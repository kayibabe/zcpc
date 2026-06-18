import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as speakeasy from 'npm:speakeasy@2.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { token } = await req.json();
    if (!token || typeof token !== 'string' || token.length !== 6) {
      return Response.json({ error: 'Invalid token format' }, { status: 400 });
    }

    // Fetch user's TOTP secret from UserSecurity
    const userSecurityRecords = await base44.entities.UserSecurity.filter(
      { user_id: user.id },
      '-created_date',
      1
    );

    if (userSecurityRecords.length === 0 || !userSecurityRecords[0].totp_secret) {
      return Response.json({ error: 'TOTP not enabled for this user' }, { status: 400 });
    }

    const userSecurity = userSecurityRecords[0];

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: userSecurity.totp_secret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow for time drift (±2 time windows = ±60 seconds)
    });

    if (!verified) {
      return Response.json({ verified: false });
    }

    // Update last verification timestamp
    await base44.entities.UserSecurity.update(userSecurity.id, {
      last_totp_verify: new Date().toISOString(),
    });

    return Response.json({ verified: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});