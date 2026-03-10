// ══════════════════════════════════════════════════════════════════
// tokens-table.js — Grouped agent table + raw session table
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

    // ── Grouped sub-agent ─────────────────────────────────────────────
    window._grpManualRefresh = false; // set true when user changes filters
    function renderGrouped(allDbItems, cutoffStart, cutoffEnd) {
      _grpManualRefresh = false;
      const agentF = window._globalAgent || [];
      const taskF = window._globalTask || [];
      const items = (allDbItems || window._allDbSubItems).filter(s => {
        if (!_isAll(taskF) && !_inFilter(s.display_name || s.task_name || '', taskF)) return false;
        if (!_isAll(agentF)) {
          const sa = (s.agent_type || '').toLowerCase();
          const norm = (sa === 'main') ? 'cliff' : sa;
          if (!_inFilter(norm, agentF)) return false;
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
        if (!groups[key].modelBreakdown[mLabel]) groups[key].modelBreakdown[mLabel] = { count: 0, cost: 0, dur: 0, tokIn: 0, tokOut: 0, sessions: [], _hasSnapshotCost: false };
        groups[key].modelBreakdown[mLabel].count++;
        groups[key].modelBreakdown[mLabel].cost += s.estimated_cost_usd || 0;
        // Flag if any session's cost came from snapshot (lifetime cost, not model-specific)
        if (!s._from_intervals) groups[key].modelBreakdown[mLabel]._hasSnapshotCost = true;
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
        // Check if ALL active sessions in the group are stale
        const grpActiveSessions = g.allSessions.filter(s => _isSessionActive(s));
        const grpAllStale = grpActiveSessions.length > 0 && grpActiveSessions.every(s => _isSessionStale(s));
        const grpActiveIndicator = !grpHasActive && !grpHasAtlasActive ? '' :
          grpAllStale ? (grpHasAtlasActive ? _staleBadgeHtml : _staleDotHtml) :
          grpHasAtlasActive ? _activeBadgeHtml : _activeDotHtml;
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

      // Total row at bottom of summary table
      if (sorted.length > 0) {
        const totalAvgDur = totalRuns > 0 ? Math.round(sorted.reduce((s,g) => s + g.totalDur, 0) / totalRuns) : 0;
        const totalAvgCost = totalRuns > 0 ? totalCost / totalRuns : 0;
        body.innerHTML += `<tr class="border-t-2 border-gray-600" style="font-weight:700;">
          <td class="px-4 py-2 text-gray-100 text-xs">Total</td>
          <td class="px-4 py-2 text-xs"></td>
          <td class="px-4 py-2 text-xs"></td>
          <td class="px-4 py-2 text-right text-white text-xs">${totalRuns}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${_fmtDur(totalAvgDur)}</td>
          <td class="px-4 py-2 text-right text-white text-xs">${_fmtK(totalTokIn)} / ${_fmtK(totalTokOut)}</td>
          <td class="px-4 py-2 text-right text-gray-400 text-xs">${totalAvgCost >= 0.01 ? '$' + totalAvgCost.toFixed(3) : '<$0.01'}</td>
          <td class="px-4 py-2 text-right text-yellow-400 text-xs font-semibold">${totalCost >= 0.01 ? '$' + totalCost.toFixed(2) : '<$0.01'}</td>
          <td class="px-4 py-2"></td>
        </tr>`;
      }

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


    // ── Raw table ─────────────────────────────────────────────────────
    function renderRawTable(allDbItems) {
      const items = allDbItems || window._allDbSubItems;
      const globalTask = window._globalTask || [];
      const taskFilter = window._dbRawTaskFilter || 'all';
      const globalTaskFiltered = _isAll(globalTask) ? items
        : items.filter(s => _inFilter(s.display_name || s.task_name || 'Unknown', globalTask));
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

