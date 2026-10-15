/**
 * To-Zoo — quick add.
 *
 * The single most-used screen in the product, so the bar is: type a sentence,
 * press Enter, done. Everything else on the form is optional and pre-filled
 * with a guess.
 *
 * The guess is shown, not applied silently. "Elephant — 'essay' and due
 * tomorrow" tells the user what the system noticed, which makes a wrong guess
 * feel like a suggestion to correct rather than a mistake to undo. Touching
 * the animal picker stops it following the text, because at that point the
 * user has told us more than the parser can infer.
 */

import { ANIMAL_ORDER, ANIMALS, dueLabel, makeTask } from '../model.js';
import { addTask as storeAddTask, updateTask as storeUpdateTask } from '../store.js';
import { stripDatePhrase, suggestAnimal, toDateInput } from '../suggest.js';
import { openDialog } from './dialog.js';

const QUICK_DATES = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'week', label: 'In a week', days: 7 },
  { id: 'none', label: 'Someday', days: null },
];

/**
 * @param {{ onCreated?: (task: import('../model.js').Task) => void,
 *           defaults?: Partial<import('../model.js').Task>,
 *           editing?: import('../model.js').Task }} [opts]
 */
export function openAddTask(opts = {}) {
  // Editing reuses this whole form. The two flows differ only in what the
  // submit button says and whether it creates or patches, so keeping them in
  // one place is what stops the suggestion logic drifting between them.
  const editing = opts.editing ?? null;
  const animalCards = ANIMAL_ORDER.map((type) => {
    const spec = ANIMALS[type];
    return `
      <button class="animal-card" type="button" role="radio" aria-checked="false"
              data-animal="${type}">
        <span class="animal-card__emoji" aria-hidden="true">${spec.emoji}</span>
        <span class="animal-card__label">${spec.label}</span>
        <span class="animal-card__size">${spec.sizeWord}</span>
        <span class="animal-card__tag">${spec.tagline}</span>
      </button>`;
  }).join('');

  const dateChips = QUICK_DATES.map((d) => `
    <button class="chip" type="button" data-quickdate="${d.id}">${d.label}</button>`).join('');

  const dialog = openDialog({
    title: editing ? 'Edit task' : 'Add a task',
    subtitle: editing
      ? 'Changing the size swaps the animal.'
      : 'It becomes an animal in your zoo.',
    className: 'modal--add',
    body: `
      <form id="add-form" novalidate>
        <label class="field">
          <span class="field__label">What needs doing?</span>
          <input class="field__input field__input--lead" id="add-title" name="title"
                 type="text" autocomplete="off" data-autofocus
                 placeholder="Finish economics essay by tomorrow"
                 aria-describedby="add-suggestion">
        </label>

        <p class="suggestion" id="add-suggestion" aria-live="polite" hidden></p>

        <fieldset class="field">
          <legend class="field__label">How big is it?</legend>
          <div class="animal-choice" role="radiogroup" aria-label="Task size">${animalCards}</div>
        </fieldset>

        <div class="field-row">
          <label class="field">
            <span class="field__label">Deadline</span>
            <input class="field__input" id="add-date" name="dueDate" type="date">
          </label>
          <div class="field">
            <span class="field__label">Quick pick</span>
            <div class="chips">${dateChips}</div>
          </div>
        </div>

        <details class="more">
          <summary>Notes and reminder</summary>
          <label class="field">
            <span class="field__label">Notes</span>
            <textarea class="field__input" id="add-notes" name="notes" rows="3"
                      placeholder="Anything you want to remember when you come back to this."></textarea>
          </label>
          <label class="switch">
            <input type="checkbox" id="add-reminder">
            <span>Remind me on the day it is due</span>
          </label>
        </details>

        <div class="dialog-actions">
          <span class="dialog-hint">Press <kbd>Enter</kbd> to save</span>
          <button class="btn btn--primary" type="submit">${
            editing ? 'Save changes' : 'Add to zoo'
          }</button>
        </div>
      </form>`,

    setup(panel, close) {
      const form = /** @type {HTMLFormElement} */ (panel.querySelector('#add-form'));
      const titleInput = /** @type {HTMLInputElement} */ (panel.querySelector('#add-title'));
      const dateInput = /** @type {HTMLInputElement} */ (panel.querySelector('#add-date'));
      const notesInput = /** @type {HTMLTextAreaElement} */ (panel.querySelector('#add-notes'));
      const reminderInput = /** @type {HTMLInputElement} */ (panel.querySelector('#add-reminder'));
      const suggestionEl = panel.querySelector('#add-suggestion');
      const cards = [...panel.querySelectorAll('[data-animal]')];

      /** Once the user picks an animal themselves, stop overriding them. */
      let manualAnimal = false;
      let animalType = editing?.animalType ?? opts.defaults?.animalType ?? 'rabbit';
      let dateFromTitle = null;

      const seed = editing ?? opts.defaults;
      if (seed?.title) titleInput.value = seed.title;
      if (seed?.dueDate) dateInput.value = seed.dueDate;
      if (seed?.notes) notesInput.value = seed.notes;
      if (seed?.reminder) reminderInput.checked = true;
      // An existing task already reflects a decision — never re-guess it.
      if (editing || opts.defaults?.animalType) manualAnimal = true;

      function paintAnimal() {
        for (const card of cards) {
          const on = card.dataset.animal === animalType;
          card.classList.toggle('is-on', on);
          card.setAttribute('aria-checked', String(on));
        }
      }

      function refreshSuggestion() {
        const raw = titleInput.value;
        const result = suggestAnimal(raw, dateInput.value || null);

        if (!raw.trim()) {
          suggestionEl.hidden = true;
          return;
        }

        // A date written into the title fills the date field once, and is
        // then left alone — retyping should not fight the user's own edit.
        if (result.date && !dateInput.value) {
          dateInput.value = toDateInput(result.date.date);
          dateFromTitle = result.date;
          markQuickDate();
        }

        if (!manualAnimal && result.animalType !== animalType) {
          animalType = result.animalType;
          paintAnimal();
        }

        suggestionEl.hidden = false;
        const spec = ANIMALS[result.animalType];
        suggestionEl.innerHTML = manualAnimal && result.animalType !== animalType
          ? `<span class="suggestion__dot"></span> We would have guessed
             ${spec.emoji} ${escapeHtml(result.reason)}`
          : `<span class="suggestion__dot"></span> ${spec.emoji}
             ${escapeHtml(result.reason)}`;
      }

      function markQuickDate() {
        const value = dateInput.value;
        for (const chip of panel.querySelectorAll('[data-quickdate]')) {
          const spec = QUICK_DATES.find((d) => d.id === chip.dataset.quickdate);
          let matches;
          if (spec.days === null) matches = !value;
          else {
            const d = new Date();
            d.setDate(d.getDate() + spec.days);
            matches = value === toDateInput(d);
          }
          chip.classList.toggle('is-on', matches);
        }
      }

      for (const card of cards) {
        card.addEventListener('click', () => {
          animalType = /** @type {any} */ (card.dataset.animal);
          manualAnimal = true;
          paintAnimal();
          refreshSuggestion();
        });
      }

      for (const chip of panel.querySelectorAll('[data-quickdate]')) {
        chip.addEventListener('click', () => {
          const spec = QUICK_DATES.find((d) => d.id === chip.dataset.quickdate);
          if (spec.days === null) {
            dateInput.value = '';
          } else {
            const d = new Date();
            d.setDate(d.getDate() + spec.days);
            dateInput.value = toDateInput(d);
          }
          markQuickDate();
          refreshSuggestion();
        });
      }

      titleInput.addEventListener('input', refreshSuggestion);
      dateInput.addEventListener('change', () => { markQuickDate(); refreshSuggestion(); });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const raw = titleInput.value.trim();
        if (!raw) {
          titleInput.setAttribute('aria-invalid', 'true');
          titleInput.focus();
          return;
        }

        // Strip the date phrase we consumed, so the card reads
        // "Finish economics essay" rather than repeating "by tomorrow".
        const title = dateFromTitle && dateInput.value
          ? stripDatePhrase(raw, dateFromTitle.matched) || raw
          : raw;

        const fields = {
          title,
          notes: notesInput.value.trim(),
          animalType,
          dueDate: dateInput.value || null,
          reminder: reminderInput.checked,
        };

        const task = editing
          ? storeUpdateTask(editing.id, fields)
          : storeAddTask(makeTask(fields));

        close(task);
        opts.onCreated?.(task);
      });

      paintAnimal();
      markQuickDate();
      if (titleInput.value) refreshSuggestion();
    },
  });

  return dialog.result;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Re-exported so views can show a consistent due label next to the picker. */
export { dueLabel };
