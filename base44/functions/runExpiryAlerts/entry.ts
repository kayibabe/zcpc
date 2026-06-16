import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Three alert windows: 30 days (critical), 60 days (warning), 90 days (info)
    const windows = [
      { label: '30 days', days: 30, severity: 'critical' },
      { label: '60 days', days: 60, severity: 'warning' },
      { label: '90 days', days: 90, severity: 'info' },
    ];

    const allNotifications = [];

    // --- PHARMACY: Check drugs ---
    const activeDrugs = await base44.asServiceRole.entities.Drug.filter(
      { status: 'active' },
      '', 500
    );

    for (const drug of activeDrugs) {
      if (!drug.expiry_date) continue;
      const expiryDate = new Date(drug.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      for (const window of windows) {
        if (daysUntilExpiry <= window.days && daysUntilExpiry > 0) {
          const stockInfo = drug.quantity_in_stock > 0
            ? `${drug.quantity_in_stock} units in stock`
            : 'OUT OF STOCK';

          await base44.asServiceRole.entities.Notification.create({
            title: `Drug Expiring: ${drug.name}`,
            message: `${drug.name} (${drug.generic_name || 'N/A'}) batch ${drug.batch_number || 'N/A'} expires in ${daysUntilExpiry} days (${drug.expiry_date}). ${stockInfo}. Use or return before expiry.`,
            type: 'alert',
            target_role: 'admin',
          });

          allNotifications.push({
            department: 'pharmacy',
            item: drug.name,
            batch: drug.batch_number,
            expiry_date: drug.expiry_date,
            days_remaining: daysUntilExpiry,
            severity: window.severity,
            stock: drug.quantity_in_stock,
          });
          break; // Only one notification per drug (most severe)
        }
      }
    }

    // --- LABORATORY: Check reagents ---
    const activeReagents = await base44.asServiceRole.entities.LabReagent.filter(
      { status: 'active' },
      '', 500
    );

    for (const reagent of activeReagents) {
      if (!reagent.expiry_date) continue;
      const expiryDate = new Date(reagent.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      for (const window of windows) {
        if (daysUntilExpiry <= window.days && daysUntilExpiry > 0) {
          const stockInfo = reagent.quantity_in_stock > 0
            ? `${reagent.quantity_in_stock} ${reagent.unit || 'units'}`
            : 'OUT OF STOCK';
          const coldChain = reagent.requires_cold_chain ? ' [COLD CHAIN]' : '';

          await base44.asServiceRole.entities.Notification.create({
            title: `Lab Reagent Expiring: ${reagent.name}`,
            message: `${reagent.name} (${reagent.catalogue_number || 'no cat#'}) lot ${reagent.lot_number || 'N/A'} expires in ${daysUntilExpiry} days (${reagent.expiry_date}). ${stockInfo} at ${reagent.storage_location || 'unknown location'}.${coldChain} Use or replace before expiry.`,
            type: 'alert',
            target_role: 'admin',
          });

          allNotifications.push({
            department: 'laboratory',
            item: reagent.name,
            batch: reagent.lot_number,
            expiry_date: reagent.expiry_date,
            days_remaining: daysUntilExpiry,
            severity: window.severity,
            stock: reagent.quantity_in_stock,
          });
          break;
        }
      }
    }

    // Count by severity
    const critical = allNotifications.filter(n => n.severity === 'critical').length;
    const warning = allNotifications.filter(n => n.severity === 'warning').length;
    const info = allNotifications.filter(n => n.severity === 'info').length;

    return Response.json({
      success: true,
      generated_at: now.toISOString(),
      total_notifications: allNotifications.length,
      critical_count: critical,
      warning_count: warning,
      info_count: info,
      notifications: allNotifications,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});