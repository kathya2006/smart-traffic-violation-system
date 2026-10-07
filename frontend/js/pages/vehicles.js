import { api } from '../api.js';
import { html, mount, $, $$, on, icon, plate, statusBadge, fmtNum, fmtMoney, fmtDate, fmtDateTime, debounce, emptyState, skeletonRows, errorMessage, countUp } from '../ui.js';
import { openViolation } from '../violation-drawer.js';

const pill = (ok, label, date) => html`<span class="valid-pill ${ok ? 'ok' : 'bad'}">${icon(ok ? 'checkCircle' : 'alert')}${label} ${ok ? 'valid till' : 'expired'} ${fmtDate(date)}</span>`;

export async function render(el, { user, params }) {
  const staff = user.role !== 'citizen';
  let alive = true;

  mount(el, html`
    <div class="glass card">
      <form id="vf" class="toolbar" style="margin:0">
        <div class="input-icon">${icon('search')}<input class="input" id="v-q" placeholder="${staff ? 'Search by plate, owner or make...' : 'Enter registration, e.g. TN 09 AB 1234'}" value="${params.plate || ''}" autocomplete="off" aria-label="Search vehicles"></div>
        <button class="btn primary" type="submit">${icon('search')} ${staff ? 'Search' : 'Look up'}</button>
      </form>
      ${staff ? html`<div id="registry" style="margin-top:16px"></div>` : ''}
    </div>
    <div id="detail"></div>`);

  const detail = $('#detail', el);

  async function openPlate(raw) {
    mount(detail, html`<div class="glass card">${skeletonRows(4, 70)}</div>`);
    try {
      const { vehicle: v, summary: s, violations } = await api.get('/api/vehicles/lookup', { plate: raw });
      if (!alive) return;
      const pts = Number(s.penalty_points); const pct = Math.min(100, Math.round((pts / 12) * 100));
      mount(detail, html`
        <div class="glass electric card" style="margin-bottom:20px"><div class="vehicle-head">
          <div>${plate(v.plate_number, 'lg')}</div>
          <div class="stack" style="gap:8px"><div><b style="font-size:18px">${[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}</b> <span class="dim">· ${v.vehicle_type}${v.color ? ' · ' + v.color : ''}${v.registered_state ? ' · ' + v.registered_state : ''}</span></div>
            <div class="muted">${icon('user')} ${v.owner_name || 'Owner not on record'}${staff && v.owner_phone ? ` · ${v.owner_phone}` : ''}${staff && v.license_number ? ` · DL ${v.license_number}` : ''}</div>
            <div class="row wrap gap-s">${pill(v.insurance_valid, 'Insurance', v.insurance_valid_till)}${pill(v.puc_valid, 'PUC', v.puc_valid_till)}${v.license_valid_till ? pill(v.license_valid, 'Licence', v.license_valid_till) : ''}</div></div>
          <div style="min-width:190px"><div class="dim" style="font-size:12px;text-transform:uppercase;letter-spacing:.1em">Penalty points</div><div class="kpi-value" style="font-size:30px;color:${pts >= 12 ? 'var(--red)' : '#fff'}">${pts} <small class="dim" style="font-size:14px">/ 12</small></div><div class="progress points-bar" style="--w:${pct}%;--c:${pts >= 12 ? '#ff3d71' : pts >= 8 ? '#ffb020' : '#00e676'}"><i></i></div>${pts >= 12 ? html`<span class="hint" style="color:var(--red)">Licence suspension threshold reached</span>` : ''}</div>
        </div></div>
        <div class="mini-stats" style="margin-bottom:20px">
          ${[['Violations', s.total_violations, ''], ['Total fined', s.total_fined, 'money'], ['Outstanding', s.outstanding, 'money'], ['Last offence', null, '']].map(([l, val, f]) => html`<div class="glass mini-stat"><small>${l}</small><b ${val !== null ? html`data-count="${val}" ${f ? html`data-format="${f}"` : ''}` : ''}>${val === null ? (s.last_violation_at ? fmtDate(s.last_violation_at) : '—') : 0}</b></div>`)}</div>
        <div class="glass card"><div class="card-head"><div class="card-title">${icon('list')} Offence history</div><span class="muted">${violations.length} record${violations.length === 1 ? '' : 's'}</span></div>
          ${violations.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Offence</th><th>Location</th><th>When</th><th>Status</th><th class="num">Fine</th></tr></thead><tbody>
          ${violations.map((x) => html`<tr class="clickable" data-id="${x.violation_id}"><td class="ref">${x.reference_no}</td><td><span class="cell-main"><span class="cat-dot" style="--c:${x.category_color}"></span>${x.violation_name}</span><span class="sub">${x.category_name}</span></td><td>${x.location_name}</td><td>${fmtDateTime(x.occurred_at)}</td><td>${statusBadge(x.status)}</td><td class="num">${x.total_due != null ? html`<b>${fmtMoney(x.total_due)}</b><span class="sub">${x.fine_status}</span>` : html`<span class="dim">—</span>`}</td></tr>`)}</tbody></table></div>`
          : emptyState('Clean record', 'No violations have been reported for this vehicle.', 'shield')}</div>`);
      countUp(detail);
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { mount(detail, html`<div class="glass card">${emptyState('Vehicle not found', errorMessage(e), 'vehicle')}</div>`); }
  }
  on(detail, 'click', 'tr[data-id]', (_e, r) => openViolation(Number(r.dataset.id), { onChange: () => $('#v-q', el).value && openPlate($('#v-q', el).value) }));

  async function loadRegistry(search) {
    const box = $('#registry', el); if (!box) return;
    mount(box, skeletonRows(5, 54));
    try {
      const r = await api.get('/api/vehicles', { search, limit: 12 });
      if (!alive) return;
      mount(box, r.data.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Vehicle</th><th>Make / model</th><th>Owner</th><th class="num">Violations</th><th class="num">Points</th><th class="num">Outstanding</th></tr></thead><tbody>
        ${r.data.map((v) => html`<tr class="clickable" data-plate="${v.plate_number}"><td>${plate(v.plate_number, 'sm')}</td><td>${[v.make, v.model].filter(Boolean).join(' ') || '—'}<span class="sub">${v.vehicle_type}</span></td><td>${v.owner_name || '—'}</td><td class="num"><b>${v.total_violations}</b></td><td class="num">${v.penalty_points}</td><td class="num">${fmtMoney(v.outstanding)}</td></tr>`)}</tbody></table></div>`
        : emptyState('No vehicles match', 'Try a different plate, owner or make.', 'vehicle'));
    } catch (e) { mount(box, emptyState('Could not load the registry', errorMessage(e), 'alert')); }
  }
  if (staff) {
    on(el, 'click', 'tr[data-plate]', (_e, r) => { $('#v-q', el).value = r.dataset.plate; openPlate(r.dataset.plate); });
    $('#v-q', el).addEventListener('input', debounce((e) => loadRegistry(e.target.value.trim()), 300));
    loadRegistry(params.plate || '');
  }
  $('#vf', el).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#v-q', el).value.trim(); if (!v) return; if (!staff || /^[A-Za-z]{2}\s?\d{2}\s?[A-Za-z]{1,3}\s?\d{4}$/.test(v)) openPlate(v); else loadRegistry(v); });
  if (params.plate) openPlate(params.plate);
  else if (!staff) mount(detail, html`<div class="glass card">${emptyState('Look up any vehicle', 'See registration, insurance and PUC validity and the full offence history.', 'vehicle')}</div>`);

  return () => { alive = false; };
}
