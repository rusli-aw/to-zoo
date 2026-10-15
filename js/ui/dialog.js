/**
 * To-Zoo — modal plumbing.
 *
 * One place that knows how a dialog behaves, so quick-add, the task panel and
 * the confirmations all trap focus, close on Escape, restore focus on the way
 * out, and label themselves the same way. Written by hand rather than with
 * <dialog> because the zoo needs to stay visible and interactive-looking
 * behind it, and ::backdrop gives far less control over that.
 */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

let openCount = 0;

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.subtitle]
 * @param {string} spec.body            HTML for the dialog contents
 * @param {string} [spec.className]
 * @param {'sheet' | 'centre'} [spec.placement]
 * @param {(root: HTMLElement, close: (result?: any) => void) => void} [spec.setup]
 * @param {() => void} [spec.onClose]
 */
export function openDialog(spec) {
  const host = document.getElementById('modal-root');
  const previouslyFocused = /** @type {HTMLElement} */ (document.activeElement);

  const wrap = document.createElement('div');
  wrap.className = `modal modal--${spec.placement ?? 'centre'}`;
  if (spec.className) wrap.classList.add(spec.className);

  const titleId = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;

  wrap.innerHTML = `
    <div class="modal__scrim" data-close></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <header class="modal__head">
        <div>
          <h2 class="modal__title" id="${titleId}">${spec.title}</h2>
          ${spec.subtitle ? `<p class="modal__sub">${spec.subtitle}</p>` : ''}
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Close">&times;</button>
      </header>
      <div class="modal__body">${spec.body}</div>
    </div>`;

  host.appendChild(wrap);
  openCount += 1;
  document.body.dataset.modal = 'open';

  let resolveFn;
  const result = new Promise((resolve) => { resolveFn = resolve; });
  let closed = false;

  function close(value) {
    if (closed) return;
    closed = true;
    openCount -= 1;
    if (openCount === 0) delete document.body.dataset.modal;

    wrap.dataset.leaving = '';
    document.removeEventListener('keydown', onKeydown, true);
    setTimeout(() => wrap.remove(), 220);

    // Returning focus is what makes a dialog usable by keyboard at all.
    previouslyFocused?.focus?.();
    spec.onClose?.();
    resolveFn(value);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(undefined);
      return;
    }
    if (event.key !== 'Tab') return;

    const panel = wrap.querySelector('.modal__panel');
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  wrap.addEventListener('click', (event) => {
    if (/** @type {HTMLElement} */ (event.target).hasAttribute('data-close')) close(undefined);
  });
  document.addEventListener('keydown', onKeydown, true);

  const panel = /** @type {HTMLElement} */ (wrap.querySelector('.modal__panel'));
  spec.setup?.(panel, close);

  // Focus the first real control, not the close button, so typing starts
  // where the user expects in the quick-add case.
  requestAnimationFrame(() => {
    const preferred = panel.querySelector('[data-autofocus]');
    const fallback = panel.querySelectorAll(FOCUSABLE)[1] ?? panel.querySelector(FOCUSABLE);
    /** @type {HTMLElement} */ (preferred ?? fallback)?.focus();
  });

  return { close, result, panel };
}

/** A small yes/no, used for destructive things like clearing the zoo. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return openDialog({
    title,
    body: `
      <p class="dialog-text">${body}</p>
      <div class="dialog-actions">
        <button class="btn btn--quiet" type="button" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm
                data-autofocus>${confirmLabel}</button>
      </div>`,
    setup(panel, close) {
      panel.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      panel.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    },
  }).result;
}

export const isDialogOpen = () => openCount > 0;
