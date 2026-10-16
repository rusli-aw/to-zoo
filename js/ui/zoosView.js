/**
 * To-Zoo — your zoos.
 *
 * A person has one personal zoo and any number of shared ones: a flat, a
 * group project, a society. They are all the same thing — an enclosure with
 * animals in it — so this view treats them as one list you switch between
 * rather than as a feature bolted onto Friends.
 *
 * Only one zoo is open at a time. Stepping into a group zoo parks your own
 * list untouched (see enterGroup in store.js) and stepping out restores it,
 * so switching is always safe and never merges anything.
 *
 * The invite link is the only key a group zoo has, which is why the store
 * remembers every zoo you have been in. Forgetting one here removes your
 * copy of the key, not the zoo.
 */

import { forgetZoo, getState, openTasks } from '../store.js';
import { inviteLink, parseInvite } from '../group.js';
import { toast } from './toast.js';
import { confirmDialog } from './dialog.js';
import { ensureName } from './identity.js';
import { avatarMark } from './icons.js';

export function renderZoosView(root, ctx) {
  const state = getState();
  const group = ctx.group;
  const here = state.group;
  const zoos = state.zoos ?? [];

  root.innerHTML = `
    <p class="zoos__lede">
      One zoo is open at a time. Your own list is kept exactly as you left it
      while you are in a shared one.
    </p>

    <ul class="zoo-list">
      ${personalCard(state, here)}
      ${zoos.map((z) => groupCard(z, here, group)).join('')}
    </ul>

    ${zoos.length ? '' : `
      <p class="zoos__empty">
        No shared zoos yet. Start one for your flat, your group project or
        your society, and send the link to whoever should be in it.
      </p>`}

    <section class="zoo-new">
      <h3 class="zoo-new__title">Start a shared zoo</h3>
      <div class="group-zoo__row">
        <label class="visually-hidden" for="zoo-new-name">Name your shared zoo</label>
        <input class="field__input" id="zoo-new-name" type="text"
               placeholder="Name it, e.g. Flat 4" maxlength="40"
               data-group-name data-keep-focus="zoo-name">
        <button class="btn btn--primary" type="button" data-group-create>Start a zoo</button>
      </div>

      <h3 class="zoo-new__title">Join one</h3>
      <div class="group-zoo__row">
        <label class="visually-hidden" for="zoo-join-link">Paste an invite link</label>
        <input class="field__input" id="zoo-join-link" type="text"
               placeholder="Paste an invite link"
               data-group-link data-keep-focus="zoo-link">
        <button class="btn" type="button" data-group-join>Join</button>
      </div>
      ${group?.cloud ? '' : `
        <p class="group-zoo__note">
          Local test mode: shared zoos sync between tabs of this browser until
          Supabase is connected.
        </p>`}
    </section>`;

  wire(root, ctx);
}

/* ---------------------------------------------------------------- cards -- */

function personalCard(state, here) {
  const active = !here;
  // While you are in a group zoo your own tasks are parked in personalTasks.
  const mine = active ? openTasks(state) : (state.personalTasks ?? []).filter((t) => !t.completed);
  return `
    <li class="zoo-card${active ? ' is-active' : ''}">
      <span class="zoo-card__mark" aria-hidden="true">${avatarMark(state.user.name, state.user.avatar)}</span>
      <div class="zoo-card__body">
        <h3 class="zoo-card__name">My zoo</h3>
        <p class="zoo-card__meta">${count(mine.length)} &middot; just yours</p>
      </div>
      ${active
    ? '<span class="tag tag--on">Open</span>'
    : '<button class="btn btn--sm" type="button" data-open-personal>Open</button>'}
    </li>`;
}

function groupCard(zoo, here, group) {
  const active = here?.id === zoo.id;
  const people = active ? (group?.people ?? []) : [];
  return `
    <li class="zoo-card${active ? ' is-active' : ''}" data-zoo="${attr(zoo.id)}">
      <span class="zoo-card__mark zoo-card__mark--group" aria-hidden="true">${peopleMark()}</span>
      <div class="zoo-card__body">
        <h3 class="zoo-card__name">${esc(zoo.name)}</h3>
        <p class="zoo-card__meta">
          ${active ? `shared &middot; ${hereNow(people.length)}` : 'shared zoo'}
        </p>
        ${active && people.length ? `
          <ul class="zoo-card__people" aria-label="Here now">
            ${people.map((p) => `
              <li><span class="zoo-card__avatar">${avatarMark(p.name, p.avatar)}</span>${esc(p.name || 'Someone')}</li>`).join('')}
          </ul>` : ''}
      </div>
      <div class="zoo-card__actions">
        ${active
    ? '<span class="tag tag--on">Open</span>'
    : `<button class="btn btn--sm btn--primary" type="button" data-open-zoo="${attr(zoo.id)}">Open</button>`}
        <button class="icon-btn icon-btn--sm" type="button" data-copy-zoo="${attr(zoo.id)}"
                aria-label="Copy the invite link for ${attr(zoo.name)}" title="Copy invite link">&#128279;</button>
        <button class="icon-btn icon-btn--sm" type="button" data-forget-zoo="${attr(zoo.id)}"
                aria-label="Remove ${attr(zoo.name)} from your list" title="Remove from my list">&times;</button>
      </div>
    </li>`;
}

const count = (n) => (n === 1 ? '1 animal' : `${n} animals`);

// You are in the zoo whether or not presence has reported back yet, so one
// and zero both mean the same thing to a reader.
const hereNow = (n) => (n <= 1 ? 'just you here now' : `${n} here now`);

const peopleMark = () => `
  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
       stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`;

/* ---------------------------------------------------------------- wiring -- */

function wire(root, ctx) {
  const group = ctx.group;
  const done = () => { ctx.syncWorld(); ctx.views.render(); };
  const oops = (err) => toast({
    title: 'Could not reach that zoo',
    note: String(err?.message ?? err),
  });

  root.querySelector('[data-open-personal]')?.addEventListener('click', () => {
    group?.leave();
    toast({ title: 'Back in your own zoo' });
    done();
  });

  for (const button of root.querySelectorAll('[data-open-zoo]')) {
    button.addEventListener('click', async () => {
      if (!group) return;
      if (!(await ensureName())) return;
      button.disabled = true;
      try {
        const zoo = await group.join(button.dataset.openZoo);
        if (!zoo) {
          toast({ title: 'That zoo is not there any more', note: 'Someone may have deleted it.' });
          button.disabled = false;
          return;
        }
        toast({ title: `You're in ${zoo.name}` });
        done();
      } catch (err) { button.disabled = false; oops(err); }
    });
  }

  for (const button of root.querySelectorAll('[data-copy-zoo]')) {
    button.addEventListener('click', () => {
      const link = inviteLink(button.dataset.copyZoo);
      navigator.clipboard?.writeText(link).then(
        () => toast({ title: 'Invite link copied' }),
        () => toast({ title: 'Invite link', note: link }),
      );
    });
  }

  for (const button of root.querySelectorAll('[data-forget-zoo]')) {
    button.addEventListener('click', async () => {
      const id = button.dataset.forgetZoo;
      const zoo = (getState().zoos ?? []).find((z) => z.id === id);
      const ok = await confirmDialog({
        title: `Remove ${zoo?.name ?? 'this zoo'}?`,
        body: 'It stays open for everyone else, and the invite link still works. '
          + 'This only takes it off your list.',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      if (getState().group?.id === id) group?.leave();
      forgetZoo(id);
      done();
    });
  }

  root.querySelector('[data-group-create]')?.addEventListener('click', async () => {
    if (!group) return;
    if (!(await ensureName())) return;
    const field = root.querySelector('[data-group-name]');
    const name = field.value.trim() || 'Our zoo';
    try {
      const id = await group.create(name);
      navigator.clipboard?.writeText(inviteLink(id)).catch(() => {});
      toast({ title: `${name} is open`, note: 'Invite link copied. Send it to whoever should join.' });
      done();
    } catch (err) { oops(err); }
  });

  root.querySelector('[data-group-join]')?.addEventListener('click', async () => {
    if (!group) return;
    const id = parseInvite(root.querySelector('[data-group-link]').value);
    if (!id) { toast({ title: 'That doesn’t look like an invite link' }); return; }
    if (!(await ensureName())) return;
    try {
      const zoo = await group.join(id);
      if (!zoo) { toast({ title: 'No zoo at that link' }); return; }
      toast({ title: `Joined ${zoo.name}` });
      done();
    } catch (err) { oops(err); }
  });
}

/* ----------------------------------------------------------------- bits -- */

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const attr = esc;
