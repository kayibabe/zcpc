import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { status_filter, format } = await req.json();

    // Get claims matching filter
    const query = status_filter ? { status: status_filter } : {};
    const claims = await base44.entities.InsuranceClaim.filter(query, "-created_date", 500);

    if (claims.length === 0) {
      return Response.json({
        message: "No claims to export",
        exported: 0,
        file_url: null
      });
    }

    let csvContent = "";
    
    if (format === "summary") {
      // Summary format: scheme breakdown
      const byScheme = {};
      claims.forEach(c => {
        if (!byScheme[c.scheme_name]) {
          byScheme[c.scheme_name] = { count: 0, amount: 0, statuses: {} };
        }
        byScheme[c.scheme_name].count++;
        byScheme[c.scheme_name].amount += c.claim_amount || 0;
        byScheme[c.scheme_name].statuses[c.status] = (byScheme[c.scheme_name].statuses[c.status] || 0) + 1;
      });

      csvContent = "Scheme,Total Claims,Total Amount,Pending,Submitted,Approved,Paid,Rejected\n";
      Object.entries(byScheme).forEach(([scheme, data]) => {
        csvContent += `"${scheme}",${data.count},${data.amount},${data.statuses.pending || 0},${data.statuses.submitted || 0},${data.statuses.approved || 0},${data.statuses.paid || 0},${data.statuses.rejected || 0}\n`;
      });
    } else {
      // Detailed format
      csvContent = "Claim ID,Invoice ID,Patient ID,Scheme,Amount,Status,Submitted Date,Response Date,Notes\n";
      claims.forEach(c => {
        csvContent += `"${c.id.slice(0, 8)}","${c.invoice_id?.slice(0, 8) || ""}","${c.patient_id?.slice(0, 8) || ""}","${c.scheme_name || ""}",${c.claim_amount || 0},"${c.status}","${c.submitted_date ? new Date(c.submitted_date).toLocaleDateString("en-GB") : ""}","${c.response_date ? new Date(c.response_date).toLocaleDateString("en-GB") : ""}","${c.response_notes || ""}"\n`;
      });
    }

    return Response.json({
      message: `Exported ${claims.length} claims`,
      exported: claims.length,
      format: format || "detailed",
      csv_data: csvContent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});