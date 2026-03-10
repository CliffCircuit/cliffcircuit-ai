// ══════════════════════════════════════════════════════════════════
// tokens-core.js — State, filters, helpers, multi-select widget
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

    // ── State ─────────────────────────────────────────────────────────
    window._globalRange  = 'today';
    // Multi-select filters: empty array = "all" (no filter)
    window._globalAgent    = [];
    window._globalTask     = [];
    window._globalProvider = [];
    window._globalModel    = [];
    // Helpers for multi-select filter checks
    window._isAll = arr => !arr || !Array.isArray(arr) ? (arr === 'all' || !arr) : arr.length === 0;
    window._inFilter = (val, arr) => _isAll(arr) || arr.includes(val);
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
    window._msWidgets = {};  // multi-select widget instances keyed by container id
    window._costChartItems = [];     // cached items for re-render on view switch
    window._costChartHidden = { agent: new Set(), model: new Set(), task: new Set() }; // legend toggle state per view


    // ── Multi-select dropdown widget ─────────────────────────────────
    // Creates a checkbox-style multi-select dropdown inside a container element.
    // options: [{ value, label }], selected: array of selected values,
    // allLabel: text for "all" state, onChange: fn(selectedArray)
    // opts.groups: optional [{ header, items: [{ value, label }] }] for grouped display
    function _initMultiSelect(containerId, options, selected, allLabel, onChange, opts) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const _escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      let groups = opts && opts.groups;
      let disabledValues = (opts && opts.disabledValues) || new Set();

      function render() {
        const sel = selected;
        const isNone = sel.length === 1 && sel[0] === '__none__';
        const realSel = isNone ? [] : sel; // real selected values (excluding sentinel)
        let triggerText = allLabel;
        if (isNone) {
          triggerText = 'None';
        } else if (sel.length === 0) {
          triggerText = allLabel;
        } else if (sel.length === options.length) {
          triggerText = allLabel;
        } else if (sel.length === 1) {
          const opt = options.find(o => o.value === sel[0]);
          triggerText = opt ? opt.label : sel[0];
        } else {
          triggerText = sel.length + ' selected';
        }

        const isOpen = container.querySelector('.ms-panel.ms-open') !== null;
        // sel empty = all (no filter); sel with all options = explicit all selection
        const allShown = !isNone && (sel.length === 0 || sel.length === options.length);
        const showSelectAll = !allShown; // show "Select All" when partially filtered or none

        // Build option HTML — grouped or flat
        let optionsHtml = '';
        if (groups && groups.length > 0) {
          optionsHtml = groups.map(g => {
            const headerHtml = `<div class="ms-group-header">${_escHtml(g.header)}</div>`;
            const itemsHtml = g.items.map(o => {
              const isDis = disabledValues.has(o.value);
              const isSel = !isDis && !isNone && (sel.length === 0 || sel.includes(o.value));
              return `<div class="ms-option ms-grouped-option${isSel ? ' ms-selected' : ''}${isDis ? ' ms-disabled' : ''}" data-value="${_escHtml(o.value)}">
                <span class="ms-option-check">${isSel ? '✓' : ''}</span>
                <span>${_escHtml(o.label)}</span>
              </div>`;
            }).join('');
            return headerHtml + itemsHtml;
          }).join('');
        } else {
          optionsHtml = options.map(o => {
            const isDis = disabledValues.has(o.value);
            const isSel = !isDis && !isNone && (sel.length === 0 || sel.includes(o.value));
            return `<div class="ms-option${isSel ? ' ms-selected' : ''}${isDis ? ' ms-disabled' : ''}" data-value="${_escHtml(o.value)}">
              <span class="ms-option-check">${isSel ? '✓' : ''}</span>
              <span>${_escHtml(o.label)}</span>
            </div>`;
          }).join('');
        }

        container.innerHTML = `
          <div class="ms-trigger${isOpen ? ' ms-open' : ''}" data-ms-id="${containerId}">
            <span class="ms-trigger-text">${_escHtml(triggerText)}</span>
            <span class="ms-trigger-arrow">▾</span>
          </div>
          <div class="ms-panel${isOpen ? ' ms-open' : ''}" data-ms-panel="${containerId}">
            <div class="ms-option ms-toggle-all" data-value="__toggle_all__"><span style="color:#818cf8;font-weight:500;font-size:11px;">${showSelectAll ? 'Select All' : 'Unselect All'}</span></div>
            <div class="ms-option-sep"></div>
            ${optionsHtml}
            ${sel.length > 0 ? '<div class="ms-option-sep"></div><div class="ms-option ms-clear-option" data-value="__clear__"><span style="color:#6b7280;">✕ Clear filters</span></div>' : ''}
          </div>`;

        // Trigger click
        const trigger = container.querySelector('.ms-trigger');
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const panel = container.querySelector('.ms-panel');
          const wasOpen = panel.classList.contains('ms-open');
          // Close all other dropdowns
          document.querySelectorAll('.ms-panel.ms-open').forEach(p => {
            p.classList.remove('ms-open');
            p.previousElementSibling?.classList.remove('ms-open');
          });
          if (!wasOpen) {
            panel.classList.add('ms-open');
            trigger.classList.add('ms-open');
          }
        });

        // Option clicks
        container.querySelectorAll('.ms-option').forEach(opt => {
          opt.addEventListener('click', (e) => {
            e.stopPropagation();
            // Skip disabled options (belt-and-suspenders with CSS pointer-events:none)
            if (opt.classList.contains('ms-disabled')) return;
            const val = opt.dataset.value;
            if (val === '__toggle_all__') {
              const isAllShown = sel.length === 0 || sel.length === options.length;
              if (isAllShown) {
                // "Unselect All" — use sentinel so _inFilter matches nothing
                sel.length = 0;
                sel.push('__none__');
              } else {
                // "Select All" — clear filters to show everything
                sel.length = 0;
              }
            } else if (val === '__clear__') {
              sel.length = 0;
            } else {
              // Toggle individual item
              const curNone = sel.length === 1 && sel[0] === '__none__';
              if (curNone) {
                // Nothing selected — clicking an item selects just that item
                sel.length = 0;
                sel.push(val);
              } else if (sel.length === 0) {
                // Currently "all" — user unchecked one item → select all EXCEPT this one
                options.forEach(o => { if (o.value !== val) sel.push(o.value); });
              } else {
                const idx = sel.indexOf(val);
                if (idx >= 0) sel.splice(idx, 1);
                else sel.push(val);
              }
            }
            render();
            onChange(sel);
          });
        });
      }

      render();
      return { render, setOptions(newOpts) { options = newOpts; render(); }, setGroups(newG) { groups = newG; render(); }, setDisabled(dv) { disabledValues = dv; render(); } };
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.ms-panel.ms-open').forEach(p => {
        p.classList.remove('ms-open');
        p.previousElementSibling?.classList.remove('ms-open');
      });
    });


    // ── Local helpers (match old page exactly) ────────────────────────
    window._fmtK = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0);
    window._fmtDur = ms => { if (!ms || ms <= 0) return '—'; const s = Math.round(ms/1000); if (s < 60) return s + 's'; const m = Math.round(s/60); if (m < 60) return m + 'm'; return Math.round(m/60) + 'h ' + (m%60) + 'm'; };
    window._fmtTs = ts => ts ? new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZone:'America/Los_Angeles' }) + ' PT' : '—';

    window._agentCls = { samantha:'text-teal-400', scout:'text-green-400', main:'text-indigo-400', cliff:'text-indigo-400', 'claude-code':'text-purple-400', atlas:'text-orange-400', fernanda:'text-emerald-400' };
    window._agentLabel = { main:'Cliff', cliff:'Cliff', samantha:'Samantha', scout:'Scout', atlas:'Atlas', fernanda:'Fernanda', 'claude-code':'Claude Code' };

    // Augment CRON_DISPLAY with Fernanda cron entries (defined in portal-common.js)
    if (typeof CRON_DISPLAY === 'object') {
      CRON_DISPLAY['fernanda-heartbeat'] = 'Heartbeat';
    }

    // Use the shared modelShort from portal-common.js (loaded before this script)
    window._modelShortT = m => modelShort(m);

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
    window._grpBreakdownStore = {};
    window._expandedTasks = new Set(); // persist expanded state across re-renders (keyed by task name)
    window._expandedSessionTasks = new Set(); // persist session-expanded state across re-renders (keyed by task name)
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
          <td class="px-4 py-2 text-right text-yellow-400 text-xs font-semibold">${d.cost >= 0.01 ? '$' + d.cost.toFixed(2) : '<$0.01'}${d._hasSnapshotCost ? ' <span class="info-tip" data-tip="Lifetime session cost — may include spending under prior models" style="color:#eab308;">⚠</span>' : ''}</td>
          <td class="px-4 py-2" style="min-width:80px;"><div class="bg-gray-800 rounded-full h-1.5"><div class="${barCls} h-1.5 rounded-full" style="width:${barPct}%"></div></div></td>`;
        insertAfter.after(tr);
        insertAfter = tr;
      });
    }

    // Session drill-down — expand individual sessions from runs count
    window._sessionStore = {};
    window._expandedSessions = new Set();
    window._sessionDataMap = {}; // keyed by session_id → full session object
    window._sessionDetailOpenId = null; // currently-open detail panel session_id
    window._sessionDetailSource = null; // 'grouped' or 'raw' — which table owns the open detail
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
    window._singleSessionSidCache = {}; // storeKey → stable sid
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
        const sessActiveIndicator = sessIsActive && !alreadyShown ? _sessionActivityIndicator(s, isAtlasActive) : '';
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
    function setGlobalAgent(arr) {
      // arr is the same reference as window._globalAgent (mutated in place by multi-select widget)
      if (arr !== window._globalAgent) window._globalAgent = Array.isArray(arr) ? arr : [];
      applyGlobalFilters();
    }
    function setGlobalTask(arr) {
      if (arr !== window._globalTask) window._globalTask = Array.isArray(arr) ? arr : [];
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

    function setGlobalProvider(arr) {
      if (arr !== window._globalProvider) window._globalProvider = Array.isArray(arr) ? arr : [];
      applyGlobalFilters();
    }
    function setGlobalModel(arr) {
      if (arr !== window._globalModel) window._globalModel = Array.isArray(arr) ? arr : [];
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
      const providers = [...new Set(items.map(s => _getProviderFromModel(s.model)).filter(p => p !== 'Unknown'))].sort();
      const opts = providers.map(p => ({ value: p, label: p }));
      // Remove stale selections (in-place to preserve array reference)
      const pArr = window._globalProvider;
      for (let i = pArr.length - 1; i >= 0; i--) { if (!providers.includes(pArr[i])) pArr.splice(i, 1); }
      window._msWidgets['global-provider'] = _initMultiSelect('global-provider', opts, pArr, 'All Providers', setGlobalProvider);
    }

    function _populateModelDropdown(items) {
      const provFilter = window._globalProvider || [];
      const filtered = _isAll(provFilter) ? items : items.filter(s => _inFilter(_getProviderFromModel(s.model), provFilter));
      const modelLabels = {};
      filtered.forEach(s => {
        const label = typeof friendlyModel === 'function' ? friendlyModel(s.model) : s.model;
        if (label && label !== 'Unknown') modelLabels[label] = true;
      });
      const sorted = Object.keys(modelLabels).sort();
      const opts = sorted.map(m => ({ value: m, label: m }));
      // Remove stale selections (in-place)
      const mArr = window._globalModel;
      for (let i = mArr.length - 1; i >= 0; i--) { if (!sorted.includes(mArr[i])) mArr.splice(i, 1); }
      window._msWidgets['global-model'] = _initMultiSelect('global-model', opts, mArr, 'All Models', setGlobalModel);
    }

    function applyGlobalFilters() {
      _grpManualRefresh = true;
      loadAndRenderAgentSessions();
    }

    // ── Cascading filter constraints ─────────────────────────────────
    // Given all items and the current filter selections, compute which
    // values in each dropdown have zero matching rows when filtered by
    // the OTHER three filters. Returns { agent, task, provider, model }
    // where each is a Set of values that should be grayed out (disabled).
    function _computeCascadingConstraints(allDbItems) {
      const agentF    = window._globalAgent    || [];
      const taskF     = window._globalTask     || [];
      const providerF = window._globalProvider || [];
      const modelF    = window._globalModel    || [];

      const agentNorm = a => { if (!a) return 'cliff'; if (a === 'main' || a === 'cliff') return 'cliff'; return a.toLowerCase(); };

      // For each item, extract all 4 dimension values once
      const items = allDbItems.map(s => ({
        agent:    agentNorm(s.agent_type),
        task:     s.display_name || s.task_name || '',
        provider: _getProviderFromModel(s.model),
        model:    typeof friendlyModel === 'function' ? friendlyModel(s.model) : s.model,
      }));

      // Collect all known values per dimension
      const allAgents    = new Set(items.map(i => i.agent));
      const allTasks     = new Set(items.map(i => i.task).filter(Boolean));
      const allProviders = new Set(items.map(i => i.provider).filter(p => p !== 'Unknown'));
      const allModels    = new Set(items.map(i => i.model).filter(m => m && m !== 'Unknown'));

      // For each dimension, find which values have at least one row
      // matching the OTHER filters' selections
      function matches(item, skipDim) {
        if (skipDim !== 'agent'    && !_isAll(agentF)    && !_inFilter(item.agent, agentF)) return false;
        if (skipDim !== 'task'     && !_isAll(taskF)     && !_inFilter(item.task, taskF)) return false;
        if (skipDim !== 'provider' && !_isAll(providerF) && !_inFilter(item.provider, providerF)) return false;
        if (skipDim !== 'model'    && !_isAll(modelF)    && !_inFilter(item.model, modelF)) return false;
        return true;
      }

      const availAgents    = new Set();
      const availTasks     = new Set();
      const availProviders = new Set();
      const availModels    = new Set();

      for (const item of items) {
        if (matches(item, 'agent'))    availAgents.add(item.agent);
        if (matches(item, 'task'))     availTasks.add(item.task);
        if (matches(item, 'provider')) availProviders.add(item.provider);
        if (matches(item, 'model'))    availModels.add(item.model);
      }

      // Disabled = known values minus available values
      const disabledAgents    = new Set([...allAgents].filter(v => !availAgents.has(v)));
      const disabledTasks     = new Set([...allTasks].filter(v => !availTasks.has(v)));
      const disabledProviders = new Set([...allProviders].filter(v => !availProviders.has(v)));
      const disabledModels    = new Set([...allModels].filter(v => !availModels.has(v)));

      return {
        agent:    disabledAgents,
        task:     disabledTasks,
        provider: disabledProviders,
        model:    disabledModels,
      };
    }

    // Apply cascading constraints to all filter dropdowns.
    // Call after any filter change to gray out values with zero matching rows.
    function updateFilterDisabledStates() {
      const rows = window._sbSessionRows || [];
      if (rows.length === 0) return;
      const constraints = _computeCascadingConstraints(rows);
      const widgetMap = {
        'global-agent':    constraints.agent,
        'global-task':     constraints.task,
        'global-provider': constraints.provider,
        'global-model':    constraints.model,
      };
      for (const [id, disabledSet] of Object.entries(widgetMap)) {
        const w = window._msWidgets[id];
        if (w && w.setDisabled) w.setDisabled(disabledSet);
      }
    }

    function _populateTaskDropdown(taskNames, disabledValues) {
      const agentF = window._globalAgent || [];
      const filtered = _isAll(agentF) ? taskNames : taskNames.filter(t => {
        const agents = window._taskAgentMap[t] || [];
        return agents.some(a => agentF.includes(a));
      });
      const opts = filtered.map(t => ({ value: t, label: t }));
      // Remove stale selections (in-place)
      const tArr = window._globalTask;
      for (let i = tArr.length - 1; i >= 0; i--) { if (!filtered.includes(tArr[i])) tArr.splice(i, 1); }

      // Build grouped structure: tasks organized by owning agent
      const agentLabels = { cliff: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas', fernanda: 'Fernanda', 'claude-code': 'Claude Code' };
      const atMap = window._agentTaskMap || {};
      const groupMap = {}; // agentKey → [taskName]
      filtered.forEach(t => {
        const agents = window._taskAgentMap[t] || [];
        if (agents.length > 0) {
          agents.forEach(a => {
            if (!_isAll(agentF) && !agentF.includes(a)) return;
            if (!groupMap[a]) groupMap[a] = [];
            if (!groupMap[a].includes(t)) groupMap[a].push(t);
          });
        } else {
          // Ungrouped task — put under "Other"
          if (!groupMap['__other__']) groupMap['__other__'] = [];
          groupMap['__other__'].push(t);
        }
      });

      // Sort agents alphabetically, tasks within each group alphabetically
      const sortedAgents = Object.keys(groupMap).filter(a => a !== '__other__').sort();
      const groups = sortedAgents.map(a => ({
        header: agentLabels[a] || a.charAt(0).toUpperCase() + a.slice(1),
        items: groupMap[a].sort().map(t => ({ value: t, label: t }))
      }));
      if (groupMap['__other__']) {
        groups.push({ header: 'Other', items: groupMap['__other__'].sort().map(t => ({ value: t, label: t })) });
      }

      // Only use groups if there are multiple agents; flat list for single agent
      const useGroups = groups.length > 1;
      window._msWidgets['global-task'] = _initMultiSelect('global-task', opts, tArr, 'All Tasks', setGlobalTask, useGroups ? { groups } : undefined);
    }

    function _populateAgentDropdown(agentNames) {
      const labels = { cliff: 'Cliff', samantha: 'Samantha', scout: 'Scout', atlas: 'Atlas', fernanda: 'Fernanda', 'claude-code': 'Claude Code' };
      const opts = agentNames.map(a => ({ value: a, label: labels[a] || a }));
      // Remove stale selections (in-place)
      const aArr = window._globalAgent;
      for (let i = aArr.length - 1; i >= 0; i--) { if (!agentNames.includes(aArr[i])) aArr.splice(i, 1); }
      window._msWidgets['global-agent'] = _initMultiSelect('global-agent', opts, aArr, 'All Agents', setGlobalAgent);
    }

