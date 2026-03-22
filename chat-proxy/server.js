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
const {
  STATE_BASE,
  CHANNELS_DIR,
  PROJECTS_DIR,
  IDENTITY_PATH,
} = require('../../../runtime/scripts/multi-agent-task/config');

// ─── Config ────────────────────────────────────────────────────────────────
const PORT          = 3200;
const GW_URL        = process.env.GW_URL || 'ws://127.0.0.1:18789';
const GW_TOKEN      = '026ca07f72f19a61b9c297e03a282df7e38b987c0f0499bd';

// ─── Channel discovery helpers ──────────────────────────────────────────────
/**
 * Discover all channels from project-scoped and legacy flat directories.
 * Returns array of { channelId, dir, meta } where dir is the resolved path.
 */
function discoverAllChannels() {
  const channels = [];
  const seen = new Set();

  // Project-scoped: projects/{slug}/channel/
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const slug of fs.readdirSync(PROJECTS_DIR)) {
      const channelDir = path.join(PROJECTS_DIR, slug, 'channel');
      const metaPath = path.join(channelDir, 'channel.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          meta._projectSlug = slug;
          channels.push({ channelId: meta.channelId || slug, dir: channelDir, meta });
          if (meta.channelId) seen.add(meta.channelId);
          seen.add(slug);
        } catch {}
      }
    }
  }

  // Legacy flat: channels/{channelId}/
  if (fs.existsSync(CHANNELS_DIR)) {
    for (const name of fs.readdirSync(CHANNELS_DIR)) {
      if (seen.has(name)) continue;
      const channelDir = path.join(CHANNELS_DIR, name);
      try { fs.realpathSync(channelDir); } catch {}
      const metaPath = path.join(channelDir, 'channel.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          channels.push({ channelId: meta.channelId || name, dir: channelDir, meta });
        } catch {}
      }
    }
  }

  return channels;
}

/**
 * Resolve the directory for a specific channel ID.
 * Checks project-scoped locations first, then legacy flat.
 */
function resolveChannelDir(channelId) {
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const slug of fs.readdirSync(PROJECTS_DIR)) {
      const channelDir = path.join(PROJECTS_DIR, slug, 'channel');
      const metaPath = path.join(channelDir, 'channel.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta.channelId === channelId || slug === channelId) return channelDir;
        } catch {}
      }
    }
  }
  const legacyDir = path.join(CHANNELS_DIR, channelId);
  if (fs.existsSync(path.join(legacyDir, 'channel.json'))) return legacyDir;
  return null;
}

const GOOGLE_CLIENT_ID  = '947274046017-kfgdo6mnr02td2sab68ts491vb57b3iu.apps.googleusercontent.com';
const ALLOWED_EMAILS    = ['timharris707@gmail.com', 'tim@lendmanagement.com', 'insightopenclaw@gmail.com'];

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
    if (token.split('.').length === 3) {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
      if (!resp.ok) return null;
      const info = await resp.json();
      if (info.aud !== GOOGLE_CLIENT_ID) return null;
      if (!ALLOWED_EMAILS.includes(info.email)) return null;
      return { email: info.email, name: info.name || info.email };
    }
    if (ALLOWED_EMAILS.includes(token)) {
      return { email: token, name: token };
    }
    return null;
  } catch {
    return null;
  }
}

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
  const deviceFamily = '';

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

let gwWs         = null;
let gwReady      = false;
let gwReconnectDelay = 2000;
const browsers   = new Set();

function connectGateway() {
  console.log('[proxy] Connecting to gateway...');
  gwWs = new WebSocket(GW_URL, { headers: { Origin: 'https://cliffcircuit.ai' } });

  gwWs.on('open', () => {
    console.log('[proxy] Gateway WS open, waiting for challenge...');
  });

  gwWs.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const logLen = msg.event === 'chat' ? 500 : 150;
    console.log('[proxy] GW recv:', JSON.stringify(msg).slice(0, logLen));

    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      const ts    = msg.payload?.ts || Date.now();
      gwWs.send(buildConnectRequest(0, nonce, ts));
      return;
    }

    if (msg.type === 'res' && msg.ok && (msg.payload?.connected || msg.payload?.type === 'hello-ok')) {
      console.log('[proxy] Gateway connected and authenticated');
      gwReady = true;
      gwReconnectDelay = 2000;

      for (const bws of browsers) {
        if (bws._pendingMessages?.length) {
          for (const m of bws._pendingMessages) gwWs.send(m);
          bws._pendingMessages = [];
        }
      }
      return;
    }

    if (msg.type === 'res' && !msg.ok && !gwReady) {
      console.error('[proxy] Gateway auth failed:', msg.error?.code, msg.error?.message);
      gwWs.close();
      return;
    }

    if (msg.type === 'res' || msg.type === 'event') {
      let desc = `${msg.type}`;
      if (msg.id) desc += ` id=${msg.id}`;
      if (msg.event) desc += ` event=${msg.event}`;
      console.log(`[proxy] Forwarding to ${browsers.size} browsers: ${desc}`);
    }
    const text = typeof data === 'string' ? data : data.toString('utf8');
    for (const bws of browsers) {
      if (bws.readyState === WebSocket.OPEN) {
        bws.send(text);
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
  });
}

