import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const results = [];

    // --- PHARMACY: Check drugs below reorder level ---
    const activeDrugs = await base44.asServiceRole.entities.Drug.filter(
      { status: 'active' },
      '', 500
    );

    const lowStockDrugs = activeDrugs.filter(d =>
      d.quantity_in_stock <= d.reorder_level && d.quantity_in_stock > 0
    );
    const outOfStockDrugs = activeDrugs.filter(d => d.quantity_in_stock === 0);

    const allLowDrugs = [...lowStockDrugs, ...outOfStockDrugs];

    if (allLowDrugs.length > 0) {
      const orderItems = allLowDrugs.map(d => ({
        drug_id: d.id,
        drug_name: d.name,
        generic_name: d.generic_name || '',
        current_stock: d.quantity_in_stock,
        reorder_level: d.reorder_level,
        suggested_quantity: Math.max(
          d.reorder_level * 3,
          (d.safety_stock_days || 30) * 1 + d.reorder_level * 2
        ),
        unit_price: d.cost_price || d.unit_price || 0,
        batch: d.batch_number || '',
      }));

      const estimatedTotal = orderItems.reduce(
        (sum, item) => sum + (item.suggested_quantity * (item.unit_price || 0)),
        0
      );

      const po = await base44.asServiceRole.entities.PharmacyPurchaseOrder.create({
        supplier: 'Central Medical Stores (CMST)',
        order_date: now,
        items: JSON.stringify(orderItems),
        total_amount: estimatedTotal,
        status: 'draft',
        notes: `AUTO-GENERATED: ${allLowDrugs.length} drug(s) below reorder threshold as of ${today}. ${
          outOfStockDrugs.length > 0 ? `${outOfStockDrugs.length} item(s) OUT OF STOCK. ` : ''
        }Please review quantities and submit order.`,
      });

      // Create notification
      await base44.asServiceRole.entities.Notification.create({
        title: `🔔 Reorder Required: ${allLowDrugs.length} Pharmacy Items`,
        message: `Automated reorder request #${po.id?.slice(0, 8)} created for ${allLowDrugs.length} drug(s). ${outOfStockDrugs.length} are OUT OF STOCK. Estimated total: MWK ${estimatedTotal.toLocaleString()}. Review and submit the purchase order in Pharmacy.`,
        type: 'alert',
        target_role: 'admin',
        action_url: '/pharmacy',
      });

      results.push({
        department: 'pharmacy',
        order_id: po.id,
        item_count: allLowDrugs.length,
        out_of_stock: outOfStockDrugs.length,
        estimated_total: estimatedTotal,
        items: orderItems.map(i => i.drug_name),
      });
    }

    // --- LABORATORY: Check reagents below reorder level ---
    const activeReagents = await base44.asServiceRole.entities.LabReagent.filter(
      { status: 'active' },
      '', 500
    );

    const lowStockReagents = activeReagents.filter(r =>
      r.quantity_in_stock <= r.reorder_level && r.quantity_in_stock > 0
    );
    const outOfStockReagents = activeReagents.filter(r => r.quantity_in_stock === 0);

    const allLowReagents = [...lowStockReagents, ...outOfStockReagents];

    if (allLowReagents.length > 0) {
      const orderItems = allLowReagents.map(r => ({
        reagent_id: r.id,
        reagent_name: r.name,
        catalogue_number: r.catalogue_number || '',
        current_stock: r.quantity_in_stock,
        reorder_level: r.reorder_level,
        suggested_quantity: Math.max(r.reorder_level * 3, 15),
        unit: r.unit || 'unit',
        lot: r.lot_number || '',
        storage: r.storage_condition || '',
        cold_chain: r.requires_cold_chain || false,
      }));

      // Estimate cost (reagents often ~15,000 MWK each as rough estimate)
      const estimatedTotal = orderItems.reduce(
        (sum, item) => sum + (item.suggested_quantity * 15000),
        0
      );

      const po = await base44.asServiceRole.entities.PharmacyPurchaseOrder.create({
        supplier: 'Central Medical Stores (CMST) — Lab Supplies',
        order_date: now,
        items: JSON.stringify(orderItems),
        total_amount: estimatedTotal,
        status: 'draft',
        notes: `AUTO-GENERATED: ${allLowReagents.length} lab reagent(s) below reorder threshold as of ${today}. ${
          outOfStockReagents.length > 0 ? `${outOfStockReagents.length} item(s) OUT OF STOCK. ` : ''
        }Please review quantities and submit order.`,
      });

      await base44.asServiceRole.entities.Notification.create({
        title: `🔔 Reorder Required: ${allLowReagents.length} Lab Reagents`,
        message: `Automated reorder request #${po.id?.slice(0, 8)} created for ${allLowReagents.length} lab reagent(s). ${outOfStockReagents.length} are OUT OF STOCK. Review and submit the purchase order in Pharmacy or Lab.`,
        type: 'alert',
        target_role: 'admin',
        action_url: '/lab',
      });

      results.push({
        department: 'laboratory',
        order_id: po.id,
        item_count: allLowReagents.length,
        out_of_stock: outOfStockReagents.length,
        items: orderItems.map(i => i.reagent_name),
      });
    }

    return Response.json({
      success: true,
      generated_at: now,
      orders_created: results.length,
      total_items: results.reduce((s, r) => s + r.item_count, 0),
      details: results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});