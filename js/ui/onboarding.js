/**
 * To-Zoo — first run.
 *
 * Four screens, and the fourth one hands over rather than congratulating
 * itself. The whole thing is skippable from the first screen, because a
 * person who already understands "animal = task" should not have to click
 * through an explanation of it.
 */

import { ANIMAL_ORDER, ANIMALS } from '../model.js';

const SCREENS = [
  {
    key: 'welcome',
    title: 'Welcome to To-Zoo.',
    body: 'To-Zoo is an animal rescue. A sanctuary where every animal is looked '
        + 'after until it is ready to go home — and each one of them is a task '
        + 'of yours.',
    art: 'gate',
  },
  {
    key: 'animals',
    title: 'Three sizes of animal.',
    body: 'Pick the one that matches the weight of the task. To-Zoo will guess for you as you type.',
    art: 'animals',
  },
  {
    key: 'release',
    title: 'Finish a task. Send one home.',
    body: 'Completing a task walks its animal out of the gate and back to the '
        + 'wild, and pays you for looking after it.',
    art: 'release',
  },
  {
    key: 'thrive',
    title: 'Look after them while they wait.',
    body: 'A full sanctuary is a good sanctuary. What matters is that nobody '
        + 'waits too long — a forgotten animal gets restless, and costs you to keep.',
    art: 'thrive',
  },
];

/**
 * @param {{ onFinish: (result: {demo: boolean}) => void }} handlers
 */
export function runOnboarding(handlers) {
  let index = 0;

  const wrap = document.createElement('div');
  wrap.className = 'onboarding';
  wrap.innerHTML = `
    <div class="onboarding__panel" role="dialog" aria-modal="true"
         aria-labelledby="ob-title">
      <div class="onboarding__art" data-art></div>
      <h2 class="onboarding__title" id="ob-title" tabindex="-1"></h2>
      <p class="onboarding__body"></p>
      <div class="onboarding__dots" role="tablist" aria-label="Progress"></div>
      <div class="onboarding__actions">
        <button class="btn btn--quiet" type="button" data-skip>Skip</button>
        <button class="btn btn--primary" type="button" data-next>Next</button>
      </div>
    </div>`;

  document.getElementById('modal-root').appendChild(wrap);
  document.body.dataset.modal = 'open';

  const titleEl = wrap.querySelector('.onboarding__title');
  const bodyEl = wrap.querySelector('.onboarding__body');
  const artEl = wrap.querySelector('[data-art]');
  const dotsEl = wrap.querySelector('.onboarding__dots');
  const nextButton = wrap.querySelector('[data-next]');
  const skipButton = wrap.querySelector('[data-skip]');

  function paint() {
    const screen = SCREENS[index];
    titleEl.textContent = screen.title;
    bodyEl.textContent = screen.body;
    artEl.dataset.art = screen.art;
    artEl.innerHTML = ART[screen.art];

    dotsEl.innerHTML = SCREENS.map((s, i) => `
      <span class="dot${i === index ? ' is-on' : ''}"
            role="tab" aria-selected="${i === index}"
            aria-label="Step ${i + 1} of ${SCREENS.length}"></span>`).join('');

    const last = index === SCREENS.length - 1;
    nextButton.textContent = last ? 'Add my first task' : 'Next';
    skipButton.textContent = last ? 'Start with a demo zoo' : 'Skip';

    // Announce the new screen to a screen reader without stealing the button.
    titleEl.focus();
  }

  function finish(demo) {
    document.removeEventListener('keydown', onKey, true);
    delete document.body.dataset.modal;
    wrap.dataset.leaving = '';
    setTimeout(() => wrap.remove(), 260);
    handlers.onFinish({ demo });
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); finish(false); }
    if (event.key === 'ArrowRight') nextButton.click();
    if (event.key === 'ArrowLeft' && index > 0) { index -= 1; paint(); }
  }

  nextButton.addEventListener('click', () => {
    if (index < SCREENS.length - 1) {
      index += 1;
      paint();
      return;
    }
    finish(false);
  });

  skipButton.addEventListener('click', () => finish(index === SCREENS.length - 1));

  document.addEventListener('keydown', onKey, true);
  paint();
}

/* ------------------------------------------------------------------ art -- */

/* Hand-drawn, in the same wobbling-line spirit as the world itself. Inline
   SVG rather than 3D: the zoo behind is already doing that job, and these
   need to be legible at 120px. */
const ART = {
  gate: `
    <svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 100c30-6 60-8 88-8s58 2 88 8"/>
      <path d="M56 100V40M144 100V40"/>
      <path d="M48 40c8-4 16-4 16-4M136 36s8 0 16 4"/>
      <path d="M50 30h100"/>
      <path d="M70 100V56h26v44M104 100V56h26v44"/>
      <path d="M20 78c6-10 14-12 20-4M160 74c6-10 14-10 18-2"/>
    </svg>`,

  animals: `
    <svg viewBox="0 0 220 110" fill="none" stroke="currentColor" stroke-width="2.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <g>
        <path d="M14 84c0-22 14-34 34-34s32 12 32 30c0 8-2 12-6 14"/>
        <path d="M14 84c0 10 4 14 12 16 12 3 34 3 44-2"/>
        <path d="M22 60c-6-5-12-3-12 3s4 9 9 10"/>
        <path d="M18 88c-3 4-4 10-2 14M66 92c3 2 6 1 8-2"/>
      </g>
      <g>
        <circle cx="126" cy="62" r="17"/>
        <path d="M126 45c-11 0-19 8-19 17s8 17 19 17 19-8 19-17-8-17-19-17z"/>
        <path d="M112 96c0-8 6-12 14-12s14 4 14 12"/>
        <path d="M120 60h1M132 60h1"/>
      </g>
      <g>
        <path d="M176 82c-8 0-14-5-14-12s6-12 14-12c2-6 8-8 12-4 5-4 12 0 12 6 5 1 8 5 8 10 0 7-6 12-14 12z"/>
        <path d="M172 82v10M196 82v10"/>
        <path d="M186 70h1M192 70h1"/>
      </g>
    </svg>`,

  release: `
    <svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 96h60M130 96h60"/>
      <path d="M62 96V44M138 96V44"/>
      <path d="M62 44c-10 6-14 14-14 22M138 44c10 6 14 14 14 22"/>
      <path d="M86 88c0-14 9-22 22-22s20 8 20 20"/>
      <path d="M86 88c0 6 3 8 8 9 8 2 22 2 28-1"/>
      <path d="M92 74c-4-3-8-2-8 2s3 6 6 6"/>
      <path d="M150 30c4-6 10-6 14 0M164 44c5-4 11-2 13 4M172 22c3-4 8-3 10 2"/>
    </svg>`,

  thrive: `
    <svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 98c30-8 62-10 92-10s62 2 92 10"/>
      <path d="M44 88c0-16 6-26 6-26s6 10 6 26"/>
      <path d="M30 74c8-14 20-16 26-6M76 70c-8-12-18-14-24-4"/>
      <path d="M132 88V58M132 58c-10 0-16-6-16-14 0-6 6-10 12-8 2-8 10-10 14-4 6-2 12 4 10 10 6 2 8 10 2 14-4 4-14 4-22 2z"/>
      <path d="M100 96c2-6 6-8 10-6M160 92c3-6 8-7 12-4"/>
    </svg>`,
};
