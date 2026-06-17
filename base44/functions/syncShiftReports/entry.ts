import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch recent doctor handovers
    const doctorHandovers = await base44.asServiceRole.entities.DoctorHandover.filter(
      { created_date: { $gte: last24h } },
      "-created_date",
      50
    );

    // Fetch existing shift handover logs
    const existingLogs = await base44.asServiceRole.entities.ShiftHandoverLog.filter(
      { handover_date: { $gte: last24h } },
      "-handover_date",
      50
    );

    const synced = [];
    const skipped = [];

    for (const dh of doctorHandovers) {
      // Check if already synced (match by date and from user)
      const alreadySynced = existingLogs.some(log =>
        log.handover_from_user_id === dh.from_doctor_id &&
        Math.abs(new Date(log.handover_date).getTime() - new Date(dh.handover_date).getTime()) < 60 * 60 * 1000
      );

      if (alreadySynced) {
        skipped.push(dh.id);
        continue;
      }

      // Map doctor shift type to shift log type
      const shiftTypeMap = {
        morning: 'clinical',
        afternoon: 'clinical',
        night: 'clinical',
        weekend: 'clinical',
        on_call: 'clinical',
      };

      try {
        // Create a ShiftHandoverLog from the DoctorHandover
        await base44.asServiceRole.entities.ShiftHandoverLog.create({
          shift_type: shiftTypeMap[dh.shift_type] || 'clinical',
          handover_from_user_id: dh.from_doctor_id,
          handover_to_user_id: dh.to_doctor_id || '',
          handover_date: dh.handover_date || dh.created_date,
          outstanding_tasks: dh.active_patients || '[]',
          critical_notes: dh.critical_cases || '',
          pending_lab_results: dh.pending_investigations || '',
          pending_imaging: '',
          ward_updates: dh.treatment_updates || '',
          pharmacy_requests: '',
          incidents_reported: dh.incidents || '',
          acknowledged: dh.acknowledged || false,
        });
        synced.push(dh.id);
      } catch (e) {
        skipped.push(dh.id);
      }
    }

    return Response.json({
      success: true,
      synced_count: synced.length,
      skipped_count: skipped.length,
      synced_ids: synced,
      skipped_ids: skipped,
      synced_by: user.id,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});