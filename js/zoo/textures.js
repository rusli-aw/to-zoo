/**
 * To-Zoo — island textures.
 *
 * Small canvases drawn at boot and nearest-filtered, so they read as chunky
 * handheld-era pixel art when stretched over the ground. White-ish on
 * purpose: the material colour does the tinting, so the seasons can still
 * recolour the ground without a second set of textures.
 */

import * as THREE from 'three';
import { rng } from './geom.js';

function finish(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Grass: a flat field with little darker "v" tufts and the odd pale fleck,
 * the pattern a cartoon island lawn is printed with.
 *
 * @param {number} seed
 */
export function grassTexture(seed = 1, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return finish(canvas);
  const r = rng(seed * 7919);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Tufts: two-pixel-wide chevrons in a darker green-neutral.
  ctx.fillStyle = 'rgba(40, 70, 20, 0.16)';
  for (let i = 0; i < 18; i += 1) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    ctx.fillRect(x, y, 1, 2);
    ctx.fillRect(x + 1, y + 2, 1, 1);
    ctx.fillRect(x + 2, y, 1, 2);
  }
  // Pale flecks, like sun on clover.
  ctx.fillStyle = 'rgba(255, 255, 220, 0.5)';
  for (let i = 0; i < 10; i += 1) {
    ctx.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  }
  return finish(canvas);
}

/**
 * Paint: a smooth field with large soft blotches of lighter and darker tone
 * and a light dry-brush speckle. Linear-filtered — this one should blur, not
 * pixelate.
 */
export function paintTexture(seed = 1, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return finish(canvas);
  const r = rng(seed * 104729);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Blotches, drawn three times offset so the tile wraps without a seam.
  for (let i = 0; i < 26; i += 1) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.08 + r() * 0.22);
    const dark = r() < 0.55;
    const a = 0.05 + r() * 0.08;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, dark ? `rgba(60,50,30,${a})` : `rgba(255,250,230,${a * 1.4})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }
  // Dry-brush speckle.
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(70,60,35,0.06)' : 'rgba(255,248,225,0.08)';
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1);
  }
  const texture = finish(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Stepping stones, two abreast and staggered. Transparent between the stones
 * so the grass shows through the gaps; used with alphaTest for a crisp edge.
 */
export function stoneTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return finish(canvas);

  ctx.clearRect(0, 0, size, size);
  const tile = (x, y, w, h) => {
    const rad = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rad);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // A darker lower lip, so each stone has a little thickness.
    ctx.fillStyle = 'rgba(60, 70, 80, 0.18)';
    ctx.fillRect(x + 3, y + h - 3, w - 6, 2);
    // One highlight pixel run on the top edge.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(x + 4, y + 2, w - 10, 1);
  };
  const half = size / 2;
  tile(3, 3, half - 5, half - 5);
  tile(half + 2, 3, half - 5, half - 5);
  // Second row offset by a quarter, so the joints do not line up.
  tile(-half / 2 + 3, half + 2, half - 5, half - 5);
  tile(half / 2 + 3, half + 2, half - 5, half - 5);
  tile(size - half / 2 + 3, half + 2, half - 5, half - 5);
  return finish(canvas);
}
