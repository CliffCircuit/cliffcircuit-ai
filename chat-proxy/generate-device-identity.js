#!/usr/bin/env node
/**
 * One-time script to generate Ed25519 device identity for the chat proxy.
 * Saves to /Users/openclaw/.openclaw/workspace/chat-proxy-device.json
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OUT_PATH = path.join(
  process.env.HOME,
  '.openclaw/workspace/chat-proxy-device.json'
);

// Generate Ed25519 keypair
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem  = publicKey.export({ type: 'spki',  format: 'pem' });

// deviceId = SHA-256 hex of raw public key bytes (last 32 bytes of SPKI DER)
const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
const rawPubKey = spkiDer.slice(-32);
const deviceId = crypto.createHash('sha256').update(rawPubKey).digest('hex');

const identity = { version: 1, deviceId, publicKeyPem, privateKeyPem };

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(identity, null, 2));

console.log('Device identity generated:');
console.log('  deviceId:', deviceId);
console.log('  saved to:', OUT_PATH);
console.log('');
console.log('Next step: run `openclaw devices approve <requestId>` after the proxy');
console.log('first connects to the gateway — it will appear in pending devices.');
