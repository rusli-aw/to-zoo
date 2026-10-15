/**
 * To-Zoo — the postcard.
 *
 * Tap the logo and a postcard from the people who made To-Zoo slides in:
 * a photo of the three of us, why it exists, and a line of paw prints, one
 * from each animal. A personal note in an app that is otherwise all task.
 *
 * The photo is assets/team.jpg. Until it exists the frame shows a quiet
 * placeholder rather than a broken image.
 */

import { openDialog } from './dialog.js';

const PHOTO = 'assets/team.jpg';

/** Paw prints: elephant, lion, rabbit, each a pair, walking off the card. */
const PAWS = `
<svg class="postcard__paws" viewBox="0 0 260 64" aria-hidden="true">
  <g fill="#d9703a">
    <!-- elephant: a big round pad with toenail dots -->
    <g transform="translate(14 22) rotate(-8)">
      <ellipse cx="14" cy="16" rx="13" ry="12" fill="#f2dccb" stroke="#d9703a" stroke-width="3.5"/>
      <circle cx="4" cy="2" r="2.6"/><circle cx="11" cy="-1" r="2.6"/><circle cx="18" cy="-1" r="2.6"/><circle cx="25" cy="2" r="2.6"/>
    </g>
    <g transform="translate(52 10) rotate(6)">
      <ellipse cx="14" cy="16" rx="13" ry="12" fill="#f2dccb" stroke="#d9703a" stroke-width="3.5"/>
      <circle cx="4" cy="2" r="2.6"/><circle cx="11" cy="-1" r="2.6"/><circle cx="18" cy="-1" r="2.6"/><circle cx="25" cy="2" r="2.6"/>
    </g>
    <!-- lion: a lobed pad and four toes -->
    <g transform="translate(106 26) rotate(-10)">
      <path d="M2 18c0-6 5-9 9-9s9 3 9 9c0 4-3 5-5 5-2 0-3-1.5-4-1.5S9 23 7 23c-2 0-5-1-5-5z"/>
      <ellipse cx="1" cy="6" rx="2.6" ry="3.4"/><ellipse cx="7.5" cy="1" rx="2.6" ry="3.4"/>
      <ellipse cx="14.5" cy="1" rx="2.6" ry="3.4"/><ellipse cx="21" cy="6" rx="2.6" ry="3.4"/>
    </g>
    <g transform="translate(140 12) rotate(8)">
      <path d="M2 18c0-6 5-9 9-9s9 3 9 9c0 4-3 5-5 5-2 0-3-1.5-4-1.5S9 23 7 23c-2 0-5-1-5-5z"/>
      <ellipse cx="1" cy="6" rx="2.6" ry="3.4"/><ellipse cx="7.5" cy="1" rx="2.6" ry="3.4"/>
      <ellipse cx="14.5" cy="1" rx="2.6" ry="3.4"/><ellipse cx="21" cy="6" rx="2.6" ry="3.4"/>
    </g>
    <!-- rabbit: a long narrow foot, small toes -->
    <g transform="translate(192 22) rotate(-6)">
      <ellipse cx="7" cy="16" rx="5.5" ry="11"/>
      <circle cx="2.5" cy="2" r="2"/><circle cx="7" cy="0" r="2"/><circle cx="11.5" cy="2" r="2"/>
    </g>
    <g transform="translate(222 10) rotate(8)">
      <ellipse cx="7" cy="16" rx="5.5" ry="11"/>
      <circle cx="2.5" cy="2" r="2"/><circle cx="7" cy="0" r="2"/><circle cx="11.5" cy="2" r="2"/>
    </g>
  </g>
</svg>`;

export function openPostcard() {
  openDialog({
    title: 'Behind To-Zoo',
    className: 'modal--postcard',
    body: `
      <figure class="postcard__photo">
        <img src="${PHOTO}" alt="The three of us who made To-Zoo"
             onerror="this.hidden = true; this.nextElementSibling.hidden = false">
        <figcaption hidden>A photo of the three of us goes here</figcaption>
      </figure>
      <h3 class="postcard__title" aria-hidden="true">Behind To-Zoo</h3>
      <div class="postcard__note">
        <p>To-Zoo started with three students and a to-do list we kept not looking at.</p>
        <p>Not because we didn't care. A list just doesn't care back. It gets longer and
           quieter, and it's so easy to close the tab and drift somewhere else.</p>
        <p>So we gave every task a heartbeat. The essay you keep putting off becomes an
           elephant, waiting for you by the gate. The quick email becomes a rabbit.
           They're patient. But they notice when you're gone.</p>
        <p>It turns out it's easier to show up for something that's waiting for you than
           for a checkbox. Caring for a whole zoo gives the day a shape, a small sense of
           responsibility, and a small win every time one of them gets to go home.</p>
        <p>This is for every student who has opened their laptop to work and ended up
           somewhere else. We've been there too. Your animals will wait for you. Just
           don't make them wait too long.</p>
        <p class="postcard__sign">With love, the three of us</p>
      </div>
      ${PAWS}`,
  });
}
