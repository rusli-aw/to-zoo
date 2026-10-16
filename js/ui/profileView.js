/**
 * To-Zoo — profile, stats and settings.
 *
 * Also where the accessibility and motion controls live. They are settings,
 * not an accessibility ghetto: the same list that holds your name holds the
 * switch that stops the world moving, because both are just preferences.
 */

import {
  ANIMALS, ANIMAL_ORDER, dayKey, DAY, todayStats,
} from '../model.js';
import {
  clearTasks, doneTasks, getState, mood as zooMoodOf, resetEverything,
  setSetting, setUser, loadDemo,
} from '../store.js';
import { confirmDialog } from './dialog.js';
import { toast } from './toast.js';
import { AVATAR_SWATCHES, avatarMark, glyph } from './icons.js';
import { portraitOf } from '../zoo/portraits.js';

const AVATARS = ['default', ...AVATAR_SWATCHES];

/** Unlocked purely by play; each one names the behaviour it rewards. */
function achievements(state) {
  const done = doneTasks(state);
  const byType = { elephant: 0, lion: 0, rabbit: 0 };
  for (const t of done) byType[t.animalType] += 1;

  return [
    { id: 'first', name: 'First release', hint: 'Complete a task', got: done.length >= 1, emoji: '🌱' },
    { id: 'ten', name: 'Zookeeper', hint: 'Release 10 animals', got: done.length >= 10, emoji: '🧺' },
    { id: 'elephant', name: 'Room, cleared', hint: 'Release 3 elephants', got: byType.elephant >= 3, emoji: '🐘' },
    { id: 'streak3', name: 'Three in a row', hint: 'A 3-day streak', got: state.user.streak >= 3, emoji: '🔥' },
    { id: 'streak7', name: 'A good week', hint: 'A 7-day streak', got: state.user.streak >= 7, emoji: '📆' },
    { id: 'pristine', name: 'Pristine', hint: 'Every animal happy at once', got: zooMoodOf(state) >= 100 && done.length > 0, emoji: '✨' },
    { id: 'rich', name: 'Well funded', hint: 'Hold 300 tokens', got: state.user.tokens >= 300, emoji: '🪙' },
    { id: 'decorator', name: 'Decorator', hint: 'Own 5 items', got: Object.keys(state.inventory).length >= 5, emoji: '🌻' },
  ];
}

/** Completions per day for the last fortnight — a small, honest bar chart. */
function recentActivity(state) {
  const done = doneTasks(state);
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const key = dayKey(Date.now() - i * DAY);
    days.push({
      key,
      count: done.filter((t) => t.completedAt && dayKey(t.completedAt) === key).length,
      label: new Date(Date.now() - i * DAY).toLocaleDateString(undefined, { weekday: 'short' }),
    });
  }
  return days;
}

export function renderProfileView(root, ctx) {
  const state = getState();
  const done = doneTasks(state);
  const stats = todayStats(state.tasks);
  const list = achievements(state);
  const activity = recentActivity(state);
  const peak = Math.max(1, ...activity.map((d) => d.count));
  const counts = { elephant: 0, lion: 0, rabbit: 0 };
  for (const t of done) counts[t.animalType] += 1;

  root.innerHTML = `
    <section class="profile-head">
      <button class="profile-avatar" type="button" data-avatar
              aria-label="Change your avatar colour">${avatarMark(state.user.name, state.user.avatar)}</button>
      <label class="field profile-name">
        <span class="field__label">Name</span>
        <input class="field__input" type="text" value="${escapeAttr(state.user.name)}"
               data-name data-keep-focus="name" maxlength="40">
      </label>
    </section>

    <section class="stat-grid">
      <div class="stat"><b>${done.length}</b><span>released</span></div>
      <div class="stat"><b>${state.user.streak}</b><span>day streak</span></div>
      <div class="stat"><b>${state.user.tokens}</b><span>tokens</span></div>
      <div class="stat"><b>${zooMoodOf(state)}%</b><span>zoo mood</span></div>
    </section>

    <section class="panel-block">
      <h3 class="block-title">Last two weeks</h3>
      <div class="spark" role="img"
           aria-label="${done.length} tasks completed in the last two weeks">
        ${activity.map((d) => `
          <span class="spark__col" title="${d.count} on ${d.label}">
            <i style="height:${Math.max(4, (d.count / peak) * 100)}%"
               ${d.count === 0 ? 'data-empty' : ''}></i>
          </span>`).join('')}
      </div>
      <p class="block-note">
        ${stats.completedToday > 0
          ? `${stats.completedToday} done today${stats.goalMet ? '. Daily goal met.' : `, ${stats.goal - stats.completedToday} to the goal.`}`
          : 'Nothing released today yet.'}
      </p>
    </section>

    <section class="panel-block">
      <h3 class="block-title">Released by size</h3>
      <ul class="by-type">
        ${ANIMAL_ORDER.map((type) => `
          <li><span aria-hidden="true">${glyph(ANIMALS[type].emoji)}</span>
              <span>${ANIMALS[type].plural}</span>
              <b>${counts[type]}</b></li>`).join('')}
      </ul>
    </section>

    <section class="panel-block">
      <h3 class="block-title">Keepsake journal</h3>
      ${done.length === 0
        ? '<p class="block-note">Every animal you send home leaves a stamp here.</p>'
        : `<ul class="journal">
            ${[...done].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 30).map((t) => `
              <li class="stamp" title="${escapeAttr(t.title)}">
                <img class="stamp__art" src="${portraitOf(t.animalType)}" alt="">
                <span class="stamp__title">${escapeAttr(t.title)}</span>
                <span class="stamp__date">${t.completedAt ? new Date(t.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span>
              </li>`).join('')}
          </ul>`}
    </section>

    <section class="panel-block">
      <h3 class="block-title">Achievements</h3>
      <ul class="badges">
        ${list.map((a) => `
          <li class="badge${a.got ? ' is-got' : ''}">
            <span class="badge__emoji" aria-hidden="true">${glyph(a.emoji)}</span>
            <span class="badge__name">${a.name}</span>
            <span class="badge__hint">${a.got ? 'Unlocked' : a.hint}</span>
          </li>`).join('')}
      </ul>
    </section>

    <section class="panel-block">
      <h3 class="block-title">Settings</h3>

      <div class="setting">
        <div><b>Light</b><span>Follow drifts from morning to golden hour with your clock. Midday holds it.</span></div>
        <div class="segmented" role="radiogroup" aria-label="Light">
          ${['system', 'light'].map((v) => `
            <button type="button" role="radio" data-theme-opt="${v}"
                    aria-checked="${(state.settings.theme === 'dark' ? 'system' : state.settings.theme) === v}"
                    class="${(state.settings.theme === 'dark' ? 'system' : state.settings.theme) === v ? 'is-on' : ''}">${
                      v === 'system' ? 'Follow' : 'Midday'}</button>`).join('')}
        </div>
      </div>

      <div class="setting">
        <div><b>Motion</b><span>Stills the wobble, the wind and the camera drift.</span></div>
        <div class="segmented" role="radiogroup" aria-label="Motion">
          ${['system', 'full', 'reduced'].map((v) => `
            <button type="button" role="radio" data-motion-opt="${v}"
                    aria-checked="${state.settings.motion === v}"
                    class="${state.settings.motion === v ? 'is-on' : ''}">${
                      v === 'system' ? 'Auto' : v === 'full' ? 'Full' : 'Reduced'}</button>`).join('')}
        </div>
      </div>

      <div class="setting">
        <div><b>Graphics</b><span>Retro draws the zoo in chunky pixels, like an old handheld.</span></div>
        <div class="segmented" role="radiogroup" aria-label="Graphics">
          ${['smooth', 'retro'].map((v) => `
            <button type="button" role="radio" data-graphics-opt="${v}"
                    aria-checked="${state.settings.graphics === v}"
                    class="${state.settings.graphics === v ? 'is-on' : ''}">${
                      v === 'retro' ? 'Retro' : 'Smooth'}</button>`).join('')}
        </div>
      </div>

      <div class="setting">
        <div><b>Sound</b><span>Birdsong, a breeze, and the animals' little calls, placed around you in 3D.</span></div>
        <div class="segmented" role="radiogroup" aria-label="Sound">
          ${[false, true].map((v) => `
            <button type="button" role="radio" data-sound-opt="${v}"
                    aria-checked="${!!state.settings.sound === v}"
                    class="${!!state.settings.sound === v ? 'is-on' : ''}">${v ? 'On' : 'Off'}</button>`).join('')}
        </div>
      </div>

      <div class="setting">
        <div><b>Your zoo</b><span>Tasks live on this device only.</span></div>
        <div class="setting__actions">
          ${state.tasks.length === 0
            ? '<button class="btn btn--quiet btn--sm" type="button" data-demo>Load a demo zoo</button>'
            : '<button class="btn btn--quiet btn--sm" type="button" data-clear>Clear all tasks</button>'}
          <button class="btn btn--danger btn--sm" type="button" data-reset>Reset everything</button>
        </div>
      </div>
    </section>`;

  /* -------------------------------------------------------- handlers -- */

  const nameInput = root.querySelector('[data-name]');
  nameInput.addEventListener('change', () => {
    setUser({ name: nameInput.value.trim() || 'You' });
    window.dispatchEvent(new CustomEvent('to-zoo:renamed'));
  });

  root.querySelector('[data-avatar]').addEventListener('click', () => {
    const i = AVATARS.indexOf(state.user.avatar);
    setUser({ avatar: AVATARS[(i + 1) % AVATARS.length] });
  });

  for (const button of root.querySelectorAll('[data-theme-opt]')) {
    button.addEventListener('click', () => {
      setSetting('theme', button.dataset.themeOpt);
      window.dispatchEvent(new CustomEvent('to-zoo:preferences'));
    });
  }

  for (const button of root.querySelectorAll('[data-motion-opt]')) {
    button.addEventListener('click', () => {
      setSetting('motion', button.dataset.motionOpt);
      window.dispatchEvent(new CustomEvent('to-zoo:preferences'));
    });
  }

  for (const button of root.querySelectorAll('[data-sound-opt]')) {
    button.addEventListener('click', () => {
      setSetting('sound', button.dataset.soundOpt === 'true');
      window.dispatchEvent(new CustomEvent('to-zoo:preferences'));
    });
  }

  for (const button of root.querySelectorAll('[data-graphics-opt]')) {
    button.addEventListener('click', () => {
      setSetting('graphics', button.dataset.graphicsOpt);
      window.dispatchEvent(new CustomEvent('to-zoo:preferences'));
    });
  }

  root.querySelector('[data-demo]')?.addEventListener('click', () => {
    loadDemo();
    ctx.syncWorld();
    ctx.views.show('zoo');
    toast({ title: 'A demo zoo moved in', emoji: '🦁' });
  });

  root.querySelector('[data-clear]')?.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Clear all tasks?',
      body: 'Every animal leaves without being released. Your tokens and purchases stay.',
      confirmLabel: 'Clear tasks',
      danger: true,
    });
    if (!yes) return;
    clearTasks();
    ctx.syncWorld();
  });

  root.querySelector('[data-reset]').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Reset everything?',
      body: 'Tasks, tokens, purchases and streak are all deleted from this device. This cannot be undone.',
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!yes) return;
    resetEverything();
    location.reload();
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;
