// ══════════════════════════════════════════════════════════════════
// tokens-detail.js — Session detail panel (expand/collapse)
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

    // ── Session Detail Panel ─────────────────────────────────────────
    function _toggleSessionDetail(sid, rowEl) {
      // Close existing panel
      const existing = document.querySelector('.session-detail-panel-row');
      if (existing) {
        const wasSame = existing.dataset.forSession === sid;
        existing.remove();
        _sessionDetailOpenId = null;
        _sessionDetailSource = null;
        if (wasSame) return; // toggled off
      }
      const s = _sessionDataMap[sid];
      if (!s) return;
      _sessionDetailOpenId = sid;
      const raw = s._raw || {};
      const panelRow = document.createElement('tr');
      panelRow.className = 'session-detail-panel-row';
      panelRow.dataset.forSession = sid;
      const td = document.createElement('td');
      td.colSpan = 9;
      td.style.cssText = 'padding: 4px 8px 12px 28px; background: transparent;';

      // Format timestamps
      const fmtTs = v => v ? new Date(v).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true }) : '—';
      const sentAt = fmtTs(raw.first_seen_at);
      const completedAt = fmtTs(raw.last_seen_at);

      // Cost breakdown
      const costIn = raw.cost_input_usd != null ? '$' + raw.cost_input_usd.toFixed(4) : '—';
      const costOut = raw.cost_output_usd != null ? '$' + raw.cost_output_usd.toFixed(4) : '—';
      const costCacheR = raw.cost_cache_read_usd != null ? '$' + raw.cost_cache_read_usd.toFixed(4) : '—';
      const costCacheW = raw.cost_cache_write_usd != null ? '$' + raw.cost_cache_write_usd.toFixed(4) : '—';
      const costTotal = raw.cost_total_usd != null ? '$' + raw.cost_total_usd.toFixed(4) : '—';

      // Token breakdown — Input = cache_read + input_tokens (true total input)
      const rawInput = (raw.cache_read || 0) + (raw.input_tokens || 0);
      const tokInput = rawInput > 0 ? rawInput.toLocaleString() : '—';
      const tokOutput = raw.output_tokens != null ? raw.output_tokens.toLocaleString() : '—';
      const rawCacheW = raw.cache_write || 0;
      const tokTotal = (rawInput + (raw.output_tokens || 0) + rawCacheW).toLocaleString();

      // Model info
      const modelFull = typeof friendlyModel === 'function' ? friendlyModel(raw.model || s.model) : (raw.model || s.model || '—');
      const thinking = raw.thinking_level || '—';
      const kind = raw.kind || '—';
      const sessionKey = s.label || raw.session_key || '—';
      const sessionId = raw.session_id || '—';
      const sdpIsActive = _isAtlasActiveSession(s) || _isSessionActive(s);
      const sdpIsStale = sdpIsActive && _isSessionStale(s);
      const sdpActiveHtml = !sdpIsActive ? '' : sdpIsStale
        ? '<span class="active-badge" style="font-size:11px;padding:2px 10px;margin-left:auto;flex-shrink:0;background:rgba(234,179,8,0.15);border-color:rgba(234,179,8,0.3);"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#eab308;"></span>STALE</span>'
        : '<span class="active-badge" style="font-size:11px;padding:2px 10px;margin-left:auto;flex-shrink:0;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;animation:live-pulse 2s ease-in-out infinite;"></span>ACTIVE</span>';

      td.innerHTML = `
        <div class="session-detail-panel">
          <div class="sdp-title-bar">
            <span class="sdp-title" style="display:flex;align-items:center;flex:1;">Session Details</span>
            <button class="sdp-title-close" onclick="event.stopPropagation();_closeSessionDetail()" title="Close">&times;</button>
          </div>
          <div class="sdp-header">
            <div class="sdp-meta">
              <span>Sent: <strong style="color:#d1d5db">${esc(sentAt)}</strong></span>
              <span>Completed: <strong style="color:#d1d5db">${esc(completedAt)}</strong></span>
              <span>Duration: <strong id="sdp-dur-${esc(sid)}" style="color:#d1d5db">${_fmtDur(s.duration_ms)}</strong></span>
              <span>Kind: <strong style="color:#d1d5db">${esc(kind)}</strong></span>
            </div>
            ${sdpActiveHtml}
          </div>
          ${(() => { const tix = _getSessionTickets(sessionKey); return tix ? _ticketListHtml(tix) : ''; })()}
          <div class="sdp-section">
            <div class="sdp-label">Model</div>
            <div style="font-size:12px;color:#e5e7eb;">${esc(modelFull)}${thinking !== '—' ? ' <span style="color:#6b7280">(thinking: ' + esc(thinking) + ')</span>' : ''}</div>
          </div>
          <div class="sdp-section">
            <div class="sdp-label">Token Breakdown</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;font-size:12px;">
              <div><span style="color:#6b7280">Input:</span> <span style="color:#d1d5db">${tokInput}</span></div>
              <div><span style="color:#6b7280">Output:</span> <span style="color:#d1d5db">${tokOutput}</span></div>
              ${rawCacheW > 0 ? '<div><span style="color:#6b7280">Cache Write:</span> <span style="color:#d1d5db">' + rawCacheW.toLocaleString() + '</span></div>' : ''}
              <div><span style="color:#6b7280">Total:</span> <strong style="color:#d1d5db">${tokTotal}</strong></div>
            </div>
          </div>
          <div class="sdp-section">
            <div class="sdp-label">Cost Breakdown</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;font-size:12px;">
              <div><span style="color:#6b7280">Input:</span> <span style="color:#d1d5db">${costIn}</span></div>
              <div><span style="color:#6b7280">Output:</span> <span style="color:#d1d5db">${costOut}</span></div>
              <div><span style="color:#6b7280">Cache Read:</span> <span style="color:#d1d5db">${costCacheR}</span></div>
              <div><span style="color:#6b7280">Cache Write:</span> <span style="color:#d1d5db">${costCacheW}</span></div>
              <div><span style="color:#6b7280">Total:</span> <strong style="color:#facc15">${costTotal}</strong></div>
            </div>
          </div>
          <div class="sdp-section" id="sdp-task-${esc(sid)}">
            <div class="sdp-label">Task</div>
            <div class="sdp-text sdp-loading">Loading...</div>
          </div>
          <div class="sdp-section" id="sdp-response-${esc(sid)}">
            <div class="sdp-label">Response</div>
            <div class="sdp-text sdp-loading">Loading...</div>
          </div>
          <div class="sdp-section" style="padding:10px 16px;background:rgba(15,23,42,0.4);">
            <div style="font-size:10px;color:#374151;font-family:'SF Mono','Fira Code','Cascadia Code',monospace;line-height:1.6;">Session: ${esc(sessionKey)}<br>ID: ${esc(sessionId)}</div>
          </div>
        </div>`;
      panelRow.appendChild(td);
      rowEl.after(panelRow);

      // Fetch task/response from session previews
      _fetchSessionPreview(sid, sessionKey);
    }

    function _closeSessionDetail() {
      const existing = document.querySelector('.session-detail-panel-row');
      if (existing) existing.remove();
      _sessionDetailOpenId = null;
      _sessionDetailSource = null;
    }

    function _toggleRawSessionDetail(sid, rowEl) {
      // Toggle detail panel for raw table rows — reuses _toggleSessionDetail
      _sessionDetailSource = 'raw';
      _toggleSessionDetail(sid, rowEl);
    }

    // Gateway WebSocket for session preview (shared connection)
    let _gwWs = null;
    let _gwWsPending = {};
    let _gwWsSeq = 0;
    function _gwRequest(method, params) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { delete _gwWsPending[id]; reject(new Error('timeout')); }, 8000);
        const id = 'req-' + (++_gwWsSeq);
        _gwWsPending[id] = { resolve: d => { clearTimeout(timeout); resolve(d); }, reject: e => { clearTimeout(timeout); reject(e); } };
        if (!_gwWs || _gwWs.readyState !== WebSocket.OPEN) {
          // Attempt WebSocket connection to gateway
          try {
            _gwWs = new WebSocket('wss://gateway.cliffcircuit.ai');
            _gwWs.onopen = () => {
              // Send connect (unauthenticated — may fail, that's OK)
              const connId = 'req-conn';
              _gwWs.send(JSON.stringify({ type: 'req', id: connId, method: 'connect', params: { minProtocol: 3, maxProtocol: 3, client: { id: 'portal-preview', version: '1.0', platform: 'web', mode: 'webchat' }, role: 'operator', scopes: [], caps: [] } }));
              // Wait briefly for hello, then send the actual request
              setTimeout(() => {
                try { _gwWs.send(JSON.stringify({ type: 'req', id, method, params })); } catch(e) { _gwWsPending[id]?.reject(e); delete _gwWsPending[id]; }
              }, 500);
            };
            _gwWs.onmessage = ev => {
              try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'res' && _gwWsPending[msg.id]) {
                  const p = _gwWsPending[msg.id];
                  delete _gwWsPending[msg.id];
                  msg.ok ? p.resolve(msg.payload) : p.reject(new Error(msg.error?.message || 'request failed'));
                }
              } catch(e) {}
            };
            _gwWs.onerror = () => { Object.values(_gwWsPending).forEach(p => p.reject(new Error('ws error'))); _gwWsPending = {}; };
            _gwWs.onclose = () => { _gwWs = null; Object.values(_gwWsPending).forEach(p => p.reject(new Error('ws closed'))); _gwWsPending = {}; };
          } catch(e) { delete _gwWsPending[id]; reject(e); }
        } else {
          try { _gwWs.send(JSON.stringify({ type: 'req', id, method, params })); } catch(e) { delete _gwWsPending[id]; reject(e); }
        }
      });
    }

    let _sessionPreviewCache = null; // cached session-previews.json data
    let _sessionPreviewCacheTs = 0;
    const _SESSION_PREVIEW_TTL = 60000; // re-fetch at most once per minute

    async function _loadSessionPreviews() {
      const now = Date.now();
      if (_sessionPreviewCache && now - _sessionPreviewCacheTs < _SESSION_PREVIEW_TTL) return _sessionPreviewCache;
      try {
        const res = await fetch('/portal/session-previews.json?t=' + now);
        if (res.ok) {
          const data = await res.json();
          _sessionPreviewCache = data.previews || data;
          _sessionPreviewCacheTs = now;
          return _sessionPreviewCache;
        }
      } catch(e) {}
      return null;
    }

    function _applyPreview(taskEl, respEl, task, response) {
      taskEl.textContent = task || 'No task prompt found';
      taskEl.classList.remove('sdp-loading');
      respEl.textContent = response || 'No response found';
      respEl.classList.remove('sdp-loading');
    }

    async function _fetchSessionPreview(sid, sessionKey) {
      const taskEl = document.querySelector('#sdp-task-' + CSS.escape(sid) + ' .sdp-text');
      const respEl = document.querySelector('#sdp-response-' + CSS.escape(sid) + ' .sdp-text');
      if (!taskEl || !respEl) return;

      // Strategy 1: Try atlas_jobs table in Supabase (most reliable)
      try {
        const { data, error } = await _sb.from('atlas_jobs')
          .select('task_prompt,response_summary,duration_seconds')
          .eq('session_id', sid)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!error && data && data.length > 0) {
          const row = data[0];
          // Update duration with exact seconds if available
          if (row.duration_seconds != null) {
            const durEl = document.getElementById('sdp-dur-' + sid);
            if (durEl) durEl.textContent = row.duration_seconds + 's';
          }
          _applyPreview(taskEl, respEl, row.task_prompt, row.response_summary);
          return;
        }
      } catch(e) { /* continue to other strategies */ }

      // Strategy 2: Try session-previews.json (static file, fast and reliable)
      try {
        const previews = await _loadSessionPreviews();
        if (previews) {
          const preview = previews[sessionKey] || previews[sid];
          if (preview) {
            _applyPreview(taskEl, respEl, preview.task, preview.response);
            return;
          }
        }
      } catch(e) { /* continue to gateway */ }

      // Strategy 3: Try gateway WebSocket sessions.preview (requires auth)
      try {
        const result = await _gwRequest('sessions.preview', { keys: [sessionKey], limit: 20, maxChars: 2000 });
        const preview = result?.previews?.[0];
        if (preview && preview.status === 'ok' && preview.items?.length > 0) {
          const items = preview.items;
          const userMsg = items.find(m => m.role === 'user');
          const asstMsg = [...items].reverse().find(m => m.role === 'assistant');
          _applyPreview(taskEl, respEl, userMsg?.text, asstMsg?.text);
          return;
        }
      } catch(e) { /* gateway unavailable */ }

      // No preview data available — check if session is from before atlas_jobs existed
      const rawRow = _sessionDataMap[sid]?._raw;
      const sessionDate = rawRow?.first_seen_at ? new Date(rawRow.first_seen_at) : null;
      const cutoffDate = new Date('2026-03-07T00:00:00');
      if (sessionDate && sessionDate < cutoffDate) {
        taskEl.textContent = 'Task details not available for sessions before March 7, 2026';
        taskEl.classList.remove('sdp-loading');
        taskEl.classList.add('sdp-empty');
        respEl.textContent = '';
        respEl.classList.remove('sdp-loading');
        respEl.classList.add('sdp-empty');
      } else {
        taskEl.textContent = 'Preview not available for this session';
        taskEl.classList.remove('sdp-loading');
        taskEl.classList.add('sdp-empty');
        respEl.textContent = 'Session content is refreshed periodically — check back shortly';
        respEl.classList.remove('sdp-loading');
        respEl.classList.add('sdp-empty');
      }
    }

    const _localModelPricing = m => {
      if (!m) return { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
      if (m.includes('haiku'))  return { input: 0.80, cacheRead: 0.08, cacheWrite: 1.0,  output: 4.0  };
      if (m.includes('sonnet')) return { input: 3.0,  cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
      if (m.includes('opus'))   return { input: 15.0, cacheRead: 1.50, cacheWrite: 18.75,output: 75.0 };
      return { input: 3.0, cacheRead: 0.30, cacheWrite: 3.75, output: 15.0 };
    };
    const _calcCost = (p, tokInput, tokCacheRead, tokCacheWrite, tokOut) =>
      (tokInput * p.input + tokCacheRead * p.cacheRead + tokCacheWrite * p.cacheWrite + tokOut * p.output) / 1e6;

    // Cron task → sub-agent task name mapping
    const _cronTaskMap = {
      'samantha-publish':       'Publish',
      'samantha-writer':        'Draft Articles',
      'samantha-cliff-tweets':  'Cliff Tweets',
      'samantha-tim-tweets':    'Tim Posts',
      'samantha-media':         'Media',
      'samantha-recycle-writer':'Recycle Rejected',
      'samantha-recycle-media': 'Media',
      'portal-data-refresh':    'Portal Data Refresh',
      'social-monitoring':      'Social Monitoring',
      'github-monitoring':      'GitHub Monitoring',
      'cliff-article-review':   'Article Review',
      'pipeline-health-check':  'Pipeline Health Check',
      'morning-check-in':       'Morning Check-in',
      'evening-check':          'Evening Check',
      'weekly-report':          'Weekly Report',
    };

    // Task tooltip descriptions — canonical database keyed by display name
    const _taskTooltips = {
      // Direct / interactive sessions
      'Tim (Telegram DM)':          'A live conversation between Tim and this agent in Telegram DMs. Cost depends on how long the conversation runs and how much context accumulates.',
      'Tim (Signal DM)':            'A live conversation between Tim and this agent via Signal.',

      'Web UI (Heartbeat+Chat)':    'Cliff\'s always-on session that handles the web dashboard and any background heartbeat checks. Can accumulate cost if left running for many hours.',
      'Atlas (Telegram DM)':        'Tim chatting directly with Atlas (the coding agent) in Telegram.',
      'Atlas (Web UI)':             'Atlas session started from the web dashboard.',
      'Samantha (Telegram DM)':     'Tim chatting directly with Samantha (the content writer) in Telegram.',
      'Scout (Telegram DM)':        'Tim chatting directly with Scout (the monitoring agent) in Telegram.',

      // Group chat
      'Cliff (Chat Hub)':           'Cliff participating in the multi-agent Telegram group chat where all agents can talk to each other and Tim.',
      'Samantha (Chat Hub)':        'Samantha participating in the multi-agent Telegram group chat.',
      'Scout (Chat Hub)':           'Scout participating in the multi-agent Telegram group chat.',
      'Atlas (Chat Hub)':           'Atlas participating in the multi-agent Telegram group chat.',

      // Content pipeline — Samantha
      'Article Writer':             'Samantha picks an industry from the Felix Playbook, researches pain points, and writes a full blog article with SEO metadata. Currently parked until Tim reviews the schedule.',
      'Article Draft':              'Samantha picks an industry from the Felix Playbook, researches pain points, and writes a full blog article with SEO metadata. Currently parked until Tim reviews the schedule.',
      'Publish':                    'Takes approved articles and tweets from the queue and pushes them live — deploys blog posts to the website and posts tweets to Twitter/X. Currently parked.',
      'Cliff Tweet':                'Samantha writes tweets in Cliff\'s voice to post from the @CliffCircuit Twitter account. Topics come from the content queue.',
      'Tim Tweet':                  'Samantha writes tweets in Tim\'s voice to post from Tim\'s Twitter account. Cross-promotes Cliff and the blog.',
      'Media / Images':             'Generates DALL-E 3 hero images in the isometric 3D diorama style for blog articles. Runs after an article is written, before it enters the queue.',
      'Recycle Writer':             'When an article gets rejected during review, this picks it back up and rewrites it — fixes the title, excerpt, or body based on the rejection reason. One article per run.',
      'Recycle Media':              'Regenerates hero images for articles that were rejected and rewritten by the recycle writer.',

      // Content pipeline — Cliff
      'Article Review':             'Cliff reads drafted articles and decides: approve, reject, or request changes. Acts as quality control before anything gets published.',
      'Scheduler':                  'The central pipeline brain — reviews drafts, assigns publish times to approved content, and triggers publishing.',

      // Infrastructure — Scout
      'Portal Refresh':             'Scout rebuilds the portal\'s data file with the latest content queue, Twitter stats, site health, and cron info, then pushes to GitHub so the dashboard stays current.',
      'Social Monitoring':          'Monitors Twitter/X for mentions of @CliffCircuit and @timharris707, tracks follower counts, and flags any notable engagement.',
      'GitHub Monitoring':          'Watches the GitHub repos for new issues, pull requests, or unexpected activity.',

      // Infrastructure — Cliff
      'Pipeline Health':            'Verifies all cron jobs are healthy, both websites are responding, the content queue isn\'t stuck, Twitter credentials work, and disk space is fine.',
      'Morning Check-In':           'Morning briefing sent to Tim via Telegram. Covers today\'s calendar, urgent emails, weather, and what the agents did overnight.',
      'Evening Check':              'End-of-day review — what got done today, anything left unfinished, and notes for tomorrow.',
      'Weekly Report':              'Executive summary — content published, follower growth, site traffic, API costs, cron health, and key decisions made during the week.',
      'Daily Cost Report':          'Summary of token usage and API costs across all agents, broken down by session type. Sent to Tim via Telegram.',
      'Nightly Extraction':         'Data extraction and processing tasks that run overnight.',
      'Nightly Git Backup':         'Commits all changed workspace files to GitHub so nothing is lost between sessions. A safety net in case something goes wrong.',

      // Atlas coding
      'Build':                      'Atlas coding agent building a new feature, page, or component from scratch. Triggered on-demand by Cliff when Tim requests something built. Cost varies by task complexity.',
      'Refactor':                   'Atlas restructuring or cleaning up existing code without changing what it does. Triggered on-demand.',
      'Debug':                      'Atlas investigating and fixing a bug. Triggered on-demand when something is broken.',

      // Subagent / misc
      'Cliff (Subagent Run)':       'Cliff spawned a short-lived helper session for an isolated task — like checking a file or running a quick script.',
      'Samantha (Subagent Run)':    'Samantha spawned a short-lived helper session for an isolated task.',
      'Scout (Subagent Run)':       'Scout spawned a short-lived helper session for an isolated task.',
      'Atlas (Subagent Run)':       'Atlas spawned a short-lived helper session for an isolated task.',
      'Fernanda (Subagent Run)':    'Fernanda spawned a short-lived helper session for an isolated task.',
      'Heartbeat':                  'Periodic check-in — reads inbox and responds to messages.',
      'Wake':                       'One-shot cron that boots an agent\'s session for the first time after configuration.',
      'Martin (Msgs DM)':           'iMessage conversation with Martin.',
      'Heartbeat':                  'Periodic health poll — checks the agent inbox for messages, verifies systems are running, and handles lightweight background tasks.',
      'Live Sessions Refresh':      'Checks which AI sessions are currently running and writes the results to a file the portal reads. This is how the Agents page knows who\'s online and what they\'re doing.',
      'Session Previews Refresh':   'Grabs the task description and latest response from each recent session so the portal can show what each session was working on when you click into it.',
    };

    // Look up cron schedule for a display name by reverse-mapping CRON_DISPLAY
    function _getCronSchedule(displayName) {
      if (!displayName || !window._cronList) return null;
      // Build reverse map: display name → cron name(s)
      const reverseDisplay = {};
      if (typeof CRON_DISPLAY === 'object') {
        for (const [cronName, dispName] of Object.entries(CRON_DISPLAY)) {
          reverseDisplay[dispName] = reverseDisplay[dispName] || [];
          reverseDisplay[dispName].push(cronName);
        }
      }
      const cronNames = reverseDisplay[displayName];
      if (cronNames) {
        for (const cn of cronNames) {
          const cron = window._cronList.find(c => c.name === cn);
          if (cron && cron.schedule && cron.schedule !== '—') return cron.schedule;
        }
      }
      // Fallback: try matching by auto-formatted name (e.g. 'Session Previews Refresh' → 'session-previews-refresh')
      const slugified = displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const fallback = window._cronList.find(c => c.name === slugified);
      if (fallback && fallback.schedule && fallback.schedule !== '—') return fallback.schedule;
      return null;
    }

    function _fmtCronSchedule(schedule) {
      if (!schedule) return null;
      const everyMatch = schedule.match(/^every\s+(\d+)m$/);
      if (everyMatch) return 'every ' + everyMatch[1] + 'm';
      const everyH = schedule.match(/^every\s+(\d+)h$/);
      if (everyH) return 'every ' + everyH[1] + 'h';
      // Cron expression — produce a human-readable summary
      const parts = schedule.split(/\s+/);
      if (parts.length >= 5) {
        const [min, hour, dom, mon, dow] = parts;
        if (dow !== '*' && hour !== '*') return `${dow === '0' ? 'Sun' : dow === '1' ? 'Mon' : dow === '2' ? 'Tue' : dow === '3' ? 'Wed' : dow === '4' ? 'Thu' : dow === '5' ? 'Fri' : dow === '6' ? 'Sat' : dow} at ${hour}:${min.padStart(2,'0')}`;
        if (hour.includes('-')) return `hourly (${hour})`;
        if (hour !== '*' && min !== '*') return `daily at ${hour}:${min.padStart(2,'0')}`;
        if (min !== '*' && hour === '*') return `every hour at :${min.padStart(2,'0')}`;
      }
      return schedule;
    }

    window._getTaskTooltip = function(name) {
      let base = _taskTooltips[name];
      // Dynamic tooltip for any iMessage contact: "[Name] (Msgs DM)"
      if (!base) {
        const msgsDmMatch = name.match(/^(.+?) \(Msgs DM\)$/);
        if (msgsDmMatch) base = 'A live conversation between ' + msgsDmMatch[1] + ' and Cliff via iMessage.';
      }
      if (!base) return null;
      const sched = _getCronSchedule(name);
      if (!sched) return base;
      const formatted = _fmtCronSchedule(sched);
      return formatted ? base + ' \u00b7 Schedule: ' + formatted : base;
    };

