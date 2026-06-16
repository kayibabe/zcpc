import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { event, data, old_data, changed_fields, action, entity_type, entity_id, details } = body;

    // Entity automation payload
    if (event) {
      let changesStr = null;
      if (event.type === 'update' && changed_fields) {
        const diff = {};
        for (const f of changed_fields) {
          diff[f] = { from: old_data?.[f], to: data?.[f] };
        }
        changesStr = JSON.stringify(diff);
      } else if (event.type === 'delete') {
        changesStr = JSON.stringify({ deleted: data });
      } else {
        changesStr = JSON.stringify({ created: data });
      }

      await base44.asServiceRole.entities.AuditLog.create({
        user_id: user.id,
        action: event.type,
        entity_type: event.entity_name,
        entity_id: event.entity_id,
        changes: changesStr,
        timestamp: new Date().toISOString()
      });

      return Response.json({ success: true });
    }

    // Manual logging from frontend
    if (!action || !entity_type) {
      return Response.json({ error: 'Missing action or entity_type' }, { status: 400 });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      user_id: user.id,
      action: action,
      entity_type: entity_type,
      entity_id: entity_id || null,
      changes: details ? JSON.stringify(details) : null,
      timestamp: new Date().toISOString()
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});