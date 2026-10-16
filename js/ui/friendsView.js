/**
 * To-Zoo — friends.
 *
 * The brief asked for comparison without stress, which mostly comes down to
 * what you choose to say about a difference. Every comparison here is written
 * to be true and kind at the same time: if a friend is ahead it is phrased as
 * something to notice, not something you are losing at, and a friend who is
 * behind is never described as behind.
 *
 * Friends are seeded mock data. Sharing is real: it encodes counts — never
 * task titles — into a link, so a shared zoo gives nothing away.
 */

import { doneTasks, getState, mood as zooMoodOf, readShareCode, shareCode } from '../store.js';
import { FRIENDS } from '../data/seed.js';
import { toast } from './toast.js';
import { openDialog } from './dialog.js';
import { avatarMark, friendMark } from './icons.js';
import { inviteLink, parseInvite } from '../group.js';
import { ensureName } from './identity.js';

export function renderFriendsView(root, ctx) {
  const state = getState();
  const me = {
    name: state.user.name,
    avatar: state.user.avatar,
    completed: doneTasks(state).length,
    released: state.user.released,
    tokens: state.user.tokens,
    health: zooMoodOf(state),
    streak: state.user.streak,
  };

  // Anyone who arrived by a share link sits at the top of the list.
  const shared = readSharedFromUrl();
  const friends = shared ? [shared, ...FRIENDS] : FRIENDS;

  root.innerHTML = `
    ${groupSection(state, ctx.group)}

    <div class="me-card">
      <span class="me-card__avatar" aria-hidden="true">${avatarMark(me.name, me.avatar)}</span>
      <div class="me-card__body">
        <h3 class="me-card__name">Your zoo</h3>
        <p class="me-card__stats">
          <span><b>${me.released}</b> released</span>
          <span><b>${me.health}%</b> mood</span>
          <span><b>${me.streak}</b>-day streak</span>
        </p>
      </div>
      <button class="btn btn--primary btn--sm" type="button" data-share>Share</button>
    </div>

    <ul class="friend-list">
      ${friends.map((f) => friendCard(f, me)).join('')}
    </ul>

    <p class="friends-foot">
      These friends are sample data for the prototype. Sharing produces a real
      link that carries only your counts — never your task titles.
    </p>`;

  root.querySelector('[data-share]').addEventListener('click', () => openShare(me, ctx));
  wireGroup(root, ctx);
}

/* ----------------------------------------------------------- group zoo -- */

function groupSection(state, group) {
  if (!group) return '';
  const g = state.group;
  if (!g) {
    return `
      <section class="group-zoo">
        <h3 class="group-zoo__title">Group zoo</h3>
        <p class="group-zoo__lede">One zoo for your flat, study group or team. Everyone adds tasks; anyone can send an animal home.</p>
        <div class="group-zoo__row">
          <input class="field__input" type="text" placeholder="Name it, e.g. Flat 4" maxlength="40" data-group-name>
          <button class="btn btn--primary" type="button" data-group-create>Start a group zoo</button>
        </div>
        <div class="group-zoo__row">
          <input class="field__input" type="text" placeholder="Paste an invite link" data-group-link>
          <button class="btn" type="button" data-group-join>Join</button>
        </div>
        ${group.cloud ? '' : '<p class="group-zoo__note">Local test mode: syncs between tabs of this browser until Supabase is connected.</p>'}
      </section>`;
  }
  const people = group.people;
  return `
    <section class="group-zoo is-in">
      <div class="group-zoo__head">
        <div>
          <p class="group-zoo__kicker">You're in a group zoo</p>
          <h3 class="group-zoo__title">${escapeHtml(g.name)}</h3>
        </div>
        <button class="btn btn--sm" type="button" data-group-leave>Back to my zoo</button>
      </div>
      <div class="group-zoo__row">
        <input class="field__input" type="text" readonly value="${escapeHtml(inviteLink(g.id))}" data-group-invite>
        <button class="btn btn--primary" type="button" data-group-copy>Copy invite link</button>
      </div>
      <ul class="group-zoo__people" aria-label="Here now">
        ${people.map((p) => `
          <li class="group-zoo__person"><span class="group-zoo__avatar">${avatarMark(p.name, p.avatar)}</span>${escapeHtml(p.name || 'Someone')}</li>`).join('')}
      </ul>
      ${group.cloud ? '' : '<p class="group-zoo__note">Local test mode: open the invite link in another tab to see it sync.</p>'}
    </section>`;
}

function wireGroup(root, ctx) {
  const group = ctx.group;
  if (!group) return;
  const done = () => { ctx.syncWorld(); ctx.views.render(); };
  const oops = (err) => toast({ title: 'Could not reach the group zoo', note: String(err?.message ?? err) });

  root.querySelector('[data-group-create]')?.addEventListener('click', async () => {
    if (!(await ensureName())) return;
    const name = root.querySelector('[data-group-name]').value.trim() || 'Our zoo';
    try {
      const id = await group.create(name);
      navigator.clipboard?.writeText(inviteLink(id)).catch(() => {});
      toast({ title: `${name} is open`, note: 'Invite link copied. Send it to whoever should join.' });
      done();
    } catch (err) { oops(err); }
  });

  root.querySelector('[data-group-join]')?.addEventListener('click', async () => {
    const id = parseInvite(root.querySelector('[data-group-link]').value);
    if (!id) { toast({ title: 'That doesn\u2019t look like an invite link' }); return; }
    if (!(await ensureName())) return;
    try {
      const zoo = await group.join(id);
      if (!zoo) { toast({ title: 'No group zoo at that link' }); return; }
      toast({ title: `Joined ${zoo.name}` });
      done();
    } catch (err) { oops(err); }
  });

  root.querySelector('[data-group-copy]')?.addEventListener('click', () => {
    const input = root.querySelector('[data-group-invite]');
    navigator.clipboard?.writeText(input.value).then(
      () => toast({ title: 'Invite link copied' }),
      () => { input.select(); },
    );
  });

  root.querySelector('[data-group-leave]')?.addEventListener('click', () => {
    group.leave();
    toast({ title: 'Back in your own zoo' });
    done();
  });
}


/* --------------------------------------------------------------- cards -- */

function friendCard(friend, me) {
  return `
    <li class="friend-card">
      <span class="friend-card__avatar" aria-hidden="true">${friendMark(friend.name)}</span>
      <div class="friend-card__body">
        <h3 class="friend-card__name">
          ${escapeHtml(friend.name)}${friend.shared ? ' <span class="tag">shared</span>' : ''}
        </h3>
        <p class="friend-card__line">${escapeHtml(friend.lastActive ?? 'Shared their zoo with you')}</p>
        <dl class="friend-card__stats">
          <div><dt>Released</dt><dd>${friend.released}</dd></div>
          <div><dt>Tokens</dt><dd>${friend.tokens}</dd></div>
          <div><dt>Mood</dt><dd>${friend.health}%</dd></div>
          <div><dt>Streak</dt><dd>${friend.streak}d</dd></div>
        </dl>
        <p class="friend-card__compare">${compare(friend, me)}</p>
      </div>
    </li>`;
}

/**
 * One line comparing two zoos. Always phrased from a standing start rather
 * than as a ranking — "you have released 3 more this week" and "Alex's zoo is
 * a little tidier right now" are both observations you can act on without
 * feeling told off.
 */
function compare(friend, me) {
  const releasedGap = me.released - friend.released;
  const healthGap = me.health - friend.health;

  if (releasedGap >= 3) return `You have released ${releasedGap} more animals than ${first(friend.name)}.`;
  if (releasedGap <= -3) return `${first(friend.name)} has been busy — ${Math.abs(releasedGap)} more releases.`;
  if (healthGap <= -12) return `${first(friend.name)}'s animals are a little happier right now.`;
  if (healthGap >= 12) return `Your animals are in better spirits at the moment.`;
  if (friend.streak > me.streak + 2) return `${first(friend.name)} is on a ${friend.streak}-day streak.`;
  if (me.streak > friend.streak + 2) return `You are ahead on streak — ${me.streak} days.`;
  return `You two are keeping a similar pace.`;
}

const first = (name) => String(name).split(' ')[0];

/* --------------------------------------------------------------- share -- */

function openShare(me, ctx) {
  const url = `${location.origin}${location.pathname}#zoo=${shareCode()}`;

  openDialog({
    title: 'Share your zoo',
    subtitle: 'Counts only — no task titles travel with the link.',
    body: `
      <div class="share">
        <div class="share-card" id="share-card">
          <span class="share-card__avatar">${avatarMark(me.name, me.avatar)}</span>
          <b class="share-card__name">${escapeHtml(me.name)}'s zoo</b>
          <dl class="share-card__stats">
            <div><dt>Released</dt><dd>${me.released}</dd></div>
            <div><dt>Mood</dt><dd>${me.health}%</dd></div>
            <div><dt>Streak</dt><dd>${me.streak}d</dd></div>
            <div><dt>Tokens</dt><dd>${me.tokens}</dd></div>
          </dl>
        </div>
        <label class="field">
          <span class="field__label">Link</span>
          <input class="field__input" type="text" readonly value="${escapeAttr(url)}"
                 data-link data-autofocus>
        </label>
        <div class="dialog-actions">
          <button class="btn btn--quiet" type="button" data-snapshot>Save a picture</button>
          <button class="btn btn--primary" type="button" data-copy>Copy link</button>
        </div>
      </div>`,

    setup(panel, close) {
      const input = panel.querySelector('[data-link]');
      input.addEventListener('focus', () => input.select());

      panel.querySelector('[data-copy]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: 'Link copied', duration: 2200 });
        } catch {
          // Clipboard is blocked on insecure origins and in some browsers —
          // selecting the text is a fair fallback rather than a dead button.
          input.select();
          toast({ title: 'Press Ctrl/Cmd + C to copy', duration: 3200 });
        }
        close();
      });

      panel.querySelector('[data-snapshot]').addEventListener('click', () => {
        saveSnapshot(me, ctx);
        close();
      });
    },
  });
}

/**
 * Composite the live 3D canvas with a stats strip and hand the user a PNG.
 * Drawn at the canvas's own resolution so it is worth posting.
 */
function saveSnapshot(me, ctx) {
  const source = ctx.zoo.renderer.domElement;
  // Force a render first: with `preserveDrawingBuffer` off, the buffer is
  // undefined after compositing, and we would export a blank image.
  ctx.zoo.renderer.render(ctx.zoo.scene, ctx.zoo.camera);

  const width = source.width;
  const strip = Math.round(width * 0.14);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = source.height + strip;

  const g = canvas.getContext('2d');
  const styles = getComputedStyle(document.documentElement);
  const paper = styles.getPropertyValue('--surface').trim();
  const ink = styles.getPropertyValue('--ink').trim();
  const muted = styles.getPropertyValue('--ink-muted').trim();

  g.fillStyle = paper;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(source, 0, 0);

  const pad = strip * 0.32;
  g.fillStyle = ink;
  g.font = `600 ${strip * 0.4}px "Fraunces", Georgia, serif`;
  g.textBaseline = 'middle';
  g.fillText(`${me.name}'s zoo`, pad, source.height + strip / 2);

  g.fillStyle = muted;
  g.font = `500 ${strip * 0.3}px "Outfit", system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText(
    `${me.released} released · ${me.health}% mood · ${me.streak}-day streak`,
    width - pad,
    source.height + strip / 2,
  );

  canvas.toBlob((blob) => {
    if (!blob) {
      toast({ title: 'Could not make the picture', tone: 'warn' });
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'my-to-zoo.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast({ title: 'Snapshot saved', duration: 2400 });
  }, 'image/png');
}

function readSharedFromUrl() {
  const match = location.hash.match(/zoo=([A-Za-z0-9_-]+)/);
  return match ? readShareCode(match[1]) : null;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;
