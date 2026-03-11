#!/usr/bin/env node
/**
 * chat-proxy/server.js
 * WebSocket proxy for CliffCircuit portal chat.
 *
 * Architecture:
 *   - Single persistent connection to OpenClaw gateway (Ed25519 device identity)
 *   - Per-browser session validated via Google OAuth token on connect
 *   - All browser WS traffic forwarded through the single gateway connection
 *   - Gateway broadcasts go to all connected browsers
 *
 * Flow:
 *   Browser (Google OAuth token) → this proxy (port 3200) → OpenClaw gateway (single conn)
 */

'use strict';

const crypto    = require('node:crypto');
const fs        = require('node:fs');
const path      = require('node:path');
const http      = require('node:http');
const { URL }   = require('node:url');
const { WebSocketServer, WebSocket } = require('ws');

// ─── Config ────────────────────────────────────────────────────────────────
const PORT          = 3200;
const GW_URL        = 'wss://gateway.cliffcircuit.ai';
const GW_TOKEN      = '026ca07f72f19a61b9c297e03a282df7e38b987c0f0499bd';
const IDENTITY_PATH = path.join(process.env.HOME, '.openclaw/workspace/chat-proxy-device.json');

const GOOGLE_CLIENT_ID  = '947274046017-kfgdo6mnr02td2sab68ts491vb57b3iu.apps.googleusercontent.com';
const ALLOWED_EMAILS    = ['timharris707@gmail.com', 'tim@lendmanagement.com'];

// ─── Load device identity ───────────────────────────────────────────────────
let identity;
try {
  identity = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
  console.log('[proxy] Loaded device identity:', identity.deviceId.slice(0, 16) + '...');
} catch (e) {
  console.error('[proxy] ERROR: Could not load device identity from', IDENTITY_PATH);
  console.error('[proxy] Run: node generate-device-identity.js');
  process.exit(1);
}

// ─── Token validation ───────────────────────────────────────────────────────
async function validateToken(token) {
  if (!token) return null;
  try {
    // Token could be a Google ID token (JWT) — JWTs have 3 dot-separated parts
    if (token.split('.').length === 3) {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
      if (!resp.ok) return null;
      const info = await resp.json();
      if (info.aud !== GOOGLE_CLIENT_ID) return null;
      if (!ALLOWED_EMAILS.includes(info.email)) return null;
      return { email: info.email, name: info.name || info.email };
    }
    // Fallback: token is just an email (from stored auth)
    if (ALLOWED_EMAILS.includes(token)) {
      return { email: token, name: token };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Ed25519 signing helpers ────────────────────────────────────────────────
function rawPublicKeyBase64url(publicKeyPem) {
  const pubKey = crypto.createPublicKey(publicKeyPem);
  const spkiDer = pubKey.export({ type: 'spki', format: 'der' });
  return spkiDer.slice(-32).toString('base64url');
}

function buildConnectRequest(id, nonce, ts) {
  const clientId     = 'gateway-client';
  const mode         = 'backend';
  const role         = 'operator';
  const scopes       = ['operator.admin', 'operator.read', 'operator.write'];
  const scopesStr    = scopes.join(',');
  const platform     = 'node';
  const deviceFamily = ''; // must match what gateway receives in client.deviceFamily

  const payload = [
    'v3', identity.deviceId, 'gateway-client', mode, role, scopesStr,
    String(ts), GW_TOKEN, nonce, platform, deviceFamily
  ].join('|');

  const privateKey = crypto.createPrivateKey(identity.privateKeyPem);
  const sig        = crypto.sign(null, Buffer.from(payload), privateKey);
  const signature  = sig.toString('base64url');
  console.log('[proxy] V3 payload:', payload.replace(GW_TOKEN, 'TOKEN'));

  return JSON.stringify({
    type: 'req',
    id: String(id),
    method: 'connect',
    params: {
      minProtocol: 3, maxProtocol: 3,
      client: { id: clientId, version: '1.0.0', platform: 'node', mode },
      role, scopes,
      auth: { token: GW_TOKEN },
      device: {
        id: identity.deviceId,
        publicKey: rawPublicKeyBase64url(identity.publicKeyPem),
        signature,
        signedAt: ts,
        nonce
      }
    }
  });
}

// ─── Gateway connection (singleton, persistent) ─────────────────────────────
let gwWs         = null;
let gwReady      = false;
let gwReconnectDelay = 2000;
const browsers   = new Set();       // connected browser WebSockets

function connectGateway() {
  console.log('[proxy] Connecting to gateway...');
  gwWs = new WebSocket(GW_URL, { headers: { Origin: 'https://cliffcircuit.ai' } });

  gwWs.on('open', () => {
    console.log('[proxy] Gateway WS open, waiting for challenge...');
  });

  gwWs.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    console.log('[proxy] GW recv:', JSON.stringify(msg).slice(0, 150));

    // Auth challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      const ts    = msg.payload?.ts || Date.now();
      gwWs.send(buildConnectRequest(0, nonce, ts));
      return;
    }

    // Connect success — gateway responds with payload.type === 'hello-ok'
    if (msg.type === 'res' && msg.ok && (msg.payload?.connected || msg.payload?.type === 'hello-ok')) {
      console.log('[proxy] Gateway connected and authenticated');
      gwReady = true;
      gwReconnectDelay = 2000;

      // Flush any pending messages from browsers
      for (const bws of browsers) {
        if (bws._pendingMessages?.length) {
          for (const m of bws._pendingMessages) gwWs.send(m);
          bws._pendingMessages = [];
        }
      }
      return;
    }

    // Connect failure (NOT_PAIRED etc.)
    if (msg.type === 'res' && !msg.ok && !gwReady) {
      console.error('[proxy] Gateway auth failed:', msg.error?.code, msg.error?.message);
      gwWs.close();
      return;
    }

    // Forward everything else to all connected browsers
    if (msg.type === 'res' || msg.type === 'event') {
      let desc = `${msg.type}`;
      if (msg.id) desc += ` id=${msg.id}`;
      if (msg.event) desc += ` event=${msg.event}`;
      console.log(`[proxy] Forwarding to ${browsers.size} browsers: ${desc}`);
    }
    for (const bws of browsers) {
      if (bws.readyState === WebSocket.OPEN) {
        bws.send(data);
      }
    }
  });

  gwWs.on('close', (code) => {
    console.log(`[proxy] Gateway disconnected (${code}), reconnecting in ${gwReconnectDelay}ms`);
    gwReady = false;
    gwWs = null;
    setTimeout(connectGateway, gwReconnectDelay);
    gwReconnectDelay = Math.min(gwReconnectDelay * 2, 30000);
  });

  gwWs.on('error', (err) => {
    console.error('[proxy] Gateway error:', err.message);
    // close event will fire and handle reconnect
  });
}

