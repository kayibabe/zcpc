import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.patient_id || !data?.priority || data.queue_status !== "triaged") {
      return Response.json({ status: "skipped", reason: "Not a triaged visit" });
    }

    // Determine ward type by priority and visit type
    const wardType = data.priority === "emergency" || data.priority === "urgent" ? "icu" : 
                     data.visit_type === "maternity" ? "maternity" : "general";

    // Get available beds
    const availableBeds = await base44.asServiceRole.entities.Bed.filter(
      { status: "available", ward_type: wardType },
      "bed_number",
      50
    );

    if (availableBeds.length === 0) {
      // Try alternative ward if primary is full
      const altWards = wardType === "icu" ? ["general"] : wardType === "maternity" ? ["general"] : ["isolation"];
      const altBeds = await base44.asServiceRole.entities.Bed.filter(
        { status: "available", ward_type: { $in: altWards } },
        "bed_number",
        50
      );

      if (altBeds.length === 0) {
        return Response.json({ status: "warning", message: "No available beds in any ward" });
      }

      const bed = altBeds[0];
      await base44.asServiceRole.entities.Bed.update(bed.id, { status: "occupied", patient_id: data.patient_id });
      const ward = await base44.asServiceRole.entities.Ward.get(bed.ward_id);

      return Response.json({
        status: "allocated_alternative",
        bed_number: bed.bed_number,
        ward: ward?.name || "Unknown Ward",
        patient_id: data.patient_id,
      });
    }

    const bed = availableBeds[0];
    await base44.asServiceRole.entities.Bed.update(bed.id, { status: "occupied", patient_id: data.patient_id });
    const ward = await base44.asServiceRole.entities.Ward.get(bed.ward_id);

    // Create admission record
    const admission = await base44.asServiceRole.entities.Admission.create({
      patient_id: data.patient_id,
      visit_id: data.id,
      bed_id: bed.id,
      ward_id: bed.ward_id,
      admission_date: new Date().toISOString(),
      admission_type: data.priority === "emergency" ? "emergency" : "elective",
      status: "admitted",
    });

    // Notify nursing station
    await base44.asServiceRole.entities.Notification.create({
      title: "New Admission",
      message: `Patient ${data.patient_id?.slice(0, 8)} admitted to ${ward?.name || "Ward"}, Bed ${bed.bed_number}. Priority: ${data.priority}`,
      is_read: false,
      target_role: "nurse",
      linked_visit_id: data.id,
      linked_patient_id: data.patient_id,
    });

    return Response.json({
      status: "allocated",
      admission_id: admission.id,
      bed_number: bed.bed_number,
      ward: ward?.name || "Unknown Ward",
      priority: data.priority,
    });

  } catch (error) {
    console.error("Error allocating bed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});