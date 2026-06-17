import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { claim_ids, auto_fix } = await req.json();

    const validationResults = [];
    let fixedCount = 0;

    for (const claimId of claim_ids || []) {
      try {
        const claim = await base44.entities.InsuranceClaim.get(claimId);
        if (!claim) continue;

        const errors = [];
        const warnings = [];

        // Validation checks
        if (!claim.invoice_id) errors.push("No invoice linked");
        if (!claim.patient_id) errors.push("No patient linked");
        if (!claim.scheme_name) errors.push("Scheme missing");
        if (claim.claim_amount <= 0) errors.push("Invalid amount");

        const invoice = claim.invoice_id ? await base44.entities.Invoice.get(claim.invoice_id) : null;
        if (invoice && invoice.status === "paid") warnings.push("Invoice already paid");

        const isValid = errors.length === 0;

        validationResults.push({
          claim_id: claim.id,
          valid: isValid,
          errors,
          warnings,
          status: claim.status
        });

        // Auto-fix: mark invalid claims for review
        if (!isValid && auto_fix && claim.status === "pending") {
          await base44.entities.InsuranceClaim.update(claim.id, {
            status: "pending",
            response_notes: `Validation failed: ${errors.join("; ")}`
          });
          fixedCount++;
        }
      } catch (e) {
        validationResults.push({
          claim_id: claimId,
          valid: false,
          errors: [e.message]
        });
      }
    }

    const validCount = validationResults.filter(r => r.valid).length;
    const invalidCount = validationResults.filter(r => !r.valid).length;

    return Response.json({
      total: validationResults.length,
      valid: validCount,
      invalid: invalidCount,
      fixed: fixedCount,
      results: validationResults
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});