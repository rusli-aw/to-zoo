/**
 * To-Zoo — reward messages and the token flight.
 *
 * The toast has to do a slightly awkward job: be celebratory enough that
 * finishing a task feels like something, and quiet enough that finishing six
 * in a row is not six interruptions. So it is small, it stacks, it never
 * steals focus, and the only thing it ever asks for is undo.
 */

import { reduced } from './motion.js';

const root = () => document.getElementById('toast-root');
const flyRoot = () => document.getElementById('token-fly-root');

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.emoji]
 * @param {{label: string, amount: number}[]} [spec.parts]  reward breakdown
 * @param {number} [spec.total]
 * @param {'reward' | 'info' | 'warn'} [spec.tone]
 * @param {{label: string, onClick: () => void}} [spec.action]
 * @param {number} [spec.duration]
 */
export function toast(spec) {
  const host = root();
  if (!host) return () => {};

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = spec.tone ?? 'info';
  el.setAttribute('role', 'status');

  // Amounts are signed: earning reads "+25", upkeep reads "−5". Rendering the
  // sign from the number keeps the two flows using one code path.
  const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

  const parts = spec.parts?.length
    ? `<ul class="toast__parts">${spec.parts.map((p) => `
        <li><span>${escapeHtml(p.label)}</span><b>${signed(p.amount)}</b></li>`).join('')}</ul>`
    : '';

  const total = typeof spec.total === 'number'
    ? `<div class="toast__total"><span class="coin" aria-hidden="true"></span>
         <b>${signed(spec.total)}</b> tokens</div>`
    : '';

  const note = spec.note
    ? `<p class="toast__note">${escapeHtml(spec.note)}</p>`
    : '';

  el.innerHTML = `
    ${spec.emoji ? `<div class="toast__emoji" aria-hidden="true">${spec.emoji}</div>` : ''}
    <div class="toast__body">
      <p class="toast__title">${escapeHtml(spec.title)}</p>
      ${parts}
      ${total}
      ${note}
    </div>
    <div class="toast__side"></div>`;

  if (spec.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--quiet btn--sm';
    button.textContent = spec.action.label;
    button.addEventListener('click', () => {
      spec.action.onClick();
      dismiss();
    });
    el.querySelector('.toast__side').appendChild(button);
  }

  host.appendChild(el);

  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.dataset.leaving = '';
    setTimeout(() => el.remove(), reduced() ? 0 : 260);
  };

  timer = setTimeout(dismiss, spec.duration ?? (spec.action ? 6500 : 4200));

  // Never let toasts pile up past the point of being readable.
  const all = host.querySelectorAll('.toast');
  if (all.length > 3) all[0].dispatchEvent(new Event('crowded'));
  while (host.querySelectorAll('.toast').length > 3) host.firstElementChild?.remove();

  return dismiss;
}

/**
 * Coins arc between a point on screen and the piggy bank.
 *
 * Earning flies them *in* and the counter only rises once they arrive — the
 * number and the animation agreeing is most of why it feels like being paid.
 * Upkeep runs the same path backwards, coins leaving the piggy and going to
 * the animal that cost them, so paying is legible rather than a silent
 * subtraction.
 *
 * @param {{x: number, y: number}} point  client coordinates of the animal
 * @param {number} amount
 * @param {() => void} onLanded
 * @param {{ direction?: 'in' | 'out' }} [opts]
 */
export function flyTokens(point, amount, onLanded, opts = {}) {
  const counter = document.getElementById('tokens');
  const host = flyRoot();
  const outbound = opts.direction === 'out';

  const land = () => {
    counter?.classList.add(outbound ? 'is-spent' : 'is-hit');
    setTimeout(() => counter?.classList.remove(outbound ? 'is-spent' : 'is-hit'), 520);
    onLanded?.();
  };

  if (!counter || !host || reduced()) {
    land();
    return;
  }

  const box = counter.getBoundingClientRect();
  const piggy = { x: box.left + box.width / 2, y: box.top + box.height / 2 };

  // The only difference between earning and paying is which end is which.
  const from = outbound ? piggy : point;
  const tx = outbound ? point.x : piggy.x;
  const ty = outbound ? point.y : piggy.y;

  // Enough coins to read as "a lot" without becoming a swarm.
  const count = Math.max(3, Math.min(9, Math.round(amount / 5)));
  let landed = 0;

  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement('span');
    coin.className = 'coin coin--fly';
    host.appendChild(coin);

    const spreadX = (Math.random() - 0.5) * 90;
    const spreadY = (Math.random() - 0.5) * 50;
    // Arc upward first, then in — a straight line reads as a UI transition,
    // a lob reads as an object being thrown to you.
    const midX = (from.x + tx) / 2 + spreadX;
    const midY = Math.min(from.y, ty) - 90 - Math.random() * 70;

    const animation = coin.animate(
      [
        { transform: `translate(${from.x + spreadX}px, ${from.y + spreadY}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${from.x + spreadX}px, ${from.y + spreadY}px) scale(1)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${midX}px, ${midY}px) scale(1.15)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx}px, ${ty}px) scale(.5)`, opacity: 1 },
      ],
      {
        duration: 620 + i * 55,
        delay: i * 45,
        easing: 'cubic-bezier(.4, 0, .3, 1)',
        fill: 'forwards',
      },
    );

    animation.onfinish = () => {
      coin.remove();
      landed += 1;
      if (landed === count) land();
    };
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
