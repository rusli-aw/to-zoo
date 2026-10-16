/**
 * To-Zoo — first run, as a tour of the real zoo.
 *
 * The app explains itself with itself: three animals walk into your actual
 * enclosure and get introduced one at a time, one of them goes home and pays
 * for it, the shop and the shared zoos open as themselves, and an elephant
 * gives up waiting while you watch. Nothing here is a mock-up.
 *
 * It never touches your task list. The cast is built directly and thrown away
 * at the end, and real animals are hidden while it runs.
 */

import * as THREE from 'three';
import { createAnimal } from '../zoo/animals.js';
import { LAYOUT } from '../zoo/environment.js';
import { flyTokens } from './toast.js';
import { reduced } from './motion.js';

/**
 * Where the three demonstration animals stand, left to right. Set well back
 * from the camera: the panel occupies the bottom of the screen, and anything
 * nearer than this stands behind it.
 */
const SPOTS = {
  elephant: new THREE.Vector3(-3.4, 0, -2.6),
  lion: new THREE.Vector3(0, 0, -2.1),
  rabbit: new THREE.Vector3(2.9, 0, -2.4),
};

const STEPS = [
  {
    key: 'welcome',
    title: 'Welcome to To-Zoo.',
    body: 'Your to-do list as an animal rescue. Every task becomes an animal in your care.',
  },
  {
    key: 'elephant',
    title: 'The elephant.',
    body: 'The massive tasks, or ones with close deadlines.',
  },
  {
    key: 'lion',
    title: 'The lion.',
    body: 'Medium tasks that are important.',
  },
  {
    key: 'rabbit',
    title: 'The rabbit.',
    body: 'Quick wins in the day. Type a task and To-Zoo picks for you.',
  },
  {
    key: 'release',
    title: 'Finish a task. Send one home.',
    body: 'The gate opens, it walks home, and you earn tokens.',
  },
  {
    key: 'shop',
    title: 'Spend your tokens.',
    body: 'Decorations, accessories for your animals, and whole seasons.',
  },
  {
    key: 'neglect',
    title: 'Leave one too long and it gives up.',
    body: 'It lies down and waits. Do the task and it is fine again.',
  },
  {
    key: 'group',
    title: 'Share a zoo.',
    body: 'One for your flat, one for a group project. Everyone adds tasks.',
  },
  {
    key: 'why',
    title: 'Why we built it this way.',
    body: 'For students, and for people with ADHD or attention difficulties who '
        + 'bounce off to-do lists. No streaks to break, and a long list costs you '
        + 'nothing. Only neglect shows.',
  },
];

/**
 * @param {object} opts
 * @param {import('../zoo/scene.js').ZooScene} opts.zoo
 * @param {any} [opts.environment]   for opening the gate during the release
 * @param {any} [opts.population]    real animals, hidden while the tour runs
 * @param {any} [opts.views]         so the shop and shared zoos can show themselves
 * @param {(result: {demo: boolean}) => void} opts.onFinish
 */
export function runOnboarding({ zoo, environment, population, views, onFinish }) {
  let index = 0;
  let disposed = false;

  /* --------------------------------------------------------- the stage -- */

  // Real animals step aside so the demonstration has the enclosure to itself.
  const hidden = [];
  for (const entry of population?.all?.() ?? []) {
    if (entry.animal?.root?.visible) {
      entry.animal.root.visible = false;
      hidden.push(entry.animal.root);
    }
  }

  /** @type {Record<string, any>} */
  const cast = {};
  const stopFrames = [];

  function summon(type) {
    if (cast[type]) return cast[type];
    const animal = createAnimal(zoo.ink, type, `tour-${type}`);
    animal.root.position.copy(SPOTS[type]);
    animal.root.visible = false;
    zoo.scene.add(animal.root);
    stopFrames.push(zoo.onFrame((dt, elapsed) => animal.update(dt, elapsed)));
    cast[type] = animal;
    return animal;
  }

  /** Fade a newcomer in rather than popping it into existence. */
  function arrive(animal, delay = 0) {
    animal.root.visible = true;
    animal.setAttention(1);
    if (reduced()) return;
    const base = animal.spec.scale;
    animal.root.scale.setScalar(base * 0.01);
    const started = performance.now() + delay;
    const stop = zoo.onFrame(() => {
      const t = Math.min(1, Math.max(0, (performance.now() - started) / 420));
      // A little overshoot, so it lands instead of inflating.
      const eased = t < 1 ? 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2 : 1;
      animal.root.scale.setScalar(base * Math.max(0.01, eased));
      if (t >= 1) stop();
    });
    stopFrames.push(stop);
  }

  /**
   * Camera. zoo.fly() rather than zoo.focusOn(): the scene keeps a camera
   * "director" after the opening shot, and while one is set the focus rig is
   * bypassed entirely, so focusOn() silently does nothing. fly() also eases
   * in and out instead of chasing.
   */
  const shot = (cam, look, seconds = 1.6) => zoo.fly([cam], [look], reduced() ? 0 : seconds);
  const home = (seconds = 1.5) => zoo.flyHome(reduced() ? 0 : seconds);

  /**
   * A three-quarter shot of one animal. Deliberately backed off: a close-up
   * fills the screen with one body and loses the comparison between the three,
   * which is the only reason these steps exist.
   */
  function portrait(type, lift, back) {
    const at = SPOTS[type];
    shot(
      new THREE.Vector3(at.x * 0.5 + 0.9, lift, at.z + back),
      at.clone().setY(0.8),
      1.5,
    );
  }

  /** Whether the tour has a view open, so it can close it on the way out. */
  let openedSheet = false;
  function sheet(name) {
    if (!views) return;
    if (name === 'zoo' && !openedSheet) return;
    openedSheet = name !== 'zoo';
    views.show(name);
  }

  /* ---------------------------------------------------------- the beats -- */

  const BEATS = {
    welcome() {
      sheet('zoo');
      home();
    },

    elephant() {
      sheet('zoo');
      // All three arrive together: the sizes only mean anything side by side.
      ['elephant', 'lion', 'rabbit'].forEach((type, i) => {
        const animal = summon(type);
        if (!animal.root.visible) setTimeout(() => !disposed && arrive(animal), i * 240);
      });
      portrait('elephant', 2.9, 7.6);
    },

    lion() {
      portrait('lion', 2.5, 6.8);
    },

    rabbit() {
      portrait('rabbit', 2.0, 5.6);
    },

    release() {
      sheet('zoo');
      const animal = summon('rabbit');
      animal.root.visible = true;
      environment?.openGate(1);

      const from = animal.root.position.clone();
      const gate = new THREE.Vector3(LAYOUT.gate.x, 0, LAYOUT.gate.z);
      const away = LAYOUT.wildTarget.clone();
      const base = animal.spec.scale;
      const t0 = performance.now() + 420;
      animal.setWalking(1);

      const stop = zoo.onFrame(() => {
        const t = Math.min(1, Math.max(0, (performance.now() - t0) / 3200));
        // Gate first, wild second, so it uses the doorway like an animal would.
        const leg = t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55;
        const a = t < 0.45 ? from : gate;
        const b = t < 0.45 ? gate : away;
        animal.root.position.lerpVectors(a, b, leg);
        animal.root.lookAt(b.x, animal.root.position.y, b.z);
        animal.root.scale.setScalar(base * (1 - 0.45 * t));

        if (t > 0.42 && !animal.root.userData.paid) {
          animal.root.userData.paid = true;
          const screen = zoo.screenPosition(animal.anchor());
          if (screen?.visible) flyTokens(screen, 8);
        }
        if (t >= 1) {
          animal.root.visible = false;
          animal.setWalking(0);
          environment?.openGate(0);
          stop();
        }
      });
      stopFrames.push(stop);
      // Wide and slightly off-axis: this beat is the whole walk out.
      shot(new THREE.Vector3(1.8, 3.6, 8.6), new THREE.Vector3(0, 0.8, -4.5), 1.4);
    },

    shop() {
      sheet('customize');
    },

    neglect() {
      sheet('zoo');
      const animal = summon('elephant');
      animal.root.visible = true;
      animal.setAttention(0);
      animal.setUrgency(1);
      setTimeout(() => !disposed && animal.setPose('lie'), reduced() ? 0 : 900);
      portrait('elephant', 2.2, 6.4);
    },

    group() {
      sheet('zoos');
    },

    why() {
      sheet('zoo');
      // Back on its feet, which is the point being made.
      cast.elephant?.setPose('stand');
      cast.elephant?.setUrgency(0.15);
      home();
    },
  };

  /* ------------------------------------------------------------- panel -- */

  const wrap = document.createElement('div');
  wrap.className = 'tour';
  wrap.innerHTML = `
    <div class="tour__panel" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <h2 class="tour__title" id="tour-title" tabindex="-1"></h2>
      <p class="tour__body"></p>
      <div class="tour__foot">
        <div class="tour__dots" role="tablist" aria-label="Progress"></div>
        <div class="tour__actions">
          <button class="btn btn--quiet btn--sm" type="button" data-skip>Skip</button>
          <button class="btn btn--primary btn--sm" type="button" data-next>Next</button>
        </div>
      </div>
    </div>`;

  document.getElementById('modal-root').appendChild(wrap);
  document.body.dataset.tour = 'open';

  const titleEl = wrap.querySelector('.tour__title');
  const bodyEl = wrap.querySelector('.tour__body');
  const dotsEl = wrap.querySelector('.tour__dots');
  const nextButton = wrap.querySelector('[data-next]');
  const skipButton = wrap.querySelector('[data-skip]');

  dotsEl.innerHTML = STEPS.map((s, i) => `
    <span class="tour__dot" role="tab" aria-label="Step ${i + 1} of ${STEPS.length}"
          data-dot="${i}"></span>`).join('');

  function paint() {
    const step = STEPS[index];
    const last = index === STEPS.length - 1;
    titleEl.textContent = step.title;
    bodyEl.innerHTML = step.body;
    for (const dot of dotsEl.children) {
      dot.classList.toggle('is-on', Number(dot.dataset.dot) === index);
    }
    nextButton.textContent = last ? 'Add my first task' : 'Next';
    skipButton.textContent = last ? 'Start with a demo zoo' : 'Skip';
    wrap.dataset.step = step.key;
    BEATS[step.key]?.();
    titleEl.focus({ preventScroll: true });
  }

  function finish(demo) {
    if (disposed) return;
    disposed = true;
    for (const stop of stopFrames) stop();
    for (const animal of Object.values(cast)) {
      zoo.scene.remove(animal.root);
      animal.dispose();
    }
    for (const root of hidden) root.visible = true;
    environment?.openGate(0);
    if (openedSheet) views?.show('zoo');
    home(0.9);
    wrap.remove();
    delete document.body.dataset.tour;
    document.removeEventListener('keydown', onKey);
    onFinish({ demo });
  }

  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    if (event.key === 'Enter' && document.activeElement === titleEl) nextButton.click();
  }

  nextButton.addEventListener('click', () => {
    if (index === STEPS.length - 1) { finish(false); return; }
    index += 1;
    paint();
  });
  skipButton.addEventListener('click', () => finish(index === STEPS.length - 1));
  document.addEventListener('keydown', onKey);

  paint();
}
