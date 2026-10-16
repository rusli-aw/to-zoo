/**
 * To-Zoo — the things you buy.
 *
 * Every catalogue entry has a builder here, keyed by its `build` field. They
 * are all made from the same primitives as the animals, so a purchase looks
 * like it belongs in the world rather than like an asset dropped into it.
 *
 * Placement is deterministic per item id: a baobab bought today stands where
 * a baobab always stands. Rearranging is a feature the prototype does not
 * have, and a zoo that reshuffled itself on reload would be worse than one
 * that does not.
 */

import * as THREE from 'three';
import { color } from './palette.js';
import { blob, box, cone, cyl, mergeGeometries, place, rng } from './geom.js';
import { LAYOUT } from './environment.js';
import { reduced } from '../ui/motion.js';

/**
 * How much ground each prop actually takes up, so animals path around trunks
 * and pools instead of standing inside them. Anything absent falls back to a
 * sensible default.
 */
const FOOTPRINT = {
  baobab: 1.1, acacia: 1.6, feverTrees: 1.5, meadow: 0, tallGrass: 0,
  stonePath: 0, termiteMounds: 1.2, wateringHole: 1.9, stream: 0,
  waterfall: 1.6, observationDeck: 1.2, rangerStation: 1.3,
  woodenBridge: 0, campsite: 1.4, safariJeep: 1.3, lanterns: 0.4,
};

/** Where each kind of thing is allowed to stand. */
const SPOTS = {
  landmark: [
    { x: -7.2, z: -4.4 }, { x: 7.4, z: -4.0 }, { x: -8.2, z: -1.2 },
    { x: 8.0, z: 2.0 }, { x: -6.0, z: 6.6 }, { x: 6.4, z: -6.0 },
  ],
  ground: [
    { x: -4.8, z: 4.4 }, { x: 4.2, z: 3.2 }, { x: -2.0, z: 5.6 },
    { x: 2.0, z: -4.6 }, { x: -6.6, z: 2.4 }, { x: 5.8, z: 6.0 },
    { x: -1.0, z: 3.4 },
  ],
  path: [
    { x: 2.6, z: 5.4 }, { x: 0.6, z: -2.6 }, { x: 1.8, z: 2.0 },
    { x: -0.4, z: 0.2 },
  ],
};

/* ---------------------------------------------------------- builders --- */

/* Each returns { parts: [{geometry, token}], sway?: number } — grouped by
   colour token so one item can still be two or three draw calls at most. */

const BUILDERS = {
  meadow() {
    const stems = [];
    const heads = [];
    const r = rng(11);
    for (let i = 0; i < 26; i += 1) {
      const x = (r() - 0.5) * 5.2;
      const z = (r() - 0.5) * 4.4;
      const h = 0.22 + r() * 0.16;
      stems.push(place(cyl(0.012, 0.016, h, {}, 4), { pos: [x, h / 2, z] }));
      heads.push(blob(0.055 + r() * 0.03, [1, 0.6, 1], { pos: [x, h, z] }, 6));
    }
    return { parts: [
      { geometry: mergeGeometries(stems), token: 'grass-deep' },
      { geometry: mergeGeometries(heads), token: 'surface' },
    ], sway: 0.03 };
  },

  stonePath() {
    const stones = [];
    const r = rng(21);
    for (let i = 0; i < 16; i += 1) {
      const t = i / 15;
      stones.push(blob(
        0.26 + r() * 0.1,
        [1, 0.16, 0.8],
        { pos: [(r() - 0.5) * 0.5, 0.04, -3.4 + t * 6.8], rot: [0, r() * 3, 0] },
        6,
      ));
    }
    return { parts: [{ geometry: mergeGeometries(stones), token: 'sand-deep' }] };
  },

  termiteMounds() {
    const parts = [];
    const r = rng(31);
    for (let i = 0; i < 4; i += 1) {
      const x = (r() - 0.5) * 3.4;
      const z = (r() - 0.5) * 2.6;
      const h = 0.5 + r() * 0.7;
      parts.push(place(cone(0.24 + r() * 0.1, h, {}, 7), { pos: [x, h / 2, z] }));
      parts.push(place(cone(0.13, h * 0.6, {}, 6), { pos: [x + 0.22, h * 0.3, z + 0.16] }));
    }
    return { parts: [{ geometry: mergeGeometries(parts), token: 'earth' }] };
  },

  acacia() { return trees(3, 2.1, 1.5, 41); },
  feverTrees() { return trees(4, 2.6, 1.1, 52); },

  baobab() {
    const trunk = mergeGeometries([
      cyl(0.55, 0.95, 2.8, { pos: [0, 1.4, 0] }, 9),
      blob(0.62, [1, 0.5, 1], { pos: [0, 2.9, 0] }, 8),
    ]);
    const branches = [];
    const r = rng(63);
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2;
      branches.push(place(cyl(0.05, 0.1, 1.1, {}, 5), {
        pos: [Math.cos(a) * 0.55, 3.4, Math.sin(a) * 0.55],
        rot: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7],
      }));
      branches.push(blob(0.3 + r() * 0.1, [1, 0.55, 1], {
        pos: [Math.cos(a) * 1.15, 3.8, Math.sin(a) * 1.15],
      }, 6));
    }
    return { parts: [
      { geometry: trunk, token: 'bark' },
      { geometry: mergeGeometries(branches), token: 'grass-deep' },
    ], sway: 0.012 };
  },

  tallGrass() {
    const blades = [];
    const r = rng(71);
    for (let i = 0; i < 34; i += 1) {
      const x = (r() - 0.5) * 3.2;
      const z = (r() - 0.5) * 2.4;
      const h = 0.8 + r() * 0.7;
      blades.push(place(cyl(0.01, 0.035, h, {}, 4), {
        pos: [x, h / 2, z],
        rot: [(r() - 0.5) * 0.34, r() * 3, (r() - 0.5) * 0.34],
      }));
    }
    return { parts: [{ geometry: mergeGeometries(blades), token: 'grass-dry' }], sway: 0.05 };
  },

  wateringHole() {
    const bank = blob(1.9, [1, 0.1, 0.82], { pos: [0, 0.04, 0] }, 12);
    const water = blob(1.62, [1, 0.06, 0.8], { pos: [0, 0.09, 0] }, 12);
    return { parts: [
      { geometry: bank, token: 'sand-deep' },
      { geometry: water, token: 'water', shine: true },
    ] };
  },

  stream() {
    const bed = [];
    const water = [];
    for (let i = 0; i < 14; i += 1) {
      const t = i / 13;
      const x = -5 + t * 10;
      const z = Math.sin(t * 3.4) * 1.5;
      bed.push(blob(0.62, [1, 0.08, 0.7], { pos: [x, 0.03, z] }, 7));
      water.push(blob(0.5, [1, 0.05, 0.6], { pos: [x, 0.08, z] }, 7));
    }
    return { parts: [
      { geometry: mergeGeometries(bed), token: 'sand-deep' },
      { geometry: mergeGeometries(water), token: 'water', shine: true },
    ] };
  },

  waterfall() {
    const rock = mergeGeometries([
      blob(1.5, [1, 1.5, 1], { pos: [0, 1.4, 0] }, 8),
      blob(1.0, [1, 0.9, 1], { pos: [0.7, 0.7, 0.5] }, 7),
    ]);
    const fall = mergeGeometries([
      box(0.9, 2.6, 0.14, { pos: [0, 1.5, 0.78] }),
      blob(0.9, [1, 0.14, 0.8], { pos: [0, 0.1, 1.2] }, 9),
    ]);
    return { parts: [
      { geometry: rock, token: 'sand-deep' },
      { geometry: fall, token: 'water', shine: true },
    ] };
  },

  observationDeck() {
    const posts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        posts.push(place(cyl(0.09, 0.11, 2.2, {}, 6), { pos: [sx * 0.75, 1.1, sz * 0.75] }));
      }
    }
    const deck = mergeGeometries([
      ...posts,
      box(2.1, 0.14, 2.1, { pos: [0, 2.2, 0] }),
      box(2.1, 0.08, 0.07, { pos: [0, 2.65, -1.02] }),
      box(0.07, 0.08, 2.1, { pos: [-1.02, 2.65, 0] }),
      box(0.07, 0.08, 2.1, { pos: [1.02, 2.65, 0] }),
      ...Array.from({ length: 6 }, (_, i) =>
        box(0.7, 0.06, 0.16, { pos: [0, 0.35 + i * 0.32, 1.15 - i * 0.05] })),
    ]);
    return { parts: [{ geometry: deck, token: 'bark' }] };
  },

  rangerStation() {
    const hut = mergeGeometries([
      box(1.9, 1.2, 1.5, { pos: [0, 0.6, 0] }),
      box(0.16, 1.4, 0.16, { pos: [-1.05, 0.7, 0.8] }),
      box(0.16, 1.4, 0.16, { pos: [1.05, 0.7, 0.8] }),
    ]);
    const roof = mergeGeometries([
      place(cone(1.75, 0.8, {}, 4), { pos: [0, 1.6, 0], rot: [0, Math.PI / 4, 0] }),
      box(2.4, 0.1, 1.2, { pos: [0, 1.28, 0.85] }),
    ]);
    return { parts: [
      { geometry: hut, token: 'surface-2' },
      { geometry: roof, token: 'bark' },
    ] };
  },

  woodenBridge() {
    const planks = [];
    for (let i = 0; i < 10; i += 1) {
      planks.push(box(1.5, 0.08, 0.2, { pos: [0, 0.36 + Math.sin(i / 9 * Math.PI) * 0.14, -1.8 + i * 0.4] }));
    }
    const ropes = [
      box(0.05, 0.05, 4.2, { pos: [-0.75, 0.86, 0] }),
      box(0.05, 0.05, 4.2, { pos: [0.75, 0.86, 0] }),
      ...[-1.9, 1.9].flatMap((z) => [
        place(cyl(0.06, 0.07, 1.0, {}, 5), { pos: [-0.75, 0.5, z] }),
        place(cyl(0.06, 0.07, 1.0, {}, 5), { pos: [0.75, 0.5, z] }),
      ]),
    ];
    return { parts: [
      { geometry: mergeGeometries(planks), token: 'bark' },
      { geometry: mergeGeometries(ropes), token: 'earth-deep' },
    ], sway: 0.02 };
  },

  campsite() {
    const tent = mergeGeometries([
      place(cone(1.0, 1.3, {}, 4), { pos: [0, 0.65, 0], rot: [0, Math.PI / 4, 0] }),
    ]);
    const kit = mergeGeometries([
      ...Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return blob(0.13, [1, 0.7, 1], { pos: [1.7 + Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45] }, 5);
      }),
      place(cyl(0.03, 0.03, 0.6, {}, 4), { pos: [1.7, 0.3, 0], rot: [0.4, 0, 0.3] }),
      box(0.4, 0.05, 0.4, { pos: [2.6, 0.34, 0.5] }),
      ...[-1, 1].flatMap((s) => [
        place(cyl(0.02, 0.02, 0.34, {}, 4), { pos: [2.6 + s * 0.15, 0.17, 0.5 + s * 0.15] }),
      ]),
    ]);
    return { parts: [
      { geometry: tent, token: 'surface-2' },
      { geometry: kit, token: 'bark' },
    ] };
  },

  safariJeep() {
    const bodyGeo = mergeGeometries([
      box(2.3, 0.6, 1.1, { pos: [0, 0.62, 0] }),
      box(1.1, 0.5, 1.0, { pos: [-0.35, 1.05, 0] }),
      box(2.4, 0.1, 1.2, { pos: [0, 1.42, 0] }),
      ...[-1, 1].flatMap((s) => [
        place(cyl(0.04, 0.04, 0.5, {}, 4), { pos: [0.55, 1.2, s * 0.5] }),
        place(cyl(0.04, 0.04, 0.5, {}, 4), { pos: [-0.95, 1.2, s * 0.5] }),
      ]),
    ]);
    const wheels = mergeGeometries(
      [-0.75, 0.8].flatMap((x) => [-1, 1].map((s) =>
        place(cyl(0.3, 0.3, 0.22, {}, 8), { pos: [x, 0.3, s * 0.6], rot: [0, 0, Math.PI / 2] }))),
    );
    return { parts: [
      { geometry: bodyGeo, token: 'grass-deep' },
      { geometry: wheels, token: 'ink' },
    ] };
  },

  lanterns() {
    const posts = [];
    const bulbs = [];
    for (let i = 0; i < 2; i += 1) {
      posts.push(place(cyl(0.06, 0.08, 2.4, {}, 6), { pos: [i * 5 - 2.5, 1.2, 0] }));
    }
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const x = -2.5 + t * 5;
      // A catenary, roughly: the string sags between the two posts.
      const y = 2.3 - Math.sin(t * Math.PI) * 0.55;
      bulbs.push(blob(0.11, [1, 1.25, 1], { pos: [x, y, 0] }, 6));
    }
    return { parts: [
      { geometry: mergeGeometries(posts), token: 'bark' },
      { geometry: mergeGeometries(bulbs), token: 'caution', glow: true },
    ], sway: 0.02 };
  },

  butterflies() { return { flock: { count: 12, color: 'accent', height: 1.1, speed: 1 } }; },
  fireflies() { return { flock: { count: 20, color: 'caution', height: 0.7, speed: 0.45, glow: true } }; },

  // Cosmetics worn by the animals are handled by animalTask, not here.
  sunHats() { return { parts: [] }; },
  flowerCrowns() { return { parts: [] }; },
};

/** The geometry for a shop item, for thumbnails. Cosmetics included. */
export function itemPieces(build) {
  if (BUILDERS[build]) {
    const spec = BUILDERS[build]();
    if (spec?.parts?.length) return spec;
  }
  const cosmetic = cosmeticGeometry(build);
  if (cosmetic?.parts?.length) return { ...cosmetic, cosmetic: true };
  return null;
}

/** Shared tree builder for the acacia grove and the fever trees. */
function trees(count, height, spread, seed) {
  const trunks = [];
  const canopies = [];
  const r = rng(seed);
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + r();
    const x = Math.cos(a) * spread * (0.6 + r() * 0.8);
    const z = Math.sin(a) * spread * (0.6 + r() * 0.8);
    const h = height * (0.75 + r() * 0.5);
    trunks.push(place(cyl(0.1, 0.16, h, {}, 6), { pos: [x, h / 2, z] }));
    canopies.push(blob(0.95 + r() * 0.3, [1, 0.3, 1], { pos: [x, h + 0.1, z] }, 8));
    canopies.push(blob(0.62, [1, 0.34, 1], { pos: [x + 0.25, h + 0.4, z - 0.1] }, 7));
  }
  return { parts: [
    { geometry: mergeGeometries(trunks), token: 'bark' },
    { geometry: mergeGeometries(canopies), token: 'grass-deep' },
  ], sway: 0.018 };
}

/* ------------------------------------------------------------- system --- */

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildDecorations(zoo, space = null) {
  const group = new THREE.Group();
  zoo.scene.add(group);

  /** @type {Map<string, any>} itemId -> { root, sway, flock } */
  const placed = new Map();
  const counters = { landmark: 0, ground: 0, path: 0 };

  function spotFor(item) {
    const list = SPOTS[item.slot] ?? SPOTS.ground;
    const index = counters[item.slot] !== undefined ? counters[item.slot]++ : 0;
    return list[index % list.length];
  }

  /** Saved positions from the store, itemId -> {x, z}. 0,0 means "not placed by hand". */
  let saved = new Map();

  function add(item) {
    const builder = BUILDERS[item.build];
    if (!builder) return;
    const spec = builder();

    const root = new THREE.Group();
    const at = saved.get(item.id);
    const spot = at && (at.x || at.z) ? at : spotFor(item);
    root.position.set(spot.x, 0, spot.z);
    root.rotation.y = rng(item.id.length * 977)() * Math.PI * 2;

    if (spec.parts) {
      for (const part of spec.parts) {
        if (!part.geometry) continue;
        const draw = zoo.ink.draw(part.geometry, color(part.token).clone(), {
          width: 0.03,
          wobble: spec.sway ? 0.02 : 0.012,
        });
        if (part.shine) {
          draw.body.material.emissive = color('water-deep').clone();
          draw.body.material.emissiveIntensity = 0.25;
        }
        if (part.glow) {
          draw.body.material.emissive = color(part.token).clone();
          draw.body.material.emissiveIntensity = 0.7;
        }
        root.add(draw);
      }
    }

    let flock = null;
    if (spec.flock) flock = makeFlock(zoo, spec.flock, root);

    group.add(root);

    // How much ground it really covers, measured from the model, so animals
    // walk round the whole thing rather than a guessed circle. Flat things
    // (paths, meadows, streams, bridges) stay walkable.
    let footprint = FOOTPRINT[item.build] ?? 0.7;
    if (footprint > 0) {
      const box = new THREE.Box3().setFromObject(root);
      const half = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      if (Number.isFinite(half)) footprint = Math.max(footprint, half * 0.9);
    }

    // Newly bought things arrive rather than appear.
    root.scale.setScalar(reduced() ? 1 : 0.01);
    // Anything with a trunk or a bank is something to walk around; ambient
    // flocks are not, so they are left out of the register entirely.
    if (space && item.slot !== 'ambient' && item.slot !== 'animal') {
      space.register(`deco_${item.id}`, {
        x: spot.x, z: spot.z, r: footprint, mobile: false,
      });
    }
    for (const o of root.children) o.traverse((m) => { m.userData.decoId = item.id; });
    placed.set(item.id, { root, sway: spec.sway ?? 0, flock, grow: reduced() ? 1 : 0, footprint });
  }

  function remove(itemId) {
    const entry = placed.get(itemId);
    if (!entry) return;
    space?.remove(`deco_${itemId}`);
    entry.root.removeFromParent();
    entry.root.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      mesh.geometry?.dispose?.();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    placed.delete(itemId);
  }

  zoo.onFrame((dt, elapsed) => {
    for (const entry of placed.values()) {
      if (entry.grow < 1) {
        entry.grow = Math.min(1, entry.grow + dt * 2.2);
        // A touch of overshoot, so it lands rather than inflates.
        const t = entry.grow;
        const s = t < 1 ? 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2 : 1;
        entry.root.scale.setScalar(Math.max(0.01, s));
      }
      if (entry.sway) {
        entry.root.rotation.z = Math.sin(elapsed * 0.6 + entry.root.position.x) * entry.sway;
      }
      entry.flock?.update(dt, elapsed);
    }
  });

  /* ------------------------------------------------------------ drag --- */

  /**
   * Every prop can be picked up and moved anywhere inside the fence. Press on
   * it, drag across the lawn (it lifts a little while carried), let go to set
   * it down. The fence keeps it in; its footprint moves with it, so the
   * animals re-route round its new spot.
   */
  let dragging = null;
  let justDragged = false;
  let onMoved = null;
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const canvas = zoo.canvas;
  canvas.style.touchAction = 'none';

  function groundAt(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, zoo.camera);
    return ray.ray.intersectPlane(ground, hitPoint);
  }
  function propAt(e) {
    const roots = [...placed.values()].map((p) => p.root);
    const hit = zoo.raycast(e.clientX, e.clientY, roots).find((h) => h.object.userData.decoId);
    return hit ? hit.object.userData.decoId : null;
  }
  const clampIn = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || document.body.dataset.modal === 'open') return;
    if (document.getElementById('app')?.dataset.sheet === 'open') return;
    const id = propAt(e);
    if (!id) return;
    const entry = placed.get(id);
    const p = groundAt(e);
    if (!entry || !p) return;
    dragging = { id, entry, dx: entry.root.position.x - p.x, dz: entry.root.position.z - p.z, moved: false, pointer: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) {
      if (e.pointerType === 'mouse') canvas.style.cursor = propAt(e) ? 'grab' : '';
      return;
    }
    const p = groundAt(e);
    if (!p) return;
    const { entry } = dragging;
    const m = Math.max(0.6, (entry.footprint || 0.5) * 0.7);
    const x = clampIn(p.x + dragging.dx, LAYOUT.minX + m, LAYOUT.maxX - m);
    const z = clampIn(p.z + dragging.dz, LAYOUT.minZ + m, LAYOUT.maxZ - m);
    if (Math.hypot(x - entry.root.position.x, z - entry.root.position.z) > 0.02) dragging.moved = true;
    entry.root.position.set(x, 0.18, z);   // carried: lifted off the grass
    space?.move(`deco_${dragging.id}`, x, z);
  });

  function drop() {
    if (!dragging) return;
    const { id, entry, moved } = dragging;
    entry.root.position.y = 0;
    canvas.style.cursor = '';
    dragging = null;
    if (moved) {
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      onMoved?.(id, entry.root.position.x, entry.root.position.z);
    }
  }
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  // A drag must not also count as a click on an animal underneath.
  canvas.addEventListener('click', (e) => { if (justDragged) e.stopImmediatePropagation(); }, true);

  return {
    group,

    /** Called with (itemId, x, z) when a prop is set down somewhere new. */
    onMoved(fn) { onMoved = fn; },

    /** True while a prop is being carried. */
    get dragging() { return Boolean(dragging); },

    /**
     * @param {ReturnType<import('../store.js').shopItems>} items
     */
    sync(items, placements = []) {
      saved = new Map(placements.map((p) => [p.itemId, { x: p.x, z: p.z }]));
      // Moved somewhere else (another tab, an undo): follow it.
      for (const [id, entry] of placed) {
        const at = saved.get(id);
        if (at && (at.x || at.z) && entry !== dragging?.entry
          && (Math.abs(entry.root.position.x - at.x) > 0.01 || Math.abs(entry.root.position.z - at.z) > 0.01)) {
          entry.root.position.set(at.x, 0, at.z);
          space?.move(`deco_${id}`, at.x, at.z);
        }
      }
      const wanted = new Set(
        items.filter((i) => i.owned && i.placedCount > 0 && BUILDERS[i.build]).map((i) => i.id),
      );

      for (const item of items) {
        if (wanted.has(item.id) && !placed.has(item.id)) add(item);
        else if (!wanted.has(item.id) && placed.has(item.id)) remove(item.id);
      }
    },

    applyTheme() {
      // Colours are cloned per material, so a theme flip rebuilds them.
      const ids = [...placed.keys()];
      for (const id of ids) remove(id);
      // The caller follows with a sync(), which re-adds everything in place.
      counters.landmark = counters.ground = counters.path = 0;
    },
  };
}

/** Butterflies and fireflies: instanced quads on lazy orbits. */
function makeFlock(zoo, spec, parent) {
  const geometry = mergeGeometries([
    blob(0.07, [1, 0.25, 0.7], { pos: [0.05, 0, 0] }, 5),
    blob(0.07, [1, 0.25, 0.7], { pos: [-0.05, 0, 0] }, 5),
  ]);
  const material = new THREE.MeshLambertMaterial({
    color: color(spec.color).clone(),
    transparent: true,
    opacity: 0.9,
  });
  if (spec.glow) {
    material.emissive = color(spec.color).clone();
    material.emissiveIntensity = 0.8;
  }

  const mesh = new THREE.InstancedMesh(geometry, material, spec.count);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  parent.add(mesh);

  const dummy = new THREE.Object3D();
  const r = rng(9393);
  const orbits = Array.from({ length: spec.count }, () => ({
    radius: 0.8 + r() * 2.6,
    height: spec.height + r() * 0.9,
    phase: r() * Math.PI * 2,
    speed: (0.35 + r() * 0.5) * spec.speed * (r() > 0.5 ? 1 : -1),
    bob: 0.15 + r() * 0.25,
  }));

  return {
    update(dt, elapsed) {
      // Reduced motion parks them; they are decoration, not information.
      const t = reduced() ? 0 : elapsed;
      for (let i = 0; i < spec.count; i += 1) {
        const o = orbits[i];
        const a = o.phase + t * o.speed;
        dummy.position.set(
          Math.cos(a) * o.radius,
          o.height + Math.sin(t * 1.7 + o.phase) * o.bob,
          Math.sin(a) * o.radius,
        );
        dummy.rotation.set(Math.sin(t * 9 + o.phase) * 0.6, -a, 0);
        dummy.scale.setScalar(0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Hats and crowns, worn by every animal. Returned as a geometry the animal
 * module parents to its head, so the cosmetic inherits the head's motion.
 */
export function cosmeticGeometry(build) {
  // Each returns one or more coloured pieces. Multi-piece cosmetics let a hat
  // have a band and a pair of sunglasses have lenses, without needing a whole
  // material system for something worn on a head.
  switch (build) {
    case 'sunHats':
      return {
        parts: [
          {
            token: 'sand',
            geometry: mergeGeometries([
              blob(0.52, [1, 0.16, 1], { pos: [0, 0.34, 0] }, 10),   // brim
              blob(0.28, [1, 0.6, 1], { pos: [0, 0.44, 0] }, 8),     // crown
            ]),
          },
          {
            // The hatband, sitting where the crown meets the brim.
            token: 'overdue',
            geometry: place(cyl(0.29, 0.29, 0.075, {}, 12), { pos: [0, 0.4, 0] }),
          },
        ],
      };

    case 'flowerCrowns': {
      const blooms = [];
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        blooms.push(blob(0.09, [1, 0.7, 1], {
          pos: [Math.cos(a) * 0.34, 0.34, Math.sin(a) * 0.34],
        }, 5));
      }
      return { parts: [{ token: 'accent', geometry: mergeGeometries(blooms) }] };
    }

    case 'sunglasses':
      return {
        kind: 'eyes',
        parts: [
          {
            token: 'outline',
            geometry: mergeGeometries([
              blob(0.15, [1, 0.62, 0.28], { pos: [-0.19, 0.08, 0.4] }, 7),
              blob(0.15, [1, 0.62, 0.28], { pos: [0.19, 0.08, 0.4] }, 7),
              box(0.16, 0.045, 0.05, { pos: [0, 0.08, 0.42] }),          // bridge
              box(0.05, 0.04, 0.3, { pos: [-0.32, 0.09, 0.27] }),        // arms
              box(0.05, 0.04, 0.3, { pos: [0.32, 0.09, 0.27] }),
            ]),
          },
        ],
      };

    case 'udeng':
      // A Balinese udeng: white cloth folded around the head, knotted at the
      // front, with the two points rising at the sides.
      return {
        parts: [
          {
            token: 'cloth',
            geometry: mergeGeometries([
              place(cyl(0.42, 0.44, 0.22, {}, 12), { pos: [0, 0.3, 0] }),     // band
              blob(0.16, [1, 0.85, 0.5], { pos: [0, 0.36, 0.4] }, 7),         // front knot
              blob(0.12, [0.55, 1.5, 0.35], { pos: [-0.3, 0.5, 0.06], rot: [0, 0, 0.5] }, 6),
              blob(0.12, [0.55, 1.5, 0.35], { pos: [0.3, 0.5, 0.06], rot: [0, 0, -0.5] }, 6),
            ]),
          },
          {
            // The gold thread that makes it read as Balinese rather than a cap.
            token: 'accent',
            geometry: place(cyl(0.435, 0.435, 0.045, {}, 12), { pos: [0, 0.37, 0] }),
          },
        ],
      };

    default:
      return null;
  }
}
