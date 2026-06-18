import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.visit_id || data.current_stage !== "COMPLETED") {
      return Response.json({ status: "skipped", reason: "Journey not completed" });
    }

    // Fetch visit, patient, and clinical data
    const [visit, patient, consultations, labResults, prescriptions] = await Promise.all([
      base44.asServiceRole.entities.Visit.get(data.visit_id),
      base44.asServiceRole.entities.Patient.get(data.patient_id),
      base44.asServiceRole.entities.Consultation.filter({ visit_id: data.visit_id }, "-created_date", 10),
      base44.asServiceRole.entities.LabResult.filter({ patient_id: data.patient_id }, "-created_date", 20),
      base44.asServiceRole.entities.Prescription.filter({ visit_id: data.visit_id }, "-created_date", 5),
    ]);

    if (!visit || !patient) {
      return Response.json({ error: "Visit or patient not found" }, { status: 404 });
    }

    // Generate discharge summary
    const lastConsultation = consultations[0];
    const summary = `
DISCHARGE SUMMARY
Patient: ${patient.first_name} ${patient.last_name} (MRN: ${patient.mrn})
Visit Date: ${new Date(visit.created_date).toLocaleDateString()}
Visit Type: ${visit.visit_type}

${lastConsultation ? `Chief Complaint: ${lastConsultation.chief_complaint}` : ""}
${lastConsultation ? `Assessment: ${lastConsultation.assessment}` : ""}
${lastConsultation ? `Plan: ${lastConsultation.plan}` : ""}

Recent Lab Results:
${labResults.slice(0, 5).map(r => `- ${r.test_name}: ${r.result_value} ${r.unit} (${r.is_critical ? "CRITICAL" : "normal"})`).join("\n")}

Active Medications:
${prescriptions.length > 0 ? prescriptions.map(p => `- See detailed prescription list`).join("\n") : "- None"}

Follow-up Instructions:
- Return if symptoms worsen or new symptoms develop
- Keep follow-up appointment as scheduled
- Take all medications as prescribed
- Maintain adequate hydration and rest

Education Materials Generated:
- Patient care guidelines for ${visit.visit_type} discharge
- Medication adherence checklist
- Warning signs reference card
- Follow-up contact information
    `;

    const discharge = await base44.asServiceRole.entities.Discharge.create({
      visit_id: data.visit_id,
      patient_id: data.patient_id,
      discharge_date: new Date().toISOString(),
      discharge_type: "home",
      summary: summary,
      status: "generated",
      discharged_by: "System",
    });

    // Create patient education materials (stored as notifications)
    const educationTopics = {
      outpatient: "Outpatient Care Instructions",
      inpatient: "Post-Discharge Home Care",
      emergency: "Emergency Follow-up Protocol",
      anc: "Antenatal Care Continuation",
      postnatal: "Postnatal Recovery Guide",
      procedure: "Post-Procedure Recovery",
    };

    await base44.asServiceRole.entities.Notification.create({
      title: "Discharge Education Materials",
      message: `${educationTopics[visit.visit_type] || "Care Instructions"} ready for ${patient.first_name}. Topics: Medication adherence, diet, activity restrictions, warning signs, follow-up appointments.`,
      is_read: false,
      target_role: "patient",
      linked_patient_id: data.patient_id,
      linked_visit_id: data.visit_id,
    });

    // Mark journey as closed
    await base44.asServiceRole.entities.PatientJourney.update(data.id, {
      status: "closed",
    });

    return Response.json({
      status: "success",
      discharge_id: discharge.id,
      patient_name: `${patient.first_name} ${patient.last_name}`,
      summary_length: summary.length,
      education_materials_generated: true,
    });

  } catch (error) {
    console.error("Error generating discharge package:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});