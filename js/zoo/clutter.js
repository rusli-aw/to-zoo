/**
 * To-Zoo — the mess.
 *
 * Leaves, twigs and scuffed ground that accumulate as the backlog does. All
 * of it is one instanced mesh whose visible count is a function of zoo health,
 * so "the zoo gets dirtier" costs one number per frame and no allocation.
 *
 * The tone matters more than the mechanic. This is meant to read as a garden
 * that needs half an hour of attention, not as a reprimand — so it is leaf
 * litter and worn grass, never rot or decay, and it tops out well before the
 * zoo becomes unpleasant to look at.
 */

import * as THREE from 'three';
import { color } from './palette.js';
import { blob, box, mergeGeometries, rng } from './geom.js';
import { LAYOUT } from './environment.js';

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildClutter(zoo) {
  const max = Math.round(190 * zoo.quality.clutter);

  // One instance shape covering both readings: a leaf with a stem. Rotated
  // flat to the ground and scaled unevenly, it passes for litter or a twig.
  const geometry = mergeGeometries([
    blob(0.1, [1, 0.12, 0.62], {}, 6),
    box(0.015, 0.012, 0.16, { pos: [0, 0, 0.13] }),
  ]);

  const material = new THREE.MeshLambertMaterial({
    color: color('earth').clone(),
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  mesh.count = 0;
  zoo.scene.add(mesh);

  // Fixed layout, revealed in order. Because the list is shuffled by
  // construction, showing the first N spreads mess evenly rather than
  // filling one corner first.
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const r = rng(6161);
  const leaf = color('grass-dry');
  const earth = color('earth-deep');

  for (let i = 0; i < max; i += 1) {
    dummy.position.set(
      LAYOUT.minX + r() * (LAYOUT.maxX - LAYOUT.minX),
      0.03 + r() * 0.02,
      LAYOUT.minZ + r() * (LAYOUT.maxZ - LAYOUT.minZ),
    );
    dummy.rotation.set(-Math.PI / 2 + (r() - 0.5) * 0.3, r() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.6 + r() * 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    // Roughly two thirds dry leaf, one third bare earth scuff.
    tint.copy(r() > 0.34 ? leaf : earth).offsetHSL(0, 0, (r() - 0.5) * 0.1);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  let shown = 0;
  let target = 0;

  // Ease the count rather than snapping it, so clearing a task visibly tidies
  // the ground instead of teleporting the litter away.
  zoo.onFrame((dt) => {
    if (Math.abs(shown - target) < 0.5) return;
    shown += (target - shown) * (1 - Math.exp(-2.4 * dt));
    mesh.count = Math.round(shown);
  });

  return {
    mesh,

    /** @param {number} messiness 0..1 */
    setMessiness(messiness) {
      const m = Math.max(0, Math.min(1, messiness));
      // Curved so the first couple of tasks barely register — a two-item
      // to-do list should not make the zoo look neglected.
      target = Math.round(max * m ** 1.5);
    },

    applyTheme() {
      material.color.copy(color('earth'));
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
