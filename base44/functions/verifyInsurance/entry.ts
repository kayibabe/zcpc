import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { patient_id, service_type } = await req.json();
    if (!patient_id) return Response.json({ error: 'patient_id required' }, { status: 400 });

    const patient = await base44.asServiceRole.entities.Patient.get(patient_id);
    if (!patient) return Response.json({ error: 'Patient not found' }, { status: 404 });

    const schemeName = patient.insurance_scheme;
    if (!schemeName) {
      return Response.json({
        verified: false,
        status: 'self_pay',
        message: 'No insurance on file — patient is self-pay',
        patient_name: `${patient.first_name} ${patient.last_name}`,
        mrn: patient.mrn,
      });
    }

    const schemes = await base44.asServiceRole.entities.MedicalAidScheme.filter({ name: schemeName, is_active: true }, '', 1);
    if (schemes.length === 0) {
      return Response.json({
        verified: false,
        status: 'inactive_scheme',
        message: `Scheme "${schemeName}" not found or inactive`,
        scheme_name: schemeName,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        mrn: patient.mrn,
      });
    }

    const scheme = schemes[0];
    const memberNumber = patient.insurance_member_number;
    if (!memberNumber) {
      return Response.json({
        verified: false,
        status: 'missing_member_number',
        message: 'Insurance scheme on file but no member number',
        scheme_name: schemeName,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        mrn: patient.mrn,
      });
    }

    // Parse coverage details to check service eligibility
    let coverage = {};
    try {
      coverage = scheme.coverage_details ? JSON.parse(scheme.coverage_details) : {};
    } catch { /* ignore */ }

    const serviceCovered = service_type && coverage[service_type] !== undefined
      ? coverage[service_type]
      : true;

    return Response.json({
      verified: true,
      status: serviceCovered ? 'covered' : 'not_covered',
      message: serviceCovered
        ? `Verified — covered by ${schemeName}`
        : `Warning — ${service_type || 'This service'} may not be covered by ${schemeName}`,
      scheme_name: schemeName,
      member_number: memberNumber,
      patient_name: `${patient.first_name} ${patient.last_name}`,
      mrn: patient.mrn,
      coverage_details: coverage,
      service_covered: serviceCovered,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});