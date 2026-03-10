// ══════════════════════════════════════════════════════════════════
// tokens-init.js — Initialization, auto-refresh, Supabase realtime
// Split from tokens.js on 2026-03-10
// ══════════════════════════════════════════════════════════════════

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
        // 1. Re-fetch data from Supabase (replaces data.json static file)
        try {
          const dj = await fetchPortalData('data');
          if (dj) {
            if (dj.crons && dj.crons.length) window._cronList = dj.crons;
            window._latestDataJson = dj;
          }
        } catch (e) { console.warn('[tokens] data refresh failed:', e); }
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
