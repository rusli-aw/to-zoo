/**
 * To-Zoo — releasing an animal.
 *
 * The emotional centre of the product, and the place most at risk of getting
 * in the way. Two rules keep it honest:
 *
 *   1. The task is already complete before any of this runs. The store
 *      committed, the tokens are paid, the health is recomputed. Nothing here
 *      can fail in a way that costs the user their progress.
 *   2. It is one timeline, not a chain. Skipping cancels the tween, which
 *      snaps t to 1, and t = 1 is defined as "animal gone, gate shut, world
 *      tidy". A skipped release and a watched one end in the same state
 *      because they run the same function.
 */

import * as THREE from 'three';
import { LAYOUT } from './environment.js';
import { color } from './palette.js';
import { blob, mergeGeometries, rng } from './geom.js';
import { easeInOut, easeOut, lerp, phase, reduced, timeline } from '../ui/motion.js';

const DURATION = 5200;   // half of it is the walk into the sunset

/**
 * A puff of leaves. One instanced mesh, reused for every release — building a
 * particle system per completion would leak geometry all afternoon.
 */
function createLeafBurst(zoo, capacity = 22) {
  const geo = mergeGeometries([
    blob(0.09, [1, 0.35, 0.7], {}, 5),
    blob(0.06, [1, 0.4, 0.8], { pos: [0.1, 0, 0.05] }, 5),
  ]);
  const material = new THREE.MeshLambertMaterial({
    color: color('grass-lush').clone(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, material, capacity);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.raycast = () => {};
  zoo.scene.add(mesh);

  const dummy = new THREE.Object3D();
  const velocities = [];
  const spins = [];
  const r = rng(9091);
  for (let i = 0; i < capacity; i += 1) {
    velocities.push(new THREE.Vector3(
      (r() - 0.5) * 2.4,
      1.6 + r() * 2.2,
      (r() - 0.5) * 2.4,
    ));
    spins.push(new THREE.Vector3(r() * 6, r() * 6, r() * 6));
  }

  const origin = new THREE.Vector3();
  let life = 0;

  zoo.onFrame((dt) => {
    if (life <= 0) return;
    life -= dt;
    if (life <= 0) { mesh.visible = false; return; }

    const age = 1 - life / 1.25;
    material.opacity = 1 - age ** 2;
    for (let i = 0; i < capacity; i += 1) {
      const v = velocities[i];
      const t = age * 1.25;
      dummy.position.set(
        origin.x + v.x * t,
        origin.y + v.y * t - 3.1 * t * t,   // gravity, so they arc and fall
        origin.z + v.z * t,
      );
      dummy.rotation.set(spins[i].x * t, spins[i].y * t, spins[i].z * t);
      dummy.scale.setScalar(1 - age * 0.35);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return {
    fire(position) {
      if (reduced()) return;          // a spray of particles is exactly what
      origin.copy(position);          // reduced motion is asking us to skip
      life = 1.25;
      mesh.visible = true;
      material.opacity = 1;
    },
    applyTheme() { material.color.copy(color('grass-lush')); },
  };
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 * @param {ReturnType<import('./animalTask.js').createPopulation>} population
 * @param {ReturnType<import('./environment.js').buildEnvironment>} environment
 */
export function createRelease(zoo, population, environment) {
  const leaves = createLeafBurst(zoo);
  let active = null;

  const start = new THREE.Vector3();
  const gateApproach = new THREE.Vector3(LAYOUT.gate.x, 0, LAYOUT.gate.z + 1.5);
  const gateThrough = new THREE.Vector3(LAYOUT.gate.x, 0, LAYOUT.gate.z - 2.2);
  // Into the sunset: a long walk out toward the hills, where the haze takes it.
  const out = new THREE.Vector3(LAYOUT.gate.x * 0.4 + 3, 0, LAYOUT.gate.z - 22);
  const at = new THREE.Vector3();

  /**
   * @param {string} taskId
   * @param {{ onExit?: (screen: {x: number, y: number}) => void }} [hooks]
   * @returns {{ promise: Promise<void>, skip: () => void }}
   */
  function release(taskId, hooks = {}) {
    const entry = population.detach(taskId);
    if (!entry) return { promise: Promise.resolve(), skip: () => {} };

    const { animal } = entry;
    start.copy(animal.root.position);
    const baseScale = animal.spec.scale;
    let exitFired = false;

    // The animal stops taking clicks the instant it starts leaving.
    for (const mesh of animal.pickTargets) mesh.userData.taskId = null;

    animal.setAttention(1);

    // Under reduced motion the timeline settles *inside* the call below, so
    // anything assigned to `active` afterwards would never be cleared and
    // `isPlaying` would stick true for the rest of the session — stranding the
    // camera and leaving the animals unclickable. The flag records whether it
    // already finished by the time we get to assign.
    let finished = false;

    const handle = timeline(DURATION, (t) => {
      /* ── 0.00–0.12  it notices you ─────────────────────────────── */
      const notice = phase(t, 0, 0.12, easeOut);
      animal.root.rotation.y = lerp(animal.root.rotation.y, Math.PI, notice * 0.35);

      /* ── 0.06–0.25  the gate swings ────────────────────────────── */
      environment.openGate(phase(t, 0.06, 0.25, easeInOut));

      /* ── 0.12–0.38  walk to the gate ───────────────────────────── */
      /* ── 0.38–0.50  through it ─────────────────────────────────── */
      /* ── 0.50–1.00  away toward the hills, into the sunset ─────── */
      let point;
      if (t < 0.12) {
        point = start;
      } else if (t < 0.38) {
        point = at.copy(start).lerp(gateApproach, phase(t, 0.12, 0.38, easeInOut));
      } else if (t < 0.5) {
        point = at.copy(gateApproach).lerp(gateThrough, phase(t, 0.38, 0.5));
      } else {
        point = at.copy(gateThrough).lerp(out, phase(t, 0.5, 1, (x) => x));
      }
      animal.root.position.x = point.x;
      animal.root.position.z = point.z;

      // Face the way it is going, except while it is looking back at you.
      if (t > 0.12) animal.root.rotation.y = Math.PI;
      animal.setWalking(t > 0.12 ? 1 : 0);
      // Facing the hills, a touch off straight so it ambles rather than marches.
      if (t > 0.5) animal.root.rotation.y = Math.PI - 0.1;

      /* ── 0.60–1.00  it grows small and dissolves into the haze ─── */
      const fade = phase(t, 0.6, 1, easeInOut);
      animal.root.scale.setScalar(baseScale * (1 - fade * 0.85) * (t >= 1 ? 0 : 1));

      /* ── the moment it is through: leaves, and the tokens fly ──── */
      if (!exitFired && t >= 0.5) {
        exitFired = true;
        animal.anchor(at);
        leaves.fire(at);
        hooks.onExit?.(zoo.screenPosition(at));
      }

      /* ── 0.88–1.00  the gate closes behind it ──────────────────── */
      if (t > 0.88) environment.openGate(1 - phase(t, 0.88, 1, easeInOut));

      /* ── t = 1 is the finished world ───────────────────────────── */
      if (t >= 1) {
        environment.openGate(0);
        // Skipped before the exit hook ran? Still pay out the animation's
        // debts, or the tokens would never visibly land. Do it before the
        // animal is torn down, while it still has a position to fly from.
        if (!exitFired) {
          exitFired = true;
          hooks.onExit?.(zoo.screenPosition(animal.anchor(at)));
        }
        population.finish(entry);
      }
    }, () => {
      finished = true;
      active = null;
    });

    if (!finished) active = handle;
    return { promise: handle.promise, skip: handle.cancel };
  }

  return {
    release,
    get isPlaying() { return active !== null; },
    skip() { active?.cancel(); },
    applyTheme() { leaves.applyTheme(); },
  };
}
