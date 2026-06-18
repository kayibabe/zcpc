import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    if (!data?.ward_id && !data?.id) {
      return Response.json({ error: "Missing ward or admission data" }, { status: 400 });
    }

    const wardId = data.ward_id || (await base44.asServiceRole.entities.Bed.get(data.bed_id))?.ward_id;
    if (!wardId) return Response.json({ error: "Ward not found" }, { status: 404 });

    // Get active admissions in ward
    const beds = await base44.asServiceRole.entities.Bed.filter(
      { ward_id: wardId, status: "occupied" },
      "",
      200
    );

    // Get available nurses for this ward
    const nurses = await base44.asServiceRole.entities.User.filter(
      { role: "nurse" },
      "",
      50
    );

    const taskDescriptions = [
      "Vital signs monitoring - record temperature, BP, HR, RR",
      "Patient hygiene and comfort - assist with bathing and bedding changes",
      "Medication administration - administer prescribed medications on schedule",
      "Wound care and dressings - inspect and change dressings as needed",
      "Fluid intake and output monitoring - track IV fluids and urine output",
      "Patient education - reinforce care instructions and recovery milestones",
      "Mobility assistance - assist with movement and positioning",
      "Pain management - monitor pain levels and comfort",
    ];

    let tasksCreated = 0;

    // Distribute tasks among nurses
    for (let i = 0; i < beds.length; i++) {
      const bed = beds[i];
      const nurse = nurses[i % nurses.length];
      const patient = await base44.asServiceRole.entities.Patient.get(bed.patient_id);

      if (!nurse || !patient) continue;

      // Generate 2-3 tasks per patient
      const numTasks = Math.floor(Math.random() * 2) + 2;
      for (let j = 0; j < numTasks; j++) {
        const taskDesc = taskDescriptions[Math.floor(Math.random() * taskDescriptions.length)];

        await base44.asServiceRole.entities.NurseTask.create({
          patient_id: bed.patient_id,
          bed_id: bed.id,
          ward_id: wardId,
          assigned_to_id: nurse.id,
          assigned_to_name: nurse.display_name || nurse.full_name || nurse.email,
          task_description: taskDesc,
          task_date: new Date().toISOString().slice(0, 10),
          priority: Math.random() > 0.7 ? "high" : "normal",
          status: "pending",
        });
        tasksCreated++;
      }
    }

    return Response.json({
      status: "success",
      tasks_created: tasksCreated,
      beds_assigned: beds.length,
      nurses_utilized: Math.min(nurses.length, beds.length),
    });

  } catch (error) {
    console.error("Error assigning nurse tasks:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});