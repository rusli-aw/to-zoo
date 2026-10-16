/**
 * To-Zoo — a mood bar over every animal that needs one.
 *
 * DOM rather than sprites. The scene already projects world points to screen
 * for the hover card and the accessibility proxies, so this reuses that path
 * and gets crisp text and real colour tokens for free — a canvas texture would
 * be blurry at this size and would need regenerating every time a mood ticked.
 *
 * A bar appears the moment an animal drops below full and stays until it is
 * released. That is the rule the user chose, and it has a nice property: a bar
 * on screen always means something is waiting, so a zoo with no bars is
 * genuinely finished rather than merely quiet.
 */

import * as THREE from 'three';
import { ANIMALS, mood as moodOf, moodStage } from '../model.js';
import { glyph } from './icons.js';
import { getState } from '../store.js';

export function createMoodBars(zoo, population) {
  const host = document.createElement('div');
  host.className = 'mood-bars';
  host.setAttribute('aria-hidden', 'true');   // the a11y proxies already say this
  document.getElementById('stage').appendChild(host);

  /** @type {Map<string, {el: HTMLElement, fill: HTMLElement, face: HTMLElement, shown: number}>} */
  const bars = new Map();
  const screen = { x: 0, y: 0, visible: true };
  // animal.anchor() writes into a Vector3 — a plain object has no .set().
  const anchor = new THREE.Vector3();
  let suspended = false;

  function ensure(taskId) {
    let bar = bars.get(taskId);
    if (bar) return bar;

    const el = document.createElement('div');
    el.className = 'mood-bar';
    el.innerHTML = '<span class="mood-bar__owner" hidden></span>'
      + '<span class="mood-bar__face"></span>'
      + '<span class="mood-bar__track"><i></i></span>';
    host.appendChild(el);

    bar = {
      el,
      fill: el.querySelector('i'),
      face: el.querySelector('.mood-bar__face'),
      owner: el.querySelector('.mood-bar__owner'),
      shown: -1,
    };
    bars.set(taskId, bar);
    return bar;
  }

  function drop(taskId) {
    const bar = bars.get(taskId);
    if (!bar) return;
    bar.el.remove();
    bars.delete(taskId);
  }

  zoo.onFrame(() => {
    if (suspended) return;

    const rect = zoo.canvas.getBoundingClientRect();
    const alive = new Set();

    for (const entry of population.all()) {
      const value = moodOf(entry.task);
      const id = entry.task.id;

      // In a group zoo, whose pet is this? That label stays even when the
      // pet is perfectly happy.
      const owner = getState().group ? (entry.task.by?.name ?? '') : '';

      // Full mood is a happy animal, and a happy animal does not need a meter.
      if (value >= 100 && !owner) { drop(id); continue; }
      alive.add(id);

      const bar = ensure(id);
      const stage = moodStage(value);
      if (bar.owner.textContent !== owner) bar.owner.textContent = owner;
      bar.owner.hidden = !owner;
      bar.el.toggleAttribute('data-name-only', value >= 100);

      if (bar.shown !== value) {
        bar.shown = value;
        bar.fill.style.width = `${value}%`;
        bar.el.dataset.stage = stage.key;
        bar.face.innerHTML = glyph(stage.emoji);
        bar.el.title = `${ANIMALS[entry.task.animalType].label}: ${entry.task.title}. ${stage.label}, ${value}%`;
      }

      // Sit the bar just above the animal's head.
      entry.animal.anchor(anchor);
      anchor.y += 0.22;
      zoo.screenPosition(anchor, screen);

      if (!screen.visible) {
        bar.el.style.display = 'none';
        continue;
      }
      bar.el.style.display = '';

      // Distance scaling: near animals get a full-size bar, far ones shrink
      // and fade so a busy zoo reads as depth rather than a wall of meters.
      const dist = zoo.camera.position.distanceTo(entry.animal.root.position);
      const scale = Math.max(0.55, Math.min(1, 14 / dist));
      bar.el.style.transform =
        `translate(-50%, -100%) translate(${screen.x - rect.left}px, ${screen.y - rect.top}px) scale(${scale.toFixed(2)})`;
      bar.el.style.opacity = String(Math.max(0.45, Math.min(1, scale + 0.15)));
    }

    for (const id of [...bars.keys()]) if (!alive.has(id)) drop(id);
  });

  let sleeping = false;

  return {
    /** Bedtime: every bar shows a drifting "z z z" instead of a face. */
    setSleeping(on) {
      sleeping = on;
      host.toggleAttribute('data-sleeping', on);
    },

    /** Hide while a sheet, dialog or release owns the screen. */
    setSuspended(value) {
      suspended = value;
      host.style.display = value ? 'none' : '';
    },
    dispose() {
      for (const bar of bars.values()) bar.el.remove();
      bars.clear();
      host.remove();
    },
  };
}
