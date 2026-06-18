import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.patient_id || !data?.visit_id) {
      return Response.json({ error: "Missing patient or visit data" }, { status: 400 });
    }

    // Get discharge and visit info
    const [visit, patient, consultations] = await Promise.all([
      base44.asServiceRole.entities.Visit.get(data.visit_id),
      base44.asServiceRole.entities.Patient.get(data.patient_id),
      base44.asServiceRole.entities.Consultation.filter({ visit_id: data.visit_id }, "-created_date", 3),
    ]);

    if (!visit || !patient) {
      return Response.json({ error: "Visit or patient not found" }, { status: 404 });
    }

    // Determine follow-up interval by diagnosis/visit type
    const diagnosisKeywords = consultations[0]?.assessment?.toLowerCase() || "";
    
    let followUpDays = 14; // default
    let followUpReason = "General follow-up";

    if (diagnosisKeywords.includes("diabetes") || diagnosisKeywords.includes("hypertension")) {
      followUpDays = 30;
      followUpReason = "Chronic disease management";
    } else if (diagnosisKeywords.includes("pregnancy") || visit.visit_type === "anc") {
      followUpDays = 7;
      followUpReason = "Antenatal care";
    } else if (visit.visit_type === "postnatal") {
      followUpDays = 3;
      followUpReason = "Postnatal check";
    } else if (diagnosisKeywords.includes("surgery") || diagnosisKeywords.includes("post-op")) {
      followUpDays = 7;
      followUpReason = "Post-operative review";
    } else if (diagnosisKeywords.includes("infection") || diagnosisKeywords.includes("pneumonia")) {
      followUpDays = 5;
      followUpReason = "Infection follow-up";
    }

    // Calculate follow-up date
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + followUpDays);

    // Create appointment
    const appointment = await base44.asServiceRole.entities.Appointment.create({
      patient_id: data.patient_id,
      appointment_date: followUpDate.toISOString(),
      appointment_type: "follow_up",
      status: "scheduled",
      notes: `${followUpReason} - Auto-scheduled post-discharge. Original visit: ${new Date(visit.created_date).toLocaleDateString()}`,
      source_visit_id: data.visit_id,
    });

    // Send notification to patient
    await base44.asServiceRole.entities.Notification.create({
      title: "Follow-up Appointment Scheduled",
      message: `${followUpReason} appointment scheduled for ${followUpDate.toLocaleDateString()} at Zomba City Private Clinic.`,
      is_read: false,
      target_role: "patient",
      linked_patient_id: data.patient_id,
      linked_visit_id: data.visit_id,
    });

    return Response.json({
      status: "success",
      appointment_id: appointment.id,
      follow_up_date: followUpDate.toISOString(),
      days_until_followup: followUpDays,
      reason: followUpReason,
      patient: `${patient.first_name} ${patient.last_name}`,
    });

  } catch (error) {
    console.error("Error scheduling follow-up:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});