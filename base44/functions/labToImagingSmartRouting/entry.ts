import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.id || !data?.is_critical) {
      return Response.json({ status: "skipped", reason: "Not a critical lab result" });
    }

    // Map lab tests to relevant imaging
    const labToImagingMap = {
      "hemoglobin": "xray",
      "pneumonia": "xray",
      "pneumothorax": "xray",
      "fracture": "xray",
      "bone": "xray",
      "chest": "xray",
      "lung": "xray",
      "thorax": "xray",
      "abdomen": "ultrasound",
      "hepatitis": "ultrasound",
      "liver": "ultrasound",
      "kidney": "ultrasound",
      "renal": "ultrasound",
      "pregnancy": "ultrasound",
      "gynae": "ultrasound",
      "prostate": "ultrasound",
      "brain": "ct_scan",
      "neuro": "ct_scan",
      "stroke": "ct_scan",
      "head": "ct_scan",
      "trauma": "ct_scan",
      "spinal": "mri",
      "spine": "mri",
      "cord": "mri",
      "nerve": "mri",
      "cancer": "mri",
      "tumor": "mri",
    };

    // Determine imaging type from lab test
    const testName = (data.test_name || "").toLowerCase();
    let imagingType = "xray";
    
    for (const [keyword, type] of Object.entries(labToImagingMap)) {
      if (testName.includes(keyword)) {
        imagingType = type;
        break;
      }
    }

    // Get lab order to find visit info
    const labOrder = await base44.asServiceRole.entities.LabOrder.get(data.lab_order_id);
    if (!labOrder) {
      return Response.json({ error: "Lab order not found" }, { status: 404 });
    }

    // Auto-create imaging order
    const imagingOrder = await base44.asServiceRole.entities.ImagingOrder.create({
      visit_id: labOrder.visit_id,
      patient_id: labOrder.patient_id,
      ordered_by: "system",
      order_date: new Date().toISOString(),
      study_type: imagingType,
      body_part: imagingType === "xray" ? "chest" : imagingType === "ultrasound" ? "abdomen" : "brain",
      clinical_indication: `Critical lab result: ${data.test_name} = ${data.result_value} ${data.unit}. Reference: ${data.reference_range}`,
      status: "ordered",
      priority: "stat",
    });

    // Notify radiographer
    await base44.asServiceRole.entities.Notification.create({
      title: "STAT Imaging Order",
      message: `Critical lab result (${data.test_name}: ${data.result_value}) - STAT ${imagingType.toUpperCase()} ordered for patient ${labOrder.patient_id?.slice(0, 8)}`,
      is_read: false,
      target_role: "radiographer",
      priority: "critical",
      linked_visit_id: labOrder.visit_id,
      linked_patient_id: labOrder.patient_id,
    });

    // Log decision
    await base44.asServiceRole.entities.AuditLog.create({
      entity_name: "ImagingOrder",
      entity_id: imagingOrder.id,
      action: "auto_order_from_lab",
      user_id: "system",
      description: `Auto-triggered ${imagingType} imaging based on critical ${data.test_name} = ${data.result_value}`,
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      status: "success",
      imaging_order_id: imagingOrder.id,
      study_type: imagingType,
      priority: "stat",
      triggered_by: `${data.test_name} = ${data.result_value}`,
    });

  } catch (error) {
    console.error("Error routing lab to imaging:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});