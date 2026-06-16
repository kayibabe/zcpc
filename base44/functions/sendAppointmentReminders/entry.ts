import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Tomorrow's date in YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const appointments = await base44.asServiceRole.entities.Appointment.filter({
      appointment_date: dateStr,
      status: 'scheduled',
    }, '', 200);

    const results = [];
    for (const appt of appointments) {
      try {
        const patient = await base44.asServiceRole.entities.Patient.get(appt.patient_id);
        if (!patient || !patient.phone) {
          results.push({ appointment_id: appt.id, status: 'skipped', reason: 'No phone number' });
          continue;
        }

        const patientName = `${patient.first_name} ${patient.last_name}`;
        const timeDisplay = appt.appointment_time || 'scheduled time';

        // Send email if available
        if (patient.email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: patient.email,
            subject: `Appointment Reminder — Zomba City Private Clinic`,
            body: `Dear ${patientName},\n\nThis is a reminder that you have an appointment at Zomba City Private Clinic tomorrow (${dateStr}) at ${timeDisplay}.\n\nAppointment Type: ${appt.type?.replace(/_/g, ' ') || 'General'}\nDepartment: ${appt.department || 'General OPD'}\n\nPlease arrive 15 minutes early. If you need to reschedule, call us at +265 888 111 222.\n\nThank you,\nZomba City Private Clinic`,
          });
        }

        results.push({
          appointment_id: appt.id,
          patient_name: patientName,
          phone: patient.phone,
          email: patient.email || null,
          appointment_time: timeDisplay,
          status: 'reminder_sent',
        });
      } catch (innerError) {
        results.push({ appointment_id: appt.id, status: 'error', reason: innerError.message });
      }
    }

    return Response.json({
      date: dateStr,
      total_appointments: appointments.length,
      reminders_sent: results.filter(r => r.status === 'reminder_sent').length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});