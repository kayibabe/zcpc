import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const users = await base44.asServiceRole.entities.User.list("", 100);
    const userMap = {};
    users.forEach(u => { userMap[u.id] = { name: u.full_name || u.email || u.id.slice(0, 8), role: u.role }; });

    // ── Consultations ──
    const allConsults = await base44.asServiceRole.entities.Consultation.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Prescriptions ──
    const allPrescriptions = await base44.asServiceRole.entities.Prescription.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Diagnoses ──
    const allDiagnoses = await base44.asServiceRole.entities.Diagnosis.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Lab Orders (ordered by doctors) ──
    const allLabOrders = await base44.asServiceRole.entities.LabOrder.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Imaging Orders ──
    const allImagingOrders = await base44.asServiceRole.entities.ImagingOrder.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Admissions ──
    const allAdmissions = await base44.asServiceRole.entities.Admission.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 500
    );

    // ── Discharges ──
    const allDischarges = await base44.asServiceRole.entities.Discharge.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 500
    );

    // ── Signatures ──
    const allSignatures = await base44.asServiceRole.entities.DigitalSignature.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 1000
    );

    // ── Doctor Handovers ──
    const allDoctorHandovers = await base44.asServiceRole.entities.DoctorHandover.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 300
    );

    // ── Patient Journeys for wait time analysis ──
    const journeys = await base44.asServiceRole.entities.PatientJourney.filter(
      { created_date: { $gte: thirtyDaysAgo } }, "-created_date", 500
    );

    // ── Build per-physician metrics ──
    const physicianIds = new Set();
    allConsults.forEach(c => physicianIds.add(c.clinician_id || c.created_by_id));
    allPrescriptions.forEach(p => physicianIds.add(p.prescribed_by || p.created_by_id));
    allAdmissions.forEach(a => physicianIds.add(a.admitting_doctor_id));

    const physicians = [];
    physicianIds.forEach(pid => {
      if (!pid) return;
      const name = userMap[pid]?.name || pid.slice(0, 8);

      // Consultations
      const consults = allConsults.filter(c => (c.clinician_id || c.created_by_id) === pid);
      const consultsToday = consults.filter(c => c.created_date?.startsWith(today));
      const consultsLast7 = consults.filter(c => new Date(c.created_date) >= new Date(sevenDaysAgo));

      // Prescriptions
      const rx = allPrescriptions.filter(p => (p.prescribed_by || p.created_by_id) === pid);

      // Diagnoses
      const dx = allDiagnoses.filter(d => d.created_by_id === pid);

      // Lab orders
      const labOrders = allLabOrders.filter(l => (l.ordered_by || l.created_by_id) === pid);

      // Imaging
      const imagingOrders = allImagingOrders.filter(i => (i.ordered_by || i.created_by_id) === pid);

      // Admissions (as admitting doctor)
      const admissions = allAdmissions.filter(a => a.admitting_doctor_id === pid);
      const activeAdmissions = admissions.filter(a => a.status === "admitted");

      // Discharges
      const discharges = allDischarges.filter(d => d.created_by_id === pid);

      // Signatures
      const sigs = allSignatures.filter(s => s.signed_by === pid);
      const signedConsultIds = new Set(sigs.filter(s => s.document_type === "consultation").map(s => s.document_id));
      const unsignedConsults = consults.filter(c => !signedConsultIds.has(c.id)).length;

      // Handovers
      const handovers = allDoctorHandovers.filter(h => h.from_doctor_id === pid || h.created_by_id === pid);
      const handoversAcknowledged = allDoctorHandovers.filter(h =>
        (h.from_doctor_id === pid || h.created_by_id === pid) && h.acknowledged
      );

      // Average diagnoses per consult
      const avgDxPerConsult = consults.length > 0
        ? Math.round((dx.length / consults.length) * 10) / 10
        : 0;

      // Average prescriptions per consult
      const avgRxPerConsult = consults.length > 0
        ? Math.round((rx.length / consults.length) * 10) / 10
        : 0;

      // Lab investigation rate (% of consults with lab orders)
      const labRate = consults.length > 0
        ? Math.round((labOrders.length / consults.length) * 100)
        : 0;

      // Signature compliance
      const sigCompliance = consults.length > 0
        ? Math.round((signedConsultIds.size / consults.length) * 100)
        : 100;

      // Handover compliance
      const handoverCompliance = handovers.length > 0
        ? Math.round((handoversAcknowledged.length / handovers.length) * 100)
        : 100;

      // Daily averages
      const avgConsultsPerDay = Math.round(consultsLast7.length / 7 * 10) / 10;

      // Overall efficiency score (weighted)
      const efficiencyScore = Math.round(
        (sigCompliance * 0.3) +
        (handoverCompliance * 0.2) +
        (Math.min(100, avgConsultsPerDay * 10) * 0.25) +
        (labRate <= 50 ? 100 : Math.max(0, 100 - (labRate - 50) * 2)) * 0.25
      );

      physicians.push({
        id: pid,
        name,
        role: userMap[pid]?.role || 'user',
        consultations: {
          total: consults.length,
          today: consultsToday.length,
          last_7_days: consultsLast7.length,
          avg_per_day: avgConsultsPerDay,
        },
        prescriptions: {
          total: rx.length,
          avg_per_consult: avgRxPerConsult,
        },
        diagnoses: {
          total: dx.length,
          avg_per_consult: avgDxPerConsult,
        },
        investigations: {
          lab_orders: labOrders.length,
          imaging_orders: imagingOrders.length,
          lab_investigation_rate: labRate,
        },
        admissions: {
          total: admissions.length,
          active: activeAdmissions.length,
        },
        discharges: discharges.length,
        compliance: {
          signature_rate: sigCompliance,
          unsigned_consults: unsignedConsults,
          handover_rate: handoverCompliance,
          total_handovers: handovers.length,
        },
        efficiency_score: efficiencyScore,
      });
    });

    // Sort by consultations (desc)
    physicians.sort((a, b) => b.consultations.total - a.consultations.total);

    // ── Summary metrics ──
    const totalConsults = allConsults.length;
    const totalPrescriptions = allPrescriptions.length;
    const totalDiagnoses = allDiagnoses.length;
    const totalLabOrders = allLabOrders.length;
    const totalImagingOrders = allImagingOrders.length;
    const totalAdmissions = allAdmissions.length;
    const totalDischarges = allDischarges.length;
    const totalSignatures = allSignatures.length;
    const activePhysicians = physicians.length;

    // ── Weekly trend (last 7 days) ──
    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyTrend.push({
        date: d,
        consultations: allConsults.filter(c => c.created_date?.startsWith(d)).length,
        prescriptions: allPrescriptions.filter(p => p.created_date?.startsWith(d)).length,
        admissions: allAdmissions.filter(a => a.created_date?.startsWith(d)).length,
      });
    }

    // ── Top physicians by efficiency ──
    const topByEfficiency = [...physicians]
      .filter(p => p.consultations.total >= 3)
      .sort((a, b) => b.efficiency_score - a.efficiency_score)
      .slice(0, 5);

    return Response.json({
      generated_at: new Date().toISOString(),
      period: "30 days",
      summary: {
        active_physicians: activePhysicians,
        total_consultations: totalConsults,
        total_prescriptions: totalPrescriptions,
        total_diagnoses: totalDiagnoses,
        total_lab_orders: totalLabOrders,
        total_imaging_orders: totalImagingOrders,
        total_admissions: totalAdmissions,
        total_discharges: totalDischarges,
        total_signatures: totalSignatures,
        avg_consultations_per_physician: activePhysicians > 0 ? Math.round(totalConsults / activePhysicians) : 0,
      },
      daily_trend: dailyTrend,
      physicians,
      top_by_efficiency: topByEfficiency,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});