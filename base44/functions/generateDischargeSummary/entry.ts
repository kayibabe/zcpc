import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { admission_id } = body;
    if (!admission_id) return Response.json({ error: 'admission_id required' }, { status: 400 });

    const admission = await base44.entities.Admission.get(admission_id);
    if (!admission) return Response.json({ error: 'Admission not found' }, { status: 404 });

    const patient = await base44.entities.Patient.get(admission.patient_id);

    // Fetch all related clinical data
    const [discharges, consultations, vitalSigns, labOrders, prescriptions, diagnoses] = await Promise.all([
      base44.entities.Discharge.filter({ admission_id: admission_id }, '', 10),
      base44.entities.Consultation.filter({ patient_id: admission.patient_id }, '-created_date', 50),
      base44.entities.VitalSigns.filter({ patient_id: admission.patient_id }, '-recorded_date', 50),
      base44.entities.LabOrder.filter({ patient_id: admission.patient_id }, '-created_date', 30),
      base44.entities.Prescription.filter({ patient_id: admission.patient_id }, '-created_date', 20),
      base44.entities.Diagnosis.filter({ patient_id: admission.patient_id }, '-diagnosis_date', 20),
    ]);

    const discharge = discharges[0] || null;

    // Gather admission-period relevant data
    const admissionStart = new Date(admission.admission_date || admission.created_date);
    const admissionEnd = discharge?.discharge_date ? new Date(discharge.discharge_date) : new Date();

    const relevantVitals = vitalSigns.filter(v => {
      const d = new Date(v.recorded_date || v.created_date);
      return d >= admissionStart && d <= admissionEnd;
    });

    const relevantConsults = consultations.filter(c => {
      const d = new Date(c.consultation_date || c.created_date);
      return d >= admissionStart && d <= admissionEnd;
    });

    const relevantLabs = labOrders.filter(l => {
      const d = new Date(l.order_date || l.created_date);
      return d >= admissionStart && d <= admissionEnd;
    });

    const relevantRx = prescriptions.filter(p => {
      const d = new Date(p.prescription_date || p.created_date);
      return d >= admissionStart && d <= admissionEnd;
    });

    const relevantDx = diagnoses.filter(dx => {
      const d = new Date(dx.diagnosis_date || dx.created_date);
      return d >= admissionStart && d <= admissionEnd;
    });

    // Build structured summary
    const summary = {
      patient: {
        name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown',
        mrn: patient?.mrn || 'N/A',
        gender: patient?.gender || 'N/A',
        dob: patient?.date_of_birth || 'N/A',
        blood_group: patient?.blood_group || 'N/A',
      },
      admission: {
        admission_date: admission.admission_date || admission.created_date,
        admission_type: admission.admission_type || 'general',
        ward_id: admission.ward_id,
        bed_id: admission.bed_id,
        admitting_diagnosis: admission.admitting_diagnosis || 'Not recorded',
      },
      discharge: discharge ? {
        discharge_date: discharge.discharge_date,
        discharge_type: discharge.discharge_type,
        follow_up_date: discharge.follow_up_date || null,
        follow_up_instructions: discharge.follow_up_instructions || null,
        discharge_summary: discharge.discharge_summary || null,
      } : null,
      clinical_summary: {
        total_consultations: relevantConsults.length,
        consultations: relevantConsults.slice(0, 5).map(c => ({
          date: c.consultation_date || c.created_date,
          notes: (c.subjective_notes || '').substring(0, 300),
        })),
        diagnoses: relevantDx.map(d => ({
          name: d.diagnosis_name,
          icd10: d.icd10_code || 'N/A',
          type: d.type,
          status: d.status,
        })),
        vital_signs_count: relevantVitals.length,
        latest_vitals: relevantVitals[0] ? {
          bp: `${relevantVitals[0].bp_systolic || '?'}/${relevantVitals[0].bp_diastolic || '?'}`,
          hr: relevantVitals[0].heart_rate,
          temp: relevantVitals[0].temperature,
          spo2: relevantVitals[0].spo2,
          weight: relevantVitals[0].weight,
        } : null,
      },
      investigations: {
        total_lab_orders: relevantLabs.length,
        lab_orders: relevantLabs.slice(0, 5).map(l => ({
          tests: l.tests,
          status: l.status,
          date: l.order_date || l.created_date,
        })),
      },
      treatment: {
        total_prescriptions: relevantRx.length,
        prescriptions: relevantRx.slice(0, 5).map(p => ({
          status: p.status,
          date: p.prescription_date || p.created_date,
        })),
      },
    };

    // Generate narrative summary using LLM
    let narrativeSummary = '';
    try {
      const promptStr = `You are a clinical discharge summary writer at Zomba City Private Clinic in Malawi. Write a professional, concise discharge summary using the following structured clinical data. Include: reason for admission, key clinical findings during stay, investigations done, treatments given, discharge diagnosis, condition at discharge, and follow-up plan. Keep it to 3-4 paragraphs. Use professional medical language appropriate for a discharge summary.

Patient: ${summary.patient.name}, ${summary.patient.gender}, DOB ${summary.patient.dob}, MRN ${summary.patient.mrn}
Admission: ${summary.admission.admission_date}, type: ${summary.admission.admission_type}
Admitting diagnosis: ${summary.admission.admitting_diagnosis}
Discharge: ${summary.discharge ? `type ${summary.discharge.discharge_type}, date ${summary.discharge.discharge_date}` : 'Not yet discharged'}
Diagnoses during stay: ${JSON.stringify(summary.clinical_summary.diagnoses)}
Latest vitals: ${JSON.stringify(summary.clinical_summary.latest_vitals)}
Lab orders: ${summary.investigations.total_lab_orders}
Prescriptions: ${summary.treatment.total_prescriptions}
Follow-up: ${summary.discharge?.follow_up_date || 'Not set'}
Follow-up instructions: ${summary.discharge?.follow_up_instructions || 'None'}`;

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: promptStr,
        model: 'gpt_5_mini'
      });
      narrativeSummary = typeof llmRes === 'string' ? llmRes : llmRes?.response || '';
    } catch (e) {
      narrativeSummary = 'Narrative summary generation unavailable.';
    }

    return Response.json({
      success: true,
      structured_summary: summary,
      narrative_summary: narrativeSummary,
      generated_by: user.full_name || user.email,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});