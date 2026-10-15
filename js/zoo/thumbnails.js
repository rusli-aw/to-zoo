/**
 * To-Zoo — shop thumbnails.
 *
 * Every item in the shop drawn from its real 3D model, the same way the
 * animal portraits are: rendered once at boot through the zoo's renderer
 * into a small offscreen square, framed automatically from its bounding box,
 * then finished in 2D with a soft wash behind it and paper grain over it.
 *
 * Flocks (butterflies, fireflies) have no geometry, so they get a little
 * painted scatter of dots instead.
 */

import * as THREE from 'three';
import { CATALOGUE } from '../data/seed.js';
import { color } from './palette.js';
import { itemPieces } from './decorations.js';

const SIZE = 192;
const WASH = ['#efe4d4', '#dcc8ae'];

/** @type {Record<string, string>} */
const urls = {};

function finish(ctx, layer) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const g = ctx.createRadialGradient(SIZE * 0.45, SIZE * 0.38, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.66);
  g.addColorStop(0, WASH[0]);
  g.addColorStop(1, WASH[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (layer) ctx.drawImage(layer, 0, 0);
  const grain = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n * 0.8;
  }
  ctx.putImageData(grain, 0, 0);
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function renderThumbnails(zoo) {
  const { renderer, ink } = zoo;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf6e6d6, 0x8e8a86, 0.9 * Math.PI));
  const key = new THREE.DirectionalLight(0xfff0dc, 0.6 * Math.PI);
  key.position.set(4, 7, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const layer = document.createElement('canvas');
  layer.width = layer.height = SIZE;
  const lctx = layer.getContext('2d');
  if (!ctx || !lctx) return urls;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();

  for (const item of CATALOGUE) {
    let pieces = null;
    try { pieces = itemPieces(item.build); } catch { pieces = null; }

    if (!pieces) {
      // A flock: a painted scatter of little bodies.
      lctx.clearRect(0, 0, SIZE, SIZE);
      const glow = item.build === 'fireflies';
      for (let i = 0; i < 9; i += 1) {
        const x = SIZE * (0.22 + Math.random() * 0.56);
        const y = SIZE * (0.22 + Math.random() * 0.56);
        lctx.fillStyle = glow ? 'rgba(240, 220, 120, 0.9)' : ['#e3a36e', '#9aab84', '#f0c48a'][i % 3];
        lctx.beginPath();
        if (glow) lctx.arc(x, y, 4 + Math.random() * 3, 0, Math.PI * 2);
        else lctx.ellipse(x, y, 9, 6, Math.random() * 3, 0, Math.PI * 2);
        lctx.fill();
      }
      finish(ctx, layer);
      urls[item.build] = canvas.toDataURL('image/png');
      continue;
    }

    const group = new THREE.Group();
    for (const part of pieces.parts) {
      const draw = ink.draw(part.geometry, color(part.token).clone(), { shadow: false });
      group.add(draw);
    }
    scene.add(group);

    // Frame it from its bounds, three-quarter view from slightly above.
    box.setFromObject(group);
    box.getBoundingSphere(sphere);
    const r = Math.max(0.2, sphere.radius);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
    const dir = new THREE.Vector3(0.75, pieces.cosmetic ? 0.35 : 0.62, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);
    camera.near = dist / 50;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);

    const img = lctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    }
    lctx.putImageData(img, 0, 0);
    finish(ctx, layer);
    urls[item.build] = canvas.toDataURL('image/png');

    scene.remove(group);
    group.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      mesh.geometry?.dispose?.();
      mesh.material?.dispose?.();
    });
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return urls;
}

export const thumbnailOf = (build) => urls[build] ?? '';
