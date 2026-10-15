/**
 * To-Zoo — ground cover.
 *
 * v1 planted 0.44-unit blades in a zoo where a rabbit stands 0.4 units tall.
 * The lawn swallowed the smallest animals and reached a lion's belly, which
 * is the opposite of what ground cover is for. The rule now is absolute:
 *
 *     MAX_HEIGHT must stay below RABBIT_BELLY.
 *
 * Nothing may grow tall enough to cross an animal's legs from the camera's
 * angle. Short safari tufts, sparse, with bare earth showing between them —
 * the ground reads as dry savanna and the animals stay the tallest thing in
 * the frame.
 *
 * It also no longer reports on your backlog. A busy zoo is not a dying lawn.
 */

import * as THREE from 'three';
import { color, mixTokens } from './palette.js';
import { LAYOUT } from './environment.js';
import { rng } from './geom.js';

/** A rabbit's underside, in world units. The hard ceiling for anything here. */
export const RABBIT_BELLY = 0.22;

/** Deliberately well clear of it. */
const MAX_HEIGHT = 0.15;

/**
 * A tuft: a few short blades fanning from one root, which reads as a clump of
 * savanna grass rather than a single fin standing on its own.
 */
function tuftGeometry(height, blades = 4) {
  const positions = [];
  const r = rng(4242);

  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + r() * 0.7;
    const lean = 0.24 + r() * 0.3;
    const h = height * (0.62 + r() * 0.38);
    const w = 0.022;

    // Each blade is one triangle, tilted outward from the root.
    const tipX = Math.cos(angle) * h * lean;
    const tipZ = Math.sin(angle) * h * lean;
    const sideX = Math.cos(angle + Math.PI / 2) * w;
    const sideZ = Math.sin(angle + Math.PI / 2) * w;

    positions.push(-sideX, 0, -sideZ);
    positions.push(sideX, 0, sideZ);
    positions.push(tipX, h, tipZ);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildGrass(zoo) {
  // Fewer than v1: tufts are denser objects, and bare ground between them is
  // part of the look rather than something to fill in.
  const count = Math.round(zoo.quality.grass * 0.42);
  const geometry = tuftGeometry(MAX_HEIGHT);

  const material = new THREE.MeshLambertMaterial({
    color: color('grass-lush').clone(),
    side: THREE.DoubleSide,
  });

  const uniforms = {
    uTime: zoo.ink.time,
    uWind: { value: 0.05 },
    uHeight: { value: MAX_HEIGHT },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWind;
         uniform float uHeight;
         attribute float aPhase;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float bend = pow(clamp(position.y / uHeight, 0.0, 1.0), 2.0);
         float p = aPhase * 6.2831853;
         // Two unrelated frequencies so the field never pulses in unison.
         float sway = sin(uTime * 1.6 + p) * 0.6 + sin(uTime * 2.9 + p * 2.1) * 0.4;
         transformed.x += sway * uWind * bend;
         transformed.z += cos(uTime * 1.3 + p * 1.7) * uWind * 0.45 * bend;`,
      );
  };
  material.customProgramCacheKey = () => 'toZooGrass';

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Ground cover must never intercept a click meant for an animal.
  mesh.raycast = () => {};

  const phases = new Float32Array(count);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const r = rng(2024);

  for (let i = 0; i < count; i += 1) {
    const x = LAYOUT.minX + r() * (LAYOUT.maxX - LAYOUT.minX);
    const z = LAYOUT.minZ + r() * (LAYOUT.maxZ - LAYOUT.minZ);

    // Clumping: most tufts sit near a previous one, which leaves genuine bare
    // patches instead of an even sprinkle.
    const clump = r() < 0.55 ? 0.6 : 1;
    const s = (0.7 + r() * 0.6) * clump;

    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, r() * Math.PI * 2, 0);
    dummy.scale.set(1, s, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    phases[i] = r();

    const v = 0.82 + r() * 0.34;
    tint.setRGB(v, v, v);
    mesh.setColorAt(i, tint);
  }
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  zoo.scene.add(mesh);

  const grassColor = new THREE.Color();

  return {
    mesh,
    /** The ceiling, exported so anything else planting on the ground can obey it. */
    maxHeight: MAX_HEIGHT,

    /**
     * Kept for the seasons layer, which legitimately dries the grass out in
     * autumn. It is deliberately *not* wired to the task count any more.
     * @param {number} dryness 0..1
     */
    setMessiness(dryness) {
      const d = Math.max(0, Math.min(1, dryness));
      material.color.copy(mixTokens('grass-lush', 'grass-dry', d * 0.8, grassColor));
    },

    applyTheme() { material.color.copy(color('grass-lush')); },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
