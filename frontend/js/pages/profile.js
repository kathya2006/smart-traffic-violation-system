import { api } from '../api.js';
import { html, mount, $, icon, initials, fmtDateTime, toast, withBusy, errorMessage } from '../ui.js';
import { state } from '../state.js';

const PERMS = {
  citizen: ['Report violations with evidence', 'Track the status of your reports', 'Look up and pay fines by registration number', 'Appeal a violation you believe is wrong'],
  officer: ['Review the queue and verify or reject reports', 'Issue fines automatically on verification', 'Decide appeals', 'View statistics, registry and database health'],
  admin: ['Everything an officer can do', 'Waive fines with a recorded reason', 'Delete violations', 'Full audit visibility'],
};

export async function render(el, { user }) {
  const o = user.officer;
  mount(el, html`
    <div class="glass electric card"><div class="profile-hero">
      <span class="avatar xl">${initials(user.name)}</span>
      <div class="grow"><h2 style="font-family:var(--font-head);font-size:26px">${user.name}</h2>
        <div class="row wrap" style="margin-top:8px"><span class="role-pill ${user.role}">${user.role}</span><span class="muted">${user.email}</span></div>
        <div class="dim" style="margin-top:8px">Member since ${fmtDateTime(user.createdAt)} · last sign-in ${fmtDateTime(user.lastLoginAt)}</div></div>
      <button class="btn ghost" id="signout">${icon('logout')} Sign out</button></div></div>

    <div class="grid cols-2">
      <form class="glass card stack" id="pf" novalidate>
        <div class="card-title">${icon('user')} Personal details</div>
        <div class="field"><label class="label" for="p-name">Full name</label><input class="input" id="p-name" value="${user.name}" maxlength="120"></div>
        <div class="field"><label class="label" for="p-email">Email</label><input class="input" id="p-email" value="${user.email}" disabled></div>
        <div class="field"><label class="label" for="p-phone">Phone</label><input class="input" id="p-phone" value="${user.phone || ''}" maxlength="15" placeholder="10-digit mobile number"></div>
        ${o ? html`<div class="panel"><h4>${icon('siren')} Officer</h4><dl class="kv">${Object.entries(o).map(([k, v]) => html`<dt style="text-transform:capitalize">${k.replace(/_/g, ' ')}</dt><dd>${v ?? '—'}</dd>`)}</dl></div>` : ''}
        <div class="error-text" id="pf-err" hidden></div>
        <button class="btn primary" type="submit" id="pf-save">${icon('check')} Save changes</button>
      </form>

      <div class="stack">
        <form class="glass card stack" id="pw" novalidate>
          <div class="card-title">${icon('key')} Change password</div>
          <div class="field"><label class="label" for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label class="label" for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password"><span class="hint">At least 8 characters with a letter and a number.</span></div>
          <div class="error-text" id="pw-err" hidden></div>
          <button class="btn ghost" type="submit" id="pw-save">${icon('shield')} Update password</button>
        </form>
        <div class="glass card"><div class="card-title" style="margin-bottom:14px">${icon('shield')} What you can do</div>
          <div class="stack" style="gap:10px">${PERMS[user.role].map((p) => html`<div class="row" style="gap:10px;align-items:flex-start"><span style="color:var(--green)">${icon('checkCircle')}</span><span>${p}</span></div>`)}</div></div>
      </div>
    </div>`);

  $('#signout', el).addEventListener('click', () => document.dispatchEvent(new Event('stvrs:logout')));

  $('#pf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pf-err', el); err.hidden = true;
    await withBusy($('#pf-save', el), async () => {
      try {
        const { user: u } = await api.patch('/api/auth/me', { full_name: $('#p-name', el).value.trim(), phone: $('#p-phone', el).value.trim() });
        Object.assign(state.user, u);
        const who = document.querySelector('.user-chip .who b'); if (who) who.textContent = u.name;
        const av = document.querySelector('.user-chip .avatar'); if (av) av.textContent = initials(u.name);
        toast('Your profile has been updated.', 'success', 'Saved');
      } catch (x) { err.hidden = false; err.textContent = errorMessage(x); }
    });
  });

  $('#pw', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pw-err', el); err.hidden = true;
    await withBusy($('#pw-save', el), async () => {
      try {
        await api.post('/api/auth/change-password', { current_password: $('#pw-cur', el).value, new_password: $('#pw-new', el).value });
        $('#pw-cur', el).value = ''; $('#pw-new', el).value = '';
        toast('Your password has been changed.', 'success', 'Password updated');
      } catch (x) { err.hidden = false; err.textContent = errorMessage(x); }
    });
  });
}
