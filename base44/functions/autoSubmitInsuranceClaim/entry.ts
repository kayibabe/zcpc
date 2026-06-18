import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.id || data.status !== "paid") {
      return Response.json({ status: "skipped", reason: "Invoice not paid" });
    }

    // Get invoice details
    const invoice = await base44.asServiceRole.entities.Invoice.get(data.id);
    if (!invoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Check if claim already exists for this invoice
    const existingClaims = await base44.asServiceRole.entities.InsuranceClaim.filter(
      { invoice_id: invoice.id },
      "-created_date",
      5
    );

    if (existingClaims.length > 0) {
      return Response.json({ status: "skipped", reason: "Claim already exists for invoice" });
    }

    // Get visit and patient info
    const [visit, patient, invoiceItems] = await Promise.all([
      base44.asServiceRole.entities.Visit.get(invoice.visit_id),
      base44.asServiceRole.entities.Patient.get(invoice.patient_id),
      base44.asServiceRole.entities.InvoiceItem.filter({ invoice_id: invoice.id }, "", 50),
    ]);

    if (!visit || !patient) {
      return Response.json({ error: "Visit or patient not found" }, { status: 404 });
    }

    // Verify insurance eligibility
    if (!patient.insurance_scheme || !patient.insurance_member_number) {
      return Response.json({
        status: "warning",
        message: "Patient has no active insurance scheme. Manual submission required.",
      });
    }

    // Create insurance claim record
    const claim = await base44.asServiceRole.entities.InsuranceClaim.create({
      invoice_id: invoice.id,
      visit_id: invoice.visit_id,
      patient_id: invoice.patient_id,
      scheme_name: patient.insurance_scheme,
      member_number: patient.insurance_member_number,
      claim_amount: invoice.net_amount || invoice.total_amount,
      claim_date: new Date().toISOString(),
      claim_items: JSON.stringify(invoiceItems.map(i => ({
        description: i.description,
        amount: i.amount,
        quantity: i.quantity,
      }))),
      status: "submitted",
      submission_method: "automated",
      notes: `Auto-submitted from Invoice #${invoice.invoice_number}`,
    });

    // Log submission audit
    await base44.asServiceRole.entities.AuditLog.create({
      entity_name: "InsuranceClaim",
      entity_id: claim.id,
      action: "auto_submit",
      user_id: "system",
      description: `Auto-submitted claim for ${patient.insurance_scheme}. Amount: ${claim.claim_amount}`,
      timestamp: new Date().toISOString(),
    });

    // Send notification to billing team
    await base44.asServiceRole.entities.Notification.create({
      title: "Insurance Claim Auto-Submitted",
      message: `Claim #${claim.id} submitted to ${patient.insurance_scheme} for patient ${patient.first_name} ${patient.last_name}. Amount: ${claim.claim_amount}. Invoice: #${invoice.invoice_number}`,
      is_read: false,
      target_role: "cashier",
      linked_patient_id: invoice.patient_id,
    });

    return Response.json({
      status: "success",
      claim_id: claim.id,
      scheme: patient.insurance_scheme,
      amount: claim.claim_amount,
      member_number: patient.insurance_member_number,
    });

  } catch (error) {
    console.error("Error submitting insurance claim:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});