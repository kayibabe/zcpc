import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find recently rejected claims
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rejectedClaims = await base44.entities.InsuranceClaim.filter({
      status: "rejected"
    }, "-created_date", 100);

    const recentlyRejected = rejectedClaims.filter(c => {
      return c.updated_date && new Date(c.updated_date) > new Date(oneDayAgo);
    });

    const notificationResults = [];

    for (const claim of recentlyRejected) {
      try {
        const invoice = await base44.entities.Invoice.get(claim.invoice_id);
        const patient = await base44.entities.Patient.get(claim.patient_id);

        // Create notification
        await base44.entities.Notification.create({
          title: "Insurance Claim Rejected",
          message: `Claim for ${patient?.first_name} ${patient?.last_name || ""} (${claim.scheme_name}) has been rejected. Amount: MWK ${claim.claim_amount}. ${claim.response_notes ? "Reason: " + claim.response_notes : ""}`,
          type: "alert",
          target_role: "admin",
          link: `/insurance-claims`,
          is_read: false
        });

        notificationResults.push({
          claim_id: claim.id,
          notified: true,
          scheme: claim.scheme_name,
          amount: claim.claim_amount
        });
      } catch (e) {
        notificationResults.push({
          claim_id: claim.id,
          notified: false,
          error: e.message
        });
      }
    }

    return Response.json({
      total_rejected: recentlyRejected.length,
      notified: notificationResults.filter(r => r.notified).length,
      failed: notificationResults.filter(r => !r.notified).length,
      results: notificationResults
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});