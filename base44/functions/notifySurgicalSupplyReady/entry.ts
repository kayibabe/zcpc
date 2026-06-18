import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    // Triggered from SurgicalDispensing entity update
    const { event, data, old_data } = body;
    
    if (!data) {
      return Response.json({ error: 'No dispensing data' }, { status: 400 });
    }

    // Only notify on status transitions to "dispensed" or "received"
    if (!["dispensed", "received"].includes(data.status)) {
      return Response.json({ message: "No notification needed for status: " + data.status });
    }

    // Prevent duplicate notifications on the same status
    if (old_data && old_data.status === data.status) {
      return Response.json({ message: "Status unchanged, skipping notification" });
    }

    // Get the requisition to find surgical team
    const requisition = await base44.asServiceRole.entities.SurgicalRequisition.get(data.requisition_id);
    if (!requisition) {
      return Response.json({ error: 'Requisition not found' }, { status: 404 });
    }

    // Get the booking to get surgeon/team info
    const booking = await base44.asServiceRole.entities.SurgicalBooking.get(requisition.booking_id);
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Collect all ready items for this requisition
    const allDispensing = await base44.asServiceRole.entities.SurgicalDispensing.filter(
      { requisition_id: data.requisition_id },
      "",
      100
    );

    const readyItems = allDispensing.filter(d => d.status === "received" || d.status === "dispensed");
    const totalItems = allDispensing.length;
    const progress = `${readyItems.length}/${totalItems}`;

    // Build notification message
    const statusLabel = data.status === "dispensed" ? "ready for pickup" : "received";
    const message = `${data.item_name} (${data.quantity_dispensed}x) is ${statusLabel} for ${booking.procedure_name} on ${booking.scheduled_date}. Progress: ${progress}`;

    // Notify surgeon/surgical team
    const targetUsers = [];
    if (booking.surgeon_id) targetUsers.push(booking.surgeon_id);
    if (booking.anaesthetist_id) targetUsers.push(booking.anaesthetist_id);

    // Also notify anyone with surgical_lead or nurse role
    const allUsers = await base44.asServiceRole.entities.User.list("", 500);
    const surgicalTeam = allUsers.filter(u => ["surgical_lead", "nurse"].includes(u.role));
    surgicalTeam.forEach(u => targetUsers.push(u.id));

    const uniqueUsers = [...new Set(targetUsers)];

    // Create notifications
    const notifications = await Promise.all(
      uniqueUsers.map(userId =>
        base44.asServiceRole.entities.Notification.create({
          user_id: userId,
          title: `Supply Ready: ${data.item_name}`,
          message,
          notification_type: "supply_ready",
          related_entity: "SurgicalDispensing",
          related_entity_id: data.id,
          reference_id: booking.id,
          is_read: false,
          created_at: new Date().toISOString(),
        }).catch(e => ({ error: e.message, user: userId }))
      )
    );

    const successful = notifications.filter(n => !n.error).length;

    return Response.json({
      status: "success",
      item: data.item_name,
      supply_status: data.status,
      notifications_sent: successful,
      progress: progress,
      booking: booking.procedure_name,
    });

  } catch (error) {
    console.error("Error notifying surgical supply:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});