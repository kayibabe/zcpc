import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import * as speakeasy from 'npm:speakeasy@2.0.0';
import qrcode from 'npm:qrcode@1.5.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Generate a unique TOTP secret for this user
    const secret = speakeasy.generateSecret({
      name: `Zomba City HIMS (${user.email})`,
      issuer: 'Zomba City Private Clinic',
      length: 32,
    });

    // Generate QR code as SVG string
    const qrCodeUrl = await qrcode.toString(secret.otpauth_url, { type: 'image/svg+xml' });

    // Return the secret and QR code (secret will be encrypted on client before storage)
    return Response.json({
      secret: secret.base32,
      qrCodeUrl: 'data:image/svg+xml;base64,' + btoa(qrCodeUrl),
      otpauth_url: secret.otpauth_url,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});