/**
 * To-Zoo — who is standing where.
 *
 * Until now nothing in the zoo knew about anything else. `steer()` picked a
 * target and walked to it, so animals strolled through each other and stood
 * inside rocks. This is the register that fixes that, and it is deliberately
 * the *only* place that answers "is there room here" — the wandering AI, the
 * drag-and-drop placement system and the release walk all ask it, so they can
 * never disagree about what counts as occupied.
 *
 * Everything is a circle on the ground plane. That is a lie about a 3D world,
 * but it is the right lie: animals and props are all roughly radially
 * symmetric from above, circles are trivial to separate, and thirty of them
 * cost nothing to test pairwise.
 */

/** @typedef {{id: string, x: number, z: number, r: number, solid: boolean, mobile: boolean}} Body */

export function createSpace() {
  /** @type {Map<string, Body>} */
  const bodies = new Map();

  /**
   * @param {string} id
   * @param {object} spec
   * @param {number} spec.x
   * @param {number} spec.z
   * @param {number} spec.r        footprint radius
   * @param {boolean} [spec.mobile] mobile bodies get pushed; static ones push
   */
  function register(id, { x, z, r, mobile = false }) {
    bodies.set(id, { id, x, z, r, mobile, solid: true });
    return bodies.get(id);
  }

  function move(id, x, z) {
    const body = bodies.get(id);
    if (!body) return;
    body.x = x;
    body.z = z;
  }

  const remove = (id) => bodies.delete(id);
  const get = (id) => bodies.get(id) ?? null;
  const clear = () => bodies.clear();

  /**
   * Is a circle here free of everything else?
   *
   * @param {number} x
   * @param {number} z
   * @param {number} r
   * @param {string} [ignoreId]  usually the thing being moved
   * @param {number} [slack]     negative lets things sit closer than touching
   */
  function isFree(x, z, r, ignoreId = null, slack = 0) {
    for (const body of bodies.values()) {
      if (body.id === ignoreId || !body.solid) continue;
      const min = body.r + r + slack;
      const dx = body.x - x;
      const dz = body.z - z;
      if (dx * dx + dz * dz < min * min) return false;
    }
    return true;
  }

  /** The nearest body overlapping this circle, or null. Used for "why not". */
  function blockerAt(x, z, r, ignoreId = null) {
    let closest = null;
    let closestGap = Infinity;
    for (const body of bodies.values()) {
      if (body.id === ignoreId || !body.solid) continue;
      const min = body.r + r;
      const dist = Math.hypot(body.x - x, body.z - z);
      if (dist < min && dist - min < closestGap) {
        closest = body;
        closestGap = dist - min;
      }
    }
    return closest;
  }

  /**
   * Separate everything that is currently overlapping.
   *
   * Run once per frame after the AI has moved things. Mobile bodies give way;
   * static ones (rocks, trees, fence posts) never move, so an animal that has
   * walked into scenery is pushed out of it rather than the scenery sliding.
   * When two mobile bodies meet they share the correction, which reads as two
   * animals politely making room for each other.
   *
   * One relaxation pass per frame is enough — the correction is applied every
   * frame, so a deep overlap resolves over a few frames as a shove rather than
   * a teleport, which looks far better than solving it exactly in one go.
   *
   * @param {(id: string, x: number, z: number) => void} [onMoved]
   */
  function resolve(onMoved) {
    const list = [...bodies.values()];

    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (!a.mobile && !b.mobile) continue;      // two rocks cannot conflict

        const min = a.r + b.r;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let distSq = dx * dx + dz * dz;
        if (distSq >= min * min) continue;

        // Exactly coincident: pick a deterministic direction rather than
        // dividing by zero and flinging one of them to infinity.
        if (distSq < 1e-6) {
          const angle = (i * 2.399963 + j) % (Math.PI * 2);
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          distSq = 1;
        }

        const dist = Math.sqrt(distSq);
        const overlap = min - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Ease the push so contact looks like nudging, not a spring.
        const push = overlap * 0.5;

        if (a.mobile && b.mobile) {
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          onMoved?.(a.id, a.x, a.z);
          onMoved?.(b.id, b.x, b.z);
        } else if (a.mobile) {
          a.x -= nx * overlap; a.z -= nz * overlap;
          onMoved?.(a.id, a.x, a.z);
        } else {
          b.x += nx * overlap; b.z += nz * overlap;
          onMoved?.(b.id, b.x, b.z);
        }
      }
    }
  }

  /**
   * Somewhere free near a preferred point — used when spawning an animal or
   * dropping a decoration onto an occupied spot. Spirals outward so the result
   * is always the closest free place rather than a random one.
   *
   * @returns {{x: number, z: number} | null}
   */
  function findFreeNear(x, z, r, {
    ignoreId = null, maxRadius = 6, contains = () => true,
  } = {}) {
    if (contains(x, z) && isFree(x, z, r, ignoreId)) return { x, z };

    for (let ring = 0.5; ring <= maxRadius; ring += 0.5) {
      const steps = Math.max(8, Math.round(ring * 8));
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2 + ring;   // offset each ring
        const px = x + Math.cos(a) * ring;
        const pz = z + Math.sin(a) * ring;
        if (contains(px, pz) && isFree(px, pz, r, ignoreId)) return { x: px, z: pz };
      }
    }
    return null;
  }

  /** Bodies within `range` of a point, nearest first. The AI's eyes. */
  function near(x, z, range, { ignoreId = null, filter = null } = {}) {
    const out = [];
    for (const body of bodies.values()) {
      if (body.id === ignoreId) continue;
      if (filter && !filter(body)) continue;
      const dist = Math.hypot(body.x - x, body.z - z);
      if (dist <= range) out.push({ body, dist });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  return {
    register, move, remove, get, clear,
    isFree, blockerAt, resolve, findFreeNear, near,
    get size() { return bodies.size; },
    all() { return [...bodies.values()]; },
  };
}
