import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data } = body;

    // Only fire on create events
    if (event?.type !== 'create') {
      return Response.json({ status: 'skipped', reason: 'not a create event' });
    }

    const visit = data;
    if (!visit?.patient_id) {
      return Response.json({ status: 'skipped', reason: 'no patient_id' });
    }

    // Get patient details
    const patient = await base44.asServiceRole.entities.Patient.get(visit.patient_id);
    if (!patient) {
      return Response.json({ status: 'skipped', reason: 'patient not found' });
    }

    const patientName = `${patient.first_name} ${patient.last_name}`;
    const visitType = (visit.visit_type || 'outpatient').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const priority = visit.priority || 'normal';
    const priorityLabel = priority === 'emergency' ? '🔴 EMERGENCY' : priority === 'urgent' ? '🟠 Urgent' : '🟢 Routine';

    // Create a broadcast notification targeting all nurses
    await base44.asServiceRole.entities.Notification.create({
      title: `New Patient Check-in — Triage Required`,
      message: `${patientName} has been checked in at Reception. Visit type: ${visitType} · Priority: ${priorityLabel}. Please begin triage process.`,
      type: 'workflow',
      target_role: 'nurse',
      patient_id: visit.patient_id,
      visit_id: visit.id,
      is_read: false,
      action_url: '/triage',
    });

    // Also notify midwives for ANC/postnatal visits
    if (visit.visit_type === 'anc' || visit.visit_type === 'postnatal') {
      await base44.asServiceRole.entities.Notification.create({
        title: `New ANC/Postnatal Patient — ${patientName}`,
        message: `${patientName} has been checked in for ${visitType}. Please coordinate with the nursing station for triage.`,
        type: 'workflow',
        target_role: 'midwife',
        patient_id: visit.patient_id,
        visit_id: visit.id,
        is_read: false,
        action_url: '/maternal',
      });
    }

    // For emergency visits, also alert doctors
    if (priority === 'emergency') {
      await base44.asServiceRole.entities.Notification.create({
        title: `🔴 EMERGENCY Check-in — ${patientName}`,
        message: `Emergency patient ${patientName} has arrived at Reception. Immediate triage and doctor assessment required.`,
        type: 'alert',
        target_role: 'doctor',
        patient_id: visit.patient_id,
        visit_id: visit.id,
        is_read: false,
        action_url: '/triage',
      });
    }

    return Response.json({
      status: 'notifications_sent',
      patient_name: patientName,
      visit_type: visit.visit_type,
      priority,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});