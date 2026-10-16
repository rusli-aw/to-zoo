/**
 * To-Zoo — the panel behind an animal.
 *
 * Clicking an animal has to feel like walking up to it, so this opens as a
 * sheet at the side rather than a box in the middle: the animal stays visible,
 * the camera has already moved in on it, and the two read as the same object.
 *
 * "Mark complete" is the only primary action, and it is the widest thing here.
 */

import {
  ANIMALS, ageDays, dailyUpkeep, dueLabel, isOverdue, mood, moodOf, moodQuip,
  urgencyBand, waitingLabel,
} from '../model.js';
import { deleteTask } from '../store.js';
import { confirmDialog, openDialog } from './dialog.js';
import { openAddTask } from './addTask.js';
import { glyph } from './icons.js';
import { portraitOf } from '../zoo/portraits.js';

/**
 * @param {import('../model.js').Task} task
 * @param {{ onComplete: (taskId: string) => void,
 *           onChanged?: () => void,
 *           onClosed?: () => void }} handlers
 */
export function openTaskPanel(task, handlers) {
  const spec = ANIMALS[task.animalType];
  const band = urgencyBand(task);
  const overdue = isOverdue(task);
  const age = Math.floor(ageDays(task));
  const moodValue = mood(task);
  const stage = moodOf(task);
  const upkeep = dailyUpkeep(task);

  const dialog = openDialog({
    title: task.title,
    placement: 'sheet',
    className: 'modal--task',
    body: `
      <div class="task-panel">
        <div class="task-panel__animal">
          <span class="task-panel__emoji" aria-hidden="true">${portraitOf(task.animalType) ? `<img src="${portraitOf(task.animalType)}" alt="">` : glyph(spec.emoji)}</span>
          <div>
            <span class="task-panel__type">${spec.label}</span>
            <span class="task-panel__size">${spec.sizeWord} task</span>
          </div>
        </div>

        <!-- The mood meter is the *second* way to read this animal. The first
             is watching what it is doing in the zoo. -->
        <div class="mood" data-stage="${stage.key}">
          <div class="mood__head">
            <span class="mood__face" aria-hidden="true">${glyph(stage.emoji)}</span>
            <span class="mood__label">${stage.label}</span>
            <span class="mood__pct">${moodValue}%</span>
          </div>
          <div class="mood__bar" role="img"
               aria-label="Mood ${moodValue} percent, ${stage.label}">
            <i style="width:${moodValue}%"></i>
          </div>
          <p class="mood__quip">“${escapeHtml(moodQuip(task))}”</p>
        </div>

        <dl class="meta">
          <div class="meta__row">
            <dt>Deadline</dt>
            <dd data-band="${band}">${escapeHtml(dueLabel(task))}</dd>
          </div>
          <div class="meta__row">
            <dt>In the zoo</dt>
            <dd>${escapeHtml(waitingLabel(task))}</dd>
          </div>
          <div class="meta__row">
            <dt>Costs you</dt>
            <dd>${upkeep > 0
              ? `<span class="coin coin--sm" aria-hidden="true"></span> ${upkeep} a day`
              : '<span class="free">Nothing</span>'}</dd>
          </div>
          <div class="meta__row">
            <dt>Worth</dt>
            <dd><span class="coin coin--sm" aria-hidden="true"></span> ${spec.tokens} tokens${
              overdue ? ' <span class="bonus">+5 overdue bonus</span>' : ''
            }</dd>
          </div>
        </dl>

        ${task.notes ? `<p class="task-panel__notes">${escapeHtml(task.notes)}</p>` : ''}

        ${upkeep > 0 ? `
          <p class="task-panel__nudge">
            ${age} days in, so ${spec.article === 'an' ? 'the' : 'this'}
            ${spec.label.toLowerCase()} has started costing you
            ${upkeep} a day. Releasing it stops that immediately.
          </p>` : ''}

        <button class="btn btn--primary btn--block btn--complete" type="button"
                data-complete data-autofocus>
          Mark done &amp; send home
        </button>

        <div class="task-panel__minor">
          <button class="btn btn--quiet btn--sm" type="button" data-edit>Edit</button>
          <button class="btn btn--quiet btn--sm" type="button" data-delete>Remove</button>
        </div>
      </div>`,

    setup(panel, close) {
      panel.querySelector('[data-complete]').addEventListener('click', () => {
        // Close first so the sheet is out of the way of the animation, then
        // hand the id to the one place that knows how to commit and release.
        close('completed');
        handlers.onComplete(task.id);
      });

      panel.querySelector('[data-edit]').addEventListener('click', async () => {
        close('editing');
        await openAddTask({ editing: task, onCreated: () => handlers.onChanged?.() });
      });

      panel.querySelector('[data-delete]').addEventListener('click', async () => {
        const yes = await confirmDialog({
          title: 'Remove this task?',
          body: `“${escapeHtml(task.title)}” will be removed without releasing its
                 animal, and without earning tokens.`,
          confirmLabel: 'Remove',
          danger: true,
        });
        if (!yes) return;
        deleteTask(task.id);
        close('deleted');
        handlers.onChanged?.();
      });
    },

    onClose: () => handlers.onClosed?.(),
  });

  return dialog;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
