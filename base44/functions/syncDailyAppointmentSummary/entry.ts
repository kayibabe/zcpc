import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date().toISOString().slice(0, 10);
    const appointments = await base44.asServiceRole.entities.Appointment.filter(
      { appointment_date: today },
      '-appointment_date',
      500
    );

    const summary = {
      date: today,
      total: appointments.length,
      by_type: {},
      by_status: {},
      by_department: {},
      details: [],
    };

    for (const a of appointments) {
      summary.by_type[a.type] = (summary.by_type[a.type] || 0) + 1;
      summary.by_status[a.status] = (summary.by_status[a.status] || 0) + 1;
      const dept = a.department || 'Unassigned';
      summary.by_department[dept] = (summary.by_department[dept] || 0) + 1;
      summary.details.push({
        id: a.id,
        patient_id: a.patient_id,
        time: a.appointment_time,
        type: a.type,
        status: a.status,
        department: a.department || 'Unassigned',
        priority: a.priority,
      });
    }

    // Store summary as DHIS2Export for reporting
    const exportRecord = await base44.asServiceRole.entities.DHIS2Export.create({
      export_date: new Date().toISOString(),
      period: today,
      report_type: 'daily_appointment_summary',
      data: JSON.stringify(summary),
      status: 'generated',
      exported_by: user.id,
    });

    return Response.json({
      success: true,
      export_id: exportRecord.id,
      summary: {
        date: today,
        total: summary.total,
        by_type: summary.by_type,
        by_status: summary.by_status,
        scheduled: summary.by_status.scheduled || 0,
        completed: summary.by_status.completed || 0,
        cancelled: summary.by_status.cancelled || 0,
        no_show: summary.by_status.no_show || 0,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});