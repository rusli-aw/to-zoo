/**
 * To-Zoo — the boundary.
 *
 * v1 ran fence along the back and part of the sides and simply stopped, so
 * the whole near edge was open and animals wandered past the ends of it. A
 * boundary with a hole in it is not a boundary; it makes the world look like
 * a stage set and it silently contradicts the placement rules.
 *
 * This walks the perimeter as a closed loop and emits posts and rails for
 * every run, with real corner posts where runs meet. The gate is the only
 * opening, and it exists because releasing an animal needs somewhere to go.
 *
 * Styles re-skin the entire boundary at once. The player picks a look; they
 * never place a segment.
 */

import * as THREE from 'three';
import { color } from './palette.js';
import { box, cyl, mergeGeometries, place, rng } from './geom.js';
import { LAYOUT } from './environment.js';

/**
 * Each style says how to build one post and one run of rails. Everything else
 * — where they go, how many, the corners — is handled by the walker below.
 */
export const FENCE_STYLES = {
  starter: {
    id: 'starter', name: 'Picket fence', cost: 0,
    blurb: 'Cream-white pickets with pointed tops. Very island.',
    token: 'picket', spacing: 0.34, postR: 0.1, postH: 0.82, postShape: 'picket',
    rails: [{ y: 0.62, h: 0.08, d: 0.05, back: true }, { y: 0.24, h: 0.08, d: 0.05, back: true }],
  },
  safari: {
    id: 'safari', name: 'Safari fence', cost: 120,
    blurb: 'Heavier posts and a third rail. Classic reserve fencing.',
    token: 'earth-deep', spacing: 2.1, postR: 0.11, postH: 1.25, postShape: 'round',
    rails: [{ y: 0.95, h: 0.1, d: 0.08 }, { y: 0.62, h: 0.1, d: 0.08 }, { y: 0.3, h: 0.1, d: 0.08 }],
  },
  rustic: {
    id: 'rustic', name: 'Rustic fence', cost: 180,
    blurb: 'Irregular branches, lashed together. No two posts alike.',
    token: 'bark', spacing: 1.6, postR: 0.085, postH: 1.1, jitter: 0.16,
    rails: [{ y: 0.8, h: 0.075, d: 0.075 }, { y: 0.46, h: 0.07, d: 0.07 }],
  },
  stone: {
    id: 'stone', name: 'Stone wall', cost: 320,
    blurb: 'Dry-stacked fieldstone. Cool in the shade.',
    token: 'sand-deep', spacing: 1.15, postR: 0.3, postH: 0.72, postShape: 'block',
    rails: [{ y: 0.78, h: 0.16, d: 0.44 }],
  },
  bamboo: {
    id: 'bamboo', name: 'Bamboo fence', cost: 260,
    blurb: 'Tall pale canes, close-set. Rattles pleasantly.',
    token: 'grass-dry', spacing: 0.42, postR: 0.05, postH: 1.4, postShape: 'round',
    rails: [{ y: 1.15, h: 0.055, d: 0.055 }, { y: 0.55, h: 0.055, d: 0.055 }],
  },
  elegant: {
    id: 'elegant', name: 'Elegant fence', cost: 420,
    blurb: 'Turned posts and a moulded top rail. Rather grand.',
    token: 'surface-2', spacing: 1.9, postR: 0.075, postH: 1.3, postShape: 'turned',
    rails: [{ y: 1.12, h: 0.12, d: 0.14 }, { y: 0.72, h: 0.07, d: 0.06 }, { y: 0.38, h: 0.07, d: 0.06 }],
  },
};

export const FENCE_ORDER = ['starter', 'safari', 'rustic', 'bamboo', 'stone', 'elegant'];

/* ------------------------------------------------------------- pieces --- */

function postGeometry(style, seed) {
  const r = rng(seed);
  const jitter = style.jitter ? (r() - 0.5) * style.jitter : 0;
  const h = style.postH + jitter;

  switch (style.postShape) {
    case 'picket': {
      // A flat board with a pointed top: a four-sided cone turned square to
      // the board and squashed to its thickness.
      const w = style.postR * 2;
      const d = 0.05;
      const tip = new THREE.ConeGeometry(w / Math.SQRT2, w * 0.7, 4);
      place(tip, { rot: [0, Math.PI / 4, 0] });
      place(tip, { scale: [1, 1, d / w] });
      place(tip, { pos: [0, h + w * 0.35, 0] });
      return mergeGeometries([box(w, h, d, { pos: [0, h / 2, 0] }), tip]);
    }
    case 'block':
      return box(style.postR * 2, h, style.postR * 1.5, { pos: [0, h / 2, 0] });
    case 'turned':
      // A turned post: shaft, a bead near the top, and a cap.
      return mergeGeometries([
        place(cyl(style.postR * 0.85, style.postR, h, {}, 8), { pos: [0, h / 2, 0] }),
        place(cyl(style.postR * 1.5, style.postR * 1.5, 0.09, {}, 8), { pos: [0, h * 0.82, 0] }),
        place(cyl(0.001, style.postR * 1.3, 0.14, {}, 8), { pos: [0, h + 0.06, 0] }),
      ]);
    case 'round':
      return place(cyl(style.postR * 0.9, style.postR, h, {}, 7), { pos: [0, h / 2, 0] });
    default:
      return place(cyl(style.postR * 0.86, style.postR, h, {}, 6), { pos: [0, h / 2, 0] });
  }
}

/* ------------------------------------------------------------- walker --- */

/**
 * The perimeter as a closed loop of corners. Because it is a loop, the fence
 * cannot have a gap unless one is asked for by name.
 */
function perimeter() {
  const { minX, maxX, minZ, maxZ } = LAYOUT;
  return [
    { x: minX, z: minZ },   // back left
    { x: maxX, z: minZ },   // back right
    { x: maxX, z: maxZ },   // front right
    { x: minX, z: maxZ },   // front left
  ];
}

/**
 * Build one straight run, skipping the gate opening if it falls inside it.
 * Returns geometry pieces; the caller merges everything into one draw call.
 */
function run(style, from, to, parts, seed) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return;

  const angle = Math.atan2(-dz, dx);
  const gate = LAYOUT.gate;

  // Is the gate on this run? Only the back edge carries it.
  const onThisRun = Math.abs(from.z - gate.z) < 0.01 && Math.abs(to.z - gate.z) < 0.01;
  const gapFrom = gate.x - gate.width / 2;
  const gapTo = gate.x + gate.width / 2;

  /** Segments of this run that actually get fence, in 0..1 along it. */
  const spans = [];
  if (!onThisRun) {
    spans.push([0, 1]);
  } else {
    const a = (gapFrom - from.x) / dx;
    const b = (gapTo - from.x) / dx;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo > 0) spans.push([0, Math.min(1, lo)]);
    if (hi < 1) spans.push([Math.max(0, hi), 1]);
  }

  for (const [t0, t1] of spans) {
    const spanLen = (t1 - t0) * length;
    if (spanLen < 0.05) continue;

    // At least one bay per span, and always a post at each end, so a run
    // never terminates in mid-air.
    const bays = Math.max(1, Math.round(spanLen / style.spacing));

    for (let i = 0; i <= bays; i += 1) {
      const t = t0 + ((t1 - t0) * i) / bays;
      const x = from.x + dx * t;
      const z = from.z + dz * t;
      parts.push(place(postGeometry(style, seed + i * 977), { pos: [x, 0, z], rot: [0, angle, 0] }));
    }

    const midX = from.x + dx * ((t0 + t1) / 2);
    const midZ = from.z + dz * ((t0 + t1) / 2);
    // Rails marked `back` sit behind the boards (on the outside of the loop),
    // the way a picket fence is nailed to its stringers.
    const nx = dz / length;
    const nz = -dx / length;
    for (const rail of style.rails) {
      const off = rail.back ? 0.05 : 0;
      parts.push(box(spanLen, rail.h, rail.d, {
        pos: [midX + nx * off, rail.y, midZ + nz * off],
        rot: [0, angle, 0],
      }));
    }
  }
}

/* -------------------------------------------------------------- build --- */

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildFence(zoo) {
  const group = new THREE.Group();
  zoo.scene.add(group);

  let current = null;
  let styleId = null;

  function clear() {
    if (!current) return;
    group.remove(current);
    current.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      mesh.geometry?.dispose?.();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    current = null;
  }

  function build(id) {
    const style = FENCE_STYLES[id] ?? FENCE_STYLES.starter;
    clear();

    const parts = [];
    const corners = perimeter();

    // Walk the loop: every corner connects to the next, and the last connects
    // back to the first. That wrap is what guarantees no open edge.
    for (let i = 0; i < corners.length; i += 1) {
      run(style, corners[i], corners[(i + 1) % corners.length], parts, 100 + i * 31);
    }

    // Corner posts last, so they sit proud of the runs that meet there.
    for (const [i, corner] of corners.entries()) {
      const cornerStyle = { ...style, postR: style.postR * 1.25, postH: style.postH * 1.08 };
      parts.push(place(postGeometry(cornerStyle, 700 + i), { pos: [corner.x, 0, corner.z] }));
    }

    current = zoo.ink.draw(mergeGeometries(parts), color(style.token).clone(), {
      width: 0.028,
      wobble: style.id === 'stone' ? 0.006 : 0.011,
    });
    group.add(current);
    styleId = id;
  }

  build('starter');

  return {
    group,
    get style() { return styleId; },

    setStyle(id) {
      if (id === styleId) return;
      build(id);
    },

    applyTheme() { if (styleId) build(styleId); },

    /**
     * Is this point inside the fenced area? The placement system and the
     * animal AI both ask, so there is exactly one definition of "in the zoo".
     */
    contains(x, z, margin = 0.6) {
      return x > LAYOUT.minX + margin && x < LAYOUT.maxX - margin
          && z > LAYOUT.minZ + margin && z < LAYOUT.maxZ - margin;
    },

    /** Nearest legal point, for clamping a drag that strayed outside. */
    clamp(x, z, margin = 0.6) {
      return {
        x: Math.max(LAYOUT.minX + margin, Math.min(LAYOUT.maxX - margin, x)),
        z: Math.max(LAYOUT.minZ + margin, Math.min(LAYOUT.maxZ - margin, z)),
      };
    },

    dispose() { clear(); },
  };
}
