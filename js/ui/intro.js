/**
 * To-Zoo — the walk-in (first-run intro, spike).
 *
 * The first thing a new person sees is the zoo's gate, shut, from outside.
 * "Open the gates" swings it open and flies the camera through into the
 * enclosure; a few short cards then explain the one idea that matters —
 * a task is an animal, finishing it sends the animal home — and introduce
 * the three animals in person, each one popping up in front of the camera.
 * The last card hands over: add a first task, or look at a demo zoo.
 *
 * Every step has "Straight To-Zoo", which drops you into the zoo at once.
 *
 * The camera is driven through zoo.fly() (eased curves); the HUD is hidden with
 * .app[data-intro] while this runs; the presenter animals are real animals
 * from zoo/animals.js, standing outside the population and disposed after.
 */

import * as THREE from 'three';
import { ANIMALS } from '../model.js';
import { createAnimal } from '../zoo/animals.js';
import { LAYOUT } from '../zoo/environment.js';
import { glyph } from './icons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Each animal is introduced in its own corner of the zoo, and stays there
 * once it has been met, so the walk-through fills the place up as it goes.
 * These are preferences; the occupancy register nudges them clear of rocks.
 */
const SPOTS = {
  elephant: V(-3.4, 0, -2.4),
  lion: V(3.0, 0, -0.6),
  rabbit: V(-0.4, 0, 2.2),
};

/** Outside the shut gate, looking in. */
const TITLE_SHOT = { cam: V(0, 1.7, -15.5), look: V(0, 1.5, LAYOUT.gate.z) };

const STEPS = [
  { key: 'title' },
  {
    key: 'how',
    kicker: 'How it works',
    title: 'Every task is an animal.',
    body: 'Add something you need to do and an animal moves in. Finish it, and '
        + 'the animal walks back out through that gate, home. You earn tokens for '
        + 'each one you send home.',
  },
  {
    key: 'elephant', animal: 'elephant',
    kicker: 'Big tasks',
    title: 'The elephant.',
    body: 'The elephant in the room: the essay, the application, the thing you '
        + 'keep not doing. Worth the most when you finally let it go.',
  },
  {
    key: 'lion', animal: 'lion',
    kicker: 'Medium tasks',
    title: 'The lion.',
    body: 'Important but manageable. Worth tackling today.',
  },
  {
    key: 'rabbit', animal: 'rabbit',
    kicker: 'Small tasks',
    title: 'The rabbit.',
    body: 'Quick wins. Two minutes, tops. Clear a few when you need momentum.',
  },
  {
    key: 'mood', animal: 'rabbit', pose: 'lie',
    kicker: 'One rule',
    title: 'Don’t keep them waiting.',
    body: 'Every animal has a mood. Leave its task too long and it gets restless, '
        + 'then lies down in protest, and starts costing you tokens. A busy zoo is '
        + 'fine. A neglected one is not.',
  },
  {
    key: 'start',
    kicker: 'Ready?',
    title: 'Your zoo is open.',
    body: 'Add the first thing on your mind. To-Zoo will suggest which animal it is as you type.',
  },
];

/**
 * @param {object} ctx
 * @param {import('../zoo/scene.js').ZooScene} ctx.zoo
 * @param {any} ctx.environment  for the gate
 * @param {any} [ctx.picking]    suspended while the intro runs
 * @param {any} [ctx.space]      to keep presenters clear of rocks and bushes
 * @param {(result: {demo: boolean, skipped: boolean}) => void} ctx.onFinish
 */
export function runIntro({ zoo, environment, picking, space, onFinish }) {
  const app = document.getElementById('app');
  app?.setAttribute('data-intro', '');
  picking?.setSuspended(true);

  // Start outside, gate shut, with no flight in. Narrow screens stand
  // further back so the whole gate fits.
  if (zoo.camera.aspect < 1) TITLE_SHOT.cam.set(0, 2.1, -23);
  environment.openGate(0);
  zoo.cutTo(TITLE_SHOT.cam, TITLE_SHOT.look);
  zoo.direct(TITLE_SHOT.cam, TITLE_SHOT.look);

  const timers = new Set();
  const later = (ms, fn) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  /* ------------------------------------------------------- presenter --- */

  /** type -> { animal, spot, stop } — everyone met so far. */
  const cast = new Map();

  function spotFor(type, radius) {
    const want = SPOTS[type];
    const free = space?.findFreeNear?.(want.x, want.z, radius, {
      contains: (x, z) => Math.abs(x) < LAYOUT.maxX - 1.5 && z > LAYOUT.minZ + 1.6 && z < LAYOUT.maxZ - 1.5,
    });
    return free ? V(free.x, 0, free.z) : want.clone();
  }

  /** The camera shot for an animal: it fills ~40% of the frame, in the upper half. */
  function shotFor(member) {
    const { animal, spot } = member;
    const h = animal.height;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(zoo.camera.fov / 2));
    const dist = Math.max(2.4, h / (0.8 * tanHalf));
    const lift = 0.45 * tanHalf * dist;
    // Look at it from the side of the zoo facing its centre, so the rest of
    // the enclosure (and whoever was met before) is in the background.
    const angle = Math.atan2(-spot.x, 6 - spot.z) * 0.6 + 0.2;
    // Roughly eye level with the animal, a little above: small animals are
    // met down at their height, not from overhead.
    const camY = Math.max(0.95, h * 0.85 + 0.5);
    return {
      cam: V(spot.x + Math.sin(angle) * dist, camY, spot.z + Math.cos(angle) * dist),
      look: V(spot.x, h * 0.5 - lift, spot.z),
    };
  }

  function present(type, pose = 'stand') {
    let member = cast.get(type);
    if (!member) {
      const animal = createAnimal(zoo.ink, type, `intro-${type}`);
      const spot = spotFor(type, animal.radius);
      animal.root.position.copy(spot);
      zoo.scene.add(animal.root);
      const stop = zoo.onFrame((dt, elapsed) => animal.update(dt, elapsed));
      member = { animal, spot, stop };
      cast.set(type, member);
    }
    const { animal, spot } = member;
    animal.setUrgency(pose === 'lie' ? 0.9 : 0.15);
    animal.setPose(pose);
    animal.setAttention(1);

    const shot = shotFor(member);
    animal.root.rotation.y = Math.atan2(shot.cam.x - spot.x, shot.cam.z - spot.z) + 0.35;
    // Whoever is not being introduced looks away and gets on with things.
    for (const [other, m] of cast) if (other !== type) m.animal.setAttention(0.2);
    zoo.fly([shot.cam], [shot.look], 2.0, () => animal.boing(0.8));
  }

  function dropCast() {
    for (const m of cast.values()) {
      m.stop();
      m.animal.dispose();
    }
    cast.clear();
  }

  /* -------------------------------------------------------------- dom --- */

  const root = document.createElement('div');
  root.className = 'intro';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'intro-title');
  document.body.appendChild(root);

  let index = 0;
  let busy = false;

  const dots = () => STEPS.slice(1).map((_, i) => (
    `<span class="intro__dot${i + 1 === index ? ' is-on' : ''}"></span>`
  )).join('');

  /** Swap the card with a short crossfade rather than a hard cut. */
  let swapTimer = null;
  function render() {
    if (!root.firstElementChild) { draw(); return; }
    clearTimeout(swapTimer);
    for (const el of root.children) el.classList.add('is-out');
    swapTimer = setTimeout(draw, 200);
  }

  function draw() {
    const step = STEPS[index];
    root.dataset.step = step.key;

    if (step.key === 'title') {
      root.innerHTML = `
        <div class="intro__title-block">
          <p class="intro__eyebrow">A to-do list that lives in a little zoo</p>
          <h1 class="intro__wordmark" id="intro-title">To-Zoo</h1>
        </div>
        <div class="intro__title-actions">
          <div class="intro__actions">
            <button class="btn btn--primary btn--lg" type="button" data-open>Open the gates</button>
            <button class="intro__skip" type="button" data-skip>Straight To-Zoo →</button>
          </div>
        </div>`;
    } else {
      const spec = step.animal ? ANIMALS[step.animal] : null;
      const last = step.key === 'start';
      root.innerHTML = `
        <section class="intro__card">
          <p class="intro__kicker">${spec ? `${glyph(spec.emoji)} ` : ''}${step.kicker}</p>
          <h2 class="intro__heading" id="intro-title" tabindex="-1">${step.title}</h2>
          <p class="intro__body">${step.body}</p>
          ${spec && step.pose !== 'lie' ? `
            <p class="intro__meta"><span class="coin coin--sm"></span> ${spec.tokens} tokens when it goes home</p>` : ''}
          <div class="intro__foot">
            <div class="intro__dots" aria-hidden="true">${dots()}</div>
            <div class="intro__actions">
              ${last ? `
                <button class="btn" type="button" data-demo>Show me a demo zoo</button>
                <button class="btn btn--primary" type="button" data-first>Add my first task</button>` : `
                ${index > 1 ? '<button class="btn" type="button" data-back>Back</button>' : ''}
                <button class="btn btn--primary" type="button" data-next>Next</button>`}
            </div>
          </div>
          ${last ? '' : '<button class="intro__skip" type="button" data-skip>Straight To-Zoo →</button>'}
        </section>`;
    }

    root.querySelector('[data-open]')?.addEventListener('click', openGates);
    root.querySelector('[data-next]')?.addEventListener('click', () => go(index + 1));
    root.querySelector('[data-back]')?.addEventListener('click', () => go(index - 1));
    root.querySelector('[data-skip]')?.addEventListener('click', () => finish({ demo: false, skipped: true }));
    root.querySelector('[data-demo]')?.addEventListener('click', () => finish({ demo: true, skipped: false }));
    root.querySelector('[data-first]')?.addEventListener('click', () => finish({ demo: false, skipped: false }));
    (root.querySelector('[data-open], [data-next], [data-first]'))?.focus({ preventScroll: true });
  }

  /** Apply a step's camera and presenter. */
  function stage(step) {
    if (step.animal) {
      present(step.animal, step.pose);
    } else {
      // Back to the whole zoo — everyone met so far stays where they stood.
      for (const m of cast.values()) m.animal.setAttention(0.4);
      zoo.fly([zoo.camBase], [zoo.lookBase], 2.0);
    }
  }

  function go(next) {
    if (busy || next < 1 || next >= STEPS.length) return;
    index = next;
    stage(STEPS[index]);
    render();
  }

  /** The walk-in: gate swings open, then one continuous eased flight
   *  through it, curving round to the resting view of the zoo. */
  function openGates() {
    if (busy) return;
    busy = true;
    for (const el of root.children) el.classList.add('is-out');
    environment.openGate(1);
    const z = LAYOUT.gate.z;
    later(650, () => {
      zoo.fly(
        [V(0, 1.5, z - 2.4), V(0, 1.55, z + 2.4), V(5.5, 3.2, 5.5), zoo.camBase],
        [V(0, 1.35, z + 6), V(0, 1.25, z + 10), V(0, 1.2, 0), zoo.lookBase],
        5.2,
        () => {
          environment.openGate(0);
          busy = false;
          index = 1;
          stage(STEPS[1]);
          render();
        },
      );
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish({ demo: false, skipped: true });
    } else if (e.key === 'ArrowRight' && index > 0) {
      go(index + 1);
    } else if (e.key === 'ArrowLeft' && index > 1) {
      go(index - 1);
    }
  }
  document.addEventListener('keydown', onKey);

  let done = false;
  function finish(result) {
    if (done) return;
    done = true;
    for (const id of timers) clearTimeout(id);
    document.removeEventListener('keydown', onKey);
    dropCast();
    environment.openGate(0);
    zoo.flight = null;
    zoo.flyHome(1.4);
    picking?.setSuspended(false);
    app?.removeAttribute('data-intro');
    root.dataset.leaving = '';
    setTimeout(() => root.remove(), 380);
    onFinish(result);
  }

  render();
  return { finish };
}
