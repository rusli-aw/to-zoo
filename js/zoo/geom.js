/**
 * To-Zoo — geometry helpers.
 *
 * Three's own merge utility lives in examples/jsm, which would drag a second
 * file into vendor/ for one function. This is that function, plus the
 * transform sugar the world builders lean on.
 *
 * Everything is merged down to non-indexed triangles. That costs some
 * vertices, but the whole art direction is flat-shaded, and merging a fence
 * into one draw call matters far more on a phone than the vertex count does.
 */

import * as THREE from 'three';

/**
 * Concatenate geometries into one. All inputs are converted to non-indexed
 * and reduced to position/normal/uv, which every geometry we build has.
 *
 * @param {THREE.BufferGeometry[]} geometries
 * @returns {THREE.BufferGeometry}
 */
export function mergeGeometries(geometries) {
  const parts = geometries
    .filter(Boolean)
    .map((g) => (g.index ? g.toNonIndexed() : g));

  let total = 0;
  for (const g of parts) total += g.attributes.position.count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);

  let v = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    for (let i = 0; i < p.count; i += 1) {
      position[(v + i) * 3] = p.getX(i);
      position[(v + i) * 3 + 1] = p.getY(i);
      position[(v + i) * 3 + 2] = p.getZ(i);
      if (n) {
        normal[(v + i) * 3] = n.getX(i);
        normal[(v + i) * 3 + 1] = n.getY(i);
        normal[(v + i) * 3 + 2] = n.getZ(i);
      }
      if (t) {
        uv[(v + i) * 2] = t.getX(i);
        uv[(v + i) * 2 + 1] = t.getY(i);
      }
    }
    v += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (!parts.some((g) => g.attributes.normal)) out.computeVertexNormals();

  // The inputs were throwaway clones; only the merged result survives.
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== geometries[i]) parts[i].dispose();
  }
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Position/rotate/scale a geometry in place and return it, so builders can
 * read as a list of parts rather than a wall of matrix calls.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {object} t
 * @param {number[]} [t.pos]    [x, y, z]
 * @param {number[]} [t.rot]    [x, y, z] radians
 * @param {number[]|number} [t.scale]
 */
export function place(geometry, t = {}) {
  const [x = 0, y = 0, z = 0] = t.pos ?? [];
  const [rx = 0, ry = 0, rz = 0] = t.rot ?? [];
  const s = t.scale ?? 1;
  const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s];

  _p.set(x, y, z);
  _q.setFromEuler(_e.set(rx, ry, rz));
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  geometry.applyMatrix4(_m);
  return geometry;
}

/* ------------------------------------------------------------- shapes --- */

/**
 * The island look is round and toy-like rather than faceted, so every curved
 * primitive asks for more segments than its caller wrote. Callers kept their
 * old low counts; this one number decides how smooth the world is.
 */
export const ROUND = 2;
const segs = (n, min = 3) => Math.max(min, Math.round(n * ROUND));

export const box = (w, h, d, t) => place(new THREE.BoxGeometry(w, h, d), t);

export const sphere = (r, t, seg = 10) =>
  place(new THREE.SphereGeometry(r, segs(seg), Math.max(6, Math.round(segs(seg) * 0.6))), t);

export const cyl = (rTop, rBottom, h, t, seg = 8) =>
  place(new THREE.CylinderGeometry(rTop, rBottom, h, segs(seg)), t);

export const cone = (r, h, t, seg = 8) =>
  place(new THREE.ConeGeometry(r, h, segs(seg)), t);

export const plane = (w, h, t, segW = 1, segH = 1) =>
  place(new THREE.PlaneGeometry(w, h, segW, segH), t);

/**
 * A squashed sphere — the workhorse for animal bodies, cloud puffs and tree
 * canopies. Segment counts are multiplied by ROUND so they read as soft toys.
 */
export const blob = (r, squash, t, seg = 9) => {
  const g = new THREE.SphereGeometry(r, segs(seg), Math.max(5, Math.round(segs(seg) * 0.6)));
  const s = Array.isArray(squash) ? squash : [1, squash, 1];
  place(g, { scale: s });
  return place(g, t);
};

/**
 * Deterministic pseudo-random from an integer seed. The world must look
 * identical on every reload — a zoo that rearranges its own scenery when you
 * refresh would feel broken rather than alive.
 */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** Hash a string to an int, so a task id can seed its animal's quirks. */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
