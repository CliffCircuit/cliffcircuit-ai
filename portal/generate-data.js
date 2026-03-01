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
    return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
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
    queue = JSON.parse(raw).queue || [];
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
        schedule: j.schedule?.expr || j.schedule?.kind || '—',
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
  const data = {
    generatedAt: new Date().toISOString(),
    auth: {
      // SHA-256 of "cliffcircuit" — change this to change the portal password
      passwordHash: '1b2a92a86286fbc041d175321caa4a11309d3daf6c7502209edbb60135287cb7'
    },
    queue: cleanQueue,
    crons,
    agentTokens: crons._agentTokens || {},
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
    sites,
    credentials,
    twitter,
    disk,
    stats,
  };

  // ── Write + Push ───────────────────────────────────────────────
  const outPath = path.join(REPO_DIR, 'portal/data.json');
  fs.mkdirSync(path.join(REPO_DIR, 'portal'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log('Wrote data.json');

  const ghToken = keychain('github-cliffcircuit');
  if (ghToken) {
    try {
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
