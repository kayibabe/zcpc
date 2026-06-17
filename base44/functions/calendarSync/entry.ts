import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Sync appointments to calendar events
    const appointments = await base44.entities.Appointment.filter(
      { appointment_date: { $gte: new Date().toISOString() } },
      "-appointment_date",
      500
    );

    const syncedEvents = [];
    for (const apt of appointments) {
      // Create a calendar-compatible event representation
      const event = {
        id: apt.id,
        title: `Appointment - ${apt.patient_id?.slice(0, 8) || 'Patient'}`,
        date: apt.appointment_date,
        time: apt.appointment_time,
        duration_minutes: 30,
        status: apt.status,
        type: "appointment",
      };
      syncedEvents.push(event);
    }

    // Create notification for sync
    await base44.entities.Notification.create({
      title: "Calendar Sync Complete",
      message: `${syncedEvents.length} appointments synced to calendar`,
      target_role: "admin",
      is_read: false,
    });

    return Response.json({
      synced_count: syncedEvents.length,
      events: syncedEvents,
      sync_time: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});