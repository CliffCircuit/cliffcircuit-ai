// ══════════════════════════════════════════════════════════════════
// tokens-cards.js — Agent portrait cards + summary stat cards
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

    // ── Agent portrait config ─────────────────────────────────────────
    const _agentPortraitConfig = {
      main:          { alias: 'cliff',      name: 'Cliff',       avatar: '/portal/cliff-avatar.jpg',     accentClass: 'text-indigo-400' },
      cliff:         { alias: 'cliff',      name: 'Cliff',       avatar: '/portal/cliff-avatar.jpg',     accentClass: 'text-indigo-400' },
      samantha:      { alias: 'samantha',   name: 'Samantha',    avatar: '/portal/samantha-avatar.jpg',  accentClass: 'text-teal-400'   },
      scout:         { alias: 'scout',      name: 'Scout',       avatar: '/portal/scout-avatar.jpg',     accentClass: 'text-green-400'  },
      atlas:         { alias: 'atlas',      name: 'Atlas',       avatar: '/portal/atlas-avatar.png',     accentClass: 'text-orange-400' },
      fernanda:      { alias: 'fernanda',  name: 'Fernanda',    avatar: '/portal/fernanda-avatar.jpg',  accentClass: 'text-emerald-400'},
      'claude-code': { alias: 'claude-code',name: 'Claude Code', avatar: '',                             accentClass: 'text-purple-400' },
    };

    function renderSummaryPortraits(items) {
      const container = document.getElementById('summary-agent-portraits');
      if (!container) return;

      const agentFilter = window._globalAgent || [];

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

      // Filter: if specific agents selected, only show those
      let agentIds = Object.keys(agentData);
      if (!_isAll(agentFilter)) {
        agentIds = agentIds.filter(id => _inFilter(id, agentFilter));
      }

      if (agentIds.length === 0) {
        container.innerHTML = '';
        return;
      }

      // Sort: known agents first (cliff, samantha, scout, atlas), then alphabetical
      const knownOrder = ['cliff','samantha','scout','atlas','fernanda'];
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
      const agentFilter = window._globalAgent || [];
      const taskFilter  = window._globalTask  || [];
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
          started_at:   runMs || (r.last_seen_at ? new Date(r.last_seen_at).getTime()
            : (r.first_seen_at ? new Date(r.first_seen_at).getTime() : 0)),
          label:        r.session_key,
          first_seen_at: r.first_seen_at,
          last_seen_at:  r.last_seen_at,
          _raw:          r,
          _from_intervals: !!r._from_intervals,
          _multiModel:   !!r._multiModel, // session used multiple models (cost split by model in intervals)
        };
      });
      window._allDbSubItems = allDbItems;

      // Apply provider and model filters
      const providerFilter = window._globalProvider || [];
      const modelFilter = window._globalModel || [];
      const filteredDbItems = allDbItems.filter(s => {
        if (!_isAll(providerFilter) && !_inFilter(_getProviderFromModel(s.model), providerFilter)) return false;
        if (!_isAll(modelFilter) && !_inFilter(typeof friendlyModel === 'function' ? friendlyModel(s.model) : s.model, modelFilter)) return false;
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
      // Agent dropdown: only show agents that have data in the current time range
      const dataAgents = [...new Set(Object.keys(atMap))];
      const allAgentNames = dataAgents.sort();
      _populateTaskDropdown(allTaskNames);
      _populateAgentDropdown(allAgentNames);
      // Provider dropdown: populated from ALL items (not filtered by provider/model)
      // so users can always see + switch to any available provider
      _populateProviderDropdown(allDbItems);
      // Model dropdown: filtered by selected provider only (not by model itself)
      _populateModelDropdown(allDbItems);

      window._cronTotals = { tokensIn: 0, tokensOut: 0, cost: 0, sessions: 0 };

      // ── Agent portrait cards (reflect all global filters incl. task) ─
      const portraitItems = !_isAll(taskFilter)
        ? filteredDbItems.filter(s => _inFilter(s.display_name || s.task_name || '', taskFilter))
        : filteredDbItems;
      renderSummaryPortraits(portraitItems);

      // ── Grouped Agent Sessions Summary ────────────────────────────
      renderGrouped(filteredDbItems, cutoffStart, cutoffEnd);

      // ── Raw table ───────────────────────────────────────────────────
      renderRawTable(filteredDbItems);
    }


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

      // Update subtitles to reflect active filters
      const agentF = window._globalAgent || [];
      const taskF  = window._globalTask  || [];
      const provF  = window._globalProvider || [];
      const modelF = window._globalModel || [];
      const labels = { cliff:'Cliff', samantha:'Samantha', scout:'Scout', atlas:'Atlas', fernanda:'Fernanda', 'claude-code':'Claude Code' };
      const parts = [];
      if (!_isAll(agentF)) parts.push(agentF.map(a => labels[a] || a).join(', '));
      if (!_isAll(taskF))  parts.push(taskF.length === 1 ? taskF[0] : taskF.length + ' tasks');
      if (!_isAll(provF))  parts.push(provF.join(', '));
      if (!_isAll(modelF)) parts.push(modelF.length === 1 ? modelF[0] : modelF.length + ' models');
      const filterDesc = parts.length > 0 ? parts.join(' · ') : null;

      if (el('tok-cost-sub')) el('tok-cost-sub').textContent = filterDesc ? filterDesc : 'all sessions combined';
      if (el('tok-runs-sub')) el('tok-runs-sub').textContent = filterDesc ? filterDesc : 'all agents';
    }

    // ── Convenience re-render ─────────────────────────────────────────
    function renderAllSections() {
      renderTokenSections();
    }

