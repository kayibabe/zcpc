import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { journey_id, triage_priority, vitals_data, notes } = await req.json();
    if (!journey_id) return Response.json({ error: 'journey_id is required' }, { status: 400 });
    if (!['emergency', 'urgent', 'normal'].includes(triage_priority)) {
      return Response.json({ error: 'triage_priority must be emergency, urgent, or normal' }, { status: 400 });
    }

    const journey = await base44.asServiceRole.entities.PatientJourney.get(journey_id);
    if (!journey) return Response.json({ error: 'Journey not found' }, { status: 404 });
    if (journey.current_stage !== 'TRIAGE') {
      return Response.json({ error: 'Patient is not in TRIAGE stage' }, { status: 400 });
    }

    const steps = [];

    // Step 1: Record vitals if provided
    if (vitals_data && Object.keys(vitals_data).length > 0) {
      const vitalRecord = await base44.asServiceRole.entities.VitalSigns.create({
        visit_id: journey.visit_id,
        patient_id: journey.patient_id,
        recorded_date: new Date().toISOString(),
        ...vitals_data,
      });
      steps.push({ step: 'vitals_recorded', vital_id: vitalRecord.id });
    }

    // Step 2: Calculate triage score
    let triageAssessment = null;
    try {
      const { data: assessment } = await base44.asServiceRole.functions.invoke('calculateTriageScore', {
        journey_id: journey.id,
        patient_id: journey.patient_id,
        visit_id: journey.visit_id,
      });
      triageAssessment = assessment;
      steps.push({ step: 'triage_calculated', mews_score: assessment.mews_score, suggested: assessment.suggested_priority });
    } catch (e) {
      steps.push({ step: 'triage_calculation_failed', error: e.message });
    }

    // Step 3: Update visit with triage priority
    const visit = await base44.asServiceRole.entities.Visit.get(journey.visit_id);
    if (visit) {
      await base44.asServiceRole.entities.Visit.update(visit.id, {
        priority: triage_priority,
        queue_status: 'triaged',
      });
      steps.push({ step: 'visit_updated', priority: triage_priority });
    }

    // Step 4: Transition journey to CONSULTATION
    const transitionNote = notes || `Triaged as ${triage_priority} by ${user.full_name || 'triage nurse'}`;
    await base44.asServiceRole.functions.invoke('handleWorkflowStageChange', {
      journey_id: journey.id,
      next_stage: 'CONSULTATION',
      notes: transitionNote,
    });
    steps.push({ step: 'journey_transitioned', next_stage: 'CONSULTATION' });

    // Step 5: Log audit entry
    await base44.asServiceRole.entities.AuditLog.create({
      user_id: user.id,
      action: 'triage_completed',
      entity_type: 'PatientJourney',
      entity_id: journey.id,
      changes: JSON.stringify({
        triage_priority,
        mews_score: triageAssessment?.mews_score,
        triaged_by: user.full_name || user.email,
        triaged_at: new Date().toISOString(),
      }),
      timestamp: new Date().toISOString(),
    });
    steps.push({ step: 'audit_logged' });

    return Response.json({
      success: true,
      journey_id,
      triage_priority,
      triage_assessment: triageAssessment,
      steps,
      triaged_by: user.id,
      triaged_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});