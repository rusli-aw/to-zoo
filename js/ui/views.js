/**
 * To-Zoo — the router.
 *
 * Secondary views are sheets that slide over the zoo rather than pages that
 * replace it. The world keeps rendering behind them, slightly desaturated, so
 * you never lose the sense that the zoo is the thing and these are ways of
 * looking at it.
 *
 * Views re-render wholesale when the store changes, which is fine at this
 * size and removes a whole class of stale-DOM bugs. Scroll position and the
 * focused control are carried across, because losing either mid-interaction
 * is exactly the sort of thing that makes a prototype feel like one.
 */

import { subscribe } from '../store.js';
import { renderTasksView } from './tasksView.js';
import { renderCustomizeView } from './customizeView.js';
import { renderFriendsView } from './friendsView.js';
import { renderZoosView } from './zoosView.js';
import { renderProfileView } from './profileView.js';

const RENDERERS = {
  zoos: renderZoosView,
  tasks: renderTasksView,
  customize: renderCustomizeView,
  friends: renderFriendsView,
  profile: renderProfileView,
};

const TITLES = {
  zoos: 'Zoos',
  tasks: 'Tasks',
  customize: 'Customize',
  friends: 'Friends',
  profile: 'Profile',
};

/**
 * @param {object} ctx  shared services the views need
 */
export function mountViews(ctx) {
  const app = document.getElementById('app');
  const sheetRoot = document.getElementById('sheet-root');
  const navButtons = [...document.querySelectorAll('.nav__item')];

  let current = 'zoo';

  function show(name) {
    if (name === current) {
      if (name !== 'zoo') return;     // tapping the active tab is a no-op
    }
    current = name;

    for (const button of navButtons) {
      const on = button.dataset.view === name;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-current', on ? 'page' : 'false');
    }

    app.dataset.view = name;

    if (name === 'zoo') {
      sheetRoot.hidden = true;
      sheetRoot.innerHTML = '';
      delete app.dataset.sheet;
      ctx.picking.setSuspended(false);
      return;
    }

    app.dataset.sheet = 'open';
    sheetRoot.hidden = false;
    // The 3D scene keeps running behind the sheet, but must not take clicks.
    ctx.picking.setSuspended(true);
    render();
    // Move focus into the sheet so keyboard users follow the navigation.
    requestAnimationFrame(() => {
      sheetRoot.querySelector('.sheet__title')?.focus();
    });
  }

  function render() {
    if (current === 'zoo') return;

    const scroller = sheetRoot.querySelector('.sheet__body');
    const scrollTop = scroller?.scrollTop ?? 0;
    const activeId = document.activeElement instanceof HTMLElement
      ? document.activeElement.dataset.keepFocus
      : null;

    sheetRoot.innerHTML = `
      <section class="sheet" aria-label="${TITLES[current]}">
        <header class="sheet__head">
          <h2 class="sheet__title" tabindex="-1">${TITLES[current]}</h2>
          <button class="icon-btn" type="button" data-back aria-label="Back to the zoo">
            &times;
          </button>
        </header>
        <div class="sheet__body"></div>
      </section>`;

    const body = sheetRoot.querySelector('.sheet__body');
    RENDERERS[current](body, ctx);

    sheetRoot.querySelector('[data-back]').addEventListener('click', () => show('zoo'));

    const restored = sheetRoot.querySelector('.sheet__body');
    if (restored) restored.scrollTop = scrollTop;
    if (activeId) {
      /** @type {HTMLElement} */
      (sheetRoot.querySelector(`[data-keep-focus="${activeId}"]`))?.focus();
    }
  }

  for (const button of navButtons) {
    button.addEventListener('click', () => show(button.dataset.view));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current !== 'zoo' && !document.body.dataset.modal) {
      show('zoo');
    }
  });

  // Keep an open sheet honest about the state behind it.
  subscribe(() => { if (current !== 'zoo') render(); });

  const api = {
    show,
    render,
    get current() { return current; },
  };

  // Views need to ask for a re-render after changing their own local state
  // (a filter, a tab), so the router hands itself to them through ctx.
  ctx.views = api;
  return api;
}
