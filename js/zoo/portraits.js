/**
 * To-Zoo — painted portraits.
 *
 * Each species, rendered once at boot from the real 3D model into a small
 * square, then finished in 2D as a little painted vignette: a soft wash of
 * colour behind the animal and a light paper grain over the lot. The result
 * is a data URL the interface can drop into an <img>, so task cards and the
 * keepsake journal show the same animals as the zoo, not a stand-in icon.
 *
 * Rendered through the zoo's own renderer into an offscreen target, so no
 * second WebGL context is needed.
 */

import * as THREE from 'three';
import { createAnimal } from './animals.js';

const SIZE = 256;

/** Background washes, one per species, from the palette. */
const WASH = {
  elephant: ['#e9dccb', '#cdbfd0'],
  lion: ['#f1dcc6', '#e3b98e'],
  rabbit: ['#eef0dc', '#cfd6b0'],
};

/** @type {Record<string, string>} */
const urls = {};

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function renderPortraits(zoo) {
  const { renderer, ink } = zoo;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf6e6d6, 0x8e8a86, 0.9 * Math.PI));
  const key = new THREE.DirectionalLight(0xfff0dc, 0.55 * Math.PI);
  key.position.set(3, 5, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return urls;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();

  for (const type of ['elephant', 'lion', 'rabbit']) {
    const animal = createAnimal(ink, type, `portrait-${type}`);
    // Pop-in spring settled, mid-breath, looking at us three-quarter on.
    for (let i = 0; i < 90; i += 1) animal.update(1 / 30, i / 30);
    animal.root.rotation.y = 0.55;
    scene.add(animal.root);

    // Frame the head and shoulders: portraits are about faces.
    const h = animal.height;
    camera.position.set(h * 0.55, h * 0.78, h * 1.9);
    camera.lookAt(0, h * 0.62, 0);

    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);

    // Wash: a soft blotchy circle of colour.
    ctx.clearRect(0, 0, SIZE, SIZE);
    const [a, b] = WASH[type];
    const g = ctx.createRadialGradient(SIZE * 0.45, SIZE * 0.4, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.62);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // The animal, flipped (GL rows run bottom-up).
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y += 1) {
      img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    }
    const layer = document.createElement('canvas');
    layer.width = layer.height = SIZE;
    layer.getContext('2d')?.putImageData(img, 0, 0);
    ctx.drawImage(layer, 0, 0);

    // Paper grain over everything.
    const grain = ctx.getImageData(0, 0, SIZE, SIZE);
    for (let i = 0; i < grain.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      grain.data[i] += n;
      grain.data[i + 1] += n;
      grain.data[i + 2] += n * 0.8;
    }
    ctx.putImageData(grain, 0, 0);

    urls[type] = canvas.toDataURL('image/png');
    scene.remove(animal.root);
    animal.dispose();
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  return urls;
}

/** The portrait for a species, or '' before they have been rendered. */
export const portraitOf = (type) => urls[type] ?? '';

/**
 * A snapshot of the zoo as it is right now, from a wide, slightly raised
 * view, for the postcard front. Rendered offscreen at its own size, so it
 * is crisp whatever the window, and returned as a data URL.
 *
 * @param {import('./scene.js').ZooScene} zoo
 */
export function snapshotZoo(zoo, width = 900, height = 600) {
  const { renderer, scene } = zoo;
  const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 260);
  camera.position.set(4.5, 5.2, 14);
  camera.lookAt(0, 1.2, -2.5);
  // The vines hang on the main camera; they should not be on the postcard.
  const hidden = [];
  for (const child of zoo.camera.children) if (child.visible) { child.visible = false; hidden.push(child); }

  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
  renderer.setRenderTarget(prev);
  rt.dispose();
  for (const child of hidden) child.visible = true;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    img.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.88);
}
