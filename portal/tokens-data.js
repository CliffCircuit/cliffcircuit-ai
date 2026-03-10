// ══════════════════════════════════════════════════════════════════
// tokens-data.js — Supabase queries, active sessions, tickets, stuck sessions
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

    // ── Supabase query (server-side time filter, matches old page) ────
    async function loadAndRenderAgentSessions() {
      const range = window._globalRange || 'today';
      const agentFilter = window._globalAgent || [];
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
      let fetchError = false;

      // ── 1. Query session_cost_intervals for accurate delta-based costs ──
      // Intervals record per-snapshot deltas so time-windowed views only show
      // spend within the window, not cumulative totals from session start.
      const intervalSessionIds = new Set();
      try {
        let intRows = [];
        let intOffset = 0;
        while (true) {
          let intQuery = _sb.from('session_cost_intervals')
            .select('session_id,session_key,agent_id,model,snapshot_at,interval_start,interval_end,tokens_in_delta,tokens_out_delta,cache_read_delta,cache_write_delta,cost_delta_usd,cumulative_cost_usd')
            .gte('snapshot_at', cutoffStart)
            .lte('snapshot_at', cutoffEnd)
            .order('snapshot_at', { ascending: false })
            .range(intOffset, intOffset + PAGE_SIZE - 1);

          if (!_isAll(agentFilter)) {
            const agentIds = agentFilter.map(a => a === 'cliff' ? 'main' : a);
            intQuery = intQuery.in('agent_id', agentIds);
          }

          const { data: intData, error: intErr } = await intQuery;
          if (intErr) {
            console.error('[tokens] session_cost_intervals query error:', intErr);
            break;
          }
          const batch = intData || [];
          intRows = intRows.concat(batch);
          if (batch.length < PAGE_SIZE) break;
          intOffset += PAGE_SIZE;
        }

        // Store raw interval rows for 5-min chart bucketing (before aggregation)
        window._rawIntervalRows = intRows;

        if (intRows.length > 0) {
          // Aggregate deltas per (session_id, model) — so model switches within a session
          // produce separate line items with correct per-model cost attribution (BUG 11 fix)
          const agg = {};
          const sessionModels = {}; // session_id → Set of models seen
          for (const r of intRows) {
            const sid = r.session_id;
            const model = r.model || 'unknown';
            const aggKey = sid + '::' + model;
            if (!sessionModels[sid]) sessionModels[sid] = new Set();
            sessionModels[sid].add(model);
            if (!agg[aggKey]) {
              agg[aggKey] = {
                session_id: sid,
                session_key: r.session_key,
                agent_id: r.agent_id,
                model: model,
                tokens_in: 0,
                tokens_out: 0,
                cache_read: 0,
                cache_write: 0,
                cost_total_usd: 0,
                cumulative_cost_usd: 0,
                interval_start: r.interval_start || r.snapshot_at,
                interval_end: r.interval_end || r.snapshot_at,
                _multiModel: false, // set true below if session used multiple models
              };
            }
            const a = agg[aggKey];
            a.tokens_in  += r.tokens_in_delta || 0;
            a.tokens_out += r.tokens_out_delta || 0;
            a.cache_read += r.cache_read_delta || 0;
            a.cache_write += r.cache_write_delta || 0;
            a.cost_total_usd += parseFloat(r.cost_delta_usd) || 0;
            const cum = parseFloat(r.cumulative_cost_usd) || 0;
            if (cum > a.cumulative_cost_usd) a.cumulative_cost_usd = cum;
            const istart = r.interval_start || r.snapshot_at;
            const iend   = r.interval_end || r.snapshot_at;
            if (istart && istart < a.interval_start) a.interval_start = istart;
            if (iend && iend > a.interval_end) a.interval_end = iend;
          }
          // Mark entries from sessions that used multiple models
          for (const [aggKey, entry] of Object.entries(agg)) {
            if ((sessionModels[entry.session_id] || new Set()).size > 1) {
              entry._multiModel = true;
            }
          }

          // Fetch metadata from session_snapshots for these sessions
          const aggIds = [...new Set(Object.values(agg).map(a => a.session_id))];
          const metaMap = {};
          for (let i = 0; i < aggIds.length; i += PAGE_SIZE) {
            const chunk = aggIds.slice(i, i + PAGE_SIZE);
            const { data: metaRows, error: metaErr } = await _sb.from('session_snapshots')
              .select('session_id,session_key,agent_id,kind,model,thinking_level,duration_ms,context_tokens,percent_used,first_seen_at,last_seen_at')
              .in('session_id', chunk);
            if (!metaErr && metaRows) {
              for (const m of metaRows) metaMap[m.session_id] = m;
            }
          }

          // Build allRows entries from merged interval + metadata
          // Now iterating per (session_id, model) pair for accurate per-model cost attribution
          for (const [aggKey, a] of Object.entries(agg)) {
            const sid = a.session_id;
            const meta = metaMap[sid] || {};
            // Skip entries with zero activity in the window
            if (a.tokens_in === 0 && a.tokens_out === 0 && a.cost_total_usd === 0) continue;
            intervalSessionIds.add(sid);
            allRows.push({
              session_id:    sid,
              session_key:   a.session_key || meta.session_key || '',
              agent_id:      meta.agent_id || a.agent_id,
              kind:          meta.kind || null,
              model:         a.model, // use the per-interval model, not meta (which is latest only)
              thinking_level: meta.thinking_level || null,
              input_tokens:  a.tokens_in,
              output_tokens: a.tokens_out,
              cache_read:    a.cache_read,
              cache_write:   a.cache_write,
              total_tokens:  a.tokens_in + a.tokens_out + a.cache_read + a.cache_write,
              context_tokens: meta.context_tokens || 0,
              percent_used:  meta.percent_used || 0,
              cost_input_usd:  null,
              cost_output_usd: null,
              cost_cache_read_usd: null,
              cost_cache_write_usd: null,
              cost_total_usd: a.cost_total_usd,
              duration_ms:   a._multiModel ? 0 : (meta.duration_ms || 0), // duration not meaningful when split by model
              first_seen_at: meta.first_seen_at || a.interval_start,
              last_seen_at:  meta.last_seen_at || a.interval_end,
              _from_intervals: true,
              _multiModel:   a._multiModel, // flag for tooltip: session used multiple models
            });
          }
        }
      } catch (e) {
        console.warn('[tokens] session_cost_intervals fetch failed, falling back to snapshots:', e);
        window._rawIntervalRows = [];
      }

      // ── 2. Fallback: query session_snapshots for sessions NOT in intervals ──
      let offset = 0;
      while (true) {
        let query = _sb.from('session_snapshots')
          .select('session_id,session_key,agent_id,kind,model,thinking_level,input_tokens,output_tokens,cache_read,cache_write,total_tokens,context_tokens,percent_used,cost_input_usd,cost_output_usd,cost_cache_read_usd,cost_cache_write_usd,cost_total_usd,duration_ms,first_seen_at,last_seen_at')
          .gte('last_seen_at', cutoffStart)
          .lte('last_seen_at', cutoffEnd)
          .or('input_tokens.gt.0,output_tokens.gt.0')
          .order('first_seen_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (!_isAll(agentFilter)) {
          const agentIds = agentFilter.map(a => a === 'cliff' ? 'main' : a);
          query = query.in('agent_id', agentIds);
        }

        const { data, error } = await query;
        if (error) {
          console.error('[tokens] session_snapshots query error:', error);
          fetchError = true;
          break;
        }
        const rows = data || [];
        // Skip sessions already covered by interval data
        for (const r of rows) {
          if (!intervalSessionIds.has(r.session_id)) {
            // If session started before the current time window, its cost_total_usd
            // is cumulative (all-time) and would inflate this window's total.
            // In-window cost for such sessions should come from interval data;
            // if they have no intervals in this window, their contribution is ~0.
            // This prevents "Today" from showing higher cost than "Last 7 Days"
            // when old sessions fall back to snapshots with cumulative costs.
            if (r.first_seen_at && new Date(r.first_seen_at) < new Date(cutoffStart)) continue;
            allRows.push(r);
          }
        }
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
        if (_isAll(agentFilter) || _inFilter('atlas', agentFilter)) {
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


    // ── Active session keys (from live-sessions.json) ───────────────
    let _activeSessionKeys = new Set();
    let _activeSessionIds = new Set();    // session UUIDs from _sessionId field
    let _activeKeyToId = {};              // review key → session_id for cross-matching
    let _activeAtlasSessions = [];        // full atlas active session objects from live-sessions.json
    let _activeSessionData = {};          // key/sessionId → live session object (for staleness checks)
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — sessions inactive longer than this show STALE badge
    // Strip :run:* suffix from cron session keys to get the base cron key
    function _cronBaseKey(key) {
      if (!key) return key;
      return key.replace(/:run:[^:]+$/, '');
    }
    function _isSessionActive(s) {
      if (!s) return false;
      const sid = s._raw && s._raw.session_id;
      // Best match: session_id (unique per gateway run)
      if (sid && _activeSessionIds.has(sid)) return true;
      // Key match: only if this Supabase row's session_id matches the live
      // session's _sessionId (prevents historical rows for persistent keys
      // like agent:main:main from lighting up as active after gateway restart)
      const key = s.label || (s._raw && s._raw.session_key);
      if (key && _activeSessionKeys.has(key)) {
        const liveEntry = _activeSessionData[key];
        // If the live session has a _sessionId and the Supabase row has a session_id,
        // they must match. If either is missing, allow the key match (backward compat).
        if (liveEntry && liveEntry._sessionId && sid) {
          return liveEntry._sessionId === sid;
        }
        return true; // no session_id to compare — trust the key match
      }
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
    window._activeDotHtml = '<span class="active-dot" title="Active session"></span>';
    window._activeBadgeHtml = '<span class="active-badge" title="Session is currently running"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;animation:live-pulse 2s ease-in-out infinite;"></span>ACTIVE</span>';
    window._staleDotHtml = '<span class="active-dot" title="Session stale (no activity for 30+ min)" style="background:#eab308;box-shadow:0 0 6px #eab308;animation:none;"></span>';
    window._staleBadgeHtml = '<span class="active-badge" title="Session stale (no activity for 30+ min)" style="background:rgba(234,179,8,0.15);border-color:rgba(234,179,8,0.3);"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#eab308;"></span>STALE</span>';
    function _getSessionLiveData(s) {
      // Look up the live-sessions.json entry for this session
      const key = s.label || (s._raw && s._raw.session_key);
      const sid = s._raw && s._raw.session_id;
      return _activeSessionData[key] || _activeSessionData[sid] || null;
    }
    function _isSessionStale(s) {
      // Returns true if the session is in the active set but hasn't had activity in 30+ min
      const live = _getSessionLiveData(s);
      if (!live) return false;
      return (live.lastActivityMs || 0) > STALE_THRESHOLD_MS;
    }
    function _sessionActivityIndicator(s, isAtlasActive) {
      // Returns the appropriate badge/dot HTML based on active vs stale status
      const isActive = isAtlasActive || _isSessionActive(s);
      if (!isActive) return '';
      if (_isSessionStale(s)) {
        return isAtlasActive ? _staleBadgeHtml : _staleDotHtml;
      }
      return isAtlasActive ? _activeBadgeHtml : _activeDotHtml;
    }

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
        _activeSessionData = {};
        allSess.forEach(s => {
          if (s._sessionId) _activeKeyToId[s.key] = s._sessionId;
          // Index by both key and sessionId for staleness lookups
          if (s.key) _activeSessionData[s.key] = s;
          if (s._sessionId) _activeSessionData[s._sessionId] = s;
        });
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

