/**
 * To-Zoo — tasks become animals.
 *
 * This is the join between the data model and the world, and the reason the
 * brief's "animal = task" reads in the first few seconds: nothing here is
 * hard-coded per task. A task arrives, it is given a slot, a species, a size
 * and a mood derived from its own fields, and it starts living in the zoo.
 *
 * Slots keep the size hierarchy readable. Rabbits gather in the centre, where
 * their hopping is easiest to watch; lions ring them; elephants take the back
 * and the flanks, where their bulk still dominates the frame. What matters is
 * that nothing small sits in the *foreground* — a rabbit at the front edge
 * would loom larger than an elephant behind it and quietly invert the whole
 * priority metaphor.
 */

import * as THREE from 'three';
import { urgency as urgencyOf, isOverdue, mood as moodOf, moodStage } from '../model.js';
import { createAnimal } from './animals.js';
import { hashString, rng } from './geom.js';
import { LAYOUT } from './environment.js';
import { createPathfinder } from './pathfind.js';

/** Hand-placed so the arrangement looks composed rather than gridded. */
const SLOTS = {
  elephant: [
    { x: -4.6, z: -2.4 }, { x: 4.4, z: -2.8 }, { x: -0.4, z: -4.2 },
    { x: -7.0, z: -0.4 }, { x: 6.8, z: -0.2 }, { x: 2.6, z: -4.6 },
  ],
  lion: [
    { x: -4.8, z: 2.6 }, { x: 4.6, z: 2.4 }, { x: -2.4, z: 4.2 },
    { x: 3.0, z: 4.4 }, { x: -6.8, z: 3.6 }, { x: 6.6, z: 4.0 },
  ],
  // The middle of the enclosure, in a loose warren.
  rabbit: [
    { x: 0.2, z: 1.1 }, { x: -1.3, z: 0.4 }, { x: 1.5, z: 0.2 },
    { x: -0.6, z: 2.1 }, { x: 1.1, z: 1.9 }, { x: -2.0, z: 1.6 },
    { x: 2.3, z: 1.3 }, { x: 0.6, z: -0.6 },
  ],
};

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function createPopulation(zoo, space) {
  const group = new THREE.Group();
  zoo.scene.add(group);

  /** @type {Map<string, any>} taskId -> entry */
  const entries = new Map();
  /** Animals mid-release: removed from the task list but still on screen. */
  const leaving = new Set();
  /**
   * Tasks that are about to be completed. Completing commits to the store
   * synchronously, which re-runs sync() — without this the animal would be
   * disposed a moment before the release animation asks for it, and the whole
   * sequence would silently do nothing.
   */
  const reserved = new Set();

  /** Whichever head cosmetic the user owns and has placed, if any. */
  let cosmetic = null;

  const tmp = new THREE.Vector3();
  const paths = createPathfinder(space);

  function slotFor(type, index, seed) {
    const list = SLOTS[type];
    const base = list[index % list.length];
    const r = rng(seed);
    // Overflow rings outward rather than stacking on top of an existing animal.
    const ring = Math.floor(index / list.length);
    const angle = r() * Math.PI * 2;
    const push = ring * 1.6;
    return {
      x: THREE.MathUtils.clamp(base.x + Math.cos(angle) * push + (r() - 0.5) * 0.7, LAYOUT.minX + 0.8, LAYOUT.maxX - 0.8),
      z: THREE.MathUtils.clamp(base.z + Math.sin(angle) * push + (r() - 0.5) * 0.7, LAYOUT.minZ + 1.0, LAYOUT.maxZ - 0.6),
    };
  }

  function spawn(task, index) {
    const animal = createAnimal(zoo.ink, task.animalType, task.id);
    let home = slotFor(task.animalType, index, hashString(task.id));

    // The slot is a preference, not a right. If something is already standing
    // there — another animal, a rock, a bought tree — spiral out to the
    // nearest free spot rather than spawning inside it.
    const free = space.findFreeNear(home.x, home.z, animal.radius, {
      contains: inBounds,
    });
    if (free) home = free;

    space.register(task.id, { x: home.x, z: home.z, r: animal.radius, mobile: true });
    animal.root.position.set(home.x, 0, home.z);
    // Face the camera, give or take. Every animal is built with its head at
    // +z and the camera sits at +z, so a rotation near zero shows faces,
    // trunks and manes. v1 spawned them at Math.PI — turned away — which is
    // why the zoo was a field of identical rumps and none of the anatomy
    // could be seen at all.
    animal.root.rotation.y = (rng(hashString(task.id) + 3)() - 0.5) * 1.3;
    group.add(animal.root);

    for (const mesh of animal.pickTargets) mesh.userData.taskId = task.id;
    if (cosmetic) animal.wear(cosmetic);

    const entry = {
      task,
      animal,
      home,
      /** Where it is currently ambling toward. */
      target: new THREE.Vector3(home.x, 0, home.z),
      /** Waypoints still to walk, from the pathfinder; the target is the last. */
      path: [],
      dwell: rng(hashString(task.id) + 7)() * 4,
      state: 'idle',
    };
    entries.set(task.id, entry);
    return entry;
  }

  /* ------------------------------------------------------------ wander --- */

  const inBounds = (x, z) => (
    x > LAYOUT.minX + 0.9 && x < LAYOUT.maxX - 0.9
    && z > LAYOUT.minZ + 1.1 && z < LAYOUT.maxZ - 0.9
  );

  /**
   * Pick a wander target that is in bounds and not already occupied, and plan
   * a route to it round the rocks, bushes and decorations. Now and then the
   * target is anywhere in the zoo rather than near home — a proper stroll
   * across the enclosure, which only works because the route goes round
   * things instead of through them.
   */
  function pickTarget(entry, reach, tries = 6) {
    const { home, animal } = entry;
    const pos = animal.root.position;
    const roam = Math.random() < 0.3;
    for (let i = 0; i < tries; i += 1) {
      let x;
      let z;
      if (roam) {
        x = LAYOUT.minX + 1 + Math.random() * (LAYOUT.maxX - LAYOUT.minX - 2);
        z = LAYOUT.minZ + 1.3 + Math.random() * (LAYOUT.maxZ - LAYOUT.minZ - 2.4);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = reach * (0.35 + Math.random() * 0.65);
        x = home.x + Math.cos(angle) * dist;
        z = home.z + Math.sin(angle) * dist;
      }
      if (!inBounds(x, z)) continue;
      if (!space.isFree(x, z, animal.radius, entry.task.id, -0.15)) continue;
      const route = paths.find(pos, { x, z }, animal.radius * 0.8, entry.task.id);
      if (!route) continue;
      entry.target.set(x, 0, z);
      entry.path = route;
      // A long stroll ends somewhere new: that becomes home for a while.
      if (roam) { home.x = x; home.z = z; }
      return true;
    }
    // Nowhere free nearby — stay put rather than walk into something.
    entry.target.set(pos.x, 0, pos.z);
    entry.path = [];
    return false;
  }

  function steer(entry, dt) {
    const { animal, home } = entry;
    const u = animal.urgency;
    const pos = animal.root.position;

    // An animal that has lain down has stopped caring about going anywhere.
    if (animal.isDown) {
      animal.setWalking(0);
      return;
    }

    entry.dwell -= dt;
    if (entry.dwell <= 0) {
      const r = Math.random;
      if (u > 0.72) {
        // Pacing: longer, more purposeful legs, and barely any rest between
        // them. Reads as restlessness without ever looking distressed.
        pickTarget(entry, 0.9 + u * 0.9);
        entry.dwell = 0.6 + r() * 1.2;
      } else {
        pickTarget(entry, 0.6 + r() * 0.9);
        entry.dwell = 3 + r() * 6;
      }
    }

    // Walk the route one waypoint at a time; the last one is the target.
    while (entry.path.length > 1 && Math.hypot(entry.path[0].x - pos.x, entry.path[0].z - pos.z) < 0.25) {
      entry.path.shift();
    }
    const next = entry.path[0] ?? entry.target;
    tmp.set(next.x - pos.x, 0, next.z - pos.z);
    const toEnd = Math.hypot(entry.target.x - pos.x, entry.target.z - pos.z);
    const dist = entry.path.length > 1 ? Math.max(tmp.length(), toEnd) : tmp.length();

    if (dist > 0.05) {
      const speed = animal.spec.speed * (u > 0.72 ? 0.85 : 0.42);
      tmp.normalize();
      pos.addScaledVector(tmp, Math.min(dist, speed * dt));
      space.move(entry.task.id, pos.x, pos.z);
      animal.setWalking(Math.min(1, dist * 2.2));

      // Turn to face travel, the short way round.
      const want = Math.atan2(tmp.x, tmp.z);
      let delta = want - animal.root.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      animal.root.rotation.y += delta * (1 - Math.exp(-4 * dt));
    } else {
      animal.setWalking(0);
    }
  }

  /* -------------------------------------------------------------- frame --- */

  zoo.onFrame((dt, elapsed) => {
    for (const entry of entries.values()) {
      if (entry.state === 'idle') steer(entry, dt);
    }

    // Separate anything that ended up overlapping, then copy the corrected
    // positions back onto the meshes. Doing it here — once, after every animal
    // has moved — is what stops them walking through each other and through
    // the scenery.
    space.resolve((id, x, z) => {
      const entry = entries.get(id);
      if (!entry) return;
      entry.animal.root.position.x = x;
      entry.animal.root.position.z = z;
    });

    for (const entry of entries.values()) entry.animal.update(dt, elapsed);
    for (const entry of leaving) entry.animal.update(dt, elapsed);
  });

  /* ---------------------------------------------------------------- api --- */

  return {
    group,

    /**
     * Bring the world in line with the task list. Additions spawn, removals
     * despawn, and everything still present has its mood refreshed.
     *
     * @param {import('../model.js').Task[]} tasks
     */
    sync(tasks) {
      const open = tasks.filter((t) => !t.completed);
      const seen = new Set();

      // Index within species decides the slot, so the arrangement is stable
      // as long as the set of tasks is.
      const counters = { elephant: 0, lion: 0, rabbit: 0 };

      for (const task of open) {
        seen.add(task.id);
        const index = counters[task.animalType]++;
        let entry = entries.get(task.id);

        if (entry && entry.task.animalType !== task.animalType) {
          // The user changed the size — the animal has to be rebuilt.
          entry.animal.dispose();
          entries.delete(task.id);
          entry = null;
        }

        if (!entry) entry = spawn(task, index);
        entry.task = task;
        entry.animal.setUrgency(urgencyOf(task));
        entry.overdue = isOverdue(task);

        // Posture is mood made physical: fed-up animals sit, and the ones at
        // the very bottom lie down and stop pretending to be interested.
        const value = moodOf(task);
        entry.mood = value;
        entry.stage = moodStage(value).key;
        entry.animal.setPose(value <= 4 ? 'lie' : value <= 12 ? 'sit' : 'stand');
      }

      for (const [id, entry] of entries) {
        if (seen.has(id) || leaving.has(entry) || reserved.has(id)) continue;
        space.remove(id);
        entry.animal.dispose();
        entries.delete(id);
      }
    },

    /** One hat for the whole zoo — cosmetics are a set, not per-animal. */
    setCosmetic(build) {
      if (build === cosmetic) return;
      cosmetic = build;
      for (const entry of entries.values()) entry.animal.wear(build);
    },

    /** Hold an animal against the next sync, ahead of releasing it. */
    reserve(taskId) { reserved.add(taskId); },
    /** Drop the hold without releasing — the completion did not happen. */
    unreserve(taskId) { reserved.delete(taskId); },

    get(taskId) { return entries.get(taskId) ?? null; },

    /** Where every animal is, for the sound layer. */
    positions() {
      return [...entries.values()].map((e) => ({
        type: e.task.animalType, x: e.animal.root.position.x, z: e.animal.root.position.z,
      }));
    },
    all() { return [...entries.values()]; },
    count() { return entries.size; },

    /** Every mesh a click could land on. */
    pickTargets() {
      const out = [];
      for (const entry of entries.values()) out.push(...entry.animal.pickTargets);
      return out;
    },

    /** World point above an animal's head, for labels and camera focus. */
    anchorOf(taskId, out = new THREE.Vector3()) {
      const entry = entries.get(taskId);
      if (!entry) return null;
      return entry.animal.anchor(out);
    },

    /**
     * Hand an animal over to the release choreography: it stops wandering and
     * stops being pickable, but keeps updating until the sequence lets it go.
     */
    detach(taskId) {
      const entry = entries.get(taskId);
      reserved.delete(taskId);
      if (!entry) return null;
      // On its way out it stops taking up room, so the zoo closes the gap.
      space.remove(taskId);
      entries.delete(taskId);
      leaving.add(entry);
      entry.state = 'leaving';
      return entry;
    },

    /** Called by the release sequence when the animal is gone for good. */
    finish(entry) {
      leaving.delete(entry);
      entry.animal.dispose();
    },

    applyTheme() {
      for (const entry of entries.values()) entry.animal.applyTheme();
      for (const entry of leaving) entry.animal.applyTheme();
    },
  };
}
