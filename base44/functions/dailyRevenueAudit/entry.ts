import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().slice(0, 10);

    // Get all invoices from today
    const invoices = await base44.asServiceRole.entities.Invoice.filter(
      {},
      "-created_date",
      500
    );

    const todayInvoices = invoices.filter(inv => 
      inv.created_date?.slice(0, 10) === today
    );

    // Get all payments from today
    const payments = await base44.asServiceRole.entities.Payment.filter(
      {},
      "-created_date",
      500
    );

    const todayPayments = payments.filter(pmt => 
      pmt.created_date?.slice(0, 10) === today
    );

    // Calculate totals
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalDue = 0;
    const discrepancies = [];
    const unpaidInvoices = [];

    for (const inv of todayInvoices) {
      totalInvoiced += inv.total_amount || 0;
      
      if (inv.status === "paid") {
        totalPaid += inv.net_amount || inv.total_amount || 0;
      } else if (inv.status === "partial") {
        totalPaid += inv.paid_amount || 0;
        totalDue += (inv.net_amount || inv.total_amount || 0) - (inv.paid_amount || 0);
        unpaidInvoices.push(inv.id);
      } else {
        totalDue += inv.net_amount || inv.total_amount || 0;
        unpaidInvoices.push(inv.id);
      }
    }

    // Check for anomalies
    const expectedPayment = todayPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    if (Math.abs(expectedPayment - totalPaid) > 100) {
      discrepancies.push(`Payment mismatch: Expected ${expectedPayment}, Recorded ${totalPaid}`);
    }

    // Check for invoices without corresponding payments
    for (const inv of todayInvoices.filter(i => i.status === "paid")) {
      const linkedPayments = todayPayments.filter(p => p.invoice_id === inv.id);
      if (linkedPayments.length === 0) {
        discrepancies.push(`Invoice ${inv.invoice_number} marked paid but no payment record found`);
      }
    }

    // Create audit record
    const auditRecord = await base44.asServiceRole.entities.AuditLog.create({
      entity_name: "DailyRevenueAudit",
      entity_id: today,
      action: "revenue_audit",
      user_id: "system",
      description: `Daily revenue audit: Invoiced ${totalInvoiced}, Paid ${totalPaid}, Due ${totalDue}. Discrepancies: ${discrepancies.length}`,
      timestamp: new Date().toISOString(),
    });

    // Notify admin if discrepancies found
    if (discrepancies.length > 0) {
      await base44.asServiceRole.entities.Notification.create({
        title: "⚠️ Revenue Audit Discrepancies",
        message: `${discrepancies.length} anomalies detected: ${discrepancies.join("; ")}`,
        is_read: false,
        target_role: "admin",
        priority: "high",
      });
    }

    // Notify about unpaid invoices
    if (unpaidInvoices.length > 0) {
      await base44.asServiceRole.entities.Notification.create({
        title: "Unpaid Invoices Alert",
        message: `${unpaidInvoices.length} invoices from today remain unpaid. Total due: ${totalDue}. Review and follow up.`,
        is_read: false,
        target_role: "cashier",
      });
    }

    return Response.json({
      status: "success",
      date: today,
      invoices_count: todayInvoices.length,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_due: totalDue,
      unpaid_count: unpaidInvoices.length,
      discrepancies: discrepancies,
      audit_record_id: auditRecord.id,
    });

  } catch (error) {
    console.error("Error performing revenue audit:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});