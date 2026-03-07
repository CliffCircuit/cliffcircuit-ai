// ═══════════════════════════════════════════════════════════════════════════
// portal-common.js — Shared code for all CliffCircuit Portal pages
// ═══════════════════════════════════════════════════════════════════════════

// ── Session Labels (keyed by session_key → friendly name) ──
let SESSION_LABELS = {};
const _sessionLabelsReady = fetch('/portal/session-labels.json?t=' + Date.now()).then(r => r.json()).then(d => { SESSION_LABELS = d || {}; }).catch(() => {});

// ── Constants ────────────────────────────────────────────────────────────
const DEFAULT_HASH = '1b2a92a86286fbc041d175321caa4a11309d3daf6c7502209edbb60135287cb7';
const SUPABASE_URL = 'https://glmwayzpcpbscunvycqk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbXdheXpwY3Bic2N1bnZ5Y3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MjMyNzMsImV4cCI6MjA4ODA5OTI3M30.AWfTKi6szXzwc6821mYkiXUxpQ5kv2sS_hWTReBoVCY';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Canonical Naming Maps (THE single source of truth) ──────────────────
const CRON_UUID_MAP = {
  'af79f87e-7b1d-4dfc-bda8-b7b81b6c4cc1': 'samantha-publish',
  '785dc24f-e15b-420b-a7e5-0116f5e60e93': 'portal-data-refresh',
  '01a338f9-8be9-4ab8-82d9-a050f64bdaf6': 'pipeline-health-check',
  '498ea0a9-f2c2-49f2-bd78-73c683af9d82': 'samantha-tim-tweets',
  '9d407dd0-af2b-4bf5-97f2-ae5d006a8663': 'cliff-article-review',
  '8cd72f3d-03b2-4160-81b2-bae92ee72620': 'samantha-cliff-tweets',
  'fbd92dff-ce46-48d2-8bfd-6893c75b1031': 'morning-check-in',
  '46b53934-fd27-4950-959d-9218f4201756': 'cliff-scheduler',
  '43a6704d-8e77-448a-81d7-e7fda3ac7614': 'samantha-recycle-writer',
  '50708c6f-37b2-4f19-88a9-9ff56a732f7c': 'samantha-recycle-media',
  'ca0f70f9-6972-494d-8910-4b65c58ddeae': 'social-monitoring',
  '3bcb8b34-667b-42a6-a156-26bead73d717': 'github-monitoring',
  '763a67ae-49b6-4bd7-82ad-5cac8510352a': 'nightly-extraction',
  '248701de-21b3-4c1a-86b6-164a8de04ca3': 'nightly-git-backup',
  'bbbd846b-ecb6-420f-822b-4c95e69a6d4d': 'weekly-report',
  'b2055796-4f19-4200-b970-f40c7212e649': 'samantha-writer',
  'f19de962-ec8e-48ee-bfcb-99df0abd28f8': 'samantha-writer',
  'cc251f3e-2019-4111-af28-b504c9e37f29': 'samantha-writer',
  '0d219875-49e2-48fb-a1f0-5532368e21cc': 'samantha-writer',
  '4e1e60f5-0ab4-4a91-94be-69c971e839dd': 'samantha-media',
  '905cd0d7-c467-4682-8c7a-dd249b75e24e': 'samantha-cliff-tweets',
  '72d80f1a-9acb-4e62-958e-eaa5380189ec': 'samantha-cliff-tweets',
  'fae33607-02a5-413e-baa4-405225ea136c': 'samantha-cliff-tweets',
  'f38645ba-b021-4156-9601-e679fdc22d3d': 'samantha-tim-tweets',
  'd0a2f346-8f18-450f-9822-47f6d987523c': 'samantha-tim-tweets',
  'e4ca8fe6-f2b3-4569-9e2a-5d07e7d19af6': 'samantha-tim-tweets',
  '50e0a780-c5ae-4d24-bf14-714e535de315': 'atlas-build',
  'befa343c-3f24-40bf-97ab-102954820866': 'atlas-refactor',
  '47cfaf3a-ca98-4eb5-9851-b12ee18641fa': 'atlas-debug',
  '6cef6a39-3fde-4575-9208-947d53f6a425': 'atlas-debug',
  'a59a04ca-a788-4850-8e41-ca5c622da51d': 'atlas-debug',
  'f50b5756-82e2-4fd8-b8e4-d1b4045a1c20': 'samantha-media',
};

const CRON_DISPLAY = {
  'samantha-draft':          'Article Draft',
  'samantha-publish':        'Publish',
  'samantha-writer':         'Article Writer',
  'samantha-media':          'Media / Images',
  'samantha-cliff-tweets':   'Cliff Tweets',
  'samantha-tim-tweets':     'Tim Posts',
  'samantha-message-check':  'Message Check',
  'samantha-recycle':        'Recycle Rejected',
  'samantha-recycle-writer': 'Recycle Writer',
  'samantha-recycle-media':  'Recycle Media',
  'cliff-article-review':    'Article Review',
  'cliff-message-check':     'Message Check',
  'cliff-scheduler':         'Scheduler',
  'scout-message-check':     'Message Check',
  'portal-data-refresh':     'Portal Refresh',
  'portal-live-refresh':     'Portal Refresh',
  'social-monitoring':       'Social Monitoring',
  'github-monitoring':       'GitHub Monitoring',
  'pipeline-health-check':   'Pipeline Health',
  'nightly-extraction':      'Nightly Extraction',
  'nightly-git-backup':      'Nightly Git Backup',
  'morning-check-in':        'Morning Check-In',
  'weekly-report':           'Weekly Report',
  'atlas-build':             'Build',
  'atlas-refactor':          'Refactor',
  'atlas-debug':             'Debug',
  'evening-check':           'Evening Check',
  'daily-cost-report':       'Daily Cost Report',
};

// ── Route cron jobs to agents by name prefix ────────────────────────────
function cronAgentFromName(name) {
  if (!name) return null;
  if (name.startsWith('samantha-')) return 'samantha';
  if (name.startsWith('atlas-')) return 'atlas';
  if (name.startsWith('scout-') || name === 'portal-data-refresh') return 'scout';
  if (name.startsWith('cliff-')) return 'main';
  // Everything else (pipeline-health-check, morning-check-in, etc.) → main (Cliff)
  return 'main';
}

const DIRECT_DISPLAY = {
  'main:telegram':     'Tim (Telegram DM)',
  'main:signal':       'Tim (Signal DM)',
  'main:main':         'Web UI (Heartbeat+Chat)',
  'samantha:telegram': 'Samantha (Telegram DM)',
  'scout:telegram':    'Scout (Telegram DM)',
  'atlas:telegram':    'Atlas (Telegram DM)',
  'atlas:main':        'Atlas (Web UI)',
};

const AGENT_DISPLAY = {
  'main':       'Cliff',
  'cliff':      'Cliff',
  'samantha':   'Samantha',
  'scout':      'Scout',
  'claude-code':'Claude Code',
};

const LABEL_DISPLAY = {
  'telegram':   'Telegram',
  'discord':    'Discord',
  'signal':     'Signal',
  'whatsapp':   'WhatsApp',
  'imessage':   'iMessage',
  'slack':      'Slack',
  'main':       'Cliff',
  'samantha':   'Samantha',
  'scout':      'Scout',
};

// ── Helper Functions ─────────────────────────────────────────────────────
function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(n) { if (n == null) return '—'; return Number(n).toLocaleString(); }
function fmtK(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0); }

function ago(iso) {
  if (!iso) return '—';
  const m = (Date.now() - new Date(iso)) / 60000;
  if (m < 60) return Math.round(m) + 'm ago';
  if (m < 1440) return Math.round(m/60) + 'h ago';
  return Math.round(m/1440) + 'd ago';
}

function timeAgo(ts) {
  if (!ts) return '—';
  const t = typeof ts === 'string' ? new Date(ts).getTime() : Number(ts);
  if (isNaN(t)) return '—';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso), now = Date.now(), diff = now - d;
  const mins = Math.round(diff / 60000);
  const hrs = Math.round(diff / 3600000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  if (hrs < 24) return hrs + (hrs===1?' hour':' hours') + ' ago';
  const ptNow = new Date(now - 8*60*60*1000);
  const ptD = new Date(d - 8*60*60*1000);
  if (ptNow.toISOString().slice(0,10) !== ptD.toISOString().slice(0,10)) {
    const dayDiff = Math.floor((ptNow - ptD) / 86400000);
    if (dayDiff === 1) return 'yesterday at ' + d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  }
  return d.toLocaleDateString([], {month:'short',day:'numeric'}) + ' at ' + d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}

function humanCron(expr) {
  if (!expr || expr === '—') return '—';
  if (expr.startsWith('every')) return expr.replace(/^every\s*(\d+)h$/, 'Every $1h').replace(/^every\s*(\d+)m$/, 'Every $1 min') || expr;
  if (expr.startsWith('in ')) return expr;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  const days = { '0':'Sun','1':'Mon','2':'Tue','3':'Wed','4':'Thu','5':'Fri','6':'Sat' };
  const months = { '1':'Jan','2':'Feb','3':'Mar','4':'Apr','5':'May','6':'Jun','7':'Jul','8':'Aug','9':'Sep','10':'Oct','11':'Nov','12':'Dec' };
  if (min === '*' && hour === '*' && dom === '*') return 'Every 1 min';
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} min`;
  if (hour.startsWith('*/')) return `Every ${hour.slice(2)}h` + (min !== '0' ? ` at :${min.padStart(2,'0')}` : '');
  if (hour.includes('-') && !hour.includes(',') && dom === '*' && mon === '*' && dow === '*') {
    const [h1,h2] = hour.split('-').map(Number);
    const fmtH = h => (h % 12 || 12) + (h >= 12 ? 'PM' : 'AM');
    if (min.startsWith('*/')) return `Every ${min.slice(2)}m (${fmtH(h1)}–${fmtH(h2)})`;
    return `Hourly ${fmtH(h1)}–${fmtH(h2)}`;
  }
  if (hour.includes(',') && dom === '*' && mon === '*' && dow === '*') {
    const hrs = hour.split(',').map(Number);
    const fmtH = h => (h % 12 || 12) + (h >= 12 ? 'PM' : 'AM');
    return `${hrs.length}x daily (${hrs.map(fmtH).join(', ')})`;
  }
  if (dom === '*' && mon === '*' && dow === '*') {
    const h = parseInt(hour), m = min.padStart(2,'0');
    return `Daily ${(h%12||12)}:${m} ${h>=12?'PM':'AM'}`;
  }
  if (dow !== '*' && dom === '*') {
    const h = parseInt(hour), m = min.padStart(2,'0');
    return `${days[dow]||dow} ${(h%12||12)}:${m} ${h>=12?'PM':'AM'}`;
  }
  if (dom !== '*' && mon !== '*') {
    const h = parseInt(hour), m = min.padStart(2,'0');
    return `${months[mon]||mon} ${dom} ${(h%12||12)}:${m} ${h>=12?'PM':'AM'}`;
  }
  return expr;
}

function fmtStatus(s, item) {
  if (s === "approved" && item && item.scheduledFor) return "Scheduled";
  const labels = { draft: "Pending Review", approved: "Approved", published: "Posted", error: "Error", rejected: "Rejected", post_failed: "Post Failed" };
  return labels[s] || s;
}

function fmtAgent(raw) {
  if (!raw) return '—';
  return AGENT_DISPLAY[raw.toLowerCase()] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

function fmtLabel(raw) {
  if (!raw) return '—';
  return LABEL_DISPLAY[raw.toLowerCase()] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

function friendlyModel(m) {
  if (!m || m === 'Unknown') return 'Unknown';
  const s = m.toLowerCase();
  if (s.includes('opus-4-6') || s.includes('opus-4.6')) return 'Opus 4.6';
  if (s.includes('opus-4')) return 'Opus 4';
  if (s.includes('sonnet-4-6') || s.includes('sonnet-4.6')) return 'Sonnet 4.6';
  if (s.includes('sonnet-4-5') || s.includes('sonnet-4.5')) return 'Sonnet 4.5';
  if (s.includes('sonnet-4')) return 'Sonnet 4';
  if (s.includes('haiku-4-5') || s.includes('haiku-4.5')) return 'Haiku 4.5';
  if (s.includes('haiku-3-5') || s.includes('haiku-3.5')) return 'Haiku 3.5';
  if (s.includes('haiku')) return 'Haiku';
  if (s.includes('gemini-3.1-pro')) return 'Gemini 3.1 Pro';
  if (s.includes('gemini-3.1-flash-lite')) return 'Gemini 3.1 Flash Lite';
  if (s.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (s.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
  if (s.includes('gemini')) return 'Gemini';
  if (s.includes('grok-4.1-fast') || s.includes('grok-4-1-fast')) return 'Grok 4.1 Fast';
  if (s.includes('grok-4.1') || s.includes('grok-4-1')) return 'Grok 4.1';
  if (s.includes('grok')) return 'Grok';
  if (s.includes('gpt-4o')) return 'GPT-4o';
  if (s.includes('gpt-4')) return 'GPT-4';
  if (s.includes('o1')) return 'o1';
  return m.split('/').pop().replace(/-/g, ' ').replace(/\w/g, c => c.toUpperCase());
}

function modelShort(m) {
  if (!m) return '<span class="text-gray-700">—</span>';
  const s = m.toLowerCase();
  if (s.includes('opus-4-6') || s.includes('opus-4.6')) return '<span class="text-purple-400">Opus 4.6</span>';
  if (s.includes('opus')) return '<span class="text-purple-400">Opus</span>';
  if (s.includes('sonnet-4-6') || s.includes('sonnet-4.6')) return '<span class="text-indigo-400">Sonnet 4.6</span>';
  if (s.includes('sonnet-4-5') || s.includes('sonnet-4.5')) return '<span class="text-indigo-400">Sonnet 4.5</span>';
  if (s.includes('sonnet')) return '<span class="text-indigo-400">Sonnet</span>';
  if (s.includes('haiku-4-5') || s.includes('haiku-4.5')) return '<span class="text-yellow-600">Haiku 4.5</span>';
  if (s.includes('haiku')) return '<span class="text-yellow-600">Haiku</span>';
  if (s.includes('gemini-3.1-flash-lite') || s.includes('flash-lite')) return '<span class="text-green-400">Gemini 3.1 Flash Lite</span>';
  if (s.includes('gemini-2.5-flash')) return '<span class="text-green-400">Gemini 2.5 Flash</span>';
  if (s.includes('gemini-2.5-pro')) return '<span class="text-green-400">Gemini 2.5 Pro</span>';
  if (s.includes('gemini')) return '<span class="text-green-400">Gemini</span>';
  if (s.includes('grok')) return '<span class="text-orange-400">Grok</span>';
  return `<span class="text-gray-400">${m.split('/').pop()}</span>`;
}

function cronTaskFromKey(key) {
  if (!key) return null;
  const m1 = key.match(/^cron:([^:]+):/);
  if (m1) return m1[1];
  const m2 = key.match(/^agent:[^:]+:cron:([^:]+)/);
  if (m2) {
    const cronId = m2[1];
    if (CRON_UUID_MAP[cronId]) return CRON_UUID_MAP[cronId];
    const found = (window._cronList || []).find(c => c.id === cronId);
    return found ? found.name : null;
  }
  return null;
}

function sessionKeyToFriendly(key, sessionId) {
  // Check explicit session labels first (from session-labels.json)
  if (key && SESSION_LABELS[key]) return SESSION_LABELS[key];
  if (!key) return 'Subagent Run';
  if (key.startsWith('cron:')) {
    const m = key.match(/^cron:([^:]+)/);
    if (m && CRON_DISPLAY[m[1]]) return CRON_DISPLAY[m[1]];
    return m ? m[1].replace(/-/g,' ') : 'Cron';
  }
  const agentCronMatch = key.match(/^agent:([^:]+):cron:([^:]+)/);
  if (agentCronMatch) {
    const taskName = cronTaskFromKey(key);
    if (taskName) return CRON_DISPLAY[taskName] || taskName.replace(/-/g,' ');
    const agentId = agentCronMatch[1];
    const agentLabel = { main: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas' }[agentId] || agentId;
    return agentLabel + ' Cron';
  }
  // Subagent sessions: agent:X:subagent:UUID
  const subagentMatch = key.match(/^agent:([^:]+):subagent:/);
  if (subagentMatch) {
    const agentLabel = { main: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas' }[subagentMatch[1]] || subagentMatch[1];
    return agentLabel + ' (Subagent Run)';
  }
  // Group chat sessions: agent:X:telegram:group:CHAT_ID
  const groupMatch = key.match(/^agent:([^:]+):([^:]+):group:/);
  if (groupMatch) {
    const agentLabel = { main: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas' }[groupMatch[1]] || groupMatch[1];
    return agentLabel + ' (Chat Hub)';
  }
  // Agent main sessions: agent:X:main
  const mainMatch = key.match(/^agent:([^:]+):main$/);
  if (mainMatch) {
    const agentLabel = { main: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas' }[mainMatch[1]] || mainMatch[1];
    if (mainMatch[1] === 'main') return 'Web UI (Heartbeat+Chat)';
    return agentLabel + ' (Web UI)';
  }
  const directMatch = key.match(/^agent:([^:]+):([^:]+)(?::direct)?:/);
  if (directMatch) {
    const dk = directMatch[1] + ':' + directMatch[2];
    if (DIRECT_DISPLAY[dk]) return DIRECT_DISPLAY[dk];
  }
  return key.split(':').pop().slice(0,14);
}

function fmtScheduled(item) {
  const s = item.scheduledFor;
  if (s) {
    const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
    if (hmMatch) {
      const h = parseInt(hmMatch[1]), min = hmMatch[2];
      return `<span class="text-green-400">${(h%12||12)}:${min} ${h>=12?'PM':'AM'}</span>`;
    }
    if (s.includes('T')) {
      const d = new Date(s);
      const now = Date.now();
      const isPast = d.getTime() < now;
      const timeStr = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      const ptNow = new Date(now - 8*60*60*1000);
      const ptD   = new Date(d.getTime() - 8*60*60*1000);
      const todayStr    = ptNow.toISOString().slice(0,10);
      const tomorrowStr = new Date(ptNow.getTime() + 86400000).toISOString().slice(0,10);
      const dStr        = ptD.toISOString().slice(0,10);
      let dayLabel;
      if (dStr === todayStr) dayLabel = 'Today';
      else if (dStr === tomorrowStr) dayLabel = 'Tomorrow';
      else dayLabel = d.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:'America/Los_Angeles' });
      const formatted = `${dayLabel} at ${timeStr}`;
      return isPast
        ? `<span class="text-gray-500 text-xs">${formatted} <span class="opacity-60">(overdue)</span></span>`
        : `<span class="text-green-400 text-xs">${formatted}</span>`;
    }
  }
  return '<span class="text-gray-500 text-xs">Unscheduled</span>';
}

function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// Model cost rates
function modelPricing(m) {
  if (!m) return { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
  if (m.includes('haiku'))  return { input: 0.80, cacheRead: 0.08, cacheWrite: 1.0,  output: 4.0  };
  if (m.includes('sonnet')) return { input: 3.0,  cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
  if (m.includes('opus'))   return { input: 15.0, cacheRead: 1.50, cacheWrite: 18.75,output: 75.0 };
  return { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
}

// ── Auth ─────────────────────────────────────────────────────────────────
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

function checkAuth() {
  return localStorage.getItem('cc_auth') === '1';
}

function logout() {
  localStorage.removeItem('cc_auth');
  window.location.href = '/portal/';
}

// ── Nav Bar ──────────────────────────────────────────────────────────────
function renderNav(activePage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: '/portal/' },
    { id: 'marketing', label: 'Marketing', href: '/portal/marketing.html' },
    { id: 'agents', label: 'Agents', href: '/portal/agents.html' },
    { id: 'ideas', label: 'Ideas', href: '/portal/ideas.html' },
    { id: 'tokens', label: 'Token Usage', href: '/portal/tokens.html' },
    { id: 'settings', label: 'Settings', href: '/portal/settings.html' },
  ];

  const navEl = document.getElementById('portal-nav');
  if (!navEl) return;

  navEl.innerHTML = `
    <nav class="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950 z-10">
      <div class="flex items-center gap-3">
        <a href="/portal/" class="font-bold text-white text-decoration-none" style="text-decoration:none;">CliffCircuit Portal</a>
        <span class="pill bg-indigo-900 text-indigo-300 ml-1">PRIVATE</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 cursor-pointer" onclick="window.location.href='/portal/agents.html'" title="Cron health">
            <div id="nav-cron-dot" class="w-2.5 h-2.5 rounded-full bg-gray-600" style="transition:background 0.3s;"></div>
            <span class="text-xs text-gray-600">crons</span>
          </div>
          <div class="flex items-center gap-1.5 cursor-pointer" onclick="window.location.href='/portal/agents.html'" title="Cliff context window">
            <div id="nav-ctx-dot" class="w-2.5 h-2.5 rounded-full bg-gray-600" style="transition:background 0.3s;"></div>
            <span class="text-xs text-gray-600">context</span>
          </div>
          <div class="flex items-center gap-1.5 cursor-pointer" onclick="window.location.href='/portal/agents.html'" title="Gateway health">
            <div id="nav-gw-dot" class="w-2.5 h-2.5 rounded-full bg-gray-600" style="transition:background 0.3s;"></div>
            <span id="nav-gw-label" class="text-xs text-gray-600">gateway</span>
          </div>
        </div>
        <button onclick="window.location.href='/portal/settings.html'" title="Settings" class="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-800 transition-colors" aria-label="Settings">⚙️</button>
        <button onclick="logout()" class="text-gray-500 hover:text-red-400 text-xs">Sign out</button>
      </div>
    </nav>
    <div class="border-b border-gray-800 px-6 bg-gray-950">
      <div class="flex items-center justify-between max-w-7xl mx-auto w-full">
        <div class="flex gap-6">
          ${pages.map(p => `<a href="${p.href}" class="nav-link${p.id === activePage ? ' active' : ''}">${p.label}</a>`).join('')}
        </div>
      </div>
    </div>
  `;
}

// ── Data Loading ─────────────────────────────────────────────────────────
let DATA = null;

async function loadData() {
  try {
    const [{ data: articles, error: aErr }, { data: tweets, error: tErr }] = await Promise.all([
      _sb.from('articles').select('*').order('created_at', { ascending: false }).limit(500),
      _sb.from('tweets').select('*').order('created_at', { ascending: false }).limit(500)
    ]);
    if (aErr) console.error('Articles fetch error:', aErr);
    if (tErr) console.error('Tweets fetch error:', tErr);

    const articleItems = (articles || []).map(a => ({
      id: a.id, type: 'article', status: a.status, title: a.title, slug: a.slug,
      excerpt: a.excerpt, htmlContent: a.content, heroImage: a.hero_image,
      heroImageGenerated: a.hero_image_generated, account: a.account || 'cliffcircuit',
      wordCount: a.word_count, url: a.url, liveUrl: a.live_url, seoTitle: a.seo_title,
      seoDescription: a.seo_description, tweetHook: a.tweet_hook, tags: a.tags || [],
      createdAt: a.created_at, publishedAt: a.published_at, scheduledFor: a.scheduled_for,
      rejectedReason: a.rejected_reason
    }));

    const tweetItems = (tweets || []).map(t => ({
      id: t.id, type: 'tweet', status: t.status, tweetText: t.text, text: t.text,
      account: t.account, tweetId: t.tweet_id, tweetUrl: t.tweet_url,
      createdAt: t.created_at, publishedAt: t.published_at, scheduledFor: t.scheduled_for
    }));

    const liveSessionsPromise = fetch('https://api.cliffcircuit.ai/sessions.json?t=' + Date.now())
      .then(r => r.json()).catch(() => null);
    const dataJsonPromise = fetch('/portal/data.json?t=' + Date.now())
      .then(r => r.json()).catch(() => null);

    DATA = {
      queue: [...articleItems, ...tweetItems],
      generatedAt: new Date().toISOString(),
      _liveGeneratedAt: new Date().toISOString(),
      sessions: [],
      gateway: { status: 'unknown', latencyMs: null, ok: false, reachable: null },
      crons: [],
      agentConfigs: {},
      stats: { displayTz: 'America/Los_Angeles' },
      auth: { passwordHash: null }
    };

    dataJsonPromise.then(dj => {
      if (dj && DATA) {
        if (dj.sites)       DATA.sites       = dj.sites;
        if (dj.credentials) DATA.credentials = dj.credentials;
        if (dj.disk)        DATA.disk        = dj.disk;
      }
    });

    liveSessionsPromise.then(live => {
      if (live && live.sessions && DATA) {
        DATA.sessions = live.sessions;
        DATA._liveGeneratedAt = live.generatedAt || DATA._liveGeneratedAt;
        if (live.agentConfigs) Object.assign(DATA.agentConfigs, live.agentConfigs);
        if (live.crons && live.crons.length) { DATA.crons = live.crons; window._cronList = live.crons; }
        updateNavDots(DATA);
        updateAgentStatusDots(live.sessions);
        // Call page-specific renderers
        (window._pageRenderers || []).forEach(fn => { try { fn(DATA); } catch(e) { console.error('Renderer error:', e); } });
      }
    });

    return DATA;
  } catch(err) { console.error('loadData error:', err); return null; }
}

// ── Page Renderer Registry ───────────────────────────────────────────────
window._pageRenderers = [];
function registerRenderer(fn) { window._pageRenderers.push(fn); }

// ── Gateway Health Polling ───────────────────────────────────────────────
function applyRealtimeGwState() {
  if (!window._realtimeGwSet) return;
  const ok = window._realtimeGwOk;
  const latencyMs = window._realtimeGwLatency;
  const color = ok ? '#22c55e' : '#ef4444';
  ['nav-gw-dot', 'gw-dot'].forEach(id => {
    const d = document.getElementById(id);
    if (d) { d.style.background = color; d.style.boxShadow = ok ? 'none' : '0 0 6px #ef4444'; }
  });
  ['nav-gw-label', 'gw-label'].forEach(id => {
    const l = document.getElementById(id);
    if (l) { l.textContent = ok ? 'Gateway OK' : 'Gateway Down'; l.style.color = ok ? '#4b5563' : '#f87171'; }
  });
  ['nav-gw-latency', 'gw-latency'].forEach(id => {
    const l = document.getElementById(id);
    if (l && latencyMs != null) l.textContent = latencyMs + 'ms';
  });
}

async function pollGatewayHealth() {
  const start = Date.now();
  try {
    await fetch('https://gateway.cliffcircuit.ai/', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
    window._realtimeGwSet = true; window._realtimeGwOk = true; window._realtimeGwLatency = Date.now() - start;
  } catch (e) {
    window._realtimeGwSet = true; window._realtimeGwOk = false; window._realtimeGwLatency = null;
  }
  applyRealtimeGwState();
}

function updateGatewayDot(ok, latencyMs) {
  window._realtimeGwSet = true; window._realtimeGwOk = ok; window._realtimeGwLatency = latencyMs;
  applyRealtimeGwState();
}

// ── Agent Status Dots ────────────────────────────────────────────────────
function updateAgentStatusDots(sessions) {
  const now = Date.now();
  const ONLINE_MS = 5 * 60 * 1000;
  const IDLE_MS   = 24 * 60 * 60 * 1000;
  ['cliff', 'samantha', 'scout'].forEach(name => {
    const agentId = name === 'cliff' ? 'main' : name;
    const agentSessions = (sessions || []).filter(s => s.agentId === agentId && s.lastActiveAt);
    const mostRecent = agentSessions.reduce((best, s) => {
      const t = new Date(s.lastActiveAt).getTime();
      return t > best ? t : best;
    }, 0);
    const dot   = document.getElementById(name + '-agent-status-dot');
    const label = document.getElementById(name + '-agent-status-label');
    if (!dot || !label) return;
    const age = mostRecent ? now - mostRecent : Infinity;
    let color, shadow, text, textColor;
    if (age < ONLINE_MS) { color = '#4ade80'; shadow = '0 0 8px #4ade80'; text = 'Online'; textColor = '#4ade80'; }
    else if (age < IDLE_MS) { color = '#facc15'; shadow = '0 0 8px #facc15'; text = 'Idle'; textColor = '#facc15'; }
    else { color = '#6b7280'; shadow = 'none'; text = 'Offline'; textColor = '#6b7280'; }
    dot.style.cssText = `background:${color}; box-shadow:${shadow};`;
    label.textContent = text;
    label.className = 'text-xs font-semibold uppercase tracking-wide';
    label.style.color = textColor;
  });
}

// ── Nav Dots ─────────────────────────────────────────────────────────────
function updateNavDots(d) {
  const crons = d.crons || [];
  const cronErrors = crons.filter(c => c.status === 'error').length;
  const cronDot = document.getElementById('nav-cron-dot');
  const cronLabel = cronDot?.nextElementSibling;
  if (cronDot) {
    if (crons.length === 0) { cronDot.style.background = '#4b5563'; if (cronLabel) { cronLabel.textContent = 'crons'; cronLabel.style.color = '#4b5563'; } }
    else if (cronErrors === 0) { cronDot.style.background = '#22c55e'; if (cronLabel) { cronLabel.textContent = 'crons'; cronLabel.style.color = '#4b5563'; } }
    else { cronDot.style.background = '#eab308'; if (cronLabel) { cronLabel.textContent = `${cronErrors} error${cronErrors>1?'s':''}`; cronLabel.style.color = '#ca8a04'; } }
  }
  const sessions = d.sessions || [];
  const cliffDirect = sessions.find(s => s.agentId === 'main' && ((s.label || '').includes('direct') || (s.thinking && s.thinking !== 'off')));
  const mainSession = cliffDirect || sessions.filter(s => s.agentId === 'main').sort((a,b) => new Date(b.lastActiveAt||0) - new Date(a.lastActiveAt||0))[0] || null;
  const pct = mainSession ? mainSession.pct : 0;
  const ctxDot = document.getElementById('nav-ctx-dot');
  const ctxLabel = ctxDot?.nextElementSibling;
  if (ctxDot) {
    if (!mainSession) { ctxDot.style.background = '#4b5563'; if (ctxLabel) { ctxLabel.textContent = 'context'; ctxLabel.style.color = '#4b5563'; } }
    else if (pct >= 75) { ctxDot.style.background = '#ef4444'; if (ctxLabel) { ctxLabel.textContent = pct+'% ctx'; ctxLabel.style.color = '#ef4444'; } }
    else if (pct >= 50) { ctxDot.style.background = '#facc15'; if (ctxLabel) { ctxLabel.textContent = pct+'% ctx'; ctxLabel.style.color = '#ca8a04'; } }
    else { ctxDot.style.background = '#34d399'; if (ctxLabel) { ctxLabel.textContent = pct+'% ctx'; ctxLabel.style.color = '#4b5563'; } }
  }
}

// ── Live Session Polling ─────────────────────────────────────────────────
async function pollLiveSessions() {
  try {
    const res = await fetch('https://api.cliffcircuit.ai/sessions.json?t=' + Date.now());
    const live = await res.json();
    if (!live || !live.sessions) return;
    if (DATA) {
      DATA.sessions = live.sessions;
      DATA._liveGeneratedAt = live.generatedAt;
      if (live.agentConfigs) DATA.agentConfigs = live.agentConfigs;
      if (live.crons && live.crons.length) { DATA.crons = live.crons; window._cronList = live.crons; }
      updateNavDots(DATA);
      updateAgentStatusDots(live.sessions);
      (window._pageRenderers || []).forEach(fn => { try { fn(DATA); } catch(e) {} });
    }
  } catch (e) {
    updateAgentStatusDots([]);
  }
}

// ── Realtime ─────────────────────────────────────────────────────────────
function updateRealtimeDot(ok) {
  const dot   = document.getElementById('sb-realtime-dot');
  const label = document.getElementById('sb-realtime-label');
  if (dot)   { dot.style.background = ok ? '#4ade80' : '#ef4444'; dot.style.boxShadow = ok ? '0 0 6px #4ade80' : 'none'; }
  if (label) { label.textContent = ok ? 'Live' : 'Disconnected'; label.style.color = ok ? '#4ade80' : '#f87171'; }
}

function setupRealtime(onContentChange, onSessionChange) {
  const start = Date.now();
  const channel = _sb.channel('portal-live');
  if (onContentChange) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, onContentChange);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tweets' }, onContentChange);
  }
  if (onSessionChange) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'session_snapshots' }, onSessionChange);
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') { updateGatewayDot(true, Date.now() - start); updateRealtimeDot(true); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { updateGatewayDot(false, null); updateRealtimeDot(false); }
  });
}

// ── Settings ─────────────────────────────────────────────────────────────
const SETTINGS_KEY = 'cliffcircuit_portal_settings';
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch(e) { return {}; } }

// Apply saved timezone on load
(function() { const s = loadSettings(); if (s.displayTz) window._portalDisplayTz = s.displayTz; })();

// ── Goals ────────────────────────────────────────────────────────────────
const GOALS_KEY = 'cliffcircuit_daily_goals';
function loadGoals() { try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || {}; } catch { return {}; } }

// ── Portal Init ──────────────────────────────────────────────────────────
async function initPortal(pageName, renderFn) {
  if (!checkAuth()) {
    // Not authenticated — if on index.html, show login; otherwise redirect
    if (pageName === 'dashboard') return false;
    window.location.href = '/portal/';
    return false;
  }
  renderNav(pageName);
  if (renderFn) registerRenderer(renderFn);

  const d = await loadData();
  if (d) {
    if (d.crons && d.crons.length) window._cronList = d.crons;
    updateNavDots(d);
    if (renderFn) renderFn(d);
  }

  // Start polling
  setInterval(pollGatewayHealth, 10000);
  pollGatewayHealth();
  setInterval(pollLiveSessions, 10000);

  // Live-tick ages every minute
  setInterval(() => {
    document.querySelectorAll('.session-age[data-ts]').forEach(el => {
      const ts = parseInt(el.dataset.ts);
      if (ts) el.textContent = timeAgo(ts);
    });
  }, 60000);

  return true;
}

// ── Reject reason formatting ─────────────────────────────────────────────
const REASON_LABELS = {
  'poor_title': ['Poor Title', '#92400e', '#fbbf24'],
  'title_too_long': ['Title Too Long', '#92400e', '#fbbf24'],
  'poor_excerpt': ['Poor Excerpt', '#92400e', '#fbbf24'],
  'missing_htmlContent': ['No Content', '#7f1d1d', '#f87171'],
  'content_empty_or_too_short': ['No Content', '#7f1d1d', '#f87171'],
  'tweet_hook_missing': ['No Tweet Hook', '#4c1d95', '#a78bfa'],
  'wrong_template': ['Wrong Template', '#4c1d95', '#a78bfa'],
  'hero_image_missing_on_disk': ['No Hero Image', '#1e3a5f', '#60a5fa'],
  'duplicate_item': ['Duplicate', '#374151', '#9ca3af'],
};

function formatRejectReasons(raw) {
  if (!raw) return '<span style="color:#6b7280">No reason noted</span>';
  const parts = raw.split(/;|,(?![^(]*\))/).map(s => s.trim()).filter(Boolean);
  return parts.map(p => {
    const key = Object.keys(REASON_LABELS).find(k => p.toLowerCase().includes(k.replace(/_/g,' ')) || p.toLowerCase().includes(k));
    const nlKey = !key ? Object.keys(REASON_LABELS).find(k => { const label = REASON_LABELS[k][0].toLowerCase(); return p.toLowerCase().includes(label); }) : null;
    const match = REASON_LABELS[key || nlKey];
    if (match) return `<span style="background:${match[1]};color:${match[2]};border-radius:9999px;padding:1px 8px;font-size:10px;font-weight:600;letter-spacing:0.03em;display:inline-block;margin:1px 2px">${match[0]}</span>`;
    const short = p.length > 30 ? p.slice(0,28) + '..' : p;
    return `<span style="background:#374151;color:#9ca3af;border-radius:9999px;padding:1px 8px;font-size:10px;font-weight:600;letter-spacing:0.03em;display:inline-block;margin:1px 2px">${esc(short)}</span>`;
  }).join(' ');
}
