/**
 * To-Zoo — the bridge between CSS tokens and the 3D world.
 *
 * The scene never hard-codes a colour. It asks for a token name, gets a
 * THREE.Color built from the same custom property the interface uses, and
 * re-reads them all when the theme flips. That is the whole reason dark mode
 * turns the zoo to dusk instead of just repainting the panels.
 */

import * as THREE from 'three';

const TOKENS = [
  'paper', 'paper-sunk', 'surface', 'surface-2', 'line',
  'ink', 'ink-muted', 'ink-faint',
  'grass', 'grass-deep', 'grass-lush', 'grass-dry',
  'sand', 'sand-deep', 'earth', 'earth-deep', 'bark',
  'sky-high', 'sky-low', 'water', 'water-deep', 'sea-shallow', 'sea', 'sea-deep', 'foam',
  'elephant', 'lion', 'rabbit', 'rabbit-ear', 'outline', 'cloth', 'ivory',
  'accent', 'accent-deep', 'thrive', 'caution', 'overdue',
  'stone', 'stone-deep', 'picket', 'roof', 'blush',
  'flower-pink', 'flower-yellow', 'flower-lilac', 'flower-peach',
  'confetti-blue', 'confetti-yellow', 'confetti-green', 'confetti-orange', 'confetti-pink', 'confetti-violet',
];

/** @type {Record<string, THREE.Color>} */
const colors = {};

const listeners = new Set();

function readAll() {
  const style = getComputedStyle(document.documentElement);
  for (const token of TOKENS) {
    const raw = style.getPropertyValue(`--${token}`).trim();
    if (!raw) continue;
    if (colors[token]) colors[token].setStyle(raw);
    else colors[token] = new THREE.Color(raw);
  }
}

readAll();

/**
 * @param {string} token  a token name without the leading dashes
 * @returns {THREE.Color} the live instance — mutated in place on theme change,
 *                        so materials holding it update for free
 */
export function color(token) {
  if (!colors[token]) {
    console.warn(`[to-zoo] unknown palette token "${token}"`);
    return new THREE.Color(0xff00ff);
  }
  return colors[token];
}

/** A detached copy, for when a material needs to tint away from the token. */
export const colorOf = (token) => color(token).clone();

/** Re-read every token. Call after <html data-theme> changes. */
export function refresh() {
  readAll();
  for (const fn of listeners) fn();
}

/** Materials that need to rebuild (not just re-read) on a theme change. */
export function onPaletteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Mix toward another token by t. Used everywhere the zoo's health drives a
 * colour: lush grass at 0, dry grass at 1.
 */
export function mixTokens(a, b, t, target = new THREE.Color()) {
  return target.copy(color(a)).lerp(color(b), Math.max(0, Math.min(1, t)));
}
