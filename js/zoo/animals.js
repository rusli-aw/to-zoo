/**
 * To-Zoo — the animals.
 *
 * Three species, all built from the same handful of squashed spheres and
 * cylinders so they read as one drawing style. Each is assembled into three
 * moving parts — body, head, accents — which is enough articulation for the
 * idle behaviour and the release walk, and few enough draw calls to put a
 * dozen of them on a phone.
 *
 * There are no leg bones. A hand-drawn animal that waddles and bobs is more
 * charming than one that walks correctly, and the whole art direction is
 * already asking you to accept a wobbling outline.
 */

import * as THREE from 'three';
import { ANIMALS } from '../model.js';
import { color } from './palette.js';
import { hashString, rng } from './geom.js';
import { buildElephant, buildLion, buildRabbit } from './anatomy.js';
import { cosmeticGeometry } from './decorations.js';

const BUILDERS = { elephant: buildElephant, lion: buildLion, rabbit: buildRabbit };

/** Geometry is identical for every animal of a species — build it once. */
const cache = new Map();
function partsFor(type) {
  if (!cache.has(type)) cache.set(type, BUILDERS[type]());
  return cache.get(type);
}

/**
 * How to roll an animal onto its side without it sinking into the ground.
 *
 * Tipping a body over about its feet puts half of it underground, and the old
 * poses hid that by pushing the whole animal down as well, so an elephant at
 * zero mood sat buried to the belly. Instead, sample the silhouette once per
 * species and, for any roll angle, work out how far to lift it so its lowest
 * point just rests on the grass — and how far to slide it so it stays over
 * the spot it was standing on.
 */
const ROLL_STEPS = 24;
const rollCache = new Map();
function rollTableFor(type, parts) {
  if (rollCache.has(type)) return rollCache.get(type);

  const points = [];
  const collect = (geometry, offset) => {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      points.push([pos.getX(i) + offset.x, pos.getY(i) + offset.y]);
    }
  };
  const zero = new THREE.Vector3();
  collect(parts.body, zero);
  collect(parts.head, parts.headAt);
  collect(parts.accents, parts.headAt);

  let cx = 0, cy = 0;
  for (const [x, y] of points) { cx += x; cy += y; }
  cx /= points.length; cy /= points.length;

  // Rotation about z: y' = x sin a + y cos a. Sampled from 0 to a right angle.
  const lowest = (a) => {
    const s = Math.sin(a), c = Math.cos(a);
    let min = Infinity;
    for (const [x, y] of points) min = Math.min(min, x * s + y * c);
    return min;
  };
  const rest = lowest(0);
  const lift = [];
  const shift = [];
  for (let i = 0; i <= ROLL_STEPS; i += 1) {
    const a = (i / ROLL_STEPS) * (Math.PI / 2);
    lift.push(rest - lowest(a));
    shift.push(cx - (cx * Math.cos(a) - cy * Math.sin(a)));
  }

  const sample = (table, angle) => {
    const f = Math.max(0, Math.min(1, Math.abs(angle) / (Math.PI / 2))) * ROLL_STEPS;
    const i = Math.min(ROLL_STEPS - 1, Math.floor(f));
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  const result = {
    lift: (angle) => sample(lift, angle),
    shift: (angle) => sample(shift, angle) * Math.sign(angle || 1),
  };
  rollCache.set(type, result);
  return result;
}

/* -------------------------------------------------------------- animal --- */

/**
 * One animal in the world.
 *
 * @param {import('./inkline.js').Ink} ink
 * @param {import('../model.js').AnimalType} type
 * @param {string} seedKey  usually the task id, so a task's animal keeps its
 *                          own quirks across reloads
 */
export function createAnimal(ink, type, seedKey = '') {
  const spec = ANIMALS[type];
  const parts = partsFor(type);
  const seed = hashString(seedKey || type);
  const rand = rng(seed);
  const phase = rand() * Math.PI * 2;

  const root = new THREE.Group();
  root.scale.setScalar(spec.scale);

  // Body and head are separate groups so the head can turn to look at you.
  const bodyGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  headGroup.position.copy(parts.headAt);

  const penWidth = 0.03 / spec.scale;   // constant apparent weight across sizes

  const bodyDraw = ink.draw(parts.body.clone(), color(parts.bodyColor).clone(), {
    width: penWidth,
    wobble: 0.014,
  });
  bodyGroup.add(bodyDraw);

  const headDraw = ink.draw(parts.head.clone(), color(parts.headColor ?? parts.bodyColor).clone(), {
    width: penWidth,
    wobble: 0.014,
  });
  headGroup.add(headDraw);

  const accentDraw = ink.draw(parts.accents.clone(), color(parts.accentColor).clone(), {
    width: penWidth,
    wobble: 0.016,
  });
  // The lion's mane rides on the head; the elephant's tusks do too.
  headGroup.add(accentDraw);

  // Eyes are ink, unlit and outline-free — they should read as drawn dots.
  const eyeMesh = new THREE.Mesh(
    parts.eyes.clone(),
    // --outline, not --ink: eyes are drawn ink and must stay dark after
    // sunset. Bound to --ink they turned white at night.
    new THREE.MeshBasicMaterial({ color: color('outline').clone() }),
  );
  headGroup.add(eyeMesh);

  // Posture lives on its own group so lying down rolls the animal without
  // rolling its contact shadow up off the ground with it.
  const poseGroup = new THREE.Group();
  poseGroup.add(bodyGroup, headGroup);
  root.add(poseGroup);
  const rollTable = rollTableFor(type, parts);

  // A soft contact shadow, so an animal never looks like it is hovering even
  // on the low tier where real shadows are off.
  const blobShadow = new THREE.Mesh(
    new THREE.CircleGeometry(parts.radius * 0.62, 18),
    new THREE.MeshBasicMaterial({
      color: color('grass-deep').clone(),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  blobShadow.rotation.x = -Math.PI / 2;
  blobShadow.position.y = 0.015;
  root.add(blobShadow);

  const bodyBaseY = bodyGroup.position.y;
  const headBaseY = headGroup.position.y;

  /** The hat or crown currently being worn, if any. */
  let cosmetic = null;
  let cosmeticBuild = null;

  let urgency = 0.2;
  let lookAtCamera = 0;        // 0..1, raised when the animal notices you
  let walk = 0;                // 0..1, blended in while moving
  let hoverLift = 0;

  /* Posture. `pose` is what we want, `poseBlend` is how far we have got —
     lerping between them means an animal sinks down rather than snapping
     flat, and gets up smoothly the moment its task is completed. */
  const POSES = {
    // A fed-up elephant goes all the way over onto its side and rests there,
    // on top of the grass. `roll` poses are lifted to the ground rather than
    // sunk, see rollTableFor().
    elephant: { sit: { drop: 0.28, tiltX: 0.1 }, lie: { roll: 1.5, settle: 0.04 } },
    lion:     { sit: { drop: 0.22, tiltX: 0.16 }, lie: { roll: 1.4, settle: 0.03 } },
    // A flopped rabbit goes right over onto its side. It is the single
    // funniest thing in the zoo and it is doing real work: you cannot miss it.
    rabbit:   { sit: { drop: 0.05, tiltX: -0.22 }, lie: { roll: 1.5, settle: 0.02 } },
  };
  const poseSet = POSES[type] ?? POSES.lion;

  let pose = 'stand';
  let poseBlend = 0;           // 0 standing, 1 fully in `pose`
  const gait = parts.gait ?? 'walk';

  const api = {
    type,
    root,
    head: headGroup,
    body: bodyGroup,
    spec,
    height: parts.height * spec.scale,
    radius: parts.radius * spec.scale,

    /** World-space point to hang a label or aim the camera at. */
    anchor(out = new THREE.Vector3()) {
      return out.set(0, parts.height, 0).multiplyScalar(spec.scale).add(root.position);
    },

    /** Meshes a raycaster should test. Outlines are excluded — they are BackSide. */
    pickTargets: [bodyDraw.body, headDraw.body, accentDraw.body],

    /**
     * Put on (or take off) a bought cosmetic. Parented to the head group so
     * it inherits every nod and turn for free.
     * @param {string | null} build
     */
    wear(build) {
      if (build === cosmeticBuild) return;
      cosmeticBuild = build;

      if (cosmetic) {
        cosmetic.removeFromParent();
        cosmetic.traverse((o) => {
          const mesh = /** @type {any} */ (o);
          mesh.geometry?.dispose?.();
          mesh.material?.dispose?.();
        });
        cosmetic = null;
      }
      if (!build) return;

      const item = cosmeticGeometry(build);
      if (!item?.parts?.length) return;

      // One group holding every coloured piece, so a straw hat can have a red
      // band and an udeng its gold thread.
      cosmetic = new THREE.Group();
      for (const part of item.parts) {
        cosmetic.add(ink.draw(part.geometry, color(part.token).clone(), {
          width: penWidth,
          wobble: 0.014,
        }));
      }
      // The geometry is drawn for an elephant's head; everyone else is
      // wearing the same hat in their own size.
      cosmetic.scale.setScalar((parts.headRadius ?? 0.47) / 0.47);
      headGroup.add(cosmetic);
    },

    setUrgency(u) {
      urgency = Math.max(0, Math.min(1, u));
      // An anxious animal is drawn more anxiously.
      ink.setEnergy(root, 1 + urgency * 2.4);
    },

    get urgency() { return urgency; },

    /** 0..1 — how much the animal is turned toward the camera. */
    setAttention(a) { lookAtCamera = Math.max(0, Math.min(1, a)); },

    setWalking(w) { walk = Math.max(0, Math.min(1, w)); },

    setHovered(on) { hoverLift = on ? 1 : 0; },

    /**
     * Posture, driven by mood.
     *
     * An animal at zero has given up on standing: it lies down, stops
     * wandering, and its breathing slows. It is meant to read as
     * theatrically fed up rather than unwell — the rabbit flops on its side
     * with its ears flat, which is comic, not sad.
     *
     * @param {'stand' | 'sit' | 'lie'} next
     */
    setPose(next) { pose = next; },
    get pose() { return pose; },
    /** True once it is properly down — the AI stops steering it. */
    get isDown() { return pose !== 'stand' && poseBlend > 0.6; },

    /**
     * @param {number} dt
     * @param {number} elapsed
     */
    update(dt, elapsed) {
      const damp = 1 - Math.exp(-8 * dt);

      // Posture first — everything below is layered on top of it.
      const poseDamp = 1 - Math.exp(-2.6 * dt);
      poseBlend += ((pose === 'stand' ? 0 : 1) - poseBlend) * poseDamp;
      const posture = pose === 'stand' ? null : poseSet[pose];
      const down = posture ? poseBlend : 0;

      // A lying animal breathes slowly and deeply; a restless one, fast and
      // shallow. Same one line drives both.
      const rate = down > 0.5 ? 0.7 : 1 + urgency * 0.55;
      const t = elapsed * rate + phase;

      const breath = Math.sin(t * 1.5);
      const depth = down > 0.5 ? 0.035 : 0.02 + urgency * 0.016;
      bodyGroup.scale.y = 1 + breath * depth;
      bodyGroup.position.y = bodyBaseY + breath * 0.012;

      // Head: a slow idle sweep, overridden by attention when it is looking
      // at you, and a nod that gets faster and shallower when it is anxious.
      // Once it is down the head simply droops.
      const idleYaw = Math.sin(t * 0.34) * 0.26 + Math.sin(t * 0.11) * 0.14;
      const nod = Math.sin(t * (1.1 + urgency * 1.6)) * (0.04 + urgency * 0.05);
      const wantYaw = idleYaw * (1 - lookAtCamera) * (1 - down);
      // A droop reads as sad on an animal still upright. On one lying on its
      // side the same droop would drive its head through the ground, so there
      // the head simply rests where the roll puts it.
      const droop = posture?.roll ? 0 : down;
      const wantPitch = nod * (1 - down) + droop * 0.34;
      headGroup.rotation.y += (wantYaw - headGroup.rotation.y) * damp;
      headGroup.rotation.x += (wantPitch - headGroup.rotation.x) * damp;
      headGroup.position.y = headBaseY + breath * 0.02 + hoverLift * 0.03 - droop * 0.12;

      // Movement. A rabbit does not waddle — it launches, which is the main
      // reason all three species read differently in motion and not just in
      // silhouette.
      const moving = walk > 0.001 && down < 0.5;
      if (moving) {
        if (gait === 'hop') {
          const stride = elapsed * 5.2 * spec.speed + phase;
          const arc = Math.abs(Math.sin(stride));
          root.position.y = arc ** 0.7 * 0.3 * walk;
          root.rotation.x = -Math.cos(stride) * 0.22 * walk;   // nose up, then down
          root.rotation.z += (0 - root.rotation.z) * damp;
          // Ears trail a beat behind the body, which is what sells a hop.
          accentDraw.rotation.x = Math.cos(stride) * 0.34 * walk;
        } else {
          const stride = elapsed * 7 * spec.speed + phase;
          root.rotation.z = Math.sin(stride) * 0.055 * walk;
          root.position.y = Math.abs(Math.sin(stride)) * 0.05 * walk;
          root.rotation.x += (0 - root.rotation.x) * damp;
          headGroup.rotation.z = -Math.sin(stride) * 0.04 * walk;
        }
      } else {
        headGroup.rotation.z += (0 - headGroup.rotation.z) * damp;
        if (gait === 'hop') {
          // Idle ear flick: rare, quick, and never in sync between rabbits.
          const flick = Math.max(0, Math.sin(elapsed * 0.7 + phase) - 0.985) * 40;
          accentDraw.rotation.x += ((down > 0.5 ? 1.15 : flick * 0.3) - accentDraw.rotation.x) * damp;
        }
      }

      // The gait's own bob and sway stay on the root; posture goes on the
      // pose group. poseBlend is already smoothed, so it is applied directly.
      const wantY = moving ? root.position.y : 0;
      const wantTiltX = moving && gait === 'hop' ? root.rotation.x : 0;
      const wantTiltZ = moving && gait !== 'hop' ? root.rotation.z : 0;
      root.position.y += (wantY - root.position.y) * (moving ? 1 : damp);
      root.rotation.x += (wantTiltX - root.rotation.x) * (moving ? 1 : damp);
      root.rotation.z += (wantTiltZ - root.rotation.z) * (moving ? 1 : damp);

      if (posture?.roll) {
        // Over onto its side, lifted so the side rests on the grass, with a
        // touch of settle so it looks heavy rather than balanced.
        const angle = posture.roll * down;
        poseGroup.rotation.set(0, 0, angle);
        poseGroup.position.set(rollTable.shift(angle), rollTable.lift(angle) - (posture.settle ?? 0) * down, 0);
        blobShadow.scale.set(1 + down * 0.7, 1 + down * 0.15, 1);
      } else {
        poseGroup.rotation.set(posture ? (posture.tiltX ?? 0) * down : 0, 0, posture ? (posture.tiltZ ?? 0) * down : 0);
        poseGroup.position.set(0, posture ? -(posture.drop ?? 0) * down : 0, 0);
        blobShadow.scale.set(1, 1, 1);
      }

      // Hover response: a small, immediate lift. The clearest possible signal
      // that this thing is clickable.
      const targetScale = spec.scale * (1 + hoverLift * 0.05);
      root.scale.x += (targetScale - root.scale.x) * damp;
      root.scale.y += (targetScale - root.scale.y) * damp;
      root.scale.z += (targetScale - root.scale.z) * damp;
    },

    applyTheme() {
      bodyDraw.body.material.color.copy(color(parts.bodyColor));
      headDraw.body.material.color.copy(color(parts.headColor ?? parts.bodyColor));
      accentDraw.body.material.color.copy(color(parts.accentColor));
      eyeMesh.material.color.copy(color('outline'));
      blobShadow.material.color.copy(color('grass-deep'));
      for (const draw of [bodyDraw, headDraw, accentDraw]) {
        draw.outline.material.uniforms.uColor.value = color('outline');
      }
    },

    dispose() {
      this.wear(null);
      root.removeFromParent();
      for (const draw of [bodyDraw, headDraw, accentDraw]) {
        draw.body.geometry.dispose();
        draw.body.material.dispose();
        draw.outline.material.dispose();
      }
      eyeMesh.geometry.dispose();
      eyeMesh.material.dispose();
      blobShadow.geometry.dispose();
      blobShadow.material.dispose();
    },
  };

  api.setUrgency(0.2);
  return api;
}

/** Free the shared geometry cache — only needed on a full teardown. */
export function disposeAnimalCache() {
  for (const parts of cache.values()) {
    for (const key of ['body', 'head', 'accents', 'eyes']) parts[key]?.dispose?.();
  }
  cache.clear();
}
