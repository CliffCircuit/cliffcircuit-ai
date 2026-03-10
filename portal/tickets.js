/* ── tickets.js — Ticket Board Modal ───────────────────────────────────
   Full-screen modal overlay showing all atlas_tickets from Supabase.
   Tim can update tim_status via dropdown + reject_reason inline.
   ──────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────
  function fmtId(id) { return 'TKT-' + String(id).padStart(4, '0'); }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'America/Los_Angeles' });
    const day = d.getDate();
    const h = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
    return `${mon} ${day}, ${h}`;
  }

  const STATUS_COLORS = {
    'todo':        { bg: '#374151', text: '#9ca3af' },
    'in-progress': { bg: '#1e3a5f', text: '#60a5fa' },
    'review':      { bg: '#422006', text: '#fbbf24' },
    'done':        { bg: '#14532d', text: '#4ade80' },
  };

  // ── Supabase helpers ────────────────────────────────────────────────
  function sbFetch(path, opts) {
    return fetch(window._sbUrl + '/rest/v1/' + path, Object.assign({
      headers: {
        apikey: window._sbKey,
        Authorization: 'Bearer ' + window._sbKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    }, opts));
  }

  async function loadTickets() {
    const res = await sbFetch('atlas_tickets?order=id.desc');
    if (!res.ok) throw new Error('Failed to load tickets: ' + res.status);
    return res.json();
  }

  async function patchTicket(id, body) {
    const res = await sbFetch('atlas_tickets?id=eq.' + id, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Patch failed: ' + res.status);
    return res.json();
  }

  // ── Render ──────────────────────────────────────────────────────────
  function renderHistory(hist) {
    if (!hist || !hist.length) return '<span style="color:#4b5563;font-size:11px;">No history</span>';
    return hist.map(h => {
      const label = h.field === 'status' ? 'Status' :
                    h.field === 'cliff_status' ? 'Cliff' :
                    h.field === 'tim_status' ? 'Tim' : h.field;
      return `<span style="color:#6b7280;">${label} → ${h.value} (${fmtDate(h.at)})</span>`;
    }).join(' <span style="color:#374151;">·</span> ');
  }

  function renderStatusPill(status) {
    const c = STATUS_COLORS[status] || STATUS_COLORS['todo'];
    return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text};white-space:nowrap;">${status}</span>`;
  }

  function renderTimDropdown(ticket) {
    const cur = ticket.tim_status || '—';
    const opts = ['—', 'Reviewed', 'Approved', 'Rejected'];
    const sel = opts.map(o =>
      `<option value="${o}"${o === cur ? ' selected' : ''}>${o}</option>`
    ).join('');
    return `<select data-ticket-id="${ticket.id}" class="tkt-tim-select" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;">${sel}</select>`;
  }

  function renderTicketRows(tickets) {
    if (!tickets.length) {
      return '<tr><td colspan="6" style="text-align:center;color:#4b5563;padding:32px;">No tickets found.</td></tr>';
    }
    return tickets.map(t => {
      const cliffStatus = t.cliff_status || '—';
      const rejectHtml = (t.tim_status === 'Rejected')
        ? `<input type="text" data-ticket-id="${t.id}" class="tkt-reject-input" placeholder="Reason…" value="${(t.reject_reason || '').replace(/"/g, '&quot;')}" style="background:#1e293b;color:#fca5a5;border:1px solid #7f1d1d;border-radius:4px;padding:2px 8px;font-size:11px;width:180px;margin-left:6px;">`
        : '';
      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:10px 12px;font-size:12px;font-weight:600;color:#a5b4fc;white-space:nowrap;">${fmtId(t.id)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#e2e8f0;max-width:400px;">${t.title || '—'}</td>
          <td style="padding:10px 12px;">${renderStatusPill(t.status)}</td>
          <td style="padding:10px 12px;font-size:11px;color:#6b7280;white-space:nowrap;">${fmtDate(t.updated_at)}</td>
          <td style="padding:10px 12px;font-size:12px;color:#9ca3af;white-space:nowrap;">Cliff: <span style="color:#e2e8f0;font-weight:500;">${cliffStatus}</span></td>
          <td style="padding:10px 12px;white-space:nowrap;">Tim: ${renderTimDropdown(t)}${rejectHtml}</td>
        </tr>
        <tr style="border-bottom:1px solid #0f172a;">
          <td colspan="6" style="padding:2px 12px 8px;font-size:11px;">${renderHistory(t.state_history)}</td>
        </tr>`;
    }).join('');
  }

  // ── Modal ───────────────────────────────────────────────────────────
  let _modalEl = null;
  let _tickets = [];

  function buildModal() {
    if (_modalEl) return _modalEl;
    const div = document.createElement('div');
    div.id = 'tickets-modal';
    div.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;';
    div.innerHTML = `
      <div id="tkt-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.65);"></div>
      <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;height:100%;padding:24px;">
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;width:100%;max-width:1200px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
          <!-- Header -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px 14px;border-bottom:1px solid #1e293b;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:16px;font-weight:700;color:#e2e8f0;">🎫 Tickets</span>
              <span id="tkt-count" style="font-size:11px;color:#6b7280;"></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="tkt-refresh" style="background:none;border:1px solid #334155;color:#9ca3af;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;" title="Refresh">↻ Refresh</button>
              <button id="tkt-close" style="background:none;border:none;color:#6b7280;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;" title="Close">✕</button>
            </div>
          </div>
          <!-- Body -->
          <div style="overflow-y:auto;flex:1;padding:8px 0;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid #1e293b;">
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">ID</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">Title</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">Status</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">Updated</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">Cliff</th>
                  <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#4b5563;text-transform:uppercase;text-align:left;">Tim</th>
                </tr>
              </thead>
              <tbody id="tkt-body">
                <tr><td colspan="6" style="text-align:center;color:#4b5563;padding:32px;">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    _modalEl = div;

    // Events
    div.querySelector('#tkt-close').addEventListener('click', closeTicketsModal);
    div.querySelector('#tkt-backdrop').addEventListener('click', closeTicketsModal);
    div.querySelector('#tkt-refresh').addEventListener('click', refreshTickets);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _modalEl && _modalEl.style.display !== 'none') closeTicketsModal();
    });

    // Delegate tim_status dropdown + reject input
    div.addEventListener('change', handleTimChange);
    div.addEventListener('keydown', handleRejectKey);
    div.addEventListener('blur', handleRejectBlur, true);

    return div;
  }

  async function handleTimChange(e) {
    if (!e.target.classList.contains('tkt-tim-select')) return;
    const id = Number(e.target.dataset.ticketId);
    const val = e.target.value;
    const ticket = _tickets.find(t => t.id === id);
    if (!ticket) return;

    // Build state_history entry
    const histEntry = { field: 'tim_status', value: val, at: new Date().toISOString() };
    const newHist = (ticket.state_history || []).concat(histEntry);

    const body = { tim_status: val, state_history: newHist };
    if (val !== 'Rejected') body.reject_reason = null;

    try {
      await patchTicket(id, body);
      ticket.tim_status = val;
      ticket.state_history = newHist;
      if (val !== 'Rejected') ticket.reject_reason = null;
      renderBody();
    } catch (err) {
      console.error('Failed to update tim_status:', err);
      alert('Failed to save. Check console.');
    }
  }

  function handleRejectKey(e) {
    if (!e.target.classList.contains('tkt-reject-input')) return;
    if (e.key === 'Enter') { e.target.blur(); }
  }

  async function handleRejectBlur(e) {
    if (!e.target.classList.contains('tkt-reject-input')) return;
    const id = Number(e.target.dataset.ticketId);
    const reason = e.target.value.trim();
    if (!reason) { e.target.focus(); e.target.style.borderColor = '#dc2626'; return; }
    try {
      await patchTicket(id, { reject_reason: reason });
      const ticket = _tickets.find(t => t.id === id);
      if (ticket) ticket.reject_reason = reason;
      e.target.style.borderColor = '#334155';
    } catch (err) {
      console.error('Failed to save reject reason:', err);
    }
  }

  function renderBody() {
    const tbody = _modalEl.querySelector('#tkt-body');
    tbody.innerHTML = renderTicketRows(_tickets);
    _modalEl.querySelector('#tkt-count').textContent = _tickets.length + ' ticket' + (_tickets.length === 1 ? '' : 's');
  }

  async function refreshTickets() {
    const tbody = _modalEl.querySelector('#tkt-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#4b5563;padding:32px;">Loading…</td></tr>';
    try {
      _tickets = await loadTickets();
      renderBody();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:32px;">Error: ${err.message}</td></tr>`;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────
  window.openTicketsModal = async function () {
    const modal = buildModal();
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    await refreshTickets();
  };

  function closeTicketsModal() {
    if (_modalEl) _modalEl.style.display = 'none';
    document.body.style.overflow = '';
  }
  window.closeTicketsModal = closeTicketsModal;
})();
