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
  if (range === '1h' || range === '24h' || range === 'today' || range === 'yesterday') return 'hourly';
  return 'daily';
}

function renderCostBarChart(items) {
  window._costChartItems = items;
  const view = window._costChartView || 'agent';
  const titleEl = document.getElementById('cost-chart-title');
  if (titleEl) {
    const titles = { agent: 'Cost Over Time \u2014 By Agent', model: 'Cost Over Time \u2014 By Model', task: 'Cost Over Time \u2014 By Task' };
    titleEl.textContent = titles[view] || 'Cost Over Time';
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
    if (bucketMode === 'hourly') {
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

