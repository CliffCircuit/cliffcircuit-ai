#!/usr/bin/env node
/**
 * generate-data.js
 * Generates /portal/data.json for the CliffCircuit Portal dashboard.
 * Run by cron every 30 minutes. Commits + pushes to GitHub Pages.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKSPACE = '/Users/openclaw/.openclaw/workspace';
const QUEUE_FILE = path.join(WORKSPACE, 'samantha/content-queue.json');
const REPO_DIR = '/tmp/cliffcircuit-ai';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 12000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function keychain(name) {
  return run(`security find-generic-password -s ${name} -w`);
}

async function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: null }); });
  });
}

async function main() {
  console.log('Generating portal data...');

  // ── Queue ──────────────────────────────────────────────────────
  let queue = [];
  try {
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.queue || !Array.isArray(parsed.queue)) {
      console.error("ABORT: content-queue.json missing .queue array (keys:", Object.keys(parsed).slice(0,5).join(","), "). Not overwriting data.json.");
      process.exit(1);
    }
    queue = parsed.queue;
  } catch (e) {
    console.warn('Could not read queue:', e.message);
  }

  // Strip htmlContent to keep data.json small
  const cleanQueue = queue.map(({ htmlContent, ...rest }) => rest);

  // ── Cron Jobs ──────────────────────────────────────────────────
  let crons = [];
  try {
    const cronRaw = run('openclaw cron list --json');
    const cronData = JSON.parse(cronRaw);
    const jobs = Array.isArray(cronData) ? cronData : (cronData.jobs || cronData.entries || []);
    const now = Date.now();
    crons = jobs.map(j => {
      const state = j.state || {};
      const status = state.lastRunStatus || (state.consecutiveErrors > 0 ? 'error' : 'idle');
      const lastMs = state.lastRunAtMs;
      const nextMs = state.nextRunAtMs;
      const msAgo = lastMs ? now - lastMs : null;
      const msUntil = nextMs ? nextMs - now : null;
      function fmtDuration(ms) {
        if (!ms || ms < 0) return null;
        const m = Math.round(ms / 60000);
        if (m < 60) return m + 'm';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h';
        return Math.round(h / 24) + 'd';
      }
      const payload = j.payload || {};
      const msg = payload.message || payload.systemEvent || '';
      // Use human-set description if available, else fall back to message
      const desc = j.description || msg.split(/\n/)[0].slice(0, 200) || '—';
      return {
        name: j.name,
        schedule: (() => {
          const s = j.schedule || {};
          if (s.expr) return s.expr;
          if (s.kind === 'every' && s.everyMs) {
            const mins = s.everyMs / 60000;
            if (mins < 60) return 'every ' + mins + 'm';
            return 'every ' + Math.round(mins / 60) + 'h';
          }
          if (s.kind === 'at' && s.at) return 'at ' + s.at;
          return s.kind || '—';
        })(),
        status: status,
        lastRun: msAgo !== null ? fmtDuration(msAgo) + ' ago' : null,
        lastRunMs: lastMs || null,
        nextRun: msUntil !== null ? 'in ' + fmtDuration(Math.abs(msUntil)) : null,
        agent: j.agentId || 'main',
        consecutiveErrors: state.consecutiveErrors || 0,
        id: j.id,
        model: payload.model || null,
        thinking: payload.thinking || null,
        description: desc,
      };
    });

    // ── Token usage per job (from most recent run of each job) ──
    const agentTokens = {};
    for (const j of jobs) {
      if (!j.state?.lastRunAtMs) continue;
      try {
        const runsRaw = run(`openclaw cron runs --id ${j.id}`);
        const runsData = JSON.parse(runsRaw);
        const lastEntry = (runsData.entries || [])[0];
        if (lastEntry?.usage) {
          const total = lastEntry.usage.total_tokens || 0;
          j._lastRunTokens = total;
          // Also track per-agent for the context bar
          const agentId = j.agentId || 'main';
          if (!agentTokens[agentId] || total > (agentTokens[agentId].totalTokens || 0)) {
            agentTokens[agentId] = {
              totalTokens: total,
              inputTokens: lastEntry.usage.input_tokens || 0,
              outputTokens: lastEntry.usage.output_tokens || 0,
              jobName: j.name,
            };
          }
        }
      } catch(e) { /* ignore */ }
    }
    // Attach per-job token usage to cron entries
    crons = crons.map((c, i) => ({
      ...c,
      lastRunTokens: jobs[i]?._lastRunTokens || null,
    }));
    crons._agentTokens = agentTokens;

  } catch (e) {
    console.warn('Could not load crons:', e.message);
  }

  // ── Sites ──────────────────────────────────────────────────────
  const siteUrls = ['shopcliffmart.com', 'cliffcircuit.ai'];
  const sites = await Promise.all(siteUrls.map(async url => {
    const r = await httpGet('https://' + url);
    return { url, status: r.status };
  }));

  // ── Credentials ────────────────────────────────────────────────
  const credChecks = [
    { name: 'CliffCircuit X API', key: 'cliffcircuit-x-api' },
    { name: 'TimHarris707 X API', key: 'timharris707-x-api' },
    { name: 'OpenRouter API', key: 'openrouter-api-key' },
    { name: 'GitHub Token', key: 'github-cliffcircuit' },
  ];
  const credentials = credChecks.map(c => {
    const val = keychain(c.key);
    return { name: c.name, ok: !!(val && val.length > 5) };
  });

  // ── Twitter Stats (live from TwitterAPI.io) ────────────────────
  let twitter = {};
  const GROWTH_FILE = path.join(WORKSPACE, 'memory/follower-growth.json');

  async function getTwitterProfile(username) {
    const apiKey = keychain('twitterapi-io-key');
    if (!apiKey) return null;
    const r = await httpGet(
      `https://api.twitterapi.io/twitter/user/info?userName=${username}`,
      { 'X-API-Key': apiKey }
    );
    if (r.status === 200 && r.body?.data) {
      return {
        followers: r.body.data.followers,
        posts: r.body.data.statusesCount,
      };
    }
    return null;
  }

  const [cliffData, timData] = await Promise.all([
    getTwitterProfile('CliffCircuit'),
    getTwitterProfile('timharris707'),
  ]);

  if (cliffData) {
    twitter.cliffFollowers = cliffData.followers;
    twitter.cliffPosts = cliffData.posts;
  }
  if (timData) {
    twitter.timFollowers = timData.followers;
    twitter.timPosts = timData.posts;
  }

  // ── Growth History ─────────────────────────────────────────────
  let growth = [];
  try {
    if (fs.existsSync(GROWTH_FILE)) {
      growth = JSON.parse(fs.readFileSync(GROWTH_FILE, 'utf8'));
    }
  } catch {}

  // Append today's snapshot (once per day — dedupe by date)
  const todayPT = new Date(Date.now() - 8*60*60*1000).toISOString().slice(0, 10);
  const existingToday = growth.findIndex(g => g.date === todayPT);
  const snapshot = {
    date: todayPT,
    cliffFollowers: twitter.cliffFollowers ?? null,
    timFollowers: twitter.timFollowers ?? null,
  };
  if (existingToday >= 0) {
    growth[existingToday] = snapshot; // update today's entry
  } else {
    growth.push(snapshot);
  }
  // Keep last 30 days
  growth = growth.slice(-30);
  fs.writeFileSync(GROWTH_FILE, JSON.stringify(growth, null, 2));

  // Compute growth deltas
  if (growth.length >= 2) {
    const prev = growth[growth.length - 2];
    const curr = growth[growth.length - 1];
    twitter.cliffGrowthToday = curr.cliffFollowers != null && prev.cliffFollowers != null
      ? curr.cliffFollowers - prev.cliffFollowers : null;
    twitter.timGrowthToday = curr.timFollowers != null && prev.timFollowers != null
      ? curr.timFollowers - prev.timFollowers : null;
  }
  if (growth.length >= 8) {
    const weekAgo = growth[growth.length - 8];
    const curr = growth[growth.length - 1];
    twitter.cliffGrowthWeek = curr.cliffFollowers != null && weekAgo.cliffFollowers != null
      ? curr.cliffFollowers - weekAgo.cliffFollowers : null;
    twitter.timGrowthWeek = curr.timFollowers != null && weekAgo.timFollowers != null
      ? curr.timFollowers - weekAgo.timFollowers : null;
  }
  // All-time (first snapshot we have)
  if (growth.length >= 2) {
    const first = growth[0];
    const curr = growth[growth.length - 1];
    twitter.cliffGrowthAllTime = curr.cliffFollowers != null && first.cliffFollowers != null
      ? curr.cliffFollowers - first.cliffFollowers : null;
    twitter.timGrowthAllTime = curr.timFollowers != null && first.timFollowers != null
      ? curr.timFollowers - first.timFollowers : null;
    twitter.trackingSince = first.date;
  }
  twitter.sparklineCliff = growth.map(g => g.cliffFollowers ?? 0);
  twitter.sparklineTim = growth.map(g => g.timFollowers ?? 0);

  // ── Agent Configs (thinking levels, models) ─────────────────────
  const agentConfigs = {};
  try {
    const agentsRaw = run('openclaw config get agents.list');
    const defaultThinking = run('openclaw config get agents.defaults.thinkingDefault') || 'off';
    const defaultModel = run('openclaw config get agents.defaults.model.primary') || 'unknown';
    const agents = JSON.parse(agentsRaw);
    for (const a of agents) {
      agentConfigs[a.id] = {
        id: a.id,
        name: a.name || a.id,
        model: a.model || defaultModel,
        thinking: defaultThinking,
      };
    }
    // Check active sessions for runtime thinking level
    const sessionsRaw = run('openclaw sessions --all-agents --json');
    if (sessionsRaw) {
      const sessData = JSON.parse(sessionsRaw);
      const sessions = Array.isArray(sessData) ? sessData : (sessData.sessions || []);
      for (const s of sessions) {
        if (s.agentId && s.thinkingLevel && agentConfigs[s.agentId]) {
          if (!agentConfigs[s.agentId]._lastUpdate || s.updatedAt > agentConfigs[s.agentId]._lastUpdate) {
            agentConfigs[s.agentId].thinking = s.thinkingLevel;
            agentConfigs[s.agentId]._lastUpdate = s.updatedAt;
          }
        }
      }
    }
    for (const id in agentConfigs) delete agentConfigs[id]._lastUpdate;
  } catch(e) { console.warn('Could not load agent configs:', e.message); }

  // ── Disk ───────────────────────────────────────────────────────
  let disk = {};
  try {
    const dfOut = run(`df -h ${WORKSPACE} | tail -1`);
    const parts = dfOut.split(/\s+/);
    const pct = parts.find(p => p.includes('%'));
    if (pct) disk.percent = parseInt(pct);
  } catch {}

  // ── Stats ──────────────────────────────────────────────────────
  // Use PT date (UTC-8) so "today" matches timestamps stored in PT
  const today = new Date(Date.now() - 8*60*60*1000).toISOString().slice(0, 10);
  const pubToday = cleanQueue.filter(i => i.status === 'published' && (i.publishedAt || '').startsWith(today));
  const stats = {
    articlesToday: pubToday.filter(i => i.account !== 'timharris707').length,
    timPostsToday: pubToday.filter(i => i.account === 'timharris707').length,
  };

  // ── Assemble ───────────────────────────────────────────────────
  // ── Token Usage / Cost History ───────────────────────────────
  let costs = {};
  try {
    const { execSync: _execSync } = require('child_process');
    const cutoff30d = Date.now() - 30 * 86400000;
    // Sequential — execSync + Promise.all don't mix (race condition)
    for (const j of crons) {
      if (!j.id) continue;
      try {
        const raw = _execSync(`openclaw cron runs --id ${j.id}`, { encoding: 'utf8', timeout: 10000 }).trim();
        const runsData = JSON.parse(raw);
        const entries = (runsData.entries || [])
          .filter(e => (e.runAtMs || 0) >= cutoff30d && e.usage)
          .map(e => ({ ts: e.runAtMs, tokens: e.usage.total_tokens || 0, tokensInput: e.usage.input_tokens || 0, tokensCacheRead: e.usage.cache_read_input_tokens || 0, tokensCacheWrite: e.usage.cache_creation_input_tokens || 0, tokensOut: e.usage.output_tokens || 0, status: e.status }));
        if (entries.length) costs[j.id] = entries;
      } catch(e) { /* skip this job */ }
    }
  } catch(e) { console.warn('Could not collect token history:', e.message); }

  // ── Gateway Health ────────────────────────────────────────────
  let gateway = { reachable: null, latencyMs: null, version: null, error: null };
  try {
    const gRaw = run('openclaw status --json');
    if (gRaw) {
      const gData = JSON.parse(gRaw);
      const gw = gData.gateway || {};
      const svc = gData.gatewayService || {};
      gateway = {
        reachable: gw.reachable ?? null,
        latencyMs: gw.connectLatencyMs ?? null,
        version: gw.self?.version ?? null,
        error: gw.error ?? null,
        running: svc.runtimeShort?.includes('running') ?? null,
      };
    }
  } catch(e) { gateway.error = e.message; }

  // ── Subagent Sessions + Exec Events from DB ───────────────
  // NOTE: seed script removed from hot path (was scanning 570+ JSONL files on every run, causing hangs)
  // DB is updated by OpenClaw's own session tracking; seed runs separately if needed
  // Auto-apply task_name mapping
  try {
    const _db2 = new (require('better-sqlite3'))('/Users/openclaw/.openclaw/workspace/portal-data.db');
    try { _db2.exec('ALTER TABLE subagent_sessions ADD COLUMN task_name TEXT'); } catch(e) {}
    const cronMap = {
      'af79f87e-7b1d-4dfc-bda8-b7b81b6c4cc1':'Publish','785dc24f-e15b-420b-a7e5-0116f5e60e93':'Portal Data Refresh',
      '01a338f9-8be9-4ab8-82d9-a050f64bdaf6':'Pipeline Health Check','498ea0a9-f2c2-49f2-bd78-73c683af9d82':'Tim Posts',
      'fcf70c5a-2ce0-4da0-acb3-f02bdbb9d4b5':'Evening Check','9d407dd0-af2b-4bf5-97f2-ae5d006a8663':'Article Review',
      'df0efdc5-5e00-45d0-a2d1-11906a278a9f':'Draft Articles (disabled)','9ce4365b-496c-42ef-941b-ff56b8aa1861':'Recycle Rejected (disabled)',
      '3bcb8b34-667b-42a6-a156-26bead73d717':'GitHub Monitoring','ca0f70f9-6972-494d-8910-4b65c58ddeae':'Social Monitoring',
      '763a67ae-49b6-4bd7-82ad-5cac8510352a':'Nightly Extraction','248701de-21b3-4c1a-86b6-164a8de04ca3':'Nightly Git Backup',
      '8cd72f3d-03b2-4160-81b2-bae92ee72620':'Cliff Tweets','fbd92dff-ce46-48d2-8bfd-6873c75b1031':'Morning Check-In',
      'bbbd846b-ecb6-420f-822b-4c95e69a6d4d':'Weekly Report','586ef3eb-f39e-4a5a-97d6-ab45b29a9f32':'Tim Thread Draft',
      '845fff96-da1a-4ebd-b653-9b3007085dd3':'Writer','f50b5756-82e2-4fd8-b8e4-d1b4045a1c20':'Media',
      '43a6704d-8e77-448a-81d7-e7fda3ac7614':'Recycle Writer','50708c6f-37b2-4f19-88a9-9ff56a732f7c':'Recycle Media',
    };
    const upd = _db2.prepare('UPDATE subagent_sessions SET task_name=? WHERE session_id=? AND task_name IS NULL');
    const rows2 = _db2.prepare('SELECT session_id, label FROM subagent_sessions WHERE task_name IS NULL').all();
    for (const r of rows2) {
      const m = (r.label||'').match(/cron:([a-f0-9-]{36})/);
      if (m && cronMap[m[1]]) upd.run(cronMap[m[1]], r.session_id);
    }
    _db2.close();
  } catch(e) {}

  let subagentSessions = { total: 0, activeCount: 0, totalCostUsd: 0, totalTokens: 0, items: [] };
  let execEvents = { total: 0, failureCount: 0, items: [] };
  try {
    // Incremental DB sync — only scans JSONL files modified since last run (~50ms)
    try { require('child_process').execSync('node /Users/openclaw/.openclaw/workspace/portal-db-sync.js', { timeout: 15000, stdio: 'pipe' }); } catch(e) { console.error('sync warn:', e.message); }
    const Database = require('better-sqlite3');
    const db = new Database('/Users/openclaw/.openclaw/workspace/portal-data.db', { readonly: true });

    const sessions = db.prepare('SELECT *, COALESCE(task_name, label) as display_name FROM subagent_sessions ORDER BY started_at DESC LIMIT 500').all();
    const totalSessions = db.prepare('SELECT COUNT(*) as c FROM subagent_sessions').get().c;
    const activeCount = db.prepare("SELECT COUNT(*) as c FROM subagent_sessions WHERE status = 'running'").get().c;
    const totalCostDb = db.prepare('SELECT SUM(estimated_cost_usd) as s FROM subagent_sessions').get().s || 0;
    const totalTokensDb = db.prepare('SELECT SUM(tokens_total) as s FROM subagent_sessions').get().s || 0;

    const execItems = db.prepare('SELECT * FROM exec_events ORDER BY started_at DESC LIMIT 100').all();
    const totalExec = db.prepare('SELECT COUNT(*) as c FROM exec_events').get().c;
    const failCount = db.prepare('SELECT COUNT(*) as c FROM exec_events WHERE exit_code != 0').get().c;

    subagentSessions = {
      total: totalSessions,
      activeCount,
      totalCostUsd: Math.round(totalCostDb * 10000) / 10000,
      totalTokens: totalTokensDb,
      items: sessions
    };

    execEvents = {
      total: totalExec,
      failureCount: failCount,
      items: execItems
    };

    db.close();
  } catch(e) {
    console.error('DB read failed:', e.message);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    auth: {
      // SHA-256 of "cliffcircuit" — change this to change the portal password
      passwordHash: '1b2a92a86286fbc041d175321caa4a11309d3daf6c7502209edbb60135287cb7'
    },
    queue: cleanQueue,
    crons,
    agentTokens: crons._agentTokens || {},
    agentConfigs,
    sessions: (() => {
      try {
        const raw = run('openclaw sessions');
        const sessions = [];
        raw.split('\n').forEach(line => {
          // Match lines like: direct agent:main:teleg...624734  just now  claude-sonnet-4-6 168k/200k (84%)
          const m = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+([\w-]+)\s+(\d+)k\/(\d+)k\s+\((\d+)%\)/);
          if (!m) return;
          const key = m[2];
          const used = parseInt(m[5]) * 1000;
          const limit = parseInt(m[6]) * 1000;
          const pct = parseInt(m[7]);
          const model = m[4];
          const age = m[3].trim();
          // Skip cron sessions
          if (key.includes('cron')) return;
          // Skip stale sessions (older than 10 minutes)
          const stalePatterns = /(\d+)h ago|([1-9]\d) ago/;
          if (age.match(/\d+h ago/)) return; // hours old = stale
          const minMatch = age.match(/^(\d+)m ago/);
          if (minMatch && parseInt(minMatch[1]) > 10) return; // >10min = stale
          // Label the session
          let label = 'Unknown';
          if (key.includes('teleg')) label = 'Telegram';
          else if (key === 'agent:main:main') label = 'Main';
          else if (key.includes('subag')) label = 'Agent';
          // Convert age string to absolute timestamp so portal can tick it live
          let lastActiveAt = null;
          if (age === 'just now') lastActiveAt = Date.now();
          else {
            const mm = age.match(/^(\d+)m ago/);
            if (mm) lastActiveAt = Date.now() - parseInt(mm[1]) * 60000;
          }
          sessions.push({ label, key, used, limit, pct, model, lastActiveAt });
        });
        return sessions;
      } catch(e) { return []; }
    })(),
    conversationSessions: (() => {
      try {
        const raw = run('openclaw sessions --all-agents --json');
        const d = JSON.parse(raw);
        const sessions = Array.isArray(d) ? d : (d.sessions || []);
        const cutoff = Date.now() - 30 * 86400000;
        return sessions
          .filter(s => s.updatedAt > cutoff)
          .map(s => ({
            sessionId: s.sessionId,
            key: s.key,
            agentId: s.agentId,
            kind: s.kind,
            model: s.model,
            totalTokens: s.totalTokens || 0,
            inputTokens: s.inputTokens || 0,
            outputTokens: s.outputTokens || 0,
            percentUsed: s.percentUsed || 0,
            updatedAt: s.updatedAt,
            thinkingLevel: s.thinkingLevel || null,
          }))
          .sort((a,b) => b.updatedAt - a.updatedAt);
      } catch(e) { return []; }
    })(),
    sessionHistory: (() => {
      try {
        const raw = run('openclaw status --json');
        const d = JSON.parse(raw);
        const recent = (d.sessions || {}).recent || [];
        return recent.map(s => ({
          sessionId: s.sessionId,
          key: s.key,
          agentId: s.agentId,
          kind: s.kind,
          model: s.model,
          totalTokens: s.totalTokens || 0,
          inputTokens: s.inputTokens || 0,
          outputTokens: s.outputTokens || 0,
          cacheRead: s.cacheRead || 0,
          percentUsed: s.percentUsed || 0,
          updatedAt: s.updatedAt,
          thinkingLevel: s.thinkingLevel || null,
        }));
      } catch(e) { return []; }
    })(),
    sites,
    credentials,
    twitter,
    disk,
    stats,
    gateway,
    costs,
    subagentSessions,
    execEvents,
  };

  // ── Write + Push ───────────────────────────────────────────────
  const ghToken = keychain('github-cliffcircuit');
  if (ghToken) {
    try {
      // Always use a fresh clone to avoid divergence issues
      run(`rm -rf ${REPO_DIR}`, { stdio: 'pipe' });
      run(`git clone https://${ghToken}@github.com/CliffCircuit/cliffcircuit-ai.git ${REPO_DIR}`, { stdio: 'pipe' });
      // Write AFTER clone so the file isn't wiped
      const outPath = path.join(REPO_DIR, 'portal/data.json');
      fs.mkdirSync(path.join(REPO_DIR, 'portal'), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log('Wrote data.json');

      // Pre-push hero images + article HTML for approved (unpublished) articles so portal previews work
      try {
        const queuePath = '/Users/openclaw/.openclaw/workspace/samantha/content-queue.json';
        if (fs.existsSync(queuePath)) {
          const queue = JSON.parse(fs.readFileSync(queuePath));
          const items = Array.isArray(queue) ? queue : queue.queue || Object.values(queue);
          const approved = items.filter(i => i.status === 'approved');
          // Images
          const imgDestDir = path.join(REPO_DIR, 'portal/images');
          fs.mkdirSync(imgDestDir, { recursive: true });
          // Article HTML previews
          const previewDestDir = path.join(REPO_DIR, 'portal/previews');
          fs.mkdirSync(previewDestDir, { recursive: true });
          approved.forEach(item => {
            if (item.heroImage) {
              const srcPath = `/Users/openclaw/.openclaw/workspace/cliffmart${item.heroImage}`;
              const slug = path.basename(item.heroImage);
              const destPath = path.join(imgDestDir, slug);
              if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
              }
            }
            if (item.slug && item.htmlContent) {
              const slug = item.heroImage ? item.heroImage.split('/').pop() : null;
              const heroImg = slug ? `<img src="https://cliffcircuit.ai/portal/images/${slug}" style="width:100%;border-radius:8px;margin-bottom:1.5rem;aspect-ratio:16/9;object-fit:contain;background:#111;" onerror="this.src='https://shopcliffmart.com${item.heroImage}';this.onerror=null;">` : '';
              const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${(item.title||'').replace(/</g,'&lt;')}</title>
  <link rel="stylesheet" href="https://shopcliffmart.com/styles.css">
  <style>body{background:#0f172a;color:#e2e8f0;padding:2rem;max-width:860px;margin:0 auto;font-family:system-ui,sans-serif;line-height:1.75;}h1{color:#fff;font-size:1.8rem;margin-bottom:0.75rem;}h2{color:#fff;font-size:1.3rem;margin-top:2rem;margin-bottom:0.75rem;}p{margin-bottom:1.1rem;}.excerpt{color:#94a3b8;font-style:italic;border-left:3px solid #334155;padding-left:1rem;margin-bottom:2rem;}.back{display:inline-block;margin-bottom:1.5rem;background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;text-decoration:none;}</style>
</head>
<body>
  <a class="back" onclick="window.close()" href="javascript:history.back()">← Back</a>
  ${heroImg}
  <h1>${(item.title||'').replace(/</g,'&lt;')}</h1>
  <p class="excerpt">${(item.excerpt||'').replace(/</g,'&lt;')}</p>
  ${item.htmlContent}
</body>
</html>`;
              fs.writeFileSync(path.join(previewDestDir, `${item.slug}.html`), previewHtml);
            }
          });
          console.log('Pre-pushed images + previews for', approved.length, 'approved items');
        }
      } catch(e) { console.warn('Pre-push skipped:', e.message); }
      run(`cd ${REPO_DIR} && git config user.email "cliff@cliffcircuit.ai"`, { stdio: 'pipe' });
      run(`cd ${REPO_DIR} && git config user.name "Cliff"`, { stdio: 'pipe' });
      run(`cd ${REPO_DIR} && git add portal/`, { stdio: 'pipe' });
      const status = run(`cd ${REPO_DIR} && git status --porcelain`);
      if (status) {
        run(`cd ${REPO_DIR} && git commit -m "chore: update portal data [${new Date().toISOString().slice(11,16)} UTC]"`, { stdio: 'pipe' });
        run(`cd ${REPO_DIR} && git push https://${ghToken}@github.com/CliffCircuit/cliffcircuit-ai.git main`, { stdio: 'pipe' });
        console.log('✅ Pushed to GitHub');
      } else {
        console.log('No changes to push');
      }
    } catch (e) {
      console.error('Push failed:', e.message);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
