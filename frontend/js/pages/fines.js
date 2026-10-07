import { api } from '../api.js';
import { html, mount, $, $$, on, icon, plate, fmtNum, fmtMoney, fmtDate, fmtDateTime, debounce, emptyState, skeletonRows, errorMessage, countUp, toast } from '../ui.js';
import { openViolation, payFineModal } from '../violation-drawer.js';
import { state } from '../state.js';

const FSTAT = ['Overdue', 'Unpaid', 'Paid', 'Waived'];

export async function render(el, { user, params }) {
  const staff = user.role !== 'citizen';
  let tab = 'fines'; let alive = true;
  const q = { status: '', search: '', page: 1, limit: 12, plate: params.plate || '' };

  mount(el, html`
    <div class="row between wrap"><div class="tabs" id="tabs"><button class="tab active" data-tab="fines">${staff ? 'All fines' : 'Pay a fine'}</button><button class="tab" data-tab="payments">${staff ? 'Payment ledger' : 'My payments'}</button></div></div>
    <div id="body"></div>`);

  let body = $('#body', el);
  on(el, 'click', '[data-tab]', (_e, b) => { tab = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('active', x === b)); show(); });

  const fineRow = (f) => html`<tr class="clickable" data-v="${f.violation_id}">
    <td class="ref">${f.reference_no}</td><td>${plate(f.plate_number, 'sm')}${staff && f.owner_name ? html`<span class="sub">${f.owner_name}</span>` : ''}</td>
    <td><span class="cell-main"><span class="cat-dot" style="--c:${f.category_color}"></span>${f.violation_name}</span><span class="sub">${f.location_name}</span></td>
    <td>${fmtDate(f.fine_due_date)}${f.fine_status === 'Overdue' ? html`<span class="sub" style="color:var(--red)">+ ${fmtMoney(f.late_fee)} late fee</span>` : ''}</td>
    <td class="num"><b>${fmtMoney(f.total_due)}</b>${Number(f.late_fee) > 0 ? html`<span class="sub">base ${fmtMoney(f.fine_amount)}</span>` : ''}</td>
    <td><span class="badge st-${f.fine_status.toLowerCase()}">${f.fine_status}</span></td>
    <td class="num">${f.fine_status === 'Unpaid' || f.fine_status === 'Overdue' ? html`<button class="btn primary sm" data-pay="${f.fine_id}" data-amt="${f.total_due}" data-ref="${f.reference_no}" data-plate="${f.plate_number}">${icon('fines')} Pay</button>` : ''}</td></tr>`;

  const fineTable = (rows) => html`<div class="table-wrap"><table class="table"><thead><tr><th>Challan</th><th>Vehicle</th><th>Offence</th><th>Due</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(fineRow)}</tbody></table></div>`;

  async function show() {
    const fresh = body.cloneNode(false); body.replaceWith(fresh); body = fresh; // drop old delegated listeners
    if (tab === 'payments') return showPayments();
    return staff ? showStaffFines() : showLookup();
  }

  // ---------------------------------------------------------------- staff list
  async function showStaffFines() {
    mount(body, html`
      <div class="grid cols-4" id="ftot">${[1, 2, 3, 4].map(() => html`<div class="glass kpi"><div class="skeleton" style="height:84px"></div></div>`)}</div>
      <div class="glass card" style="margin-top:20px">
        <div class="chips"><button class="chip active" data-fs="">All</button>${FSTAT.map((s) => html`<button class="chip" data-fs="${s}">${s}</button>`)}</div>
        <div class="toolbar"><div class="input-icon">${icon('search')}<input class="input" id="f-search" placeholder="Search plate, challan or owner..." value="${q.plate}"></div><span class="result-count" id="fcount"></span></div>
        <div id="flist">${skeletonRows(6)}</div><div class="pagination" id="fpager"></div></div>`);
    if (q.plate) q.search = q.plate;
    on(body, 'click', '[data-fs]', (_e, b) => { q.status = b.dataset.fs; q.page = 1; $$('[data-fs]', body).forEach((x) => x.classList.toggle('active', x === b)); loadStaff(); });
    $('#f-search', body).addEventListener('input', debounce((e) => { q.search = e.target.value.trim(); q.page = 1; loadStaff(); }, 300));
    on(body, 'click', '[data-p]', (_e, b) => { q.page = Number(b.dataset.p); loadStaff(); });
    wireRows(body, loadStaff);
    await loadStaff();
  }

  async function loadStaff() {
    try {
      const r = await api.get('/api/fines', { status: q.status, search: q.search, page: q.page, limit: q.limit });
      if (!alive || tab !== 'fines') return;
      const t = r.totals;
      mount($('#ftot', body), html`
        ${[['Fines on record', t.count, 'receipt', '#00e5ff', ''], ['Outstanding', t.outstanding, 'rupee', '#ffb020', 'money'], ['Collected', t.paid, 'checkCircle', '#00e676', 'money'], ['Overdue', t.overdue_count, 'alert', '#ff3d71', '']].map(([l, v, ic, c, fmt]) => html`
          <div class="glass kpi" style="--kc:${c}" data-tilt><div class="kpi-top"><span class="kpi-label">${l}</span><span class="kpi-icon">${icon(ic)}</span></div><div class="kpi-value" data-count="${v}" ${fmt ? html`data-format="${fmt}"` : ''}>0</div></div>`)}`);
      countUp($('#ftot', body));
      $('#fcount', body).textContent = `${fmtNum(r.total)} fine${r.total === 1 ? '' : 's'}`;
      mount($('#flist', body), r.data.length ? fineTable(r.data) : emptyState('No fines found', 'Fines are issued when a violation is verified.', 'receipt'));
      const cur = r.page; const p = r.pages;
      mount($('#fpager', body), r.total ? html`<span>Page ${cur} of ${p}</span><div class="pager"><button data-p="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>‹</button><button data-p="${cur + 1}" ${cur >= p ? 'disabled' : ''}>›</button></div>` : '');
    } catch (e) { mount($('#flist', body), emptyState('Could not load fines', errorMessage(e), 'alert')); }
  }

  // ---------------------------------------------------------------- citizen lookup (e-challan style)
  function showLookup() {
    mount(body, html`
      <div class="glass electric card lookup-hero">
        ${icon('fines')}<h2>Check &amp; pay challans</h2>
        <p class="muted" style="max-width:520px">Enter a vehicle registration number to see every fine issued against it. Payment is a demonstration gateway.</p>
        <form id="lk" class="stack" style="width:min(520px,100%)"><div class="plate-input"><span>IND</span><input id="lk-plate" placeholder="TN09AB1234" maxlength="14" autocomplete="off" aria-label="Registration number" value="${q.plate}"></div>
          <button class="btn primary lg block" type="submit">${icon('search')} Find fines</button><div class="error-text" id="lk-err" hidden></div></form>
      </div>
      <div id="lk-out" style="margin-top:20px"></div>`);
    $('#lk', body).addEventListener('submit', (e) => { e.preventDefault(); lookup($('#lk-plate', body).value); });
    wireRows(body, () => lookup($('#lk-plate', body).value));
    if (q.plate) lookup(q.plate);
  }

  async function lookup(raw) {
    const err = $('#lk-err', body); err.hidden = true;
    const out = $('#lk-out', body);
    mount(out, html`<div class="glass card">${skeletonRows(3)}</div>`);
    try {
      const r = await api.get('/api/fines', { plate: raw.trim(), limit: 50 });
      const t = r.totals;
      mount(out, html`<div class="glass card">
        <div class="card-head"><div class="row">${plate(r.data[0] ? r.data[0].plate_number : raw.toUpperCase(), 'lg')}</div>
          <div style="text-align:right"><div class="dim" style="font-size:12px;letter-spacing:.1em;text-transform:uppercase">Total outstanding</div><div class="kpi-value" style="font-size:30px" data-count="${t.outstanding}" data-format="money">0</div></div></div>
        ${r.data.length ? fineTable(r.data) : emptyState('No fines on this vehicle', 'Either it has no verified violations or the registration is not in the system.', 'checkCircle')}</div>`);
      countUp(out);
    } catch (e) { mount(out, ''); err.hidden = false; err.textContent = errorMessage(e); }
  }

  function wireRows(root, refresh) {
    on(root, 'click', '[data-pay]', async (e, b) => {
      e.stopPropagation();
      const p = await payFineModal({ fine_id: Number(b.dataset.pay), total_due: Number(b.dataset.amt), reference_no: b.dataset.ref, plate_number: b.dataset.plate });
      if (p) { state.refreshBadges(); refresh(); }
    });
    on(root, 'click', 'tr[data-v]', (e, r) => { if (e.target.closest('[data-pay]')) return; openViolation(Number(r.dataset.v), { onChange: refresh }); });
  }

  // ---------------------------------------------------------------- payments
  async function showPayments() {
    mount(body, html`<div class="glass card">${skeletonRows(6)}</div>`);
    try {
      const r = await api.get('/api/payments', { limit: 50 });
      if (!alive || tab !== 'payments') return;
      const sum = r.data.reduce((a, p) => a + Number(p.amount), 0);
      mount(body, html`<div class="glass card"><div class="card-head"><div><div class="card-title">${icon('receipt')} ${staff ? 'Recent transactions' : 'Your payments'}</div><div class="card-sub">${r.data.length} transaction${r.data.length === 1 ? '' : 's'} · ${fmtMoney(sum)}</div></div></div>
        ${r.data.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Transaction</th><th>Challan</th><th>Vehicle</th><th>Method</th><th>Paid by</th><th>When</th><th class="num">Amount</th></tr></thead><tbody>
        ${r.data.map((p) => html`<tr class="clickable" data-v="${p.violation_id}"><td class="ref">${p.transaction_ref}</td><td class="ref">${p.reference_no}</td><td>${plate(p.plate_number, 'sm')}</td><td><span class="badge plain" style="--c:var(--violet)">${p.method}</span></td><td>${p.paid_by_name || '—'}</td><td>${fmtDateTime(p.paid_at)}</td><td class="num"><b>${fmtMoney(p.amount)}</b></td></tr>`)}</tbody></table></div>`
        : emptyState('No payments yet', 'Paid fines appear here with their transaction reference.', 'receipt')}</div>`);
      on(body, 'click', 'tr[data-v]', (_e, row) => openViolation(Number(row.dataset.v)));
    } catch (e) { mount(body, html`<div class="glass card">${emptyState('Could not load payments', errorMessage(e), 'alert')}</div>`); }
  }

  await show();
  return () => { alive = false; };
}
