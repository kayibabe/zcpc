import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Base32 decoder
function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = [];
  let bits = 0;
  let value = 0;

  for (const char of encoded.toUpperCase()) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// TOTP RFC 6238 - verify a token with ±1 time window
async function verifyTOTP(secret, token) {
  const key = base32Decode(secret);
  const code = parseInt(token, 10);
  
  if (isNaN(code) || code < 0 || code > 999999 || token.length !== 6) {
    return false;
  }

  const now = Math.floor(Date.now() / 30000);

  for (let t = now - 1; t <= now + 1; t++) {
    const counter = new ArrayBuffer(8);
    const view = new DataView(counter);
    view.setBigInt64(0, BigInt(t), false);
    
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counter));
    
    const offset = hmac[19] & 0x0f;
    const truncated = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) >>> 0;
    
    if ((truncated % 1000000) === code) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { token, secret } = await req.json();
    if (!token || typeof token !== 'string' || token.length !== 6) {
      return Response.json({ error: 'Invalid token format' }, { status: 400 });
    }

    let totp_secret = secret;

    // If no secret provided, fetch from UserSecurity
    if (!totp_secret) {
      const userSecurityRecords = await base44.entities.UserSecurity.filter(
        { user_id: user.id },
        '-created_date',
        1
      );

      if (userSecurityRecords.length === 0 || !userSecurityRecords[0].totp_secret) {
        return Response.json({ error: 'TOTP not enabled' }, { status: 400 });
      }

      totp_secret = userSecurityRecords[0].totp_secret;
    }

    // Verify with RFC 6238 implementation
    const verified = await verifyTOTP(totp_secret, token);

    if (!verified) {
      return Response.json({ verified: false });
    }

    // Update last verification timestamp if secret came from DB
    if (!secret) {
      const userSecurityRecords = await base44.entities.UserSecurity.filter(
        { user_id: user.id },
        '-created_date',
        1
      );
      if (userSecurityRecords.length > 0) {
        await base44.entities.UserSecurity.update(userSecurityRecords[0].id, {
          last_totp_verify: new Date().toISOString(),
        });
      }
    }

    return Response.json({ verified: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});