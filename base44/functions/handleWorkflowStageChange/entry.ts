import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const STAGE_TRANSITIONS = {
  RECEPTION: { allowed: ["TRIAGE", "CONSULTATION", "COMPLETED"], next_role: "doctor", sla_minutes: 15 },
  TRIAGE: { allowed: ["CONSULTATION", "LAB_PENDING", "IMAGING_PENDING", "COMPLETED"], next_role: "doctor", sla_minutes: 20 },
  CONSULTATION: { allowed: ["LAB_PENDING", "IMAGING_PENDING", "PHARMACY_PENDING", "NURSING_ADMINISTRATION", "BILLING", "COMPLETED"], next_role: "doctor", sla_minutes: 45 },
  LAB_PENDING: { allowed: ["LAB_PROCESSING", "CONSULTATION", "COMPLETED"], next_role: "lab_technician", sla_minutes: 30 },
  LAB_PROCESSING: { allowed: ["CONSULTATION", "COMPLETED"], next_role: "doctor", sla_minutes: 60 },
  IMAGING_PENDING: { allowed: ["IMAGING_PROCESSING", "CONSULTATION", "COMPLETED"], next_role: "radiographer", sla_minutes: 30 },
  IMAGING_PROCESSING: { allowed: ["CONSULTATION", "COMPLETED"], next_role: "doctor", sla_minutes: 60 },
  PHARMACY_PENDING: { allowed: ["PHARMACY_DISPENSING", "CONSULTATION", "COMPLETED"], next_role: "pharmacist", sla_minutes: 30 },
  PHARMACY_DISPENSING: { allowed: ["NURSING_ADMINISTRATION", "BILLING", "COMPLETED"], next_role: null, sla_minutes: 45 },
  NURSING_ADMINISTRATION: { allowed: ["BILLING", "COMPLETED"], next_role: "nurse", sla_minutes: 60 },
  BILLING: { allowed: ["COMPLETED"], next_role: "cashier", sla_minutes: 30 },
  COMPLETED: { allowed: [], next_role: null, sla_minutes: null },
};

