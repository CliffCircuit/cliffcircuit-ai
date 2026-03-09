// ══════════════════════════════════════════════════════════════════
// tokens.js — All inline JavaScript extracted from tokens.html
// Last modified: 2026-03-09 — green-dot bug fixed
// Persistent session test — can you see the previous task context?
// ══════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════
    // Token Usage — standalone page
    // Extracted from portal-old.html (the working version)
    // ══════════════════════════════════════════════════════════════════

    // ── State ─────────────────────────────────────────────────────────
    window._globalRange  = 'today';
    window._globalAgent    = 'all';
    window._globalTask     = 'all';
    window._globalProvider = 'all';
    window._globalModel    = 'all';
    window._tokenRange     = 'today';
    window._dbSubShowAll = false;
    window._dbRawTaskFilter = 'all';
    window._sbSessionRows = [];
    window._allDbSubItems = [];
    window._cronTotals = { tokensIn:0, tokensOut:0, cost:0, sessions:0 };
    window._subTotals  = { tokensIn:0, tokensOut:0, cost:0, sessions:0 };
    window._agentTaskMap = {};
    window._taskAgentMap = {};
    window._costChartView = 'agent';  // default: stacked by agent over time
    window._costChartItems = [];     // cached items for re-render on view switch
    window._costChartHidden = { agent: new Set(), model: new Set(), task: new Set() }; // legend toggle state per view

    // ── Local helpers (match old page exactly) ────────────────────────
    const _fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0);
    const _fmtDur = ms => { if (!ms || ms <= 0) return '—'; const s = Math.round(ms/1000); if (s < 60) return s + 's'; const m = Math.round(s/60); if (m < 60) return m + 'm'; return Math.round(m/60) + 'h ' + (m%60) + 'm'; };
    const _fmtTs = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZone:'America/Los_Angeles' }) + ' PT' : '—';

    const _agentCls = { samantha:'text-teal-400', scout:'text-green-400', main:'text-indigo-400', cliff:'text-indigo-400', 'claude-code':'text-purple-400', atlas:'text-orange-400' };
    const _agentLabel = { main:'Cliff', cliff:'Cliff', samantha:'Samantha', scout:'Scout', atlas:'Atlas', 'claude-code':'Claude Code' };

    // Use the shared modelShort from portal-common.js (loaded before this script)
    const _modelShortT = m => modelShort(m);

    // Model breakdown — expand summary row into per-model sub-rows
    function _renderModelCell(g, rowId) {
      const keys = Object.keys(g.modelBreakdown || {});
      // modelShort returns HTML (with <span> color), so don't esc() it
      const primary = Object.entries(g.modelBreakdown).sort((a,b) => b[1].count - a[1].count)[0];
      // breakdown keys are already HTML from modelShort(); use directly
      const label = primary ? primary[0] : _modelShortT(g.model);
      if (keys.length <= 1) return label;
      return `<span style="display:inline-flex;align-items:center;gap:6px;">${label}<button onclick="event.stopPropagation();_toggleModelExpand('${rowId}')" style="background:none;border:1px solid #4b5563;border-radius:4px;color:#9ca3af;cursor:pointer;font-size:11px;padding:0 4px;line-height:1.4;" title="Show per-model breakdown">+${keys.length}</button></span>`;
    }
    const _grpBreakdownStore = {};
    const _expandedTasks = new Set(); // persist expanded state across re-renders (keyed by task name)
    const _expandedSessionTasks = new Set(); // persist session-expanded state across re-renders (keyed by task name)
    function _toggleModelExpand(rowId) {
      const parentRow = document.getElementById(rowId);
      if (!parentRow) return;
      const expanded = parentRow.dataset.expanded === '1';
      // Remove existing sub-rows
      let next = parentRow.nextElementSibling;
      while (next && (next.classList.contains('model-sub-row') || next.classList.contains('session-detail-row'))) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
      const taskName = parentRow.dataset.taskName || '';
      if (expanded) {
        parentRow.dataset.expanded = '0';
        parentRow.style.opacity = '';
        _expandedTasks.delete(taskName);
        return;
      }
      // Insert sub-rows
      parentRow.dataset.expanded = '1';
      parentRow.style.opacity = '0.4';
      _expandedTasks.add(taskName);
      const bd = _grpBreakdownStore[rowId] || {};
      const entries = Object.entries(bd).sort((a,b) => b[1].cost - a[1].cost);
      const maxCost = entries[0] ? entries[0][1].cost : 1;
      let insertAfter = parentRow;
      entries.forEach(([model, d], idx) => {
        const barPct = Math.round((d.cost / maxCost) * 100);
        const barCls = barPct > 66 ? 'bg-red-500' : barPct > 33 ? 'bg-yellow-500' : 'bg-teal-500';
        const tr = document.createElement('tr');
        tr.className = 'model-sub-row border-b border-gray-900 hover:bg-gray-800 transition-colors';
        tr.style.cssText = 'background:rgba(55,65,81,0.25);';
        const taskName = esc(parentRow.dataset.taskName || '');
        const shortTask = taskName.length > 20 ? taskName.slice(0,20) + '\u2026' : taskName;
        tr.innerHTML = `
          <td class="px-4 py-2 text-gray-500 text-xs font-medium" style="padding-left:28px;">${shortTask}</td>
          <td class="px-4 py-2 text-xs"><span class="${parentRow.dataset.agentCls || 'text-gray-400'}">${parentRow.dataset.agentLabel || ''}</span></td>
          <td class="px-4 py-2 text-xs text-gray-300">${model}</td>
          <td class="px-4 py-2 text-right text-white text-xs font-bold">${_renderRunsCell(d.count, 'msub-' + rowId + '-' + idx, d.sessions)}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${d.count > 0 ? _fmtDur(Math.round(d.dur / d.count)) : '\u2014'}</td>
          <td class="px-4 py-2 text-right text-white text-xs">${_fmtK(d.tokIn)} / ${_fmtK(d.tokOut)}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${d.count > 0 && (d.cost/d.count) >= 0.01 ? '$' + (d.cost/d.count).toFixed(3) : '<$0.01'}</td>
          <td class="px-4 py-2 text-right text-yellow-400 text-xs font-semibold">${d.cost >= 0.01 ? '$' + d.cost.toFixed(2) : '<$0.01'}</td>
          <td class="px-4 py-2" style="min-width:80px;"><div class="bg-gray-800 rounded-full h-1.5"><div class="${barCls} h-1.5 rounded-full" style="width:${barPct}%"></div></div></td>`;
        insertAfter.after(tr);
        insertAfter = tr;
      });
    }

    // Session drill-down — expand individual sessions from runs count
    const _sessionStore = {};
    const _expandedSessions = new Set();
    const _sessionDataMap = {}; // keyed by session_id → full session object
    let _sessionDetailOpenId = null; // currently-open detail panel session_id
    let _sessionDetailSource = null; // 'grouped' or 'raw' — which table owns the open detail
    function _renderRunsCell(count, storeKey, sessions) {
      const hasMulti = sessions && sessions.length > 1;
      const hasSingle = sessions && sessions.length === 1;
      if (hasMulti || hasSingle) _sessionStore[storeKey] = sessions;
      const btnStyle = 'background:none;border:1px solid #4b5563;border-radius:4px;color:#9ca3af;cursor:pointer;font-size:12px;padding:1px 5px;line-height:1;min-width:18px;display:inline-block;text-align:center;';
      if (hasMulti) {
        return `${count} <button onclick="event.stopPropagation();_toggleSessionExpand('${storeKey}',this)" title="Show individual sessions" style="${btnStyle}">+</button>`;
      }
      // Single session or zero — invisible placeholder keeps alignment consistent
      return `${count} <span style="${btnStyle}visibility:hidden;">+</span>`;
    }
    const _singleSessionSidCache = {}; // storeKey → stable sid
    function _toggleSingleSessionDetail(storeKey, parentRow) {
      if (!parentRow) return;
      const sessions = _sessionStore[storeKey] || [];
      if (sessions.length !== 1) return;
      const s = sessions[0];
      // Use stable sid — cache it so toggle-off works
      if (!_singleSessionSidCache[storeKey]) {
        _singleSessionSidCache[storeKey] = s._raw?.session_id || s.label || ('s-' + Math.random().toString(36).slice(2));
      }
      const sid = _singleSessionSidCache[storeKey];
      _sessionDataMap[sid] = s;
      // Delegate to _toggleSessionDetail which handles open/close toggle
      _sessionDetailSource = 'grouped';
      _toggleSessionDetail(sid, parentRow);
    }
    // Handle click on grouped summary row — route to single-session detail or multi-session expand
    function _handleSummaryRowClick(storeKey, rowEl) {
      const sessions = _sessionStore[storeKey] || [];
      if (sessions.length === 1) {
        _toggleSingleSessionDetail(storeKey, rowEl);
      } else if (sessions.length > 1) {
        // Find the session expand button inside this row
        const btn = rowEl.querySelector('button[title="Show individual sessions"]');
        if (btn) _toggleSessionExpand(storeKey, btn);
      }
    }
    function _toggleSessionExpand(storeKey, btn) {
      const parentRow = btn.closest('tr');
      if (!parentRow) return;
      const expanded = parentRow.dataset.sessExpanded === '1';
      // Remove existing session sub-rows and detail panels
      let next = parentRow.nextElementSibling;
      while (next && (next.classList.contains('session-detail-row') || next.classList.contains('session-detail-panel-row'))) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
      _sessionDetailOpenId = null;
      const taskName = parentRow.dataset.taskName || '';
      if (expanded) {
        parentRow.dataset.sessExpanded = '0';
        _expandedSessions.delete(storeKey);
        _expandedSessionTasks.delete(taskName);
        return;
      }
      parentRow.dataset.sessExpanded = '1';
      _expandedSessions.add(storeKey);
      if (taskName) _expandedSessionTasks.add(taskName);
      const sessions = _sessionStore[storeKey] || [];
      const sorted = [...sessions].sort((a,b) => new Date(b.last_seen_at||0) - new Date(a.last_seen_at||0));
      let insertAfter = parentRow;
      const _shownActiveKeys = new Set();   // only show green dot on the most recent row per key
      sorted.forEach(s => {
        const sid = s._raw?.session_id || s.label || ('s-' + Math.random().toString(36).slice(2));
        _sessionDataMap[sid] = s;
        const tr = document.createElement('tr');
        tr.className = 'session-detail-row border-b border-gray-900/50';
        tr.style.cssText = 'background:rgba(30,40,55,0.5);cursor:pointer;';
        tr.dataset.sessionDetailId = sid;
        tr.onclick = function(e) { if (e.target.closest('button')) return; _sessionDetailSource = 'grouped'; _toggleSessionDetail(sid, this); };
        const when = (s.first_seen_at || s.last_seen_at) ? new Date(s.first_seen_at || s.last_seen_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true }) : '—';
        const dur = _fmtDur(s.duration_ms);
        const tokIn = _fmtK(s.tokens_in || 0);
        const tokOut = _fmtK(s.tokens_out || 0);
        const cost = (s.estimated_cost_usd || 0) >= 0.01 ? '$' + (s.estimated_cost_usd||0).toFixed(2) : '<$0.01';
        const sessKey = s.label || (s._raw && s._raw.session_key) || '';
        const isAtlasActive = _isAtlasActiveSession(s);
        const sessIsActive = isAtlasActive || _isSessionActive(s);
        const alreadyShown = sessKey && _shownActiveKeys.has(sessKey);
        if (sessIsActive && sessKey) _shownActiveKeys.add(sessKey);
        const sessActiveIndicator = sessIsActive && !alreadyShown ? (isAtlasActive ? _activeBadgeHtml : _activeDotHtml) : '';
        const sessTix = _getSessionTickets(sessKey);
        tr.innerHTML = `
          <td class="px-4 py-1 text-gray-600 text-xs" style="padding-left:36px;"><span style="display:inline-flex;align-items:center;">${when}${sessActiveIndicator}</span></td>
          <td class="px-4 py-1 text-xs"></td>
          <td class="px-4 py-1 text-xs text-gray-500">${_modelShortT(s.model)}</td>
          <td class="px-4 py-1 text-right text-gray-500 text-xs">1</td>
          <td class="px-4 py-1 text-right text-gray-400 text-xs">${dur}</td>
          <td class="px-4 py-1 text-right text-gray-300 text-xs">${tokIn} / ${tokOut}</td>
          <td class="px-4 py-1 text-right text-gray-500 text-xs"></td>
          <td class="px-4 py-1 text-right text-yellow-400/70 text-xs">${cost}</td>
          <td class="px-4 py-1"></td>`;
        insertAfter.after(tr);
        insertAfter = tr;
      });
    }

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
      const sdpActiveHtml = sdpIsActive ? '<span class="active-badge" style="font-size:11px;padding:2px 10px;margin-left:auto;flex-shrink:0;"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;animation:live-pulse 2s ease-in-out infinite;"></span>ACTIVE</span>' : '';

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

    const _getTaskTooltip = function(name) {
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

    // ── Toggle ────────────────────────────────────────────────────────
    function toggleDbSubagents() {
      window._dbSubShowAll = !window._dbSubShowAll;
      renderAllSections();
    }

    // ── Global Filter Controls ────────────────────────────────────────
    function setGlobalRange(r) {
      window._globalRange = r;
      window._tokenRange = r;
      const sel = document.getElementById('global-range');
      if (sel) sel.value = r;
      applyGlobalFilters();
    }
    function setGlobalAgent(a) {
      window._globalAgent = a;
      if (a !== 'all' && window._globalTask !== 'all') {
        const validTasks = window._agentTaskMap[a] || [];
        if (!validTasks.includes(window._globalTask)) {
          window._globalTask = 'all';
          const tSel = document.getElementById('global-task');
          if (tSel) tSel.value = 'all';
        }
      }
      applyGlobalFilters();
    }
    function setGlobalTask(t) {
      window._globalTask = t;
      if (t !== 'all' && window._globalAgent !== 'all') {
        const validAgents = window._taskAgentMap[t] || [];
        if (!validAgents.includes(window._globalAgent)) {
          window._globalAgent = 'all';
          const aSel = document.getElementById('global-agent');
          if (aSel) aSel.value = 'all';
        }
      }
      applyGlobalFilters();
    }

    function _getProviderFromFriendlyModel(label) {
      // Map friendly model labels (e.g. "Sonnet 4.6") back to provider
      if (!label) return 'Unknown';
      const l = label.toLowerCase();
      if (l.includes('opus') || l.includes('sonnet') || l.includes('haiku')) return 'Anthropic';
      if (l.includes('gemini')) return 'Google';
      if (l.includes('grok')) return 'xAI';
      if (l.includes('gpt') || l.includes('o1')) return 'OpenAI';
      return 'Other';
    }

    function setGlobalProvider(p) {
      window._globalProvider = p;
      // Reset model filter if it doesn't match the new provider
      if (p !== 'all' && window._globalModel !== 'all') {
        const modelProvider = _getProviderFromFriendlyModel(window._globalModel);
        if (modelProvider !== p) {
          window._globalModel = 'all';
          const mSel = document.getElementById('global-model');
          if (mSel) mSel.value = 'all';
        }
      }
      applyGlobalFilters();
    }
    function setGlobalModel(m) {
      window._globalModel = m;
      applyGlobalFilters();
    }

    function _getProviderFromModel(rawModel) {
      if (!rawModel) return 'Unknown';
      const m = rawModel.toLowerCase();
      if (m.includes('claude') || m.includes('anthropic')) return 'Anthropic';
      if (m.includes('gemini') || m.includes('google')) return 'Google';
      if (m.includes('grok') || m.includes('xai')) return 'xAI';
      if (m.includes('gpt') || m.includes('openai') || m.includes('o1')) return 'OpenAI';
      return 'Other';
    }

    function _populateProviderDropdown(items) {
      const sel = document.getElementById('global-provider');
      if (!sel) return;
      const cur = window._globalProvider || 'all';
      const providers = [...new Set(items.map(s => _getProviderFromModel(s.model)).filter(p => p !== 'Unknown'))].sort();
      sel.innerHTML = '<option value="all">All Providers</option>' +
        providers.map(p => `<option value="${esc(p)}"${p===cur?' selected':''}>${esc(p)}</option>`).join('');
      // Reset stale selection if current provider no longer exists in options
      if (cur !== 'all' && !providers.includes(cur)) {
        window._globalProvider = 'all';
        sel.value = 'all';
      }
    }

    function _populateModelDropdown(items) {
      const sel = document.getElementById('global-model');
      if (!sel) return;
      const cur = window._globalModel || 'all';
      const provFilter = window._globalProvider || 'all';
      const filtered = provFilter === 'all' ? items : items.filter(s => _getProviderFromModel(s.model) === provFilter);
      const modelLabels = {};
      filtered.forEach(s => {
        const label = typeof friendlyModel === 'function' ? friendlyModel(s.model) : s.model;
        if (label && label !== 'Unknown') modelLabels[label] = true;
      });
      const sorted = Object.keys(modelLabels).sort();
      sel.innerHTML = '<option value="all">All Models</option>' +
        sorted.map(m => `<option value="${esc(m)}"${m===cur?' selected':''}>${esc(m)}</option>`).join('');
      // Reset stale selection if current model no longer exists in options
      if (cur !== 'all' && !sorted.includes(cur)) {
        window._globalModel = 'all';
        sel.value = 'all';
      }
    }

    function applyGlobalFilters() {
      _grpManualRefresh = true;
      loadAndRenderAgentSessions();
    }

    function _populateTaskDropdown(taskNames) {
      const sel = document.getElementById('global-task');
      if (!sel) return;
      const cur = window._globalTask || 'all';
      const agent = window._globalAgent || 'all';
      const filtered = agent === 'all' ? taskNames : taskNames.filter(t => (window._agentTaskMap[agent]||[]).includes(t));
      sel.innerHTML = '<option value="all">All Tasks</option>' +
        filtered.map(t => `<option value="${esc(t)}"${t===cur?' selected':''}>${esc(t)}</option>`).join('');
      // Reset stale selection if current task no longer exists in options
      if (cur !== 'all' && !filtered.includes(cur)) {
        window._globalTask = 'all';
        sel.value = 'all';
      }
    }

    function _populateAgentDropdown(agentNames) {
      const sel = document.getElementById('global-agent');
      if (!sel) return;
      const cur = window._globalAgent || 'all';
      // Always show ALL agents so users can switch directly between them
      const labels = { cliff: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas', 'claude-code': 'Claude Code' };
      sel.innerHTML = '<option value="all">All Agents</option>' +
        agentNames.map(a => `<option value="${a}"${a===cur?' selected':''}>${labels[a]||a}</option>`).join('');
    }

    // ── Supabase query (server-side time filter, matches old page) ────
    async function loadAndRenderAgentSessions() {
      const range = window._globalRange || 'today';
      const agentFilter = window._globalAgent || 'all';
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoffStart, cutoffEnd = now.toISOString();

      if      (range === '1h')        cutoffStart = new Date(now - 3600000).toISOString();
      else if (range === '24h')       cutoffStart = new Date(now - 86400000).toISOString();
      else if (range === 'today')     cutoffStart = todayMidnight.toISOString();
      else if (range === 'yesterday') { cutoffStart = new Date(todayMidnight - 86400000).toISOString(); cutoffEnd = todayMidnight.toISOString(); }
      else if (range === '7d')        cutoffStart = new Date(now - 7*86400000).toISOString();
      else if (range === 'week')      cutoffStart = new Date(todayMidnight - todayMidnight.getDay()*86400000).toISOString();
      else if (range === '30d')       cutoffStart = new Date(now - 30*86400000).toISOString();
      else if (range === 'month')     cutoffStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      else                            cutoffStart = todayMidnight.toISOString();

      const PAGE_SIZE = 1000;
      let allRows = [];
      let offset = 0;
      let fetchError = false;
      while (true) {
        let query = _sb.from('session_snapshots')
          .select('session_id,session_key,agent_id,kind,model,thinking_level,input_tokens,output_tokens,cache_read,cache_write,total_tokens,context_tokens,percent_used,cost_input_usd,cost_output_usd,cost_cache_read_usd,cost_cache_write_usd,cost_total_usd,duration_ms,first_seen_at,last_seen_at')
          .gte('first_seen_at', cutoffStart)
          .lte('first_seen_at', cutoffEnd)
          .or('input_tokens.gt.0,output_tokens.gt.0')
          .order('first_seen_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (agentFilter !== 'all') {
          const agentId = agentFilter === 'cliff' ? 'main' : agentFilter;
          query = query.eq('agent_id', agentId);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[tokens] session_snapshots query error:', error);
          fetchError = true;
          break;
        }
        const rows = data || [];
        allRows = allRows.concat(rows);
        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Even on partial error, render with whatever we got (may be empty on first page error)
      if (fetchError && allRows.length === 0) {
        console.warn('[tokens] Supabase fetch failed, keeping previous data');
        // Keep previous _sbSessionRows and re-render with those
        if (window._sbSessionRows && window._sbSessionRows.length > 0) {
          renderTokenSections();
        }
        return;
      }

      // ── Merge atlas_jobs rows that are missing from session_snapshots ──
      // atlas_jobs is the authoritative record for Atlas build/debug sessions.
      // Some completed sessions may not appear in session_snapshots (e.g. snapshot
      // expired or was never created). Fetch atlas_jobs for the same time range
      // and inject synthetic session_snapshot-shaped rows for any that are missing.
      try {
        // Only fetch atlas_jobs if agent filter is 'all' or 'atlas'
        if (agentFilter === 'all' || agentFilter === 'atlas') {
        const ajQuery = _sb.from('atlas_jobs')
          .select('id,session_id,session_key,tokens_input,tokens_output,tokens_total,cost_usd,duration_seconds,status,job_type,project_slug,created_at,response_summary')
          .gte('created_at', cutoffStart)
          .lte('created_at', cutoffEnd)
          .order('created_at', { ascending: false });
        const { data: ajRows, error: ajErr } = await ajQuery;
        if (!ajErr && ajRows && ajRows.length > 0) {
          const existingIds = new Set(allRows.map(r => r.session_id));
          const existingKeys = new Set(allRows.map(r => r.session_key));
          for (const aj of ajRows) {
            // Skip if already present in session_snapshots (by session_id OR session_key)
            if ((aj.session_id && existingIds.has(aj.session_id)) ||
                (aj.session_key && existingKeys.has(aj.session_key))) continue;
            // Skip rows with no session_id and no session_key (very early records)
            if (!aj.session_id && !aj.session_key) continue;
            // Build a synthetic session_snapshot-shaped row from atlas_jobs data
            const durationMs = aj.duration_seconds ? aj.duration_seconds * 1000 : 0;
            const createdAt = aj.created_at;
            const endAt = durationMs ? new Date(new Date(createdAt).getTime() + durationMs).toISOString() : createdAt;
            allRows.push({
              session_id:    aj.session_id || aj.id,
              session_key:   aj.session_key || '',
              agent_id:      'atlas',
              kind:          'cron',
              model:         'anthropic/claude-opus-4-6',  // Atlas default
              thinking_level: null,
              input_tokens:  aj.tokens_input || 0,
              output_tokens: aj.tokens_output || 0,
              cache_read:    0,
              cache_write:   0,
              total_tokens:  aj.tokens_total || 0,
              context_tokens: 0,
              percent_used:  0,
              cost_input_usd:  null,
              cost_output_usd: null,
              cost_cache_read_usd: null,
              cost_cache_write_usd: null,
              cost_total_usd: aj.cost_usd || 0,
              duration_ms:   durationMs,
              first_seen_at: createdAt,
              last_seen_at:  endAt,
              _from_atlas_jobs: true,  // marker for debugging
            });
          }
        }
        } // end if agentFilter
      } catch (e) {
        console.warn('[tokens] atlas_jobs merge failed:', e);
      }

      window._sbSessionRows = allRows;
      renderAgentSessionsSection(allRows);
      renderTokenSections();
    }

    // ── Agent portrait config ─────────────────────────────────────────
    const _agentPortraitConfig = {
      main:          { alias: 'cliff',      name: 'Cliff',       avatar: '/portal/cliff-avatar.jpg',     accentClass: 'text-indigo-400' },
      cliff:         { alias: 'cliff',      name: 'Cliff',       avatar: '/portal/cliff-avatar.jpg',     accentClass: 'text-indigo-400' },
      samantha:      { alias: 'samantha',   name: 'Samantha',    avatar: '/portal/samantha-avatar.jpg',  accentClass: 'text-teal-400'   },
      scout:         { alias: 'scout',      name: 'Scout',       avatar: '/portal/scout-avatar.jpg',     accentClass: 'text-green-400'  },
      atlas:         { alias: 'atlas',      name: 'Atlas',       avatar: '/portal/atlas-avatar.png',     accentClass: 'text-orange-400' },
      'claude-code': { alias: 'claude-code',name: 'Claude Code', avatar: '',                             accentClass: 'text-purple-400' },
    };

    function renderSummaryPortraits(items) {
      const container = document.getElementById('summary-agent-portraits');
      if (!container) return;

      const agentFilter = window._globalAgent || 'all';

      // Aggregate per agent — merge "main" and "cliff" into "cliff"
      // Accepts processed items (agent_type, tokens_in, tokens_out, estimated_cost_usd)
      const agentData = {};
      for (const r of items) {
        const raw = r.agent_type || r.agent_id || 'unknown';
        const id = (raw === 'main') ? 'cliff' : raw;
        if (!agentData[id]) agentData[id] = { sessions: 0, tokens: 0, cost: 0 };
        agentData[id].sessions++;
        agentData[id].tokens += (r.tokens_in || 0) + (r.tokens_out || 0);
        agentData[id].cost += r.estimated_cost_usd || r.cost_total_usd || 0;
      }

      // Filter: if specific agent selected, only show that one
      let agentIds = Object.keys(agentData);
      if (agentFilter !== 'all') {
        agentIds = agentIds.filter(id => id === agentFilter);
      }

      if (agentIds.length === 0) {
        container.innerHTML = '';
        return;
      }

      // Sort: known agents first (cliff, samantha, scout, atlas), then alphabetical
      const knownOrder = ['cliff','samantha','scout','atlas'];
      agentIds.sort((a,b) => {
        const ai = knownOrder.indexOf(a), bi = knownOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });

      const cards = agentIds.map(id => {
        const cfg = _agentPortraitConfig[id] || { alias: id, name: _agentLabel[id] || id, avatar: '', accentClass: 'text-gray-400' };
        const d = agentData[id];
        const avatarHtml = cfg.avatar
          ? `<img src="${cfg.avatar}" alt="${esc(cfg.name)}" class="absolute left-0 top-0 h-full w-32 object-cover object-top" style="opacity:0.7;" /><div class="absolute left-0 top-0 h-full w-32" style="background:linear-gradient(to right, transparent 55%, #111827 100%);"></div>`
          : '';
        return `<div class="relative overflow-hidden" style="min-height:90px;background:#111827;border:1px solid #1f2937;border-radius:8px;">
          ${avatarHtml}
          <div class="relative px-5 py-4 ${cfg.avatar ? 'pl-36' : 'pl-5'}">
            <div class="${cfg.accentClass}" style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${esc(cfg.name)}</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div><div style="font-size:11px;color:#6b7280;">Sessions</div><div style="font-size:20px;font-weight:700;color:#fff;">${d.sessions}</div></div>
              <div><div style="font-size:11px;color:#6b7280;">Tokens</div><div style="font-size:20px;font-weight:700;color:#fff;">${_fmtK(d.tokens)}</div></div>
              <div><div style="font-size:11px;color:#6b7280;">Cost</div><div style="font-size:20px;font-weight:700;color:#facc15;">$${d.cost.toFixed(2)}</div></div>
            </div>
          </div>
        </div>`;
      }).join('');

      container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:16px;">${cards}</div>`;
    }

    // ── Agent Sessions section (table) ────────────────────────────────
    function renderAgentSessionsSection(rows) {
      // Portrait rendering moved to renderTokenSections() so it reflects all global filters
      // (Agent Sessions table removed — data still flows to Summary + Raw sections below)
    }

    // ── Main render (Grouped + Raw) ───────────────────────────────────
    function renderTokenSections() {
      const range = window._tokenRange || 'today';
      const agentFilter = window._globalAgent || 'all';
      const taskFilter  = window._globalTask  || 'all';
      const now = Date.now();
      const n = new Date();
      const cutoff = (() => {
        if (range === '1h')        return now - 3600000;
        if (range === '24h')       return now - 86400000;
        if (range === 'today')     return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
        if (range === 'yesterday') { const y = new Date(n.getFullYear(), n.getMonth(), n.getDate()-1); return [y.getTime(), y.getTime()+86400000]; }
        if (range === '7d')        return now - 7*86400000;
        if (range === 'week')      { const d = n.getDay(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()-d).getTime(); }
        if (range === '30d')       return now - 30*86400000;
        if (range === 'month')     return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
      })();
      const cutoffEnd = Array.isArray(cutoff) ? cutoff[1] : now;
      const cutoffStart = Array.isArray(cutoff) ? cutoff[0] : cutoff;

      const sbRows = window._sbSessionRows || [];

      // Build agent-task maps
      const agentNorm = a => { if (!a) return 'cliff'; if (a === 'main' || a === 'cliff') return 'cliff'; return a.toLowerCase(); };
      const atMap = {}, taMap = {};

      // Build allDbItems from sbRows
      const allDbItems = sbRows.map(r => {
        const isCron = r.session_key && (r.session_key.startsWith('cron:') || r.session_key.includes(':cron:'));
        const cronName = isCron ? cronTaskFromKey(r.session_key) : null;
        const displayName = sessionKeyToFriendly(r.session_key, r.session_id);
        const runMs = (() => { const m = r.session_key?.match(/:run:(\d+)$/); return m ? parseInt(m[1]) : null; })();
        const durationMs = r.duration_ms || (r.last_seen_at && r.first_seen_at
          ? new Date(r.last_seen_at) - new Date(r.first_seen_at) : 0);
        return {
          display_name: displayName,
          task_name:    cronName || (isCron ? 'unknown' : 'direct'),
          agent_type:   r.agent_id,
          model:        r.model,
          duration_ms:  durationMs,
          tokens_in:    (r.input_tokens||0) + (r.cache_read||0) + (r.cache_write||0),
          tokens_out:   r.output_tokens || 0,
          estimated_cost_usd: r.cost_total_usd || 0,
          started_at:   runMs || (r.first_seen_at ? new Date(r.first_seen_at).getTime() : 0),
          label:        r.session_key,
          first_seen_at: r.first_seen_at,
          last_seen_at:  r.last_seen_at,
          _raw:          r,
        };
      });
      window._allDbSubItems = allDbItems;

      // Apply provider and model filters
      const providerFilter = window._globalProvider || 'all';
      const modelFilter = window._globalModel || 'all';
      const filteredDbItems = allDbItems.filter(s => {
        if (providerFilter !== 'all' && _getProviderFromModel(s.model) !== providerFilter) return false;
        if (modelFilter !== 'all' && (typeof friendlyModel === 'function' ? friendlyModel(s.model) : s.model) !== modelFilter) return false;
        return true;
      });

      // Build agent-task maps from provider/model-filtered items
      // so dropdowns only show tasks/agents with matching sessions
      filteredDbItems.forEach(s => {
        const a = agentNorm(s.agent_type);
        const t = s.display_name || s.task_name;
        if (!t) return;
        if (!atMap[a]) atMap[a] = [];
        if (!atMap[a].includes(t)) atMap[a].push(t);
        if (!taMap[t]) taMap[t] = [];
        if (!taMap[t].includes(a)) taMap[t].push(a);
      });
      window._agentTaskMap = atMap;
      window._taskAgentMap = taMap;

      const subTaskNames = [...new Set(filteredDbItems.map(s => s.display_name || s.task_name).filter(Boolean))];
      const allTaskNames = [...new Set(subTaskNames)].sort();
      // Agent dropdown: always show ALL known agents (not just filtered ones)
      // so users can switch directly between agents without going through "All Agents" first
      const knownAgents = ['cliff', 'samantha', 'scout', 'atlas', 'claude-code'];
      const dataAgents = [...new Set(Object.keys(atMap))];
      const allAgentNames = [...new Set([...knownAgents, ...dataAgents])].sort();
      _populateTaskDropdown(allTaskNames);
      _populateAgentDropdown(allAgentNames);
      // Provider dropdown: populated from ALL items (not filtered by provider/model)
      // so users can always see + switch to any available provider
      _populateProviderDropdown(allDbItems);
      // Model dropdown: filtered by selected provider only (not by model itself)
      _populateModelDropdown(allDbItems);

      window._cronTotals = { tokensIn: 0, tokensOut: 0, cost: 0, sessions: 0 };

      // ── Agent portrait cards (reflect all global filters) ─────────
      renderSummaryPortraits(filteredDbItems);

      // ── Grouped Agent Sessions Summary ────────────────────────────
      renderGrouped(filteredDbItems, cutoffStart, cutoffEnd);

      // ── Raw table ───────────────────────────────────────────────────
      renderRawTable(filteredDbItems);
    }


// ── Cost Bar Chart (stacked over time) ──────────────────────────
// Color palette for agents
const _agentColors = {
  cliff:        '#6366f1',
  samantha:     '#14b8a6',
  scout:        '#22c55e',
  atlas:        '#f97316',
  'claude-code':'#a855f7',
};
const _agentNames = { cliff:'Cliff', samantha:'Samantha', scout:'Scout', atlas:'Atlas', 'claude-code':'Claude Code' };
// Color palette for models (assigned dynamically, consistent per render)
const _modelColorPalette = ['#6366f1','#14b8a6','#22c55e','#f97316','#a855f7','#ec4899','#eab308','#06b6d4','#f43f5e','#84cc16','#8b5cf6','#0ea5e9','#d946ef','#f59e0b','#10b981','#ef4444','#3b82f6','#78716c','#fb923c','#a3e635'];
const _defaultSegmentColor = '#6b7280';

function setCostChartView(view) {
  window._costChartView = view;
  document.querySelectorAll('.cost-view-btn').forEach(btn => {
    btn.classList.toggle('cost-view-active', btn.dataset.view === view);
  });
  renderCostBarChart(window._costChartItems);
}

function _toggleCostLegend(segKey) {
  const mode = window._costChartView || 'agent';
  const hiddenSet = window._costChartHidden[mode];
  if (hiddenSet.has(segKey)) {
    hiddenSet.delete(segKey);
  } else {
    hiddenSet.add(segKey);
  }
  renderCostBarChart(window._costChartItems);
}

function _toggleAllCostLegend() {
  const mode = window._costChartView || 'agent';
  const hiddenSet = window._costChartHidden[mode];
  const allKeys = window._costChartAllSegKeys || [];
  if (hiddenSet.size === 0) {
    // All visible → deselect all
    allKeys.forEach(k => hiddenSet.add(k));
  } else {
    // Some or all hidden → select all
    hiddenSet.clear();
  }
  renderCostBarChart(window._costChartItems);
}

function _ensureChartContainer() {
  const wrap = document.getElementById('cost-bar-chart-wrap');
  const chart = document.getElementById('cost-bar-chart');
  if (!wrap || !chart) return null;
  const container = wrap.querySelector('.cost-chart-container') || (() => {
    const div = document.createElement('div');
    div.className = 'cost-chart-container';
    chart.parentNode.insertBefore(div, chart);
    div.appendChild(chart);
    return div;
  })();
  return { wrap, chart, container };
}

function _renderChartGrid(container, maxCost) {
  const oldGrid = container.querySelector('.cost-chart-grid');
  if (oldGrid) oldGrid.remove();
  const gridSteps = [1, 0.75, 0.5, 0.25, 0];
  const gridHtml = `<div class="cost-chart-grid" style="padding-left:0;">` +
    gridSteps.map(frac => {
      const val = maxCost * frac;
      const label = val >= 1 ? '$' + val.toFixed(0) : val >= 0.01 ? '$' + val.toFixed(2) : val > 0 ? '$' + val.toFixed(3) : '$0';
      return `<div class="cost-chart-gridline"><span class="cost-chart-gridline-val">${label}</span><span class="cost-chart-gridline-line"></span></div>`;
    }).join('') + '</div>';
  container.insertAdjacentHTML('afterbegin', gridHtml);
}

function _getTimeBuckets(range) {
  if (range === '1h') return '5min';
  if (range === '24h' || range === 'today' || range === 'yesterday') return 'hourly';
  return 'daily';
}

const _rangeLabels = { '1h': 'Last 1 Hour', '24h': 'Last 24 Hours', 'today': 'Today', 'yesterday': 'Yesterday', '7d': 'Last 7 Days', 'week': 'This Week', '30d': 'Last 30 Days', 'month': 'This Month' };

function renderCostBarChart(items) {
  window._costChartItems = items;
  const view = window._costChartView || 'agent';
  const titleEl = document.getElementById('cost-chart-title');
  if (titleEl) {
    const titles = { agent: 'Cost Over Time \u2014 By Agent', model: 'Cost Over Time \u2014 By Model', task: 'Cost Over Time \u2014 By Task' };
    titleEl.textContent = titles[view] || 'Cost Over Time';
  }
  // Update active time range label
  const rangeLabelEl = document.getElementById('cost-chart-range-label');
  if (rangeLabelEl) {
    const range = window._globalRange || 'today';
    rangeLabelEl.textContent = _rangeLabels[range] || range;
  }
  _renderStackedCostChart(items, view);
}

function _renderStackedCostChart(items, mode) {
  const els = _ensureChartContainer();
  if (!els) return;
  const { wrap, chart, container } = els;
  const legendEl = document.getElementById('cost-chart-legend');
  const range = window._globalRange || 'today';
  const bucketMode = _getTimeBuckets(range);
  const TZ = 'America/Los_Angeles';

  // 1. Bucket items into time periods, tracking per-segment costs
  const buckets = {};   // key -> { label, segments: { segKey -> { cost, sessions, tokIn, tokOut } } }
  const allSegKeys = new Set();

  for (const s of items) {
    const ts = s.started_at ? new Date(typeof s.started_at === 'number' ? s.started_at : s.started_at) : null;
    if (!ts || isNaN(ts)) continue;

    let timeKey, timeLabel;
    if (bucketMode === '5min') {
      // Floor timestamp to nearest 5-minute interval
      const msInTZ = ts.getTime();
      const fiveMin = 5 * 60 * 1000;
      const floored = new Date(Math.floor(msInTZ / fiveMin) * fiveMin);
      timeKey = floored.toISOString();
      timeLabel = floored.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    } else if (bucketMode === 'hourly') {
      const hStr = ts.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: true });
      const dateKey = ts.toLocaleDateString('en-CA', { timeZone: TZ });
      timeKey = dateKey + ' ' + ts.toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false });
      timeLabel = hStr;
    } else {
      timeKey = ts.toLocaleDateString('en-CA', { timeZone: TZ });
      timeLabel = ts.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
    }

    // Determine segment key
    let segKey;
    if (mode === 'agent') {
      const raw = s.agent_type || s.agent_id || 'unknown';
      segKey = (raw === 'main') ? 'cliff' : raw;
    } else if (mode === 'task') {
      segKey = s.display_name || s.task_name || 'Unknown';
    } else {
      segKey = typeof friendlyModel === 'function' ? friendlyModel(s.model) : (s.model || 'Unknown');
    }

    if (!buckets[timeKey]) buckets[timeKey] = { label: timeLabel, segments: {} };
    if (!buckets[timeKey].segments[segKey]) buckets[timeKey].segments[segKey] = { cost: 0, sessions: 0, tokIn: 0, tokOut: 0 };
    buckets[timeKey].segments[segKey].cost += s.estimated_cost_usd || s.cost_total_usd || 0;
    buckets[timeKey].segments[segKey].sessions++;
    buckets[timeKey].segments[segKey].tokIn += s.tokens_in || 0;
    buckets[timeKey].segments[segKey].tokOut += s.tokens_out || 0;
    allSegKeys.add(segKey);
  }

  // Backfill empty 5-minute slots so the 1h chart always shows all 12 buckets
  if (bucketMode === '5min') {
    const fiveMin = 5 * 60 * 1000;
    const nowMs = Date.now();
    const startMs = Math.floor((nowMs - 60 * 60 * 1000) / fiveMin) * fiveMin;
    for (let i = 0; i < 12; i++) {
      const slotDate = new Date(startMs + i * fiveMin);
      const slotKey = slotDate.toISOString();
      if (!buckets[slotKey]) {
        buckets[slotKey] = {
          label: slotDate.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }),
          segments: {}
        };
      }
    }
  }

  const timePeriods = Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));

  if (timePeriods.length === 0) {
    wrap.style.display = '';
    chart.innerHTML = '<div class="cost-chart-empty">No cost data for the current filters</div>';
    const oldGrid = container.querySelector('.cost-chart-grid');
    if (oldGrid) oldGrid.remove();
    if (legendEl) legendEl.innerHTML = '';
    return;
  }

  wrap.style.display = '';

  // 2. Build color map for segments
  const sortedSegKeys = [...allSegKeys].sort((a, b) => {
    // Sort by total cost descending for consistent ordering
    const aCost = timePeriods.reduce((s, [, bk]) => s + (bk.segments[a]?.cost || 0), 0);
    const bCost = timePeriods.reduce((s, [, bk]) => s + (bk.segments[b]?.cost || 0), 0);
    return bCost - aCost;
  });

  const colorMap = {};
  if (mode === 'agent') {
    sortedSegKeys.forEach(k => { colorMap[k] = _agentColors[k] || _defaultSegmentColor; });
  } else {
    // Both 'model' and 'task' modes use dynamically assigned colors
    sortedSegKeys.forEach((k, i) => { colorMap[k] = _modelColorPalette[i % _modelColorPalette.length]; });
  }

  // 4. Determine hidden segments for this view
  const hiddenSet = window._costChartHidden[mode] || new Set();

  // 5. Compute visible max cost (excluding hidden segments) for scaling
  const visiblePeriodTotals = timePeriods.map(([, b]) =>
    Object.entries(b.segments)
      .filter(([sk]) => !hiddenSet.has(sk))
      .reduce((sum, [, seg]) => sum + seg.cost, 0)
  );
  const visibleMaxCost = Math.max(...visiblePeriodTotals) || 1;
  _renderChartGrid(container, visibleMaxCost);

  // 6. Render stacked bars — per-bar sort: largest cost at bottom
  chart.innerHTML = timePeriods.map(([key, bucket], colIdx) => {
    // Filter out hidden segments, then sort per-bar by cost descending (largest first = bottom)
    const segs = Object.entries(bucket.segments)
      .filter(([sk, seg]) => !hiddenSet.has(sk) && seg.cost > 0)
      .map(([sk, seg]) => ({ key: sk, ...seg }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost = segs.reduce((s, seg) => s + seg.cost, 0);
    const barHeightPct = Math.max((totalCost / visibleMaxCost) * 100, 2);
    const delay = (colIdx * 0.06).toFixed(2);

    // Build stacked segments: segs is sorted desc (largest first).
    // In CSS flex-direction:column, first child is at top.
    // We want largest at bottom, so reverse: smallest first (top) → largest last (bottom).
    const segmentsHtml = [...segs].reverse().map(seg => {
      const segPct = totalCost > 0 ? (seg.cost / totalCost) * 100 : 0;
      const color = colorMap[seg.key];
      return `<div class="cost-stacked-segment" style="height:${segPct}%;background:${color};"></div>`;
    }).join('');

    // Tooltip breakdown (sorted by cost desc)
    const tooltipLines = segs.map(seg => {
      const name = mode === 'agent' ? (_agentNames[seg.key] || seg.key) : seg.key;
      const color = colorMap[seg.key];
      return `<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></span><span>${esc(name)}</span><span style="color:#facc15;font-weight:600;margin-left:auto;padding-left:12px;">$${seg.cost.toFixed(2)}</span></div>`;
    }).join('');
    const tooltipTotal = `<div style="border-top:1px solid #374151;margin-top:6px;padding-top:6px;font-weight:700;color:#fff;display:flex;justify-content:space-between;"><span>Total</span><span style="color:#facc15;">$${totalCost.toFixed(2)}</span></div>`;

    return `<div class="cost-bar-col">
      <div class="cost-bar-tooltip">
        <div style="font-weight:600;color:#fff;margin-bottom:6px;">${esc(bucket.label)}</div>
        ${tooltipLines}
        ${tooltipTotal}
      </div>
      <div class="cost-bar-value">$${totalCost.toFixed(2)}</div>
      <div class="cost-stacked-bar" style="height:${barHeightPct}%;animation-delay:${delay}s;">
        ${segmentsHtml}
      </div>
      <div class="cost-bar-label">${esc(bucket.label)}</div>
    </div>`;
  }).join('');

  // 7. Render interactive legend with select/deselect all toggle
  window._costChartAllSegKeys = sortedSegKeys;
  if (legendEl) {
    const allVisible = hiddenSet.size === 0;
    const toggleLabel = allVisible ? 'Deselect All' : 'Select All';
    const toggleHtml = `<span class="cost-legend-toggle-all" title="${toggleLabel}">${toggleLabel}</span>`;
    legendEl.innerHTML = toggleHtml + sortedSegKeys.map(sk => {
      const name = mode === 'agent' ? (_agentNames[sk] || sk) : sk; // task and model modes use the key directly
      const color = colorMap[sk];
      const isHidden = hiddenSet.has(sk);
      const hiddenCls = isHidden ? ' cost-legend-hidden' : '';
      return `<div class="cost-legend-item${hiddenCls}" data-seg="${esc(sk)}" title="Click to ${isHidden ? 'show' : 'hide'}"><span class="cost-legend-swatch" style="background:${color};"></span><span class="cost-legend-label">${esc(name)}</span></div>`;
    }).join('');
    // Attach click handlers via delegation
    legendEl.onclick = function(e) {
      if (e.target.closest('.cost-legend-toggle-all')) { _toggleAllCostLegend(); return; }
      const item = e.target.closest('.cost-legend-item');
      if (item && item.dataset.seg) _toggleCostLegend(item.dataset.seg);
    };
  }

  // 8. Tooltip overflow prevention — reposition on hover
  chart.addEventListener('mouseenter', function(e) {
    const col = e.target.closest('.cost-bar-col');
    if (!col) return;
    const tip = col.querySelector('.cost-bar-tooltip');
    if (!tip) return;
    // Reset any previous anchor class
    tip.classList.remove('tt-anchor-right', 'tt-anchor-left');
    // Force display so we can measure
    tip.style.display = 'block';
    const tipRect = tip.getBoundingClientRect();
    const chartRect = chart.getBoundingClientRect();
    if (tipRect.right > chartRect.right - 4) {
      tip.classList.add('tt-anchor-right');
    } else if (tipRect.left < chartRect.left + 4) {
      tip.classList.add('tt-anchor-left');
    }
    tip.style.display = '';
  }, true);
}



    // ── Grouped sub-agent ─────────────────────────────────────────────
    let _grpManualRefresh = false; // set true when user changes filters
    function renderGrouped(allDbItems, cutoffStart, cutoffEnd) {
      _grpManualRefresh = false;
      const agent = window._globalAgent || 'all';
      const taskF = window._globalTask || 'all';
      const items = (allDbItems || window._allDbSubItems).filter(s => {
        if (taskF !== 'all' && (s.display_name || s.task_name || '') !== taskF) return false;
        if (agent !== 'all') {
          const sa = (s.agent_type || '').toLowerCase();
          const agentMap = { cliff: ['cliff','main'], samantha: ['samantha'], scout: ['scout'], 'claude-code': ['claude-code'] };
          const allowed = agentMap[agent] || [agent];
          if (!allowed.some(a => sa.includes(a))) return false;
        }
        return true;
      });

      const groups = {};
      for (const s of items) {
        const key = s.display_name || s.task_name || s.agent_type || 'Unknown';
        if (!groups[key]) groups[key] = { task: key, agent: s.agent_type, model: s.model, runs: 0, totalDur: 0, tokensIn: 0, tokensOut: 0, totalCost: 0, modelBreakdown: {}, allSessions: [] };
        groups[key].runs++;
        groups[key].totalDur += s.duration_ms || 0;
        groups[key].tokensIn += s.tokens_in || 0;
        groups[key].tokensOut += s.tokens_out || 0;
        groups[key].totalCost += s.estimated_cost_usd || 0;
        // Track per-model breakdown
        const mLabel = _modelShortT(s.model);
        if (!groups[key].modelBreakdown[mLabel]) groups[key].modelBreakdown[mLabel] = { count: 0, cost: 0, dur: 0, tokIn: 0, tokOut: 0, sessions: [] };
        groups[key].modelBreakdown[mLabel].count++;
        groups[key].modelBreakdown[mLabel].cost += s.estimated_cost_usd || 0;
        groups[key].modelBreakdown[mLabel].dur += s.duration_ms || 0;
        groups[key].modelBreakdown[mLabel].tokIn += s.tokens_in || 0;
        groups[key].modelBreakdown[mLabel].tokOut += s.tokens_out || 0;
        groups[key].modelBreakdown[mLabel].sessions.push(s);
        groups[key].allSessions.push(s);
      }

      const sorted = Object.values(groups).sort((a,b) => b.totalCost - a.totalCost);
      const totalRuns   = sorted.reduce((s,r) => s + r.runs, 0);
      const totalCost   = sorted.reduce((s,r) => s + r.totalCost, 0);
      const totalTokIn  = sorted.reduce((s,r) => s + r.tokensIn, 0);
      const totalTokOut = sorted.reduce((s,r) => s + r.tokensOut, 0);
      set('grp-sub-runs', totalRuns);
      set('grp-sub-cost', '$' + totalCost.toFixed(2));
      const grpTokEl = document.getElementById('grp-sub-tokens');
      if (grpTokEl) grpTokEl.textContent = _fmtK(totalTokIn) + ' / ' + _fmtK(totalTokOut);
      const grpSubEl = document.getElementById('grp-sub-tokens-sub');
      if (grpSubEl) grpSubEl.textContent = 'in / out';
      window._subTotals = { tokensIn: totalTokIn, tokensOut: totalTokOut, cost: totalCost, sessions: totalRuns };
      _updateSummaryCards();

      const body = document.getElementById('grp-subagent-body');
      if (sorted.length === 0) {
        body.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-600">No sessions in this period</td></tr>';
        return;
      }
      const maxCost = Math.max(...sorted.map(g => g.totalCost), 1);
      // Save open detail panel state — will restore after rebuild
      const _savedDetailId = (_sessionDetailSource === 'grouped') ? _sessionDetailOpenId : null;
      const _savedDetailScrollY = _savedDetailId ? window.scrollY : null;
      if (_sessionDetailSource === 'grouped') {
        _sessionDetailOpenId = null;
        _sessionDetailSource = null;
      }
      let _grpRowIdx = 0;
      body.innerHTML = sorted.map(g => {
        const rowId = 'grp-row-' + (_grpRowIdx++);
        const barPct = Math.round((g.totalCost / maxCost) * 100);
        const barCls = barPct > 66 ? 'bg-red-500' : barPct > 33 ? 'bg-yellow-500' : 'bg-teal-500';
        const shortTask = g.task.length > 22 ? g.task.slice(0, 22) + '\u2026' : g.task;
        const agentCls = _agentCls[g.agent] || 'text-gray-400';
        const agentLabel = fmtAgent(g.agent);
        _grpBreakdownStore[rowId] = g.modelBreakdown;
        const grpStoreKey = 'grp-' + rowId;
        const grpHasActive = g.allSessions.some(s => _isSessionActive(s));
        const grpHasAtlasActive = _hasActiveAtlasInGroup(g.allSessions);
        const grpActiveIndicator = grpHasAtlasActive ? _activeBadgeHtml : (grpHasActive ? _activeDotHtml : '');
        // Collect ticket badges for grouped sessions
        return `<tr id="${rowId}" class="border-b border-gray-900 hover:bg-gray-800 transition-colors" style="cursor:pointer;" data-task-name="${esc(g.task)}" data-agent-cls="${agentCls}" data-agent-label="${esc(agentLabel)}" onclick="if(!event.target.closest('button'))_handleSummaryRowClick('${grpStoreKey}',this)">
          <td class="px-4 py-2 text-gray-200 text-xs font-medium"><span style="display:inline-flex;align-items:center;">${esc(shortTask)}${grpActiveIndicator}</span>${_getTaskTooltip(g.task) ? ' <span class="info-tip" data-tip="' + esc(_getTaskTooltip(g.task)) + '">&#9432;</span>' : ''}</td>
          <td class="px-4 py-2 text-xs"><span class="${agentCls}">${agentLabel}</span></td>
          <td class="px-4 py-2 text-xs text-gray-400">${_renderModelCell(g, rowId)}</td>
          <td class="px-4 py-2 text-right text-white text-xs font-bold">${_renderRunsCell(g.runs, grpStoreKey, g.allSessions)}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${_fmtDur(Math.round(g.totalDur/g.runs))}</td>
          <td class="px-4 py-2 text-right text-white text-xs">${_fmtK(g.tokensIn)} / ${_fmtK(g.tokensOut)}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${(g.totalCost/g.runs) >= 0.01 ? '$' + (g.totalCost/g.runs).toFixed(3) : '<$0.01'}</td>
          <td class="px-4 py-2 text-right text-yellow-400 text-xs font-semibold">${g.totalCost >= 0.01 ? '$' + g.totalCost.toFixed(2) : '<$0.01'}</td>
          <td class="px-4 py-2" style="min-width:80px;"><div class="bg-gray-800 rounded-full h-1.5"><div class="${barCls} h-1.5 rounded-full" style="width:${barPct}%"></div></div></td>
        </tr>`;
      }).join('');

      // Re-expand rows that were expanded before the re-render
      if (_expandedTasks.size > 0 || _expandedSessionTasks.size > 0) {
        const rows = body.querySelectorAll('tr[data-task-name]');
        rows.forEach(row => {
          const task = row.dataset.taskName || '';
          const rowId = row.id;
          // Re-expand model breakdown
          if (_expandedTasks.has(task) && rowId && _grpBreakdownStore[rowId]) {
            _toggleModelExpand(rowId);
          }
          // Re-expand session list
          if (_expandedSessionTasks.has(task)) {
            const storeKey = 'grp-' + rowId;
            const btn = row.querySelector('button[title="Show individual sessions"]');
            if (btn && _sessionStore[storeKey]) {
              _toggleSessionExpand(storeKey, btn);
            }
          }
        });
      }

      // Restore open detail panel after rebuild
      if (_savedDetailId && _sessionDataMap[_savedDetailId]) {
        // Find the session-detail-row or summary row that matches
        const detailRow = body.querySelector('tr[data-session-detail-id="' + CSS.escape(_savedDetailId) + '"]');
        if (detailRow) {
          _sessionDetailSource = 'grouped';
          _toggleSessionDetail(_savedDetailId, detailRow);
          if (_savedDetailScrollY != null) {
            requestAnimationFrame(() => window.scrollTo(0, _savedDetailScrollY));
          }
        } else {
          // Single-session row — find by checking _singleSessionSidCache
          for (const [sk, cachedSid] of Object.entries(_singleSessionSidCache)) {
            if (cachedSid === _savedDetailId) {
              const grpRow = body.querySelector('tr[data-task-name]');
              // Find the correct row by iterating
              const allRows = body.querySelectorAll('tr[data-task-name]');
              for (const row of allRows) {
                const rowId = row.id;
                const storeKey = 'grp-' + rowId;
                if (_sessionStore[storeKey] && _sessionStore[storeKey].length === 1) {
                  const s = _sessionStore[storeKey][0];
                  const sid = s._raw?.session_id || s.label || '';
                  if (sid === _savedDetailId || _singleSessionSidCache[storeKey] === _savedDetailId) {
                    _sessionDetailSource = 'grouped';
                    _toggleSessionDetail(_savedDetailId, row);
                    if (_savedDetailScrollY != null) {
                      requestAnimationFrame(() => window.scrollTo(0, _savedDetailScrollY));
                    }
                    break;
                  }
                }
              }
              break;
            }
          }
        }
      }

      // Efficiency insights — cost-aware, actionable rules
      const insights = [];
      const groupedStats = Object.values(groups);
      const totalSpend = groupedStats.reduce((s,g) => s + g.totalCost, 0);
      groupedStats.forEach(g => {
        const avgCost = g.runs > 0 ? g.totalCost / g.runs : 0;
        const avgTokens = g.runs > 0 ? Math.round((g.tokensIn + g.tokensOut) / g.runs) : 0;
        const avgDur = g.runs > 0 ? g.totalDur / g.runs : 0;
        const costShare = totalSpend > 0 ? g.totalCost / totalSpend : 0;
        // High cost per run (> $1/run)
        if (avgCost > 1.0) insights.push({ level: 'warn', msg: `<strong>${esc(g.task)}</strong> costs $${avgCost.toFixed(2)}/run avg across ${g.runs} runs ($${g.totalCost.toFixed(2)} total). Review if this task needs a cheaper model or shorter context.` });
        // Cost hog — single task > 50% of total spend
        else if (costShare > 0.5 && g.totalCost > 1.0) insights.push({ level: 'warn', msg: `<strong>${esc(g.task)}</strong> accounts for ${Math.round(costShare*100)}% of total spend ($${g.totalCost.toFixed(2)}). Consider whether frequency or model tier can be reduced.` });
        // Long average duration (> 30 min per run)
        if (avgDur > 1800000 && g.runs >= 2) insights.push({ level: 'info', msg: `<strong>${esc(g.task)}</strong> averages ${Math.round(avgDur/60000)}m per run — potentially stuck or doing too much work per session.` });
        // High frequency + low value (many runs, very cheap each — could reduce frequency)
        if (g.runs > 40 && avgCost < 0.01) insights.push({ level: 'info', msg: `<strong>${esc(g.task)}</strong> ran ${g.runs}x but costs almost nothing per run. Consider reducing frequency to save overhead.` });
        // Efficient tasks worth celebrating
        if (g.runs >= 5 && avgCost < 0.05 && avgCost > 0) insights.push({ level: 'ok', msg: `<strong>${esc(g.task)}</strong> is efficient: $${avgCost.toFixed(3)}/run across ${g.runs} runs.` });
      });
      // Overall spend context
      if (totalSpend > 10) insights.unshift({ level: 'warn', msg: `Total spend this period: <strong>$${totalSpend.toFixed(2)}</strong>. Review top cost drivers above.` });
      else if (totalSpend > 0) insights.unshift({ level: 'ok', msg: `Total spend this period: <strong>$${totalSpend.toFixed(2)}</strong>.` });
      if (insights.length === 0) insights.push({ level: 'ok', msg: 'No efficiency issues detected.' });

      const insightsEl = document.getElementById("tok-insights");
      if (insightsEl) {
        insightsEl.innerHTML = insights.map(i => {
          const icon = i.level === "warn" ? "\u26A0" : i.level === "ok" ? "\u2713" : "i";
          const cls = i.level === "warn" ? "text-yellow-400" : i.level === "ok" ? "text-green-400" : "text-blue-400";
          return `<div class="flex gap-2 items-start"><span class="${cls} font-bold">${icon}</span><span class="${cls}">${i.msg}</span></div>`;
        }).join("");
      }

      // Cost bar chart (reflects all active filters)
      renderCostBarChart(items);
    }

    // ── Active session keys (from live-sessions.json) ───────────────
    let _activeSessionKeys = new Set();
    let _activeSessionIds = new Set();    // session UUIDs from _sessionId field
    let _activeKeyToId = {};              // review key → session_id for cross-matching
    let _activeAtlasSessions = [];        // full atlas active session objects from live-sessions.json
    // Strip :run:* suffix from cron session keys to get the base cron key
    function _cronBaseKey(key) {
      if (!key) return key;
      return key.replace(/:run:[^:]+$/, '');
    }
    function _isSessionActive(s) {
      if (!s) return false;
      const key = s.label || (s._raw && s._raw.session_key);
      if (key && _activeSessionKeys.has(key)) return true;
      // Match by session_id (unique per run — most reliable)
      const sid = s._raw && s._raw.session_id;
      if (sid && _activeSessionIds.has(sid)) return true;
      // NOTE: Removed cron base-key fallback — it matched ALL historical runs
      // from the same cron, lighting up every row green. Active sessions must
      // match by exact key or session_id only.
      return false;
    }
    function _isAtlasActiveSession(s) {
      // Returns true if this specific session is the currently active Atlas build/review session
      if (!_activeAtlasSessions.length) return false;
      return _activeAtlasSessions.some(as => {
        if (as._sessionId && s._raw?.session_id === as._sessionId) return true;
        const key = s.label || (s._raw && s._raw.session_key);
        if (key && key === as.key) return true;
        if (key && as.key) {
          const runMatch = key.match(/:run:(\d+)$/);
          if (runMatch && as.key.includes(runMatch[1])) return true;
        }
        return false;
      });
    }
    function _hasActiveAtlasInGroup(sessions) {
      // Returns true if any session in the group is the active Atlas session
      return sessions.some(s => _isAtlasActiveSession(s));
    }
    const _activeDotHtml = '<span class="active-dot" title="Active session"></span>';
    const _activeBadgeHtml = '<span class="active-badge" title="Session is currently running"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;animation:live-pulse 2s ease-in-out infinite;"></span>ACTIVE</span>';

    // ── Ticket System Helpers ──────────────────────────────────────
    function _getSessionTickets(sessionKey) {
      if (!window.DATA || !window.DATA.sessionTickets) return null;
      const tix = window.DATA.sessionTickets;
      // Try exact match
      if (tix[sessionKey]) return tix[sessionKey];
      // Try matching by atlas-review-* name embedded in session key
      // (strict: only match review names, not base cron keys)
      for (const [k, v] of Object.entries(tix)) {
        if (k.startsWith('atlas-review-') && sessionKey && sessionKey.includes(k)) return v;
        if (sessionKey && sessionKey.startsWith('atlas-review-') && k.includes(sessionKey)) return v;
      }
      // Try matching by run UUID extracted from session key
      const runMatch = sessionKey && sessionKey.match(/:run:([a-f0-9-]+)$/);
      if (runMatch) {
        const uuid = runMatch[1];
        if (tix[uuid]) return tix[uuid];
        // Also check if any key contains this UUID
        for (const [k, v] of Object.entries(tix)) {
          if (k.includes(uuid)) return v;
        }
      }
      // Try matching by session_id (the UUID itself)
      if (sessionKey && /^[a-f0-9-]{36}$/.test(sessionKey) && tix[sessionKey]) return tix[sessionKey];
      return null;
    }

    function _ticketBadgeHtml(tickets) {
      if (!tickets || !tickets.length) return '';
      const count = tickets.length;
      const allDone = tickets.every(t => t.status === 'done');
      const anyReview = tickets.some(t => t.status === 'review');
      const anyInProgress = tickets.some(t => t.status === 'in-progress');
      let cls = 'ticket-badge-gray';
      if (allDone) cls = 'ticket-badge-green';
      else if (anyReview) cls = 'ticket-badge-yellow';
      else if (anyInProgress) cls = 'ticket-badge-blue';
      return `<span class="ticket-badge ${cls}">${count} ticket${count !== 1 ? 's' : ''}</span>`;
    }

    function _ticketListHtml(tickets) {
      if (!tickets || !tickets.length) return '';
      const pillCls = { 'todo': 'tkt-todo', 'in-progress': 'tkt-in-progress', 'review': 'tkt-review', 'done': 'tkt-done' };
      const rows = tickets.map(t => {
        const cls = pillCls[t.status] || 'tkt-todo';
        return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0;">
          <span style="color:#6b7280;font-size:11px;font-family:monospace;min-width:52px;">${esc(t.id)}</span>
          <span class="tkt-pill ${cls}">${esc(t.status)}</span>
          <span style="color:#d1d5db;font-size:12px;">${esc(t.title)}</span>
        </div>`;
      }).join('');
      return `<div class="sdp-section">
        <div class="sdp-label">Tickets</div>
        <div style="padding:4px 0;">${rows}</div>
      </div>`;
    }

    // ── Stuck Sessions (from live-sessions.json) ───────────────────
    async function loadLiveSessions() {
      try {
        const res = await fetch('/portal/live-sessions.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) throw new Error('live-sessions.json: ' + res.status);
        const data = await res.json();
        // Store active session keys + session IDs for green dot/badge indicators
        // live-sessions.json already filters stale sessions (persistent: <4h, cron: <15min)
        const allSess = data.sessions || [];
        _activeSessionKeys = new Set(allSess.map(s => s.key));
        _activeSessionIds = new Set(allSess.filter(s => s._sessionId).map(s => s._sessionId));
        _activeKeyToId = {};
        allSess.forEach(s => { if (s._sessionId) _activeKeyToId[s.key] = s._sessionId; });
        _activeAtlasSessions = allSess.filter(s => s.agent === 'atlas' && s.isReview);
        // Load ticket data for session detail panels
        if (data.sessionTickets) {
          if (!window.DATA) window.DATA = {};
          window.DATA.sessionTickets = data.sessionTickets;
        }
        console.log('[tokens] live-sessions loaded:', _activeSessionKeys.size, 'active keys,', _activeAtlasSessions.length, 'atlas active');
        const tbody = document.getElementById('live-sess-body');
        const updatedEl = document.getElementById('live-updated');
        if (!tbody) return;

        if (updatedEl && data.generatedAt) {
          const ago = Date.now() - new Date(data.generatedAt).getTime();
          const agoStr = ago < 60000 ? 'just now' : ago < 3600000 ? Math.round(ago/60000) + 'm ago' : Math.round(ago/3600000) + 'h ago';
          updatedEl.textContent = 'Updated ' + agoStr;
        }

        const allSessions = data.sessions || [];

        // Client-side stuck detection — compute from duration thresholds
        // Cron/isolated sessions: stuck if > 1 hour (should finish in minutes)
        // Persistent/DM sessions: stuck if > 8 hours (runaway scenario)
        const STUCK_CRON_MS = 3600000;      // 1 hour
        const STUCK_PERSISTENT_MS = 28800000; // 8 hours
        allSessions.forEach(s => {
          const dur = s.sessionLengthMs || 0;
          const isCronOrIsolated = s.isCron || (!s.isPersistent && !s.isCron);
          const thresholdMs = isCronOrIsolated ? STUCK_CRON_MS : STUCK_PERSISTENT_MS;
          const thresholdLabel = isCronOrIsolated ? '1h' : '8h';
          if (dur > thresholdMs) {
            s.isStuck = true;
            if (!s.stuckReason) {
              s.stuckReason = 'Session running ' + (s.sessionLength || Math.round(dur / 60000) + 'm') +
                ' (threshold: ' + thresholdLabel + ') \u2014 potential runaway, cache costs accumulating';
            }
          } else {
            s.isStuck = false;
            s.stuckReason = null;
          }
        });
        const sessions = allSessions.filter(s => s.isStuck);

        const headerEl = document.querySelector('#live-sessions-section h3');
        if (headerEl) {
          headerEl.innerHTML = sessions.length > 0
            ? 'Stuck Sessions <span class="ml-2 px-2 py-0.5 rounded-full text-xs bg-red-900 text-red-300">' + sessions.length + ' stuck</span>'
            : 'Stuck Sessions <span class="ml-2 px-2 py-0.5 rounded-full text-xs bg-green-900 text-green-300">All Clear</span>';
        }

        if (sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-green-600">No stuck sessions — all systems running normally (' + allSessions.length + ' active)</td></tr>';
          return;
        }

        const agentColors = { main: 'text-indigo-400', cliff: 'text-indigo-400', samantha: 'text-teal-400', scout: 'text-green-400', atlas: 'text-orange-400' };
        const agentNames = { main: 'Cliff', cliff: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas' };

        tbody.innerHTML = sessions.map(s => {
          const aCls = agentColors[s.agent] || 'text-gray-400';
          const aName = agentNames[s.agent] || s.agent;
          const friendlyKey = typeof sessionKeyToFriendly === 'function' ? sessionKeyToFriendly(s.key, '') : s.key;
          const ctxBarCls = s.ctxPct >= 75 ? 'bg-red-500' : s.ctxPct >= 50 ? 'bg-yellow-500' : 'bg-green-500';
          const ctxTextCls = s.ctxPct >= 75 ? 'text-red-400' : s.ctxPct >= 50 ? 'text-yellow-400' : 'text-gray-300';
          const tokIn = s.tokensIn != null ? _fmtK(s.tokensIn) : '—';
          const tokOut = s.tokensOut != null ? _fmtK(s.tokensOut) : '—';
          const reasonHtml = s.stuckReason ? '<div class="text-xs text-red-400 mt-0.5">' + esc(s.stuckReason) + '</div>' : '';
          return `<tr class="border-b border-gray-900 hover:bg-gray-800 transition-colors bg-red-950/20">
            <td class="px-4 py-1.5 text-gray-300 text-xs">${esc(friendlyKey)}${reasonHtml}</td>
            <td class="px-4 py-1.5 text-xs"><span class="${aCls}">${aName}</span></td>
            <td class="px-4 py-1.5 text-xs">${_modelShortT(s.model)}</td>
            <td class="px-4 py-1.5 text-right text-xs text-white">${tokIn} / ${tokOut}</td>
            <td class="px-4 py-1.5 text-right text-xs">
              <span class="${ctxTextCls}">${s.ctxUsedK || s.usedTokensK}k / ${s.ctxMaxK || s.maxTokensK}k (${s.ctxPct}%)</span>
              <div class="bg-gray-800 rounded-full h-1 mt-1" style="width:60px;display:inline-block;vertical-align:middle;margin-left:6px;">
                <div class="${ctxBarCls} h-1 rounded-full" style="width:${Math.min(s.ctxPct, 100)}%"></div>
              </div>
            </td>
            <td class="px-4 py-1.5 text-right text-xs text-red-400 font-semibold">${s.sessionLength || '—'}</td>
            <td class="px-4 py-1.5 text-right text-xs text-gray-400">${s.lastActivity || '—'}</td>
          </tr>`;
        }).join('');
      } catch (e) {
        const tbody = document.getElementById('live-sess-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-600">Live session data not available</td></tr>';
      }
    }

    // ── Raw table ─────────────────────────────────────────────────────
    function renderRawTable(allDbItems) {
      const items = allDbItems || window._allDbSubItems;
      const globalTask = window._globalTask || 'all';
      const taskFilter = window._dbRawTaskFilter || 'all';
      const globalTaskFiltered = globalTask === 'all' ? items
        : items.filter(s => (s.display_name || s.task_name || 'Unknown') === globalTask);
      const filtered = taskFilter === 'all' ? globalTaskFiltered
        : globalTaskFiltered.filter(s => (s.display_name || s.task_name || 'Unknown') === taskFilter);

      const total   = filtered.length;
      const cost    = filtered.reduce((s,x) => s + (x.estimated_cost_usd || 0), 0);
      const toksIn  = filtered.reduce((s,x) => s + (x.tokens_in  || 0), 0);
      const toksOut = filtered.reduce((s,x) => s + (x.tokens_out || 0), 0);
      set('db-sub-total', total);
      set('db-sub-cost', '$' + cost.toFixed(2));
      const dbTokEl = document.getElementById('db-sub-tokens');
      if (dbTokEl) dbTokEl.textContent = _fmtK(toksIn) + ' / ' + _fmtK(toksOut);
      const dbSubEl = document.getElementById('db-sub-tokens-sub');
      if (dbSubEl) dbSubEl.textContent = 'in / out';

      // Populate raw task filter
      const taskSel = document.getElementById('raw-task-filter');
      if (taskSel) {
        const currentFilter = taskSel.value || 'all';
        const taskNames = [...new Set(items.map(s => s.display_name || s.task_name || 'Unknown'))].sort();
        taskSel.innerHTML = '<option value="all">All Tasks</option>' +
          taskNames.map(t => `<option value="${esc(t)}"${t === currentFilter ? ' selected' : ''}>${esc(t)}</option>`).join('');
      }

      const visible = window._dbSubShowAll ? filtered : filtered.slice(0, 20);
      const dbSubBody = document.getElementById('db-subagent-body');
      // Save open detail panel state for raw table — will restore after rebuild
      const _rawSavedDetailId = (_sessionDetailSource === 'raw') ? _sessionDetailOpenId : null;
      const _rawSavedScrollY = _rawSavedDetailId ? window.scrollY : null;
      if (_sessionDetailSource === 'raw') {
        _sessionDetailOpenId = null;
        _sessionDetailSource = null;
      }
      if (filtered.length === 0) {
        dbSubBody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-600">No sessions match this filter</td></tr>';
      } else {
        const _rawShownActiveKeys = new Set();   // only show green dot on the most recent row per key
        dbSubBody.innerHTML = visible.map(s => {
          const rawSid = s._raw?.session_id || s.label || ('raw-' + Math.random().toString(36).slice(2));
          _sessionDataMap[rawSid] = s;
          const rawKey = s.label || (s._raw && s._raw.session_key) || '';
          const rawIsAtlasActive = _isAtlasActiveSession(s);
          const rawIsActive = rawIsAtlasActive || _isSessionActive(s);
          const rawAlreadyShown = rawKey && _rawShownActiveKeys.has(rawKey);
          if (rawIsActive && rawKey) _rawShownActiveKeys.add(rawKey);
          const rawActiveIndicator = rawIsActive && !rawAlreadyShown ? (rawIsAtlasActive ? _activeBadgeHtml : _activeDotHtml) : '';
          return `<tr class="border-b border-gray-900 hover:bg-gray-800 transition-colors" style="cursor:pointer;" data-raw-sid="${esc(rawSid)}" onclick="_toggleRawSessionDetail('${esc(rawSid)}',this)">
          <td class="px-4 py-2 text-gray-300 text-xs" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><span style="display:inline-flex;align-items:center;">${esc((s.display_name || s.task_name || s.label || '—').replace(/^(Samantha|Scout|Cliff): /i,'').slice(0,50))}${rawActiveIndicator}</span>${_getTaskTooltip(s.display_name || s.task_name) ? ' <span class="info-tip" data-tip="' + esc(_getTaskTooltip(s.display_name || s.task_name)) + '">&#9432;</span>' : ''}</td>
          <td class="px-4 py-2 text-xs"><span class="${_agentCls[s.agent_type] || 'text-gray-400'}">${fmtAgent(s.agent_type)}</span></td>
          <td class="px-4 py-2 text-xs">${_modelShortT(s.model)}</td>
          <td class="px-4 py-2 text-gray-400 text-xs">${_fmtDur(s.duration_ms)}</td>
          <td class="px-4 py-2 text-right text-white text-xs">${_fmtK(s.tokens_in||0)} / ${_fmtK(s.tokens_out||0)}</td>
          <td class="px-4 py-2 text-right text-yellow-400 text-xs">${(s.estimated_cost_usd||0) >= 0.01 ? '$' + s.estimated_cost_usd.toFixed(3) : '<$0.01'}</td>
          <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap text-right">${_fmtTs(s.started_at)}</td>
        </tr>`; }).join('');

      }
      const toggleBtn = document.getElementById('db-subagent-toggle');
      if (filtered.length <= 20) toggleBtn.classList.add('hidden');
      else { toggleBtn.classList.remove('hidden'); toggleBtn.textContent = window._dbSubShowAll ? 'Show 20' : 'Show All (' + filtered.length + ' sessions)'; }

      // Restore open detail panel for raw table after rebuild
      if (_rawSavedDetailId && _sessionDataMap[_rawSavedDetailId]) {
        const rawRow = dbSubBody.querySelector('tr[data-raw-sid="' + CSS.escape(_rawSavedDetailId) + '"]');
        if (rawRow) {
          _sessionDetailSource = 'raw';
          _toggleSessionDetail(_rawSavedDetailId, rawRow);
          if (_rawSavedScrollY != null) {
            requestAnimationFrame(() => window.scrollTo(0, _rawSavedScrollY));
          }
        }
      }
    }

    window.filterRawTask = function(val) {
      window._dbRawTaskFilter = val;
      renderAllSections();
    };

    // ── Summary cards (combined cron + sub-agent) ─────────────────────
    function _updateSummaryCards() {
      const cron = window._cronTotals || { tokensIn:0, tokensOut:0, cost:0, sessions:0 };
      const sub  = window._subTotals  || { tokensIn:0, tokensOut:0, cost:0, sessions:0 };
      const combIn       = cron.tokensIn  + sub.tokensIn;
      const combOut      = cron.tokensOut + sub.tokensOut;
      const combCost     = cron.cost      + sub.cost;
      const combSessions = cron.sessions  + sub.sessions;
      const avgIn  = combSessions ? Math.round(combIn  / combSessions) : 0;
      const avgOut = combSessions ? Math.round(combOut / combSessions) : 0;
      const el = id => document.getElementById(id);
      if (el('tok-total')) el('tok-total').innerHTML    = _fmtK(combIn) + ' / ' + _fmtK(combOut);
      if (el('tok-cost'))  el('tok-cost').textContent   = '$' + combCost.toFixed(2);
      if (el('tok-runs'))  el('tok-runs').textContent   = combSessions;
      if (el('tok-avg'))   el('tok-avg').innerHTML      = _fmtK(avgIn) + ' / ' + _fmtK(avgOut);
    }

    // ── Convenience re-render ─────────────────────────────────────────
    function renderAllSections() {
      renderTokenSections();
    }

    // ── Auto-refresh cycle ───────────────────────────────────────────
    // Single function that fetches ALL fresh data and re-renders everything.
    // Called on init, every 30s by setInterval, and on realtime events.
    let _refreshInFlight = false;
    let _lastRefreshAt = 0;
    async function refreshAllData() {
      // Safety valve: if previous refresh has been stuck for >25s, force-reset the flag
      if (_refreshInFlight) {
        if (_lastRefreshAt && (Date.now() - _lastRefreshAt > 25000)) {
          console.warn('[tokens] refresh was stuck — force-resetting _refreshInFlight');
          _refreshInFlight = false;
        } else {
          console.log('[tokens] refresh skipped — already in flight');
          return;
        }
      }
      _refreshInFlight = true;
      const t0 = Date.now();
      _lastRefreshAt = t0; // track when we STARTED so the safety valve can detect hangs
      try {
        // 1. Re-fetch data.json with cache-busting + no-store (bypass CDN/browser cache)
        try {
          const djRes = await fetch('/portal/data.json?t=' + Date.now(), { cache: 'no-store' });
          if (djRes.ok) {
            const dj = await djRes.json();
            if (dj) {
              if (dj.crons && dj.crons.length) window._cronList = dj.crons;
              window._latestDataJson = dj; // store full payload for render functions
            }
          }
        } catch (e) { console.warn('[tokens] data.json refresh failed:', e); }
        // 2. Fetch fresh live-sessions.json (for green-dot active indicators + active session keys)
        try { await loadLiveSessions(); } catch (e) { console.warn('[tokens] live-sessions refresh failed:', e); }
        // 3. Fetch fresh Supabase session data and re-render everything
        // loadAndRenderAgentSessions re-queries Supabase, stores fresh _sbSessionRows,
        // then calls renderTokenSections → renderGrouped + renderRawTable + _updateSummaryCards
        await loadAndRenderAgentSessions();
        _lastRefreshAt = Date.now();
        console.log('[tokens] refresh done in', Date.now() - t0, 'ms —', (window._sbSessionRows||[]).length, 'rows');
      } catch (e) {
        console.error('[tokens] refresh error:', e);
      } finally {
        _refreshInFlight = false;
      }
    }

    // ── Init ──────────────────────────────────────────────────────────
    let _tokensInitialLoad = false;
    initPortal('tokens', function(d) {
      // data.json loaded — store cron list for name resolution
      if (d && d.crons && d.crons.length) window._cronList = d.crons;
      // Only kick off Supabase rendering on first load — subsequent data.json polls
      // should NOT re-trigger the full Supabase fetch (it has its own 30s poll + realtime)
      if (_tokensInitialLoad) return;
      _tokensInitialLoad = true;
      _grpManualRefresh = true;
      refreshAllData();
    }).then(ok => {
      // Always set up the 30s auto-refresh — even if initPortal partially failed,
      // refreshAllData() fetches data.json + live-sessions.json + Supabase fresh each cycle
      // 30s auto-refresh interval
      setInterval(() => { _grpManualRefresh = true; refreshAllData(); }, 30000);

      // Browsers throttle setInterval to ~60s+ in background tabs.
      // When the tab becomes visible again, fire an immediate refresh if ≥25s elapsed.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && _lastRefreshAt && (Date.now() - _lastRefreshAt > 25000)) {
          console.log('[tokens] tab became visible — triggering immediate refresh');
          _grpManualRefresh = true;
          refreshAllData();
        }
      });

      if (!ok) return;
      // Realtime subscription for faster updates (debounced 5s to batch rapid changes)
      let _rtDebounce = null;
      _sb.channel('tokens-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_snapshots' }, () => {
          clearTimeout(_rtDebounce);
          _rtDebounce = setTimeout(() => { _grpManualRefresh = true; refreshAllData(); }, 5000);
        })
        .subscribe(status => {
          const dot = document.getElementById('sb-realtime-dot');
          const label = document.getElementById('sb-realtime-label');
          if (status === 'SUBSCRIBED') {
            if (dot) { dot.className = 'w-2 h-2 rounded-full bg-green-500'; dot.style.boxShadow = '0 0 6px #4ade80'; }
            if (label) { label.textContent = 'Live'; label.className = 'text-xs text-green-500'; }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (dot) { dot.className = 'w-2 h-2 rounded-full bg-red-500'; dot.style.boxShadow = 'none'; }
            if (label) { label.textContent = 'Disconnected'; label.className = 'text-xs text-red-400'; }
          }
        });
    });

  // Global tooltip for .info-tip elements — uses fixed positioning so overflow:hidden can't clip it
  (function(){
    const popup = document.getElementById('tip-popup');
    document.addEventListener('mouseover', function(e){
      const tip = e.target.closest('.info-tip');
      if (!tip || !tip.dataset.tip) { popup.style.display='none'; return; }
      popup.textContent = tip.dataset.tip;
      popup.style.display = 'block';
      const r = tip.getBoundingClientRect();
      let left = r.right + 10;
      let top = r.top + r.height/2 - popup.offsetHeight/2;
      // If it would overflow the right edge, flip to left side
      if (left + popup.offsetWidth > window.innerWidth - 16) left = r.left - popup.offsetWidth - 10;
      // Keep within vertical bounds
      if (top < 8) top = 8;
      if (top + popup.offsetHeight > window.innerHeight - 8) top = window.innerHeight - popup.offsetHeight - 8;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    });
    document.addEventListener('mouseout', function(e){
      if (e.target.closest('.info-tip')) popup.style.display='none';
    });
  })();
// Supabase ticket test
