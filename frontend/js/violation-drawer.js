// Shared violation detail drawer + the action modals used across pages (pay, appeal, review).
import { api, fileUrl } from './api.js';
import {
  html, raw, mount, $, $$, on, icon, plate, statusBadge, priorityBadge, fmtMoney, fmtDateTime, fmtDate, timeAgo,
  openDrawer, openModal, openLightbox, promptText, confirmDialog, toast, withBusy, errorMessage, categoryIcon, countUp,
} from './ui.js';
import { state } from './state.js';
import { strike } from './fx.js';

const STATUS_COLOR = { Pending: '#ffb020', 'Under Review': '#4d7cff', Verified: '#00e5ff', Rejected: '#ff3d71', Appealed: '#8b5cff', Closed: '#00e676' };
const STATUS_BTN = { 'Under Review': ['ghost', 'eye'], Verified: ['success', 'checkCircle'], Rejected: ['danger', 'x'], Closed: ['ghost', 'check'] };
const METHODS = [['UPI', 'phone'], ['Card', 'fines'], ['NetBanking', 'database'], ['Cash', 'rupee']];

/** Pay-fine modal. Resolves with the payment (or null if cancelled). */
export function payFineModal({ fine_id, total_due, reference_no, plate_number }) {
  return new Promise((resolve) => {
    let method = 'UPI'; let done = false;
    const m = openModal({
      title: 'Pay fine', icon: 'fines',
      lead: `${reference_no}${plate_number ? ' · ' + plate_number : ''}`,
      body: html`
        <div class="panel" style="text-align:center"><div class="dim" style="font-size:12px;letter-spacing:.1em;text-transform:uppercase">Amount payable</div><div class="fine-total">${fmtMoney(total_due)}</div></div>
        <div class="field" style="margin-top:16px"><label class="label">Payment method</label>
          <div class="method-grid">${METHODS.map(([k, ic]) => html`<button type="button" class="method ${k === 'UPI' ? 'active' : ''}" data-m="${k}">${icon(ic)}${k === 'NetBanking' ? 'Net Banking' : k}</button>`)}</div></div>
        <p class="hint" style="margin-top:12px">This is a demonstration gateway: no real money moves. Paying records a transaction, marks the fine as paid and closes the violation through a database trigger.</p>`,
      onClose: () => { if (!done) resolve(null); },
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: (c) => c() },
        { label: `Pay ${fmtMoney(total_due)}`, cls: 'success', onClick: async (close, btn) => {
          await withBusy(btn, async () => {
            try {
              const { payment } = await api.post(`/api/fines/${fine_id}/pay`, { method });
              done = true; strike(); toast(`Transaction ${payment.transaction_ref}`, 'success', 'Payment successful');
              close(); resolve(payment);
            } catch (e) { toast(errorMessage(e), 'error'); }
          });
        } },
      ],
    });
    on(m.el, 'click', '[data-m]', (_e, b) => { method = b.dataset.m; $$('[data-m]', m.el).forEach((x) => x.classList.toggle('active', x === b)); });
  });
}

/** Citizen files an appeal. Resolves true when filed. */
export async function appealModal({ violation_id, reference_no }) {
  const reason = await promptText({
    title: 'Appeal this violation', icon: 'appeals', lead: `${reference_no}: explain why you believe it was issued in error. An officer will review it.`,
    label: 'Reason for appeal', placeholder: 'Describe what happened and attach any context the officer should know...', min: 15, confirm: 'Submit appeal',
  });
  if (!reason) return false;
  try { await api.post('/api/appeals', { violation_id, reason }); toast('Your appeal has been submitted for review.', 'success', 'Appeal filed'); return true; } catch (e) { toast(errorMessage(e), 'error'); return false; }
}

/** Officer decides an appeal. Resolves true when saved. */
export function reviewAppealModal(appeal) {
  return new Promise((resolve) => {
    let decision = appeal.status === 'Submitted' ? 'Under Review' : 'Accepted'; let done = false;
    const opts = [['Under Review', 'Take up for review', 'eye'], ['Accepted', 'Accept appeal', 'checkCircle'], ['Rejected', 'Reject appeal', 'x']];
    const m = openModal({
      title: 'Review appeal', icon: 'gavel', lead: `${appeal.reference_no} · ${appeal.plate_number}`,
      body: html`
        <div class="appeal-box"><b>${appeal.filed_by_name} wrote:</b><span>${appeal.reason}</span></div>
        <div class="field" style="margin-top:16px"><label class="label">Decision</label>
          <div class="method-grid" style="grid-template-columns:repeat(3,1fr)">${opts.map(([k, l, ic]) => html`<button type="button" class="method ${k === decision ? 'active' : ''}" data-d="${k}">${icon(ic)}${l}</button>`)}</div></div>
        <div class="field" style="margin-top:14px"><label class="label">Notes ${raw('<span class="dim">(required for accept / reject)</span>')}</label><textarea class="textarea" id="rv-notes" rows="3" placeholder="Visible to the appellant"></textarea><span class="error-text" id="rv-err" hidden></span></div>
        <p class="hint" style="margin-top:10px">Accepting rejects the violation and waives the fine. Rejecting restores it to Verified.</p>`,
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: (c) => c() },
        { label: 'Save decision', cls: 'primary', onClick: async (close, btn, box) => {
          const notes = $('#rv-notes', box).value.trim(); const err = $('#rv-err', box);
          if (decision !== 'Under Review' && notes.length < 5) { err.hidden = false; err.textContent = 'Please add a short note (min 5 characters).'; return; }
          await withBusy(btn, async () => {
            try { await api.patch(`/api/appeals/${appeal.appeal_id}/review`, { decision, notes }); done = true; toast(`Appeal marked ${decision}.`, 'success'); close(); resolve(true); } catch (e) { toast(errorMessage(e), 'error'); }
          });
        } },
      ],
    });
    on(m.el, 'click', '[data-d]', (_e, b) => { decision = b.dataset.d; $$('[data-d]', m.el).forEach((x) => x.classList.toggle('active', x === b)); });
  });
}

/** Opens the detail drawer. onChange() is called after any mutation so the caller can refresh its list. */
export async function openViolation(id, { onChange } = {}) {
  let changed = false;
  const dr = openDrawer({ onClose: () => { if (changed && onChange) onChange(); state.refreshBadges(); } });
  mount(dr.head, html`<div class="skeleton" style="height:56px;width:100%"></div>`);
  mount(dr.body, html`<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:140px"></div>`);

  async function load() {
    let d;
    try { d = await api.get(`/api/violations/${id}`); } catch (e) {
      mount(dr.head, html`<div class="vd-title"><h2>Unable to load</h2></div><button class="icon-btn" data-close>${icon('x')}</button>`);
      mount(dr.body, html`<div class="empty">${icon('alert')}<b>${errorMessage(e)}</b></div>`);
      return;
    }
    render(d);
  }

  function render({ violation: v, evidence, history, payments, appeals, vehicleSummary: vs, actions: a }) {
    const staff = state.user.role !== 'citizen';
    const color = v.category_color || '#00e5ff';
    mount(dr.head, html`
      <div class="vd-title">
        <span class="vd-ref">${v.reference_no}</span>
        <h2>${v.violation_name}</h2>
        <div class="vd-badges">${statusBadge(v.status)}${priorityBadge(v.priority)}<span class="badge plain" style="--c:${color}"><span class="cat-dot" style="--c:${color};margin:0 4px 0 0"></span>${v.category_name}</span></div>
      </div>
      <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>`);

    const fine = v.fine_id ? html`
      <div class="panel fine-card"><h4>${icon('fines')} Fine</h4>
        <div class="fine-total ${v.fine_status === 'Paid' ? 'paid' : v.fine_status === 'Overdue' ? 'overdue' : ''}">${fmtMoney(v.total_due)}</div>
        <dl class="kv">
          <dt>Status</dt><dd><span class="badge st-${(v.fine_status || '').toLowerCase()}">${v.fine_status}</span></dd>
          <dt>Base fine</dt><dd>${fmtMoney(v.fine_amount)}</dd>
          ${Number(v.late_fee) > 0 ? html`<dt>Late fee</dt><dd style="color:var(--red)">+ ${fmtMoney(v.late_fee)}</dd>` : ''}
          <dt>${v.fine_status === 'Paid' ? 'Paid on' : 'Due date'}</dt><dd>${fmtDate(v.fine_status === 'Paid' ? v.fine_paid_at : v.fine_due_date)}</dd>
        </dl>
      </div>` : html`<div class="panel"><h4>${icon('fines')} Fine</h4><span class="muted">${v.status === 'Rejected' ? 'No fine: this violation was rejected.' : 'A fine is issued automatically once the violation is verified.'}</span></div>`;

    mount(dr.body, html`
      <div class="panel"><h4>${icon('vehicle')} Vehicle</h4>
        <div class="row" style="margin-bottom:12px">${plate(v.plate_number, 'lg')}</div>
        <dl class="kv">
          <dt>Vehicle</dt><dd>${[v.make, v.model, v.color].filter(Boolean).join(' · ') || '—'} <span class="dim">(${v.vehicle_type})</span></dd>
          <dt>Owner</dt><dd>${v.owner_name || 'Unregistered'}${staff && v.owner_phone ? html` <span class="dim">· ${v.owner_phone}</span>` : ''}</dd>
          ${vs ? html`<dt>History</dt><dd>${vs.total_violations} violations · ${vs.penalty_points} penalty pts · ${fmtMoney(vs.outstanding)} outstanding</dd>` : ''}
        </dl>
      </div>

      <div class="panel"><h4>${icon('flag')} Offence</h4>
        <dl class="kv">
          <dt>Occurred</dt><dd>${fmtDateTime(v.occurred_at)}</dd>
          <dt>Location</dt><dd>${v.location_name}<span class="dim"> · ${v.area}, ${v.city} (${v.zone})</span></dd>
          ${v.recorded_speed ? html`<dt>Speed</dt><dd><b style="color:var(--red)">${v.recorded_speed} km/h</b> in a ${v.speed_limit_kmph} km/h zone</dd>` : ''}
          <dt>Section</dt><dd>${(state.meta.violationTypes.find((t) => t.id === v.violation_type_id) || {}).law_reference || '—'}</dd>
          <dt>Penalty pts</dt><dd>${v.penalty_points}</dd>
          <dt>Source</dt><dd>${v.source}</dd>
          <dt>Reported by</dt><dd>${v.reported_by_name || '—'}</dd>
          <dt>Officer</dt><dd>${v.officer_name ? html`${v.officer_name} <span class="dim">(${v.badge_number})</span>` : html`<span class="dim">Not assigned</span>`}</dd>
        </dl>
        <p style="margin-top:12px;color:var(--ink-2);font-size:14px">${v.description}</p>
      </div>

      <div class="panel"><h4>${icon('camera')} Evidence <span class="dim" style="text-transform:none;letter-spacing:0">(${evidence.length})</span></h4>
        ${evidence.length ? html`<div class="evidence-grid">${evidence.map((e) => html`<div class="thumb" data-ev="${e.file_path}" data-mime="${e.mime_type}" title="${e.file_name}">${e.mime_type.startsWith('video') ? html`<video src="${fileUrl(e.file_path)}" muted preload="metadata"></video>` : html`<img src="${fileUrl(e.file_path)}" alt="Evidence ${e.file_name}" loading="lazy">`}</div>`)}</div>` : html`<span class="muted">No evidence attached.</span>`}
        ${a.canUploadEvidence ? html`<div style="margin-top:12px"><input type="file" id="ev-file" accept="image/*,video/mp4,video/webm" multiple hidden><button class="btn ghost sm" id="ev-add">${icon('upload')} Add evidence</button></div>` : ''}
      </div>

      ${fine}

      ${payments.length ? html`<div class="panel"><h4>${icon('receipt')} Payments</h4>${payments.map((p) => html`<dl class="kv"><dt>Transaction</dt><dd class="mono">${p.transaction_ref}</dd><dt>Amount</dt><dd>${fmtMoney(p.amount)} via ${p.method}</dd><dt>Paid</dt><dd>${fmtDateTime(p.paid_at)} by ${p.paid_by_name || '—'}</dd></dl>`)}</div>` : ''}

      ${appeals.length ? html`<div class="panel"><h4>${icon('appeals')} Appeals</h4><div class="stack">${appeals.map((ap) => html`
        <div class="appeal-box"><div class="row between"><b>${ap.filed_by_name}</b><span class="badge st-${ap.status.toLowerCase().replace(/ /g, '-')}">${ap.status}</span></div><span>${ap.reason}</span><small class="dim">Filed ${timeAgo(ap.filed_at)}</small>
        ${ap.review_notes ? html`<span style="border-top:1px dashed var(--stroke);padding-top:6px"><b>${ap.reviewed_by_name || 'Officer'}:</b> ${ap.review_notes}</span>` : ''}
        ${a.canReviewAppeal && (ap.status === 'Submitted' || ap.status === 'Under Review') ? html`<div><button class="btn primary sm" data-review="${ap.appeal_id}">${icon('gavel')} Review</button></div>` : ''}</div>`)}</div></div>` : ''}

      <div class="panel"><h4>${icon('clock')} Audit trail <span class="dim" style="text-transform:none;letter-spacing:0">written by a database trigger</span></h4>
        <div class="timeline">${history.map((h, i) => html`
          <div class="tl-item ${i === history.length - 1 ? 'last' : ''}" style="--c:${STATUS_COLOR[h.new_status] || '#00e5ff'}">
            <div class="tl-title">${h.old_status ? html`<span class="dim">${h.old_status}</span> ${icon('chevron')}` : ''}${statusBadge(h.new_status)}</div>
            <div class="tl-meta">${h.changed_by_name || 'System'}${h.changed_by_role ? ` (${h.changed_by_role})` : ''} · ${fmtDateTime(h.changed_at)}</div>
            ${h.remarks ? html`<div class="tl-note">${h.remarks}</div>` : ''}
          </div>`)}</div></div>`);

    // footer actions
    const btns = [];
    (a.nextStatuses || []).forEach((s) => { const [cls, ic] = STATUS_BTN[s] || ['ghost', 'check']; btns.push(html`<button class="btn ${cls}" data-status="${s}">${icon(ic)} ${s === 'Under Review' ? 'Start review' : s === 'Verified' ? 'Verify & issue fine' : s === 'Rejected' ? 'Reject' : 'Mark ' + s}</button>`); });
    if (a.canPay) btns.push(html`<button class="btn primary" data-pay>${icon('fines')} Pay ${fmtMoney(v.total_due)}</button>`);
    if (a.canAppeal) btns.push(html`<button class="btn ghost" data-appeal>${icon('appeals')} Appeal</button>`);
    if (a.canAssign && staff) btns.push(html`<button class="btn ghost" data-assign>${icon('users')} ${v.officer_name ? 'Reassign' : 'Assign'}</button>`);
    if (v.fine_id && state.user.role === 'admin' && !['Paid', 'Waived'].includes(v.fine_status)) btns.push(html`<button class="btn warn" data-waive>${icon('shield')} Waive fine</button>`);
    if (a.canDelete) btns.push(html`<button class="btn danger sm" data-delete style="margin-left:auto">${icon('trash')} Delete</button>`);
    dr.foot.classList.toggle('hide', !btns.length);
    mount(dr.foot, html`${btns}`);
    countUp(dr.body);

    bind(v, a);
  }

  const bound = new WeakSet();
  function bind(v, a) {
    const refresh = async () => { changed = true; await load(); };
    if (!bound.has(dr.el)) {
      bound.add(dr.el);
      on(dr.el, 'click', '[data-ev]', (_e, el) => openLightbox(fileUrl(el.dataset.ev), el.dataset.mime));
    }
    // handlers re-bound each render to the latest violation (cheap; elements were replaced)
    const q = (s) => $(s, dr.el);
    const onc = (sel, fn) => { const el = q(sel); if (el) el.addEventListener('click', () => fn(el)); };

    $$('[data-status]', dr.foot).forEach((btn) => btn.addEventListener('click', async () => {
      const s = btn.dataset.status;
      let remarks = '';
      if (s === 'Rejected') { remarks = await promptText({ title: 'Reject violation', icon: 'x', lead: 'The reporter and owner are notified with your reason. No fine will be issued.', label: 'Reason', placeholder: 'e.g. Plate not visible in the evidence', min: 5, confirm: 'Reject', cls: 'danger' }); if (!remarks) return; }
      else if (s === 'Verified') { if (!(await confirmDialog({ title: 'Verify and issue fine?', lead: `A fine of the standard amount (plus any over-speed surcharge) will be generated by the stored procedure sp_issue_fine and ${v.owner_name || 'the owner'} will be notified.`, confirm: 'Verify', cls: 'success', icon: 'shield' }))) return; remarks = 'Evidence verified, fine issued'; }
      await withBusy(btn, async () => {
        try { await api.patch(`/api/violations/${id}/status`, { status: s, remarks }); if (s === 'Verified') strike(); toast(`Status changed to ${s}.`, 'success'); await refresh(); } catch (e) { toast(errorMessage(e), 'error'); }
      });
    }));

    const pay = $('[data-pay]', dr.foot);
    if (pay) pay.addEventListener('click', async () => { const p = await payFineModal({ fine_id: v.fine_id, total_due: v.total_due, reference_no: v.reference_no, plate_number: v.plate_number }); if (p) await refresh(); });
    const ap = $('[data-appeal]', dr.foot);
    if (ap) ap.addEventListener('click', async () => { if (await appealModal({ violation_id: id, reference_no: v.reference_no })) await refresh(); });
    $$('[data-review]', dr.body).forEach((b) => b.addEventListener('click', async () => {
      const { appeals } = await api.get(`/api/violations/${id}`);
      const found = appeals.find((x) => x.appeal_id === Number(b.dataset.review));
      if (found && (await reviewAppealModal({ ...found, reference_no: v.reference_no, plate_number: v.plate_number }))) await refresh();
    }));
    const as = $('[data-assign]', dr.foot);
    if (as) as.addEventListener('click', () => assignModal(v, refresh));
    const wv = $('[data-waive]', dr.foot);
    if (wv) wv.addEventListener('click', async () => {
      const reason = await promptText({ title: 'Waive fine', icon: 'shield', lead: `${fmtMoney(v.total_due)} will be written off. This is recorded in the audit trail.`, label: 'Reason', min: 5, confirm: 'Waive fine', cls: 'warn' });
      if (!reason) return;
      try { await api.post(`/api/fines/${v.fine_id}/waive`, { reason }); toast('Fine waived.', 'success'); await refresh(); } catch (e) { toast(errorMessage(e), 'error'); }
    });
    const del = $('[data-delete]', dr.foot);
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Delete this violation?', lead: 'This permanently removes the violation with its evidence, fine, payments and history (ON DELETE CASCADE). It cannot be undone.', confirm: 'Delete permanently', cls: 'danger', icon: 'trash' }))) return;
      try { await api.del(`/api/violations/${id}`); changed = true; toast('Violation deleted.', 'success'); dr.close(); } catch (e) { toast(errorMessage(e), 'error'); }
    });

    const add = q('#ev-add'); const file = q('#ev-file');
    if (add && file) {
      add.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        if (!file.files.length) return;
        const fd = new FormData(); [...file.files].slice(0, 4).forEach((f) => fd.append('evidence', f));
        await withBusy(add, async () => { try { await api.upload(`/api/violations/${id}/evidence`, fd); toast('Evidence uploaded.', 'success'); await refresh(); } catch (e) { toast(errorMessage(e), 'error'); } });
      });
    }
  }

  function assignModal(v, refresh) {
    const officers = state.meta.officers || [];
    const m = openModal({
      title: 'Assign officer', icon: 'users', lead: v.reference_no,
      body: html`<div class="field"><label class="label">Officer</label><select class="select" id="as-off">${officers.map((o) => html`<option value="${o.id}" ${o.id === v.assigned_officer_id ? 'selected' : ''}>${o.name} · ${o.station}</option>`)}</select></div>`,
      actions: [
        { label: 'Cancel', cls: 'ghost', onClick: (c) => c() },
        { label: 'Assign', cls: 'primary', onClick: async (close, btn, box) => {
          await withBusy(btn, async () => { try { await api.patch(`/api/violations/${id}/assign`, { officer_id: Number($('#as-off', box).value) }); toast('Officer assigned.', 'success'); close(); await refresh(); } catch (e) { toast(errorMessage(e), 'error'); } });
        } },
      ],
    });
    return m;
  }

  on(dr.el, 'click', '[data-close]', () => dr.close());
  await load();
}
