/**
 * To-Zoo — animal anatomy.
 *
 * The geometry only. Behaviour, mood and task binding live elsewhere; this
 * file's single job is that an elephant reads as an elephant from a camera
 * sitting low and about fifteen units away.
 *
 * v1 failed that test. Its animals were one big blob with four cylinders
 * pushed into the underside, and at distance all three species collapsed into
 * the same lump. The fixes are all about *silhouette*, because silhouette is
 * the only thing that survives being small on screen:
 *
 *   - the head is pushed clear of the body on a neck, so there is a notch
 *     between them rather than one continuous mass
 *   - the parts that identify a species are oversized and held away from the
 *     body — an elephant's ears and trunk, a lion's mane, a rabbit's fleece
 *   - legs taper and have feet, so they read as limbs rather than dowels
 *   - the back has a line: withers, dip, haunch
 *
 * Everything is still built from squashed spheres and tapered cylinders, and
 * everything still wears the wobbling ink outline. Better proportioned, not
 * more realistic.
 */

import * as THREE from 'three';
import { blob, box, cone, cyl, mergeGeometries, place, rng } from './geom.js';

/**
 * A leg: tapered, with a foot. `splay` pushes the foot outward from the hip so
 * the stance reads as weight-bearing instead of four parallel pipes.
 */
function leg(x, z, { top, bottom, height, foot, splay = 0.02 }) {
  const fx = x + Math.sign(x) * splay * height;
  const fz = z + Math.sign(z) * splay * height * 0.4;
  return [
    // Thigh into shin, angled slightly outward.
    place(cyl(bottom, top, height, {}, 7), {
      pos: [(x + fx) / 2, height / 2, (z + fz) / 2],
      rot: [0, 0, Math.atan2(fx - x, height) * -1],
    }),
    // Foot: a flattened pad, always wider than the ankle.
    blob(foot, [1, 0.45, 1.15], { pos: [fx, foot * 0.42, fz + foot * 0.12] }, 7),
  ];
}

function legs(spec) {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Front legs sit a little further under the chest than the back ones.
      const scale = sz > 0 ? spec.front ?? 1 : 1;
      out.push(...leg(sx * spec.spreadX, sz * spec.spreadZ, {
        top: spec.top * scale,
        bottom: spec.bottom * scale,
        height: spec.height,
        foot: spec.foot * scale,
        splay: spec.splay,
      }));
    }
  }
  return out;
}

/* ------------------------------------------------------------ elephant --- */

export function buildElephant() {
  const bodyY = 1.32;

  const body = mergeGeometries([
    // Barrel, longer than it is wide, with the withers higher than the rump.
    blob(0.8, [1.02, 0.92, 1.28], { pos: [0, bodyY, 0] }, 11),
    blob(0.62, [1, 0.95, 1], { pos: [0, bodyY + 0.12, 0.42] }, 9),   // shoulders
    blob(0.58, [1, 0.9, 1], { pos: [0, bodyY - 0.04, -0.6] }, 9),    // haunch
    // Chest, dropping between the front legs.
    blob(0.5, [1, 0.8, 0.85], { pos: [0, bodyY - 0.32, 0.5] }, 8),

    ...legs({
      spreadX: 0.46, spreadZ: 0.5, height: 0.92,
      top: 0.26, bottom: 0.2, foot: 0.25, splay: 0.03, front: 1.02,
    }),

    // Tail with a tuft, hanging off the back of the rump.
    place(cyl(0.035, 0.06, 0.62, {}, 5), { pos: [0, bodyY - 0.22, -1.12], rot: [0.42, 0, 0] }),
    blob(0.075, [1, 1.4, 1], { pos: [0, bodyY - 0.56, -1.3] }, 5),
  ]);

  // The head is carried forward and slightly down on a short thick neck, so a
  // clear notch appears between skull and shoulder.
  const head = mergeGeometries([
    place(cyl(0.42, 0.5, 0.34, {}, 9), { pos: [0, 0.16, -0.16], rot: [0.5, 0, 0] }), // neck
    blob(0.46, [1.05, 1.1, 0.92], { pos: [0, 0, 0] }, 10),          // skull
    blob(0.3, [1.15, 0.62, 0.9], { pos: [0, 0.3, -0.02] }, 8),      // domed brow
    blob(0.33, [1, 0.8, 0.9], { pos: [0, -0.24, 0.16] }, 8),        // muzzle base

    // Trunk: nine shrinking segments on an S-curve, hanging then curling out.
    ...Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      const drop = -0.42 - t * 0.92;
      const push = 0.3 + Math.sin(t * 2.1) * 0.34;
      return blob(0.175 - t * 0.105, [1, 1, 1], { pos: [0, drop, push] }, 7);
    }),

    // Ears: big, thin, angled out from the skull. The elephant's whole read.
    blob(0.52, [1, 1.2, 0.09], { pos: [-0.5, 0.04, -0.16], rot: [0.12, -0.55, 0.16] }, 9),
    blob(0.52, [1, 1.2, 0.09], { pos: [0.5, 0.04, -0.16], rot: [0.12, 0.55, -0.16] }, 9),
  ]);

  // Tusks, curving forward and up past the trunk.
  const accents = mergeGeometries([
    place(cone(0.06, 0.5, {}, 7), { pos: [-0.23, -0.42, 0.42], rot: [1.32, 0, 0.16] }),
    place(cone(0.06, 0.5, {}, 7), { pos: [0.23, -0.42, 0.42], rot: [1.32, 0, -0.16] }),
  ]);

  const eyes = mergeGeometries([
    blob(0.055, 1, { pos: [-0.33, 0.06, 0.28] }, 6),
    blob(0.055, 1, { pos: [0.33, 0.06, 0.28] }, 6),
  ]);

  return {
    body, head, accents, eyes,
    headAt: new THREE.Vector3(0, 1.78, 0.78),
    headRadius: 0.46,
    bodyColor: 'elephant',
    // --ivory, not --surface. UI-role tokens flip with the theme, so tusks
    // bound to --surface were the brightest thing on the animal after dark
    // *and* turned brown in dusk. Physical colours get physical tokens.
    accentColor: 'ivory',
    height: 2.35,
    radius: 1.2,
  };
}

/* ---------------------------------------------------------------- lion --- */

export function buildLion() {
  const bodyY = 0.92;

  const body = mergeGeometries([
    // Long, low, with a deeper chest than rump — a cat's wedge.
    blob(0.44, [1.02, 0.94, 1.5], { pos: [0, bodyY, -0.1] }, 10),
    blob(0.42, [1.05, 1, 0.95], { pos: [0, bodyY + 0.04, 0.42] }, 9),   // chest
    blob(0.38, [1, 0.98, 1], { pos: [0, bodyY + 0.02, -0.72] }, 9),     // haunch
    blob(0.3, [1, 0.85, 1.1], { pos: [0, bodyY - 0.2, -0.5] }, 8),      // belly

    ...legs({
      spreadX: 0.3, spreadZ: 0.48, height: 0.7,
      top: 0.16, bottom: 0.115, foot: 0.15, splay: 0.015,
    }),

    // Tail: three segments sweeping up and out, with the famous tuft.
    place(cyl(0.045, 0.055, 0.5, {}, 5), { pos: [0, bodyY, -1.06], rot: [0.75, 0, 0] }),
    place(cyl(0.035, 0.045, 0.42, {}, 5), { pos: [0.1, bodyY + 0.16, -1.36], rot: [-0.5, 0, -0.3] }),
    blob(0.12, [1, 1.35, 1], { pos: [0.22, bodyY + 0.4, -1.42] }, 6),
  ]);

  const head = mergeGeometries([
    place(cyl(0.2, 0.26, 0.3, {}, 8), { pos: [0, -0.02, -0.2], rot: [0.6, 0, 0] }),  // neck
    blob(0.28, [1.08, 0.98, 1], { pos: [0, 0, 0.04] }, 10),        // skull
    blob(0.17, [1.1, 0.78, 1], { pos: [0, -0.13, 0.28] }, 8),      // muzzle
    blob(0.09, [1.2, 0.7, 1], { pos: [0, -0.05, 0.36] }, 7),       // nose bridge
    // Ears: small rounded cups, set wide.
    blob(0.095, [1, 1.05, 0.55], { pos: [-0.22, 0.24, -0.02], rot: [0, -0.3, -0.25] }, 7),
    blob(0.095, [1, 1.05, 0.55], { pos: [0.22, 0.24, -0.02], rot: [0, 0.3, 0.25] }, 7),
  ]);

  // The mane is a deep ruff, heavier at the jaw than the crown, in its own
  // colour — it is what separates a lion from any other four-legged animal.
  const maneParts = [];
  const r = rng(1907);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const heavy = 1 + Math.max(0, -Math.sin(a)) * 0.55;   // fuller underneath
    maneParts.push(blob(
      (0.15 + r() * 0.05) * heavy,
      [1, 1, 0.72],
      {
        pos: [Math.cos(a) * 0.36, Math.sin(a) * 0.32 + 0.02, -0.14 + (r() - 0.5) * 0.1],
      },
      6,
    ));
  }
  // A second, tighter ring so the ruff has depth rather than reading as a disc.
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    maneParts.push(blob(0.12, [1, 1, 0.8], {
      pos: [Math.cos(a) * 0.26, Math.sin(a) * 0.24, 0.02],
    }, 6));
  }
  const accents = mergeGeometries(maneParts);

  const eyes = mergeGeometries([
    blob(0.04, [1, 0.8, 1], { pos: [-0.13, 0.05, 0.26] }, 6),
    blob(0.04, [1, 0.8, 1], { pos: [0.13, 0.05, 0.26] }, 6),
    blob(0.045, [1.2, 0.7, 1], { pos: [0, -0.09, 0.43] }, 6),      // nose
  ]);

  return {
    body, head, accents, eyes,
    headAt: new THREE.Vector3(0, 1.24, 0.62),
    headRadius: 0.28,
    bodyColor: 'lion',
    accentColor: 'earth',
    height: 1.5,
    radius: 0.9,
  };
}

/* -------------------------------------------------------------- rabbit --- */

/**
 * The whole rabbit is its ears. Everything else — the crouched egg of a body,
 * the high haunch, the tiny forelegs — exists to make those two upright
 * shapes read at forty units away. It is also the only animal here that
 * *hops*, which the walk cycle keys off `gait: 'hop'`.
 */
export function buildRabbit() {
  const bodyY = 0.34;

  const body = mergeGeometries([
    // A crouched egg, higher at the back than the front.
    blob(0.3, [1, 1.02, 1.22], { pos: [0, bodyY + 0.02, -0.04] }, 10),
    // Haunches: the big rounded hindquarters a rabbit sits on.
    blob(0.24, [1.15, 1.05, 1], { pos: [0, bodyY + 0.04, -0.24] }, 9),
    blob(0.14, [1, 1, 1], { pos: [-0.2, bodyY - 0.06, -0.2] }, 7),
    blob(0.14, [1, 1, 1], { pos: [0.2, bodyY - 0.06, -0.2] }, 7),
    // Chest, dipping toward the front paws.
    blob(0.19, [1, 0.95, 1], { pos: [0, bodyY - 0.02, 0.22] }, 8),

    // Short front legs, tucked close and nearly vertical.
    place(cyl(0.045, 0.055, 0.24, {}, 6), { pos: [-0.11, 0.12, 0.24] }),
    place(cyl(0.045, 0.055, 0.24, {}, 6), { pos: [0.11, 0.12, 0.24] }),
    blob(0.06, [1, 0.5, 1.3], { pos: [-0.11, 0.04, 0.29] }, 6),
    blob(0.06, [1, 0.5, 1.3], { pos: [0.11, 0.04, 0.29] }, 6),

    // Long back feet, flat on the ground and pointing forward.
    blob(0.075, [1, 0.55, 1.9], { pos: [-0.17, 0.05, -0.12] }, 7),
    blob(0.075, [1, 0.55, 1.9], { pos: [0.17, 0.05, -0.12] }, 7),

    // Cotton tail.
    blob(0.095, [1, 1, 1], { pos: [0, bodyY + 0.06, -0.48] }, 7),
  ]);

  const head = mergeGeometries([
    blob(0.17, [1, 1.02, 1.1], { pos: [0, 0, 0.02] }, 9),           // skull
    blob(0.105, [1, 0.85, 1.15], { pos: [0, -0.07, 0.15] }, 7),     // muzzle
    blob(0.05, [1.4, 0.7, 1], { pos: [0, -0.04, 0.24] }, 6),        // nose pad
    // Cheeks, which is what makes a rabbit face read as soft.
    blob(0.09, [1, 1, 0.9], { pos: [-0.11, -0.05, 0.06] }, 7),
    blob(0.09, [1, 1, 0.9], { pos: [0.11, -0.05, 0.06] }, 7),
  ]);

  // Ears are their own accent group so they can flick and fold — upright when
  // happy, flat along the back when the mood bottoms out.
  const accents = mergeGeometries([
    blob(0.062, [1, 3.6, 0.42], { pos: [-0.09, 0.36, -0.03], rot: [-0.12, 0, -0.14] }, 7),
    blob(0.062, [1, 3.6, 0.42], { pos: [0.09, 0.36, -0.03], rot: [-0.12, 0, 0.14] }, 7),
    // Inner ear, a shade darker, set just proud of the front face.
    blob(0.032, [1, 3.2, 0.3], { pos: [-0.09, 0.35, 0.01], rot: [-0.12, 0, -0.14] }, 6),
    blob(0.032, [1, 3.2, 0.3], { pos: [0.09, 0.35, 0.01], rot: [-0.12, 0, 0.14] }, 6),
  ]);

  const eyes = mergeGeometries([
    blob(0.042, [1, 1.1, 1], { pos: [-0.12, 0.04, 0.11] }, 6),
    blob(0.042, [1, 1.1, 1], { pos: [0.12, 0.04, 0.11] }, 6),
  ]);

  return {
    body, head, accents, eyes,
    headAt: new THREE.Vector3(0, 0.56, 0.24),
    headRadius: 0.17,
    bodyColor: 'rabbit',
    accentColor: 'rabbit-ear',
    /** Hops instead of walking — see the gait switch in animals.js. */
    gait: 'hop',
    height: 0.92,
    radius: 0.42,
  };
}
