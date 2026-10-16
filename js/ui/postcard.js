/**
 * To-Zoo — the postcard.
 *
 * Tap the logo and a postcard arrives. The front is a picture card with a
 * scalloped edge: your own zoo, as it is right now, under big chunky
 * "greetings from To-Zoo" lettering. Click it and it flips over to the back:
 * a handwritten note from the three of us, a stamp, a postmark, address lines
 * and a little doodle with paw prints.
 *
 * The stamp shows assets/team.jpg once it exists, and the elephant until then.
 */

import { openDialog } from './dialog.js';
import { portraitOf, snapshotZoo } from '../zoo/portraits.js';

const PHOTO = 'assets/team.jpg';

/** A line drawing of an elephant, in the doodle style of the card back. */
const DOODLE = `
<svg class="pc-back__doodle" viewBox="0 0 120 90" aria-hidden="true" fill="none" stroke="currentColor"
     stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M30 44c0-14 10-24 24-24s25 9 25 22c0 6-2 10-2 14"/>
  <path d="M30 44c-9-1-15-8-14-16 1-7 9-11 16-8"/>
  <path d="M79 42c9-1 15-8 14-16-1-7-9-11-16-8"/>
  <path d="M54 52c-1 8 1 14 6 17 5 3 10 1 11-4"/>
  <circle cx="45" cy="38" r="2.4" fill="currentColor"/><circle cx="63" cy="38" r="2.4" fill="currentColor"/>
  <path d="M38 58c-3 8-3 16-1 22M50 64v16M66 64v16M76 56c3 8 3 16 1 24"/>
  <path d="M34 80h8M46 80h8M62 80h8M74 80h8"/>
</svg>`;

const PAWS = `
<svg class="pc-back__paws" viewBox="0 0 120 28" aria-hidden="true" fill="currentColor">
  <g transform="translate(4 8)"><ellipse cx="8" cy="10" rx="7" ry="6"/><circle cx="2" cy="2" r="1.8"/><circle cx="6" cy="0" r="1.8"/><circle cx="10" cy="0" r="1.8"/><circle cx="14" cy="2" r="1.8"/></g>
  <g transform="translate(44 6)"><path d="M1 12c0-4 3-6 6-6s6 2 6 6c0 3-2 4-3.5 4-1.3 0-2-1-2.5-1s-1.2 1-2.5 1C2.8 16 1 15 1 12z"/><ellipse cx="0.5" cy="4" rx="1.7" ry="2.2"/><ellipse cx="4.5" cy="1" rx="1.7" ry="2.2"/><ellipse cx="9.5" cy="1" rx="1.7" ry="2.2"/><ellipse cx="13.5" cy="4" rx="1.7" ry="2.2"/></g>
  <g transform="translate(84 4)"><ellipse cx="5" cy="12" rx="4" ry="8"/><circle cx="2" cy="2" r="1.5"/><circle cx="5" cy="0.5" r="1.5"/><circle cx="8" cy="2" r="1.5"/></g>
</svg>`;

/** @param {import('../zoo/scene.js').ZooScene} [zoo] */
export function openPostcard(zoo) {
  let scene = '';
  try { scene = zoo ? snapshotZoo(zoo) : ''; } catch { scene = ''; }
  const year = new Date().getFullYear();

  const dialog = openDialog({
    title: 'Behind To-Zoo',
    className: 'modal--postcard',
    body: `
      <button class="pc" type="button" aria-label="Postcard. Click to flip it over." aria-pressed="false" data-flip>
        <span class="pc__inner">

          <span class="pc__face pc-front">
            <span class="pc-front__art" style="${scene ? `background-image:url(${scene})` : ''}"></span>
            <span class="pc-front__dots"></span>
            <span class="pc-front__greeting">greetings from…</span>
            <span class="pc-front__name">TO-ZOO</span>
            <span class="pc-front__hint">click to flip</span>
          </span>

          <span class="pc__face pc-back">
            <span class="pc-back__left">
              <span class="pc-back__title">Behind To-Zoo</span>
              <span class="pc-back__note">
                To-Zoo started with three students and a to-do list we kept not looking at.
                Not because we didn't care. A list just doesn't care back.
              </span>
              <span class="pc-back__note">
                So we gave every task a heartbeat. The essay you keep putting off is an
                elephant waiting by the gate. The quick email is a rabbit. They're patient,
                but they notice when you're gone.
              </span>
              <span class="pc-back__note">
                It's easier to show up for something that's waiting for you than for a
                checkbox. Look after them, and they'll look after your day.
              </span>
              <span class="pc-back__foot">${DOODLE}${PAWS}</span>
            </span>

            <span class="pc-back__right">
              <span class="pc-back__stamp">
                <img src="${PHOTO}" alt="" onerror="this.onerror=null; this.src='${portraitOf('elephant')}'">
              </span>
              <svg class="pc-back__postmark" viewBox="0 0 110 110" aria-hidden="true">
                <circle cx="55" cy="55" r="40" fill="none" stroke="currentColor" stroke-width="2.4"/>
                <circle cx="55" cy="55" r="31" fill="none" stroke="currentColor" stroke-width="1.4"/>
                <text x="55" y="52" text-anchor="middle" font-size="12" fill="currentColor">TO ZOO</text>
                <text x="55" y="68" text-anchor="middle" font-size="11" fill="currentColor">${year}</text>
              </svg>
              <span class="pc-back__lines">
                <span>To every student who opened</span>
                <span>their laptop to work and</span>
                <span>ended up somewhere else.</span>
                <span>We've been there too. ♡</span>
              </span>
              <span class="pc-back__sign">Designed with ♥ by the three of us</span>
            </span>
          </span>

        </span>
      </button>`,
    setup(panel) {
      const card = panel.querySelector('[data-flip]');
      // Start focus on the close button, so the card is not ringed on open.
      requestAnimationFrame(() => panel.querySelector('[data-close]')?.focus({ preventScroll: true }));
      card.addEventListener('click', () => {
        const flipped = card.classList.toggle('is-flipped');
        card.setAttribute('aria-pressed', String(flipped));
      });
    },
  });
  return dialog;
}
