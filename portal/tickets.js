/* ── tickets.js — Ticket Board Modal ───────────────────────────────────
   Full-screen modal overlay showing all atlas_tickets from Supabase.
   Tim can update tim_status via dropdown + reject_reason with image attachments.

   Status pipeline: Queued → Coding → Deployed → Verified → Reviewed → Rejected
   State history rendered as a timestamp trail under each ticket.
   Reject textarea with drag-and-drop / paste image support.
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

  function fmtTime(iso) {
    if (!iso) return '?';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  }

  // ── Status Pipeline ─────────────────────────────────────────────────
  const PIPELINE_STATUSES = ['Queued', 'Coding', 'Deployed', 'Verified', 'Reviewed', 'Rejected'];

  const STATUS_COLORS = {
    'Queued':    { bg: '#374151', text: '#9ca3af' },
    'Coding':    { bg: '#1e3a5f', text: '#60a5fa' },
    'Deployed':  { bg: '#1a2e05', text: '#84cc16' },
    'Verified':  { bg: '#14532d', text: '#4ade80' },
    'Reviewed':  { bg: '#422006', text: '#fbbf24' },
    'Rejected':  { bg: '#450a0a', text: '#f87171' },
    // Legacy fallbacks
    'todo':        { bg: '#374151', text: '#9ca3af' },
    'in-progress': { bg: '#1e3a5f', text: '#60a5fa' },
    'review':      { bg: '#422006', text: '#fbbf24' },
    'done':        { bg: '#14532d', text: '#4ade80' },
  };

  // ── Reject data helpers ─────────────────────────────────────────────
  // reject_reason stores either plain text (legacy) or JSON: {text, images}
  function parseRejectData(raw) {
    if (!raw) return { text: '', images: [] };
    if (typeof raw === 'object') return { text: raw.text || '', images: raw.images || [] };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { text: parsed.text || '', images: parsed.images || [] };
      }
    } catch (_) { /* not JSON */ }
    return { text: raw, images: [] };
  }

  function serializeRejectData(text, images) {
    if (!images || !images.length) return text || '';
    return JSON.stringify({ text: text || '', images: images });
  }

  // ── Supabase helpers ────────────────────────────────────────────────
  function sbFetch(path, opts) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
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
  function renderStateHistory(hist) {
    if (!hist || !hist.length) return '<span style="color:#4b5563;font-size:11px;font-style:italic;">No transitions yet</span>';
    // Filter to status transitions only for the pipeline trail
    const statusEntries = hist.filter(h => h.field === 'status' || h.status);
    if (!statusEntries.length) {
      // Fallback: show all entries
      return hist.map(h => {
        const label = h.status || h.value || h.field || '?';
        const time = fmtTime(h.at || h.timestamp);
        return `<span style="color:#9ca3af;font-size:11px;">${label} <span style="color:#4b5563;">${time}</span></span>`;
      }).join(' <span style="color:#334155;font-size:11px;">→</span> ');
    }
    return statusEntries.map(h => {
      const label = h.status || h.value || '?';
      const time = fmtTime(h.at || h.timestamp);
      const c = STATUS_COLORS[label] || STATUS_COLORS['Queued'];
      return `<span style="color:${c.text};font-size:11px;">${label} <span style="color:#4b5563;">${time}</span></span>`;
    }).join(' <span style="color:#334155;font-size:11px;">→</span> ');
  }

  function renderStatusPill(status) {
    const c = STATUS_COLORS[status] || STATUS_COLORS['Queued'];
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

  function renderRejectArea(ticket) {
    if (ticket.tim_status !== 'Rejected') return '';
    const data = parseRejectData(ticket.reject_reason);

    // Thumbnails HTML
    let thumbsHtml = '';
    if (data.images && data.images.length) {
      thumbsHtml = '<div class="tkt-reject-thumbs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">' +
        data.images.map((img, i) =>
          `<div style="position:relative;display:inline-block;" data-ticket-id="${ticket.id}" data-img-idx="${i}">
            <img src="${img.data_url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #334155;cursor:pointer;" title="${img.filename || 'image'}" onclick="window._tktPreviewImage(this.src)">
            <button class="tkt-remove-img" data-ticket-id="${ticket.id}" data-img-idx="${i}" style="position:absolute;top:-4px;right:-4px;background:#7f1d1d;color:#fca5a5;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;line-height:16px;text-align:center;cursor:pointer;padding:0;" title="Remove">✕</button>
          </div>`
        ).join('') +
        '</div>';
    }

    return `
      <div class="tkt-reject-area" data-ticket-id="${ticket.id}" style="margin-top:8px;width:100%;">
        <textarea data-ticket-id="${ticket.id}" class="tkt-reject-input" rows="4" placeholder="Rejection reason… (paste or drag images here)"
          style="background:#1e293b;color:#fca5a5;border:1px solid #7f1d1d;border-radius:6px;padding:8px 10px;font-size:12px;width:100%;min-width:300px;resize:vertical;font-family:inherit;line-height:1.4;box-sizing:border-box;">${data.text.replace(/</g, '&lt;')}</textarea>
        <div class="tkt-drop-zone" data-ticket-id="${ticket.id}" style="border:1px dashed #334155;border-radius:6px;padding:8px;margin-top:4px;text-align:center;color:#4b5563;font-size:11px;cursor:pointer;transition:all 0.15s;">
          📎 Drag &amp; drop or paste (⌘V) screenshots
        </div>
        ${thumbsHtml}
      </div>`;
  }

  function renderTicketRows(tickets) {
    if (!tickets.length) {
      return '<tr><td colspan="6" style="text-align:center;color:#4b5563;padding:32px;">No tickets found.</td></tr>';
    }
    return tickets.map(t => {
      const cliffStatus = t.cliff_status || '—';
      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:10px 12px;font-size:12px;font-weight:600;color:#a5b4fc;white-space:nowrap;">${fmtId(t.id)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#e2e8f0;max-width:400px;">
            ${t.title || '—'}
            ${renderRejectArea(t)}
          </td>
          <td style="padding:10px 12px;">${renderStatusPill(t.cliff_status || t.status || '—')}</td>
          <td style="padding:10px 12px;font-size:11px;color:#6b7280;white-space:nowrap;">${fmtDate(t.updated_at)}</td>
          <td style="padding:10px 12px;font-size:12px;color:#9ca3af;white-space:nowrap;">Cliff: <span style="color:#e2e8f0;font-weight:500;">${cliffStatus}</span></td>
          <td style="padding:10px 12px;white-space:nowrap;">Tim: ${renderTimDropdown(t)}</td>
        </tr>
        <tr style="border-bottom:1px solid #0f172a;">
          <td colspan="6" style="padding:2px 12px 8px;font-size:11px;">${renderStateHistory(t.state_history)}</td>
        </tr>`;
    }).join('');
  }

  // ── Modal ───────────────────────────────────────────────────────────
  let _modalEl = null;
  let _tickets = [];
  // Per-ticket image staging (before save)
  let _rejectImages = {}; // ticketId -> [{data_url, filename, timestamp}]

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
      <!-- Image preview overlay -->
      <div id="tkt-img-preview" style="display:none;position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.85);cursor:zoom-out;display:none;align-items:center;justify-content:center;" onclick="this.style.display='none'">
        <img id="tkt-img-preview-src" style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);">
      </div>
    `;
    document.body.appendChild(div);
    _modalEl = div;

    // Events
    div.querySelector('#tkt-close').addEventListener('click', closeTicketsModal);
    div.querySelector('#tkt-backdrop').addEventListener('click', closeTicketsModal);
    div.querySelector('#tkt-refresh').addEventListener('click', refreshTickets);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const preview = document.getElementById('tkt-img-preview');
        if (preview && preview.style.display === 'flex') { preview.style.display = 'none'; return; }
        if (_modalEl && _modalEl.style.display !== 'none') closeTicketsModal();
      }
    });

    // Delegate: tim_status dropdown
    div.addEventListener('change', handleTimChange);

    // Delegate: reject textarea blur (auto-save)
    div.addEventListener('focusout', handleRejectBlur);

    // Delegate: reject textarea Ctrl+Enter save
    div.addEventListener('keydown', handleRejectKey);

    // Delegate: remove image button
    div.addEventListener('click', handleRemoveImage);

    // Delegate: drop zone drag & drop
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', handleDrop);

    // Global paste handler for images
    document.addEventListener('paste', handlePaste);

    return div;
  }

  // ── Image preview ───────────────────────────────────────────────────
  window._tktPreviewImage = function (src) {
    const el = document.getElementById('tkt-img-preview');
    if (!el) return;
    el.querySelector('#tkt-img-preview-src').src = src;
    el.style.display = 'flex';
  };

  // ── Image handling ──────────────────────────────────────────────────
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addImagesToTicket(ticketId, files) {
    const ticket = _tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const data = parseRejectData(ticket.reject_reason);
    const images = data.images || [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await fileToDataUrl(file);
      images.push({
        data_url: dataUrl,
        filename: file.name || 'screenshot.png',
        timestamp: new Date().toISOString(),
      });
    }

    const serialized = serializeRejectData(data.text, images);
    try {
      await patchTicket(ticketId, { reject_reason: serialized });
      ticket.reject_reason = serialized;
      renderBody();
    } catch (err) {
      console.error('Failed to save images:', err);
      alert('Failed to save images. Check console.');
    }
  }

  async function removeImageFromTicket(ticketId, imgIdx) {
    const ticket = _tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const data = parseRejectData(ticket.reject_reason);
    if (!data.images || !data.images.length) return;

    data.images.splice(imgIdx, 1);
    const serialized = serializeRejectData(data.text, data.images);
    try {
      await patchTicket(ticketId, { reject_reason: serialized });
      ticket.reject_reason = serialized;
      renderBody();
    } catch (err) {
      console.error('Failed to remove image:', err);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────
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
    // Ctrl+Enter or Cmd+Enter to save
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.target.blur();
    }
  }

  async function handleRejectBlur(e) {
    if (!e.target.classList.contains('tkt-reject-input')) return;
    const id = Number(e.target.dataset.ticketId);
    const text = e.target.value.trim();
    const ticket = _tickets.find(t => t.id === id);
    if (!ticket) return;

    const oldData = parseRejectData(ticket.reject_reason);
    if (text === oldData.text) return; // no change

    const serialized = serializeRejectData(text, oldData.images);
    try {
      await patchTicket(id, { reject_reason: serialized });
      ticket.reject_reason = serialized;
      e.target.style.borderColor = '#334155';
      // Brief flash to confirm save
      e.target.style.borderColor = '#22c55e';
      setTimeout(() => { if (e.target) e.target.style.borderColor = '#7f1d1d'; }, 600);
    } catch (err) {
      console.error('Failed to save reject reason:', err);
      e.target.style.borderColor = '#dc2626';
    }
  }

  function handleRemoveImage(e) {
    const btn = e.target.closest('.tkt-remove-img');
    if (!btn) return;
    const ticketId = Number(btn.dataset.ticketId);
    const imgIdx = Number(btn.dataset.imgIdx);
    removeImageFromTicket(ticketId, imgIdx);
  }

  function handleDragOver(e) {
    const zone = e.target.closest('.tkt-drop-zone');
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    zone.style.borderColor = '#60a5fa';
    zone.style.background = 'rgba(96,165,250,0.05)';
    zone.textContent = '📎 Drop image here';
  }

  function handleDragLeave(e) {
    const zone = e.target.closest('.tkt-drop-zone');
    if (!zone) return;
    zone.style.borderColor = '#334155';
    zone.style.background = 'transparent';
    zone.innerHTML = '📎 Drag &amp; drop or paste (⌘V) screenshots';
  }

  function handleDrop(e) {
    const zone = e.target.closest('.tkt-drop-zone');
    if (!zone) return;
    e.preventDefault();
    e.stopPropagation();
    zone.style.borderColor = '#334155';
    zone.style.background = 'transparent';
    zone.innerHTML = '📎 Drag &amp; drop or paste (⌘V) screenshots';

    const ticketId = Number(zone.dataset.ticketId);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) addImagesToTicket(ticketId, files);
  }

  function handlePaste(e) {
    // Only handle if a reject textarea or drop zone is focused/active
    if (!_modalEl || _modalEl.style.display === 'none') return;
    const active = document.activeElement;
    const isRejectArea = active && (active.classList.contains('tkt-reject-input') || active.closest('.tkt-reject-area'));
    if (!isRejectArea) return;

    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;

    e.preventDefault();
    const ticketId = Number(active.dataset.ticketId || active.closest('[data-ticket-id]')?.dataset.ticketId);
    if (!ticketId) return;

    const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
    if (files.length) addImagesToTicket(ticketId, files);
  }

  // ── Render body ─────────────────────────────────────────────────────
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