async function sendToAgent(agentId, message, idempotencyKey, attachments) {
  return new Promise((resolve) => {
    if (!gwWs || gwWs.readyState !== WebSocket.OPEN || !gwReady) {
      resolve({ ok: false, error: 'Gateway not ready' });
      return;
    }

    const reqId = 'send-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const payload = {
      type: 'req',
      id: reqId,
      method: 'sessions_send',
      params: {
        label: `agent:${agentId}:main`,
        message: message
      }
    };
    if (attachments?.length) {
      payload.params.attachments = attachments;
    }
    if (idempotencyKey) {
      payload.params.idempotencyKey = idempotencyKey;
    }

    let timeout;
    const listener = (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.type === 'res' && msg.id === reqId) {
        clearTimeout(timeout);
        gwWs.off('message', listener);
        console.log(`[proxy] sendToAgent response for ${agentId}: ${msg.ok ? 'ok' : 'error'}`);
        resolve({ ok: msg.ok, status: msg.ok ? 200 : 400, result: msg.ok ? msg.payload : msg.error });
      }
    };

    gwWs.on('message', listener);
    timeout = setTimeout(() => {
      gwWs.off('message', listener);
      console.error(`[proxy] sendToAgent timeout for ${agentId}`);
      resolve({ ok: false, error: 'Timeout waiting for response' });
    }, 5000);

    console.log(`[proxy] Sending sessions_send RPC for agent:${agentId}:main (id: ${reqId})`);
    gwWs.send(JSON.stringify(payload));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('chat-proxy running\n');
    return;
  }

  if (req.method === 'POST' && req.url === '/api/send-to-agent') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1024 * 1024 * 10) {
        res.writeHead(413);
        res.end('Payload too large');
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const auth = req.headers.authorization || '';
        const token = auth.replace(/^Bearer\s+/, '');
        const user = await validateToken(token);
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        const payload = JSON.parse(body);
        const { agentId, message, idempotencyKey, attachments } = payload;

        if (!agentId || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing agentId or message' }));
          return;
        }

        const result = await sendToAgent(agentId, message, idempotencyKey, attachments);

        if (result.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, payload: result.result }));
        } else {
          res.writeHead(result.status || 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: result.error || result.result }));
        }
      } catch (err) {
        console.error('[proxy] /api/send-to-agent error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  async function requireAuth(req, res) {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/, '');
    const user = await validateToken(token);
    if (!user) {
      res.writeHead(401, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return user;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/channels')) {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/channels') {
      const user = await requireAuth(req, res);
      if (!user) return;
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const includeArchived = params.get('includeArchived') === 'true';
        const discovered = discoverAllChannels();
        const channels = discovered
          .map(d => d.meta)
          .filter(ch => includeArchived || ch.status !== 'archived');
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels }));
      } catch (err) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  const eventsMatch = req.url.match(/^\/api\/channels\/([^/]+)\/events/);
  if (req.method === 'GET' && eventsMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const channelId = decodeURIComponent(eventsMatch[1]);
    try {
      const dir = resolveChannelDir(channelId);
      if (!dir) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Channel not found' }));
        return;
      }
      const eventsPath = path.join(dir, 'events.jsonl');
      if (!fs.existsSync(eventsPath)) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channelId, events: [], total: 0 }));
        return;
      }
      const params = new URL(req.url, 'http://localhost').searchParams;
      const afterId = params.get('after') || null;
      const limit = parseInt(params.get('limit')) || 200;

      const raw = fs.readFileSync(eventsPath, 'utf8').trim();
      const lines = raw ? raw.split('\n').filter(Boolean) : [];
      let events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

      if (afterId) {
        const idx = events.findIndex(e => e.id === afterId);
        if (idx >= 0) events = events.slice(idx + 1);
      }
      events = events.slice(-limit);

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ channelId, events, total: lines.length }));
    } catch (err) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const channelMatch = req.url.match(/^\/api\/channels\/([^/]+)$/);
  if (req.method === 'GET' && channelMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const channelId = decodeURIComponent(channelMatch[1]);
    try {
      const dir = resolveChannelDir(channelId);
      if (!dir) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Channel not found' }));
        return;
      }
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'channel.json'), 'utf8'));
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meta));
    } catch (err) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'PATCH' && channelMatch) {
    const user = await requireAuth(req, res);
    if (!user) return;
    const channelId = decodeURIComponent(channelMatch[1]);
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1024 * 10) {
        res.writeHead(413, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const dir = resolveChannelDir(channelId);
        if (!dir) {
          res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Channel not found' }));
          return;
        }
        const payload = body ? JSON.parse(body) : {};
        if (payload.status !== 'archived') {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unsupported status' }));
          return;
        }
        const metaPath = path.join(dir, 'channel.json');
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta.status = payload.status;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(meta));
      } catch (err) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found\n');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  console.log(`[proxy] WS upgrade request: ${req.url}`);
  wss.handleUpgrade(req, socket, head, (browserWs) => {
    wss.emit('connection', browserWs, req);
  });
});

wss.on('connection', async (browserWs, req) => {
  const ip = req.socket.remoteAddress;

  let token;
  try {
    const u = new URL(req.url, 'http://localhost');
    token = u.searchParams.get('token');
  } catch {
    browserWs.close(1008, 'Bad request');
    return;
  }

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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] Chat proxy listening on ws://127.0.0.1:${PORT}`);
  console.log(`[proxy] Gateway: ${GW_URL}`);
  console.log(`[proxy] Auth: Google OAuth (allowed: ${ALLOWED_EMAILS.join(', ')})`);
  connectGateway();
});

process.on('SIGTERM', () => {
  console.log('[proxy] Shutting down...');
  server.close(() => process.exit(0));
});