// Stages that free up a consultation room when the patient leaves
const ROOM_RELEASE_STAGES = ["CONSULTATION"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { journey_id, next_stage, notes } = body;

    if (!journey_id || !next_stage) {
      return Response.json({ error: 'journey_id and next_stage are required' }, { status: 400 });
    }

    const journey = await base44.asServiceRole.entities.PatientJourney.get(journey_id);
    if (!journey) return Response.json({ error: 'Journey not found' }, { status: 404 });

    const currentStage = journey.current_stage;
    const transition = STAGE_TRANSITIONS[currentStage];

    if (!transition) {
      return Response.json({ error: `Unknown stage: ${currentStage}` }, { status: 400 });
    }

    if (!transition.allowed.includes(next_stage)) {
      return Response.json({
        error: `Cannot transition from ${currentStage} to ${next_stage}. Allowed: ${transition.allowed.join(', ')}`
      }, { status: 400 });
    }

    // ── SLA Breach Check ──
    // Check if the current stage has exceeded its SLA
    let breachedSLA = false;
    if (transition.sla_minutes && journey.stage_history) {
      const history = JSON.parse(journey.stage_history);
      const lastEntry = history[history.length - 1];
      if (lastEntry && lastEntry.to === currentStage) {
        const stageStart = new Date(lastEntry.timestamp);
        const minutesInStage = (Date.now() - stageStart.getTime()) / 60000;
        if (minutesInStage > transition.sla_minutes) {
          breachedSLA = true;
        }
      }
    }

    // If SLA breached, auto-escalate priority and notify manager
    if (breachedSLA) {
      try {
        const visit = await base44.asServiceRole.entities.Visit.get(journey.visit_id).catch(() => null);
        if (visit && visit.priority !== "emergency") {
          const newPriority = visit.priority === "normal" ? "urgent" : "emergency";
          await base44.asServiceRole.entities.Visit.update(journey.visit_id, { priority: newPriority });
        }
        const patient = journey.patient_id ? await base44.asServiceRole.entities.Patient.get(journey.patient_id).catch(() => null) : null;
        const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown patient';
        const stageLabel = currentStage.replace(/_/g, ' ').toLowerCase();
        await base44.asServiceRole.entities.Notification.create({
          title: `⚠️ SLA Breach: ${patientName}`,
          message: `${patientName} exceeded ${transition.sla_minutes}min SLA in ${stageLabel}. Priority auto-escalated.`,
          type: 'alert',
          target_role: 'admin',
          patient_id: journey.patient_id,
          visit_id: journey.visit_id,
          is_read: false,
          action_url: '/',
        });
      } catch (_) { /* SLA notification best-effort */ }
    }

    // ── Build stage history ──
    const history = journey.stage_history ? JSON.parse(journey.stage_history) : [];
    history.push({
      from: currentStage,
      to: next_stage,
      timestamp: new Date().toISOString(),
      user_id: user.id,
      notes: notes || '',
      sla_breached: breachedSLA,
    });

    const nextRole = STAGE_TRANSITIONS[next_stage]?.next_role || 'admin';

    // Update journey
    await base44.asServiceRole.entities.PatientJourney.update(journey_id, {
      current_stage: next_stage,
      assigned_to_role: nextRole,
      notes: notes || journey.notes,
      stage_history: JSON.stringify(history),
    });

    // Update visit queue_status
    try {
      await base44.asServiceRole.entities.Visit.update(journey.visit_id, {
        queue_status: next_stage.toLowerCase(),
      });
    } catch (_) { /* visit may not exist */ }

    // ── Notification: Next Role ──
    const stageLabel = next_stage.replace(/_/g, ' ').toLowerCase();
    const patient = journey.patient_id ? await base44.asServiceRole.entities.Patient.get(journey.patient_id).catch(() => null) : null;
    const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown patient';

    await base44.asServiceRole.entities.Notification.create({
      title: `Patient ready for ${stageLabel}`,
      message: `${patientName} has been moved to ${stageLabel} by ${user.full_name || 'staff'}.`,
      type: 'workflow',
      target_role: nextRole,
      patient_id: journey.patient_id,
      visit_id: journey.visit_id,
      is_read: false,
      action_url: '/',
    });

    // ── Room Vacancy: Notify Reception when consultation room frees up ──
    if (ROOM_RELEASE_STAGES.includes(currentStage) && next_stage !== "CONSULTATION") {
      await base44.asServiceRole.entities.Notification.create({
        title: `🏥 Room Available`,
        message: `${patientName} has left consultation. Room is now vacant — ready for next patient.`,
        type: 'info',
        target_role: 'reception',
        patient_id: journey.patient_id,
        visit_id: journey.visit_id,
        is_read: false,
        action_url: '/reception',
      });
    }

    // ── Bidirectional: Notify Previous Role when results come back ──
    // E.g. when Lab sends results back to doctor, notify doctor explicitly
    const previousRole = STAGE_TRANSITIONS[currentStage]?.next_role;
    if (nextRole === "doctor" && previousRole) {
      await base44.asServiceRole.entities.Notification.create({
        title: `Results back: ${patientName}`,
        message: `${patientName}'s ${stageLabel.replace(/_/g, ' ')} results are ready for review.`,
        type: 'workflow',
        target_role: 'doctor',
        patient_id: journey.patient_id,
        visit_id: journey.visit_id,
        is_read: false,
        action_url: '/clinical',
      });
    }

    // ── Audit trail ──
    await base44.asServiceRole.entities.AuditLog.create({
      user_id: user.id,
      action: 'workflow_transition',
      entity_type: 'PatientJourney',
      entity_id: journey_id,
      changes: JSON.stringify({ from: currentStage, to: next_stage, sla_breached: breachedSLA }),
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      journey_id,
      previous_stage: currentStage,
      current_stage: next_stage,
      sla_breached: breachedSLA,
      history,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});