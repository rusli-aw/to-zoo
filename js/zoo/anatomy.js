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
 * The cozy remodel keeps those silhouette rules but goes plush: big round
 * heads (about as wide as the body), short stubby legs that are just soft
 * capsules, no sharp tapers or cones anywhere, and a pink blush on every
 * cheek. Think stuffed toy on a shelf rather than wildlife documentary.
 */

import * as THREE from 'three';
import { blob, cyl, mergeGeometries, place, rng } from './geom.js';

/**
 * Four stubby plush legs: a soft upright capsule with a rounder pad at the
 * bottom, so the animal stands on little cushions rather than posts.
 */
function softLegs({ spreadX, spreadZ, r, height }) {
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * spreadX;
      const z = sz * spreadZ;
      const stretch = height / (2 * r);
      out.push(blob(r, [1, stretch, 1], { pos: [x, height / 2 + r * 0.15, z] }, 9));
      out.push(blob(r * 1.08, [1, 0.55, 1.08], { pos: [x, r * 0.5, z + r * 0.12] }, 9));
    }
  }
  return out;
}

/** A pair of blush cheeks at ±x. */
const cheeks = (x, y, z, r) => mergeGeometries([
  blob(r, [1, 0.62, 0.4], { pos: [-x, y, z], rot: [0, -0.5, 0] }, 7),
  blob(r, [1, 0.62, 0.4], { pos: [x, y, z], rot: [0, 0.5, 0] }, 7),
]);

/* ------------------------------------------------------------ elephant --- */

export function buildElephant() {
  const bodyY = 0.95;

  const body = mergeGeometries([
    // One round barrel and a soft belly under it.
    blob(0.78, [1.05, 0.88, 1.12], { pos: [0, bodyY, 0] }, 12),
    blob(0.58, [1, 0.8, 1], { pos: [0, bodyY - 0.2, 0.12] }, 10),
    ...softLegs({ spreadX: 0.42, spreadZ: 0.46, r: 0.23, height: 0.68 }),
    // A little tail with a round tuft.
    place(cyl(0.035, 0.05, 0.36, {}, 5), { pos: [0, bodyY - 0.05, -0.92], rot: [0.5, 0, 0] }),
    blob(0.08, [1, 1.2, 1], { pos: [0, bodyY - 0.2, -1.06] }, 6),
  ]);

  // A big round head, nearly as wide as the body.
  const head = mergeGeometries([
    blob(0.6, [1.05, 0.98, 0.95], { pos: [0, 0, 0] }, 12),
    blob(0.4, [1, 0.8, 0.9], { pos: [0, -0.22, 0.24] }, 10),          // full cheeks
    // A short trunk that hangs and curls gently forward at the tip.
    ...Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return blob(0.17 - t * 0.065, 1, {
        pos: [0, -0.18 - t * 0.56 + t * t * 0.26, 0.5 + t * 0.3],
      }, 8);
    }),
    // Ears: big soft round discs.
    blob(0.48, [1, 1.05, 0.13], { pos: [-0.62, 0.06, -0.12], rot: [0.05, -0.45, 0.2] }, 11),
    blob(0.48, [1, 1.05, 0.13], { pos: [0.62, 0.06, -0.12], rot: [0.05, 0.45, -0.2] }, 11),
  ]);

  // Two tiny rounded tusks — nubs, not spikes.
  const accents = mergeGeometries([
    blob(0.05, [1, 1, 2.4], { pos: [-0.2, -0.36, 0.5], rot: [-0.5, -0.2, 0] }, 7),
    blob(0.05, [1, 1, 2.4], { pos: [0.2, -0.36, 0.5], rot: [-0.5, 0.2, 0] }, 7),
  ]);

  const eyes = mergeGeometries([
    blob(0.065, [1, 1.2, 0.6], { pos: [-0.27, 0.08, 0.5] }, 7),
    blob(0.065, [1, 1.2, 0.6], { pos: [0.27, 0.08, 0.5] }, 7),
  ]);

  return {
    body, head, accents, eyes,
    cheeks: cheeks(0.37, -0.1, 0.43, 0.09),
    headAt: new THREE.Vector3(0, 1.55, 0.72),
    headRadius: 0.6,
    bodyColor: 'elephant',
    // --ivory, not --surface. UI-role tokens flip with the theme, so tusks
    // bound to --surface were the brightest thing on the animal after dark
    // *and* turned brown in dusk. Physical colours get physical tokens.
    accentColor: 'ivory',
    height: 2.2,
    radius: 1.1,
  };
}

/* ---------------------------------------------------------------- lion --- */

export function buildLion() {
  const bodyY = 0.62;

  const body = mergeGeometries([
    blob(0.48, [1, 0.92, 1.22], { pos: [0, bodyY, 0] }, 12),
    ...softLegs({ spreadX: 0.24, spreadZ: 0.32, r: 0.13, height: 0.4 }),
    // A tail that curls up, ending in a round tuft.
    place(cyl(0.035, 0.045, 0.42, {}, 5), { pos: [0, bodyY + 0.02, -0.66], rot: [0.9, 0, 0] }),
    place(cyl(0.03, 0.035, 0.3, {}, 5), { pos: [0, bodyY + 0.2, -0.86], rot: [-0.4, 0, 0] }),
    blob(0.1, [1, 1.15, 1], { pos: [0, bodyY + 0.36, -0.9] }, 7),
  ]);

  const head = mergeGeometries([
    blob(0.38, [1.05, 0.96, 0.95], { pos: [0, 0, 0] }, 12),
    blob(0.18, [1.25, 0.8, 0.9], { pos: [0, -0.13, 0.3] }, 9),       // muzzle
    // Round ears poking out of the mane.
    blob(0.11, [1, 1, 0.6], { pos: [-0.28, 0.3, -0.02], rot: [0, -0.3, -0.3] }, 8),
    blob(0.11, [1, 1, 0.6], { pos: [0.28, 0.3, -0.02], rot: [0, 0.3, 0.3] }, 8),
  ]);

  // The mane: a ring of fat round puffs and a soft cushion behind the head,
  // like a fluffy collar.
  const maneParts = [blob(0.44, [1, 1, 0.5], { pos: [0, -0.02, -0.2] }, 10)];
  const r = rng(1907);
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2 + 0.2;
    maneParts.push(blob(0.19 + r() * 0.03, [1, 1, 0.75], {
      pos: [Math.cos(a) * 0.42, Math.sin(a) * 0.4 - 0.02, -0.12],
    }, 8));
  }
  const accents = mergeGeometries(maneParts);

  const eyes = mergeGeometries([
    blob(0.048, [1, 1.2, 0.6], { pos: [-0.15, 0.07, 0.34] }, 7),
    blob(0.048, [1, 1.2, 0.6], { pos: [0.15, 0.07, 0.34] }, 7),
    blob(0.05, [1.3, 0.8, 0.8], { pos: [0, -0.07, 0.46] }, 7),      // nose
  ]);

  return {
    body, head, accents, eyes,
    cheeks: cheeks(0.24, -0.08, 0.3, 0.065),
    headAt: new THREE.Vector3(0, 1.08, 0.5),
    headRadius: 0.38,
    bodyColor: 'lion',
    accentColor: 'earth',
    height: 1.55,
    radius: 0.8,
  };
}

/* -------------------------------------------------------------- rabbit --- */

/**
 * The whole rabbit is its ears. It is also the only animal here that *hops*,
 * which the walk cycle keys off `gait: 'hop'`.
 */
export function buildRabbit() {
  const bodyY = 0.3;

  const body = mergeGeometries([
    // A round loaf, a little higher at the back.
    blob(0.3, [1, 0.95, 1.1], { pos: [0, bodyY, -0.04] }, 12),
    blob(0.16, [1, 1, 1], { pos: [-0.18, bodyY - 0.08, -0.16] }, 8),   // haunches
    blob(0.16, [1, 1, 1], { pos: [0.18, bodyY - 0.08, -0.16] }, 8),
    // Front paws, two little round mitts.
    blob(0.07, [1, 0.8, 1.2], { pos: [-0.11, 0.06, 0.24] }, 7),
    blob(0.07, [1, 0.8, 1.2], { pos: [0.11, 0.06, 0.24] }, 7),
    // Back feet.
    blob(0.08, [1, 0.55, 1.7], { pos: [-0.17, 0.05, -0.08] }, 7),
    blob(0.08, [1, 0.55, 1.7], { pos: [0.17, 0.05, -0.08] }, 7),
    // Cotton tail.
    blob(0.1, 1, { pos: [0, bodyY + 0.04, -0.38] }, 8),
  ]);

  const head = mergeGeometries([
    blob(0.24, [1.05, 1, 1], { pos: [0, 0, 0] }, 12),
    blob(0.1, [1.25, 0.8, 0.9], { pos: [0, -0.08, 0.18] }, 8),         // muzzle
  ]);

  // Ears are their own accent group so they can flick and fold — upright when
  // happy, flat along the back when the mood bottoms out.
  const accents = mergeGeometries([
    blob(0.07, [1, 3.2, 0.45], { pos: [-0.1, 0.4, -0.04], rot: [-0.1, 0, -0.16] }, 9),
    blob(0.07, [1, 3.2, 0.45], { pos: [0.1, 0.4, -0.04], rot: [-0.1, 0, 0.16] }, 9),
  ]);

  const eyes = mergeGeometries([
    blob(0.04, [1, 1.2, 0.6], { pos: [-0.11, 0.04, 0.215] }, 7),
    blob(0.04, [1, 1.2, 0.6], { pos: [0.11, 0.04, 0.215] }, 7),
    blob(0.026, [1.3, 0.8, 0.8], { pos: [0, -0.05, 0.27] }, 6),     // nose
  ]);

  return {
    body, head, accents, eyes,
    cheeks: cheeks(0.15, -0.05, 0.19, 0.045),
    headAt: new THREE.Vector3(0, 0.62, 0.18),
    headRadius: 0.24,
    bodyColor: 'rabbit',
    accentColor: 'rabbit-ear',
    /** Hops instead of walking — see the gait switch in animals.js. */
    gait: 'hop',
    height: 1.02,
    radius: 0.42,
  };
}
