#!/usr/bin/env node

const token = process.argv[2];
if (!token) {
  console.error('Usage: node debug-jwt.js <jwt-token>');
  process.exit(1);
}

const parts = token.split('.');
if (parts.length !== 3) {
  console.log('Invalid JWT format - expected 3 parts, got', parts.length);
  process.exit(1);
}

try {
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

  console.log('=== JWT HEADER ===');
  console.log(JSON.stringify(header, null, 2));
  console.log('\n=== JWT PAYLOAD ===');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n=== CLAIMS ANALYSIS ===');
  console.log('Has iss (issuer):', !!payload.iss);
  console.log('Has aud (audience):', !!payload.aud);
  console.log('Has exp (expiration):', !!payload.exp);
  console.log('Has iat (issued at):', !!payload.iat);
  console.log('Has scope:', !!payload.scope);
  console.log('Has client_id:', !!payload.client_id);
} catch (error) {
  console.error('Failed to decode JWT:', error.message);
  process.exit(1);
}
