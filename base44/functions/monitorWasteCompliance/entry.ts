import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();

    // Find all waste logs that are past their SLA deadline and not yet disposed
    const overdueLogs = await base44.asServiceRole.entities.WasteLog.filter(
      { sla_deadline: { $lte: now }, sla_breached: false, status: { $ne: 'disposed' } },
      '', 200
    );

    const breached = [];
    for (const log of overdueLogs) {
      await base44.asServiceRole.entities.WasteLog.update(log.id, { sla_breached: true });

      // Get category for alert context
      let categoryName = log.category_code;
      try {
        const cat = await base44.asServiceRole.entities.WasteCategory.get(log.waste_category_id);
        if (cat) categoryName = cat.name;
      } catch (_) {}

      // Create notification for admin/waste management team
      await base44.asServiceRole.entities.Notification.create({
        title: 'Waste SLA Breached',
        message: `${categoryName} waste from ${log.origin_department} department has exceeded the ${log.sla_deadline ? Math.round((Date.now() - new Date(log.sla_deadline).getTime()) / 3600000) : '?'}-hour storage limit. Immediate collection required.`,
        type: 'alert',
        target_role: 'admin',
        patient_id: log.patient_id || '',
      });

      breached.push({ id: log.id, department: log.origin_department, category: categoryName });
    }

    // Also check for expired drugs that haven't been logged as waste
    const expiredDrugs = await base44.asServiceRole.entities.Drug.filter(
      { expiry_date: { $lte: now.slice(0, 10) }, status: 'active' },
      '', 200
    );

    const expiredAlerts = [];
    for (const drug of expiredDrugs) {
      await base44.asServiceRole.entities.Notification.create({
        title: 'Expired Drug Requires Disposal',
        message: `${drug.name} (batch ${drug.batch_number || 'N/A'}) expired on ${drug.expiry_date}. ${drug.quantity_in_stock} units require pharmaceutical waste disposal.`,
        type: 'alert',
        target_role: 'admin',
      });
      expiredAlerts.push({ name: drug.name, quantity: drug.quantity_in_stock, expiry: drug.expiry_date });
    }

    return Response.json({
      success: true,
      sla_breaches_fixed: breached.length,
      breached_logs: breached,
      expired_drugs_alerted: expiredAlerts.length,
      expired_drugs: expiredAlerts,
      timestamp: now,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});