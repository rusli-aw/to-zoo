/**
 * To-Zoo — pathfinding.
 *
 * Jump Point Search on a grid over the enclosure, ported from the idea in
 * fgenesis/jps (public domain). JPS is A* that skips across open ground in
 * straight lines and only stops at "jump points" — cells where a wall forces
 * a turn — so on a mostly empty lawn it expands a handful of nodes instead of
 * hundreds.
 *
 * The grid is rebuilt from the occupancy register for each request: the
 * static footprints (rocks, bushes, decorations, gate posts) are grown by the
 * walker's radius, so a path that clears the grid cells clears the walker.
 * The enclosure is ~45×34 cells, so a rebuild costs nothing worth caching.
 *
 * The raw jump-point path is then string-pulled: any waypoint the walker can
 * see past is dropped, so animals amble on long diagonals rather than
 * zig-zagging cell to cell.
 */

import { LAYOUT } from './environment.js';

const CELL = 0.4;
const SQRT2 = Math.SQRT2;

/**
 * @param {ReturnType<import('./space.js').createSpace>} space
 */
export function createPathfinder(space) {
  const minX = LAYOUT.minX;
  const minZ = LAYOUT.minZ;
  const W = Math.ceil((LAYOUT.maxX - LAYOUT.minX) / CELL);
  const H = Math.ceil((LAYOUT.maxZ - LAYOUT.minZ) / CELL);
  const blocked = new Uint8Array(W * H);

  const toCell = (x, z) => [
    Math.max(0, Math.min(W - 1, Math.floor((x - minX) / CELL))),
    Math.max(0, Math.min(H - 1, Math.floor((z - minZ) / CELL))),
  ];
  const toWorld = (cx, cz) => ({ x: minX + (cx + 0.5) * CELL, z: minZ + (cz + 0.5) * CELL });
  const walkable = (cx, cz) => cx >= 0 && cz >= 0 && cx < W && cz < H && !blocked[cz * W + cx];

  /** Mark every cell a walker of radius r cannot stand in. */
  function build(r, ignoreId) {
    blocked.fill(0);
    const margin = r + 0.5;   // keep off the fence
    for (let cz = 0; cz < H; cz += 1) {
      for (let cx = 0; cx < W; cx += 1) {
        const { x, z } = toWorld(cx, cz);
        if (x < LAYOUT.minX + margin || x > LAYOUT.maxX - margin
          || z < LAYOUT.minZ + margin || z > LAYOUT.maxZ - margin) blocked[cz * W + cx] = 1;
      }
    }
    for (const body of space.all()) {
      if (body.mobile || body.id === ignoreId) continue;
      const reach = body.r + r;
      const [x0, z0] = toCell(body.x - reach, body.z - reach);
      const [x1, z1] = toCell(body.x + reach, body.z + reach);
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let cx = x0; cx <= x1; cx += 1) {
          const p = toWorld(cx, cz);
          if ((p.x - body.x) ** 2 + (p.z - body.z) ** 2 < reach * reach) blocked[cz * W + cx] = 1;
        }
      }
    }
  }

  /* ------------------------------------------------------------- JPS --- */

  /** Walk from (x,y) in (dx,dy) until a jump point, the goal, or a wall.
   *  The variant that never cuts a corner (diagonals need both sides open). */
  function jump(x, y, dx, dy, gx, gy) {
    for (;;) {
      x += dx;
      y += dy;
      if (!walkable(x, y)) return null;
      // No corner cutting: a diagonal step needs both orthogonal neighbours open.
      if (dx && dy && (!walkable(x - dx, y) || !walkable(x, y - dy))) return null;
      if (x === gx && y === gy) return [x, y];

      if (dx && dy) {
        // Diagonal: a jump point if either straight sweep from here finds one.
        if (jump(x, y, dx, 0, gx, gy) || jump(x, y, 0, dy, gx, gy)) return [x, y];
      } else if (dx) {
        // Horizontal: stop where a wall alongside ends, because a turn
        // through that new opening might be the way round.
        if ((walkable(x, y + 1) && !walkable(x - dx, y + 1))
          || (walkable(x, y - 1) && !walkable(x - dx, y - 1))) return [x, y];
      } else if ((walkable(x + 1, y) && !walkable(x + 1, y - dy))
          || (walkable(x - 1, y) && !walkable(x - 1, y - dy))) {
        return [x, y];
      }
    }
  }

  /** Neighbour directions worth exploring from a node, given how we arrived. */
  function directions(x, y, px, py) {
    if (px === null) {
      const all = [];
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) all.push([dx, dy]);
      return all;
    }
    const dx = Math.sign(x - px);
    const dy = Math.sign(y - py);
    const out = [];
    if (dx && dy) {
      out.push([dx, dy], [dx, 0], [0, dy]);
    } else if (dx) {
      out.push([dx, 0], [0, 1], [0, -1], [dx, 1], [dx, -1]);
    } else {
      out.push([0, dy], [1, 0], [-1, 0], [1, dy], [-1, dy]);
    }
    return out;
  }

  const octile = (ax, ay, bx, by) => {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  function search(sx, sy, gx, gy) {
    const key = (x, y) => y * W + x;
    const g = new Map([[key(sx, sy), 0]]);
    const parent = new Map([[key(sx, sy), null]]);
    /** Tiny binary heap keyed on f. */
    const heap = [];
    const push = (n) => {
      heap.push(n);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= heap[i].f) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    push({ x: sx, y: sy, f: octile(sx, sy, gx, gy) });
    let expanded = 0;
    while (heap.length && expanded < 4000) {
      const node = pop();
      expanded += 1;
      if (node.x === gx && node.y === gy) {
        const path = [];
        for (let k = key(gx, gy); k !== null; k = parent.get(k)) path.push([k % W, Math.floor(k / W)]);
        return path.reverse();
      }
      const pk = parent.get(key(node.x, node.y));
      const px = pk === null ? null : pk % W;
      const py = pk === null ? null : Math.floor(pk / W);
      for (const [dx, dy] of directions(node.x, node.y, px, py)) {
        const jp = jump(node.x, node.y, dx, dy, gx, gy);
        if (!jp) continue;
        const [jx, jy] = jp;
        const cost = g.get(key(node.x, node.y)) + octile(node.x, node.y, jx, jy);
        const jk = key(jx, jy);
        if (g.has(jk) && g.get(jk) <= cost) continue;
        g.set(jk, cost);
        parent.set(jk, key(node.x, node.y));
        push({ x: jx, y: jy, f: cost + octile(jx, jy, gx, gy) });
      }
    }
    return null;
  }

  /* ------------------------------------------------------- smoothing --- */

  /** Can a walker go straight from a to b without entering a blocked cell? */
  function clear(ax, az, bx, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / (CELL * 0.5));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const [cx, cz] = toCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!walkable(cx, cz)) return false;
    }
    return true;
  }

  /** Nearest walkable cell to a point, so a start inside a footprint still works. */
  function nearestOpen(cx, cz) {
    if (walkable(cx, cz)) return [cx, cz];
    for (let ring = 1; ring < 8; ring += 1) {
      for (let dz = -ring; dz <= ring; dz += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          if (walkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
      }
    }
    return null;
  }

  return {
    /**
     * A walkable route from one point to another, as world-space waypoints
     * (excluding the start). Null if there is no way through.
     *
     * @param {{x: number, z: number}} from
     * @param {{x: number, z: number}} to
     * @param {number} radius   the walker's footprint
     * @param {string} [ignoreId]
     */
    find(from, to, radius, ignoreId = null) {
      build(radius, ignoreId);
      const s = nearestOpen(...toCell(from.x, from.z));
      const e = nearestOpen(...toCell(to.x, to.z));
      if (!s || !e) return null;
      if (clear(from.x, from.z, to.x, to.z) && walkable(...toCell(to.x, to.z))) return [{ x: to.x, z: to.z }];

      const cells = search(s[0], s[1], e[0], e[1]);
      if (!cells) return null;
      const points = cells.map(([cx, cz]) => toWorld(cx, cz));
      points[points.length - 1] = walkable(...toCell(to.x, to.z)) ? { x: to.x, z: to.z } : points[points.length - 1];

      // String-pull: from each kept point, skip ahead to the furthest visible one.
      const out = [];
      let here = { x: from.x, z: from.z };
      let i = 0;
      while (i < points.length) {
        let j = points.length - 1;
        while (j > i && !clear(here.x, here.z, points[j].x, points[j].z)) j -= 1;
        out.push(points[j]);
        here = points[j];
        i = j + 1;
      }
      return out;
    },

    /** Is this point somewhere a walker of this size could stand? */
    standable(x, z, radius, ignoreId = null) {
      build(radius, ignoreId);
      return walkable(...toCell(x, z));
    },
  };
}
