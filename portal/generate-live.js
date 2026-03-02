#!/usr/bin/env node
/**
 * generate-live.js
 * Fast live-data refresh — runs every 2 minutes via cron.
 * Only pulls active session context (context window %, model, tokens).
 * Writes portal/live-data.json and pushes to GitHub.
 * No external HTTP calls. No image processing. Should complete in <15s.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_DIR = '/tmp/cliffcircuit-ai';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 15000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function keychain(name) {
  return run(`security find-generic-password -s ${name} -w`);
}

async function main() {
  console.log('Generating live data...');

  // Active Sessions (context window)
  const sessions = (() => {
    try {
      const raw = run('openclaw sessions');
      const result = [];
      raw.split('\n').forEach(line => {
        const m = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+([\w-]+)\s+(\d+)k\/(\d+)k\s+\((\d+)%\)/);
        if (!m) return;
        const key = m[2];
        const used = parseInt(m[5]) * 1000;
        const limit = parseInt(m[6]) * 1000;
        const pct = parseInt(m[7]);
        const model = m[4];
        const age = m[3].trim();
        if (key.includes('cron')) return;
        if (age.match(/\d+h ago/)) return;
        const minMatch = age.match(/^(\d+)m ago/);
        if (minMatch && parseInt(minMatch[1]) > 10 && !key.includes('teleg')) return;
        let label = 'Unknown';
        if (key.includes('teleg')) label = 'Telegram';
        else if (key === 'agent:main:main') label = 'Main';
        else if (key.includes('subag')) label = 'Agent';
        let lastActiveAt = null;
        if (age === 'just now') lastActiveAt = Date.now();
        else {
          const mm = age.match(/^(\d+)m ago/);
          if (mm) lastActiveAt = Date.now() - parseInt(mm[1]) * 60000;
        }
        result.push({ label, key, used, limit, pct, model, lastActiveAt });
      });
      return result;
    } catch (e) { return []; }
  })();

  // Conversation Sessions (all agents, last 30 days)
  const conversationSessions = (() => {
    try {
      const raw = run('openclaw sessions --all-agents --json');
      const d = JSON.parse(raw);
      const list = Array.isArray(d) ? d : (d.sessions || []);
      const cutoff = Date.now() - 30 * 86400000;
      return list
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
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) { return []; }
  })();

  // Session History (from status --json)
  const sessionHistory = (() => {
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
    } catch (e) { return []; }
  })();

  const liveData = {
    generatedAt: new Date().toISOString(),
    sessions,
    conversationSessions,
    sessionHistory,
  };

  // Push to GitHub
  const ghToken = keychain('github-cliffcircuit');
  if (!ghToken) { console.error('No GitHub token'); process.exit(1); }

  const repoExists = fs.existsSync(path.join(REPO_DIR, '.git'));
  if (repoExists) {
    run(`cd ${REPO_DIR} && git fetch https://${ghToken}@github.com/CliffCircuit/cliffcircuit-ai.git main && git reset --hard FETCH_HEAD`, { stdio: 'pipe' });
  } else {
    run(`rm -rf ${REPO_DIR}`, { stdio: 'pipe' });
    run(`git clone https://${ghToken}@github.com/CliffCircuit/cliffcircuit-ai.git ${REPO_DIR}`, { stdio: 'pipe' });
  }

  const outPath = path.join(REPO_DIR, 'portal/live-data.json');
  fs.writeFileSync(outPath, JSON.stringify(liveData, null, 2));
  console.log('Wrote live-data.json');

  run(`cd ${REPO_DIR} && git config user.email "cliff@cliffcircuit.ai"`, { stdio: 'pipe' });
  run(`cd ${REPO_DIR} && git config user.name "Cliff"`, { stdio: 'pipe' });
  run(`cd ${REPO_DIR} && git add portal/live-data.json`, { stdio: 'pipe' });
  const status = run(`cd ${REPO_DIR} && git status --porcelain`);
  if (status) {
    run(`cd ${REPO_DIR} && git commit -m "live: session data ${new Date().toISOString()}"`, { stdio: 'pipe' });
    run(`cd ${REPO_DIR} && git push https://${ghToken}@github.com/CliffCircuit/cliffcircuit-ai.git main`, { stdio: 'pipe' });
    console.log('Pushed live-data.json');
  } else {
    console.log('No changes');
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