// ─── WebSocket server (browser connections) ──────────────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('chat-proxy running\n');
});

const wss = new WebSocketServer({ noServer: true });

// Explicit upgrade handler for WS requests
server.on('upgrade', (req, socket, head) => {
  console.log(`[proxy] WS upgrade request: ${req.url}`);
  wss.handleUpgrade(req, socket, head, (browserWs) => {
    wss.emit('connection', browserWs, req);
  });
});

wss.on('connection', async (browserWs, req) => {
  const ip = req.socket.remoteAddress;

  // Parse Supabase token from query string
  let token;
  try {
    const u = new URL(req.url, 'http://localhost');
    token = u.searchParams.get('token');
  } catch {
    browserWs.close(1008, 'Bad request');
    return;
  }

  // Validate auth token
  console.log(`[proxy] Browser connect from ${ip}, token: ${token ? token.slice(0, 30) + '...' : 'null'}`);
  const user = await validateToken(token);
  if (!user) {
    console.log(`[proxy] Rejected unauthenticated connection from ${ip}`);
    browserWs.close(1008, 'Unauthorized');
    return;
  }

  console.log(`[proxy] Browser connected: ${user.email} (${ip})`);
  browserWs._user = user;
  browserWs._pendingMessages = [];
  browsers.add(browserWs);

  browserWs.on('message', (data) => {
    const str = data.toString('utf8').slice(0, 100);
    console.log(`[proxy] Browser message from ${user.email}: ${str}...`);
    if (gwReady && gwWs?.readyState === WebSocket.OPEN) {
      gwWs.send(data);
    } else {
      console.log(`[proxy] Gateway not ready, queueing message (gwReady=${gwReady}, state=${gwWs?.readyState})`);
      browserWs._pendingMessages.push(data);
    }
  });

  browserWs.on('close', () => {
    console.log(`[proxy] Browser disconnected: ${user.email}`);
    browsers.delete(browserWs);
  });

  browserWs.on('error', (err) => {
    console.error(`[proxy] Browser error (${user.email}):`, err.message);
    browsers.delete(browserWs);
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] Chat proxy listening on ws://127.0.0.1:${PORT}`);
  console.log(`[proxy] Gateway: ${GW_URL}`);
  console.log(`[proxy] Auth: Google OAuth (allowed: ${ALLOWED_EMAILS.join(', ')})`);
  connectGateway(); // Connect to gateway immediately on startup
});

process.on('SIGTERM', () => {
  console.log('[proxy] Shutting down...');
  server.close(() => process.exit(0));
});
