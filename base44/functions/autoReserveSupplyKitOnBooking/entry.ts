import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.id || data.status !== "confirmed") {
      return Response.json({ status: "skipped", reason: "Booking not confirmed" });
    }

    // Get procedure category to find matching supply kit
    const procedureCategory = data.procedure_category || "general";
    
    const kits = await base44.asServiceRole.entities.SurgicalSupplyKit.filter(
      { procedure_category: procedureCategory, status: "active" },
      "",
      5
    );

    if (kits.length === 0) {
      return Response.json({ status: "warning", message: `No supply kit found for ${procedureCategory}` });
    }

    const kit = kits[0];
    const kitItems = JSON.parse(kit.items || "[]");

    // Create requisition with kit items
    const requisition = await base44.asServiceRole.entities.SurgicalRequisition.create({
      booking_id: data.id,
      patient_id: data.patient_id,
      procedure_name: data.procedure_name,
      scheduled_date: data.scheduled_date,
      requested_by_id: data.surgeon_id,
      requested_by_name: data.surgeon_name,
      requisition_date: new Date().toISOString(),
      items: JSON.stringify(kitItems),
      status: "submitted",
      total_items: kitItems.length,
      items_fulfilled: 0,
      priority: data.priority || "routine",
      notes: `Auto-generated from ${kit.kit_name}`,
    });

    // Reserve inventory for each item
    const drugs = await base44.asServiceRole.entities.Drug.filter(
      { status: "active" },
      "",
      500
    );

    for (const item of kitItems) {
      const drug = drugs.find(d => d.id === item.item_id || d.name === item.item_name);
      if (drug && drug.quantity_in_stock >= item.quantity) {
        // Update inventory reserved count (if field exists)
        const reserved = (drug.quantity_reserved || 0) + item.quantity;
        await base44.asServiceRole.entities.Drug.update(drug.id, {
          quantity_reserved: reserved,
          quantity_in_stock: drug.quantity_in_stock - item.quantity,
        });

        // Create dispensing record
        await base44.asServiceRole.entities.SurgicalDispensing.create({
          requisition_id: requisition.id,
          booking_id: data.id,
          patient_id: data.patient_id,
          item_id: drug.id,
          item_name: drug.name,
          quantity_requested: item.quantity,
          quantity_dispensed: item.quantity,
          unit: drug.unit || "units",
          batch_number: drug.batch_number || "",
          expiry_date: drug.expiry_date || "",
          dispensed_by_name: "System",
          dispensed_date: new Date().toISOString(),
          status: "dispensed",
        });
      }
    }

    return Response.json({
      status: "success",
      requisition_id: requisition.id,
      kit_name: kit.kit_name,
      items_reserved: kitItems.length,
    });

  } catch (error) {
    console.error("Error reserving supply kit:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});