/**
 * To-Zoo — the list view.
 *
 * The escape hatch for anyone who wants to see everything at once, and the
 * accessible equivalent of the zoo. Grouped by animal, because that is the
 * priority order the whole product is built on — a flat list sorted by date
 * would quietly contradict the metaphor the 3D scene teaches.
 *
 * Search, filter and sort live at module scope so they survive the wholesale
 * re-render the router does on every store change.
 */

import {
  ANIMAL_ORDER, ANIMALS, dueLabel, daysUntil, isOverdue, urgencyBand,
} from '../model.js';
import { getState, reorderTasks } from '../store.js';
import { openTaskPanel } from './taskPanel.js';
import { glyph } from './icons.js';

let query = '';
let sort = 'priority';
let filter = 'all';
let showDone = false;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'soon', label: 'This week' },
  { id: 'someday', label: 'Someday' },
];

const SORTS = [
  { id: 'priority', label: 'Priority' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'added', label: 'Recently added' },
  { id: 'manual', label: 'My order' },
];

function matches(task) {
  if (query) {
    const haystack = `${task.title} ${task.notes}`.toLowerCase();
    if (!haystack.includes(query.toLowerCase())) return false;
  }
  const days = daysUntil(task.dueDate);
  switch (filter) {
    case 'overdue': return isOverdue(task);
    case 'today': return days === 0;
    case 'soon': return days !== null && days >= 0 && days <= 7;
    case 'someday': return task.dueDate === null;
    default: return true;
  }
}

function compare(a, b) {
  switch (sort) {
    case 'deadline': {
      const da = daysUntil(a.dueDate);
      const db = daysUntil(b.dueDate);
      if (da === null && db === null) return a.order - b.order;
      if (da === null) return 1;              // someday sinks to the bottom
      if (db === null) return -1;
      return da - db;
    }
    case 'added': return b.createdAt - a.createdAt;
    case 'manual': return a.order - b.order;
    default: {
      // Priority: soonest-and-most-urgent first within the species group.
      const da = daysUntil(a.dueDate);
      const db = daysUntil(b.dueDate);
      if (da === null && db === null) return a.createdAt - b.createdAt;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
  }
}

/**
 * @param {HTMLElement} root
 * @param {any} ctx
 */
export function renderTasksView(root, ctx) {
  const state = getState();
  const open = state.tasks.filter((t) => !t.completed);
  const done = state.tasks
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const visible = open.filter(matches).sort(compare);

  root.innerHTML = `
    <div class="toolbar">
      <label class="search">
        <span class="visually-hidden">Search tasks</span>
        <input type="search" class="search__input" placeholder="Search tasks"
               value="${escapeAttr(query)}" data-keep-focus="search" data-search>
      </label>
      <label class="select">
        <span class="visually-hidden">Sort by</span>
        <select data-sort data-keep-focus="sort">
          ${SORTS.map((s) => `<option value="${s.id}"${
            s.id === sort ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="chips chips--filter" role="group" aria-label="Filter tasks">
      ${FILTERS.map((f) => `
        <button class="chip${f.id === filter ? ' is-on' : ''}" type="button"
                data-filter="${f.id}" aria-pressed="${f.id === filter}">${f.label}</button>`).join('')}
    </div>

    <div class="groups" data-groups></div>

    ${done.length ? `
      <div class="done-block">
        <button class="done-toggle" type="button" data-toggle-done aria-expanded="${showDone}">
          ${showDone ? '▾' : '▸'} Released (${done.length})
        </button>
        ${showDone ? `<ul class="done-list">${done.slice(0, 24).map((t) => `
          <li><span aria-hidden="true">${glyph(ANIMALS[t.animalType].emoji)}</span>
              <s>${escapeHtml(t.title)}</s>
              <time>${t.completedAt ? new Date(t.completedAt).toLocaleDateString(undefined,
                { month: 'short', day: 'numeric' }) : ''}</time></li>`).join('')}</ul>` : ''}
      </div>` : ''}`;

  /* ------------------------------------------------------------ groups -- */

  const groupsEl = root.querySelector('[data-groups]');

  if (open.length === 0) {
    groupsEl.innerHTML = `
      <div class="list-empty">
        <p class="list-empty__title">Nothing in the zoo.</p>
        <p>Add a task and an animal moves in.</p>
        <button class="btn btn--primary" type="button" data-add>+ Add a task</button>
      </div>`;
    groupsEl.querySelector('[data-add]').addEventListener('click', ctx.onAddTask);
    return;
  }

  if (visible.length === 0) {
    groupsEl.innerHTML = `
      <div class="list-empty">
        <p class="list-empty__title">No tasks match.</p>
        <p>${query ? `Nothing found for “${escapeHtml(query)}”.` : 'Try another filter.'}</p>
        <button class="btn btn--quiet" type="button" data-clear>Clear filters</button>
      </div>`;
    groupsEl.querySelector('[data-clear]').addEventListener('click', () => {
      query = '';
      filter = 'all';
      ctx.views.render();
    });
    return;
  }

  groupsEl.innerHTML = ANIMAL_ORDER.map((type) => {
    const items = visible.filter((t) => t.animalType === type);
    if (items.length === 0) return '';
    const spec = ANIMALS[type];
    return `
      <section class="group" data-group="${type}">
        <header class="group__head">
          <span class="group__emoji" aria-hidden="true">${glyph(spec.emoji)}</span>
          <h3 class="group__title">${spec.plural}</h3>
          <span class="group__count">${items.length}</span>
          <span class="group__hint">${spec.sizeWord}</span>
        </header>
        <ul class="cards">${items.map((task) => card(task)).join('')}</ul>
      </section>`;
  }).join('');

  /* ---------------------------------------------------------- wiring -- */

  const searchEl = root.querySelector('[data-search]');
  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    ctx.views.render();
  });

  root.querySelector('[data-sort]').addEventListener('change', (event) => {
    sort = event.target.value;
    ctx.views.render();
  });

  for (const chip of root.querySelectorAll('[data-filter]')) {
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      ctx.views.render();
    });
  }

  root.querySelector('[data-toggle-done]')?.addEventListener('click', () => {
    showDone = !showDone;
    ctx.views.render();
  });

  for (const el of root.querySelectorAll('[data-task]')) {
    const id = el.dataset.task;

    el.querySelector('[data-complete]').addEventListener('click', (event) => {
      event.stopPropagation();
      // Completing from the list still plays the release — the reward is the
      // point, and hiding it here would make the list feel like the "real"
      // app and the zoo like decoration.
      ctx.onComplete(id);
      ctx.views.show('zoo');
    });

    el.querySelector('[data-open]').addEventListener('click', () => {
      const task = getState().tasks.find((t) => t.id === id);
      if (task) openTaskPanel(task, { onComplete: ctx.onComplete, onChanged: ctx.syncWorld });
    });
  }

  enableDragAndDrop(root, ctx);
}

/* ---------------------------------------------------------------- card -- */

function card(task) {
  const spec = ANIMALS[task.animalType];
  const band = urgencyBand(task);
  return `
    <li class="card" data-task="${task.id}" data-band="${band}" draggable="true">
      <button class="card__complete" type="button" data-complete
              aria-label="Complete and release ${escapeAttr(task.title)}">
        <span class="card__tick" aria-hidden="true"></span>
      </button>
      <button class="card__main" type="button" data-open>
        <span class="card__title">${escapeHtml(task.title)}</span>
        <span class="card__meta">
          <span class="card__due" data-band="${band}">${escapeHtml(dueLabel(task))}</span>
          ${task.notes ? `<span class="card__note">${escapeHtml(task.notes.slice(0, 60))}${
            task.notes.length > 60 ? '…' : ''}</span>` : ''}
        </span>
      </button>
      <span class="card__worth" title="${spec.tokens} tokens">
        <span class="coin coin--sm" aria-hidden="true"></span>${spec.tokens}
      </span>
      <span class="card__grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
    </li>`;
}

/* ------------------------------------------------------------------ dnd -- */

function enableDragAndDrop(root, ctx) {
  let dragged = null;

  for (const el of root.querySelectorAll('[data-task]')) {
    el.addEventListener('dragstart', (event) => {
      dragged = el;
      el.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without data on the transfer.
      event.dataTransfer.setData('text/plain', el.dataset.task);
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('is-dragging');
      dragged = null;
      commit(root, ctx);
    });

    el.addEventListener('dragover', (event) => {
      if (!dragged || dragged === el) return;
      // Only reorder within a group — dragging a rabbit into the elephants
      // would silently change its size, which is a decision, not a sort.
      if (dragged.closest('[data-group]') !== el.closest('[data-group]')) return;
      event.preventDefault();

      const box = el.getBoundingClientRect();
      const below = event.clientY > box.top + box.height / 2;
      el.parentElement.insertBefore(dragged, below ? el.nextSibling : el);
    });
  }
}

function commit(root, ctx) {
  const ids = [...root.querySelectorAll('[data-task]')].map((el) => el.dataset.task);
  reorderTasks(ids);
  // Reordering by hand is a statement of intent — switch to that view of the
  // list so the user can actually see the order they just built.
  if (sort !== 'manual') {
    sort = 'manual';
    ctx.views.render();
  }
}

/* --------------------------------------------------------------- utils -- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;
