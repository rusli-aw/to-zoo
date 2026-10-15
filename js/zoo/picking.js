/**
 * To-Zoo — making the 3D world clickable, hoverable and keyboard-operable.
 *
 * The pointer half is a raycast. The keyboard half is the interesting one: a
 * real <button> is kept over each animal, invisible until focused. Tab moves
 * through the animals in priority order and announces them properly, which is
 * the only honest way to let someone use a 3D task list without a mouse.
 * Their positions are updated from the same projection the hover card uses,
 * so the focus ring always lands on the animal it names.
 */

import * as THREE from 'three';
import { ANIMALS, dueLabel, urgencyBand } from '../model.js';
import { glyph } from '../ui/icons.js';

/**
 * @param {import('./scene.js').ZooScene} zoo
 * @param {ReturnType<import('./animalTask.js').createPopulation>} population
 * @param {{ onSelect: (taskId: string) => void }} handlers
 */
export function createPicking(zoo, population, handlers) {
  const canvas = zoo.canvas;
  const proxyRoot = document.getElementById('animal-proxies');
  const hoverCard = document.getElementById('hover-card');

  /** @type {Map<string, HTMLButtonElement>} */
  const proxies = new Map();

  let hoveredId = null;
  let suspended = false;
  const screen = { x: 0, y: 0, visible: true };
  const anchor = new THREE.Vector3();

  /* ------------------------------------------------------------- hover --- */

  function setHovered(id) {
    if (id === hoveredId) return;

    const previous = population.get(hoveredId);
    if (previous) previous.animal.setHovered(false);

    hoveredId = id;
    const entry = population.get(id);

    if (!entry) {
      hoverCard.hidden = true;
      canvas.style.cursor = '';
      return;
    }

    entry.animal.setHovered(true);
    canvas.style.cursor = 'pointer';

    const { task } = entry;
    const spec = ANIMALS[task.animalType];
    const band = urgencyBand(task);
    hoverCard.innerHTML = `
      <span class="hover-card__title">${escapeHtml(task.title)}</span>
      <span class="hover-card__meta">
        <span>${glyph(spec.emoji)} ${spec.label}</span>
        <span data-band="${band}">${escapeHtml(dueLabel(task))}</span>
      </span>`;
    hoverCard.hidden = false;
  }

  function onPointerMove(event) {
    if (suspended) return;
    const hit = zoo.raycast(event.clientX, event.clientY, population.pickTargets())[0];
    setHovered(hit?.object?.userData?.taskId ?? null);
  }

  function onPointerLeave() { setHovered(null); }

  function onClick(event) {
    if (suspended) return;
    const hit = zoo.raycast(event.clientX, event.clientY, population.pickTargets())[0];
    const id = hit?.object?.userData?.taskId;
    if (id) handlers.onSelect(id);
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
  canvas.addEventListener('click', onClick);

  /* ----------------------------------------------------------- proxies --- */

  function syncProxies() {
    const wanted = new Set();

    // Biggest first, so tabbing walks the zoo in the same priority order the
    // Tasks view lists it in.
    const sorted = population.all().sort((a, b) => {
      const rank = { elephant: 0, lion: 1, rabbit: 2 };
      const d = rank[a.task.animalType] - rank[b.task.animalType];
      return d !== 0 ? d : a.task.title.localeCompare(b.task.title);
    });

    for (const entry of sorted) {
      const { task, animal } = entry;
      wanted.add(task.id);
      let button = proxies.get(task.id);

      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'animal-proxy';
        button.dataset.taskId = task.id;
        button.addEventListener('click', () => handlers.onSelect(task.id));
        button.addEventListener('focus', () => setHovered(task.id));
        button.addEventListener('blur', () => setHovered(null));
        proxyRoot.appendChild(button);
        proxies.set(task.id, button);
      }

      const spec = ANIMALS[task.animalType];
      const label = `${spec.label}: ${task.title}. ${dueLabel(task)}.`;
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.textContent = label;         // text-indented off screen by CSS
      }
      // Size the hit area to the animal, so the focus ring frames it.
      const size = Math.max(44, animal.radius * 110);
      button.style.width = `${size}px`;
      button.style.height = `${size}px`;
      // Reorder to match priority without destroying focus.
      proxyRoot.appendChild(button);
    }

    for (const [id, button] of proxies) {
      if (wanted.has(id)) continue;
      button.remove();
      proxies.delete(id);
    }
  }

  /* ------------------------------------------------------------- frame --- */

  const canvasRect = { left: 0, top: 0 };

  zoo.onFrame(() => {
    if (proxies.size === 0 && hoverCard.hidden) return;

    const rect = canvas.getBoundingClientRect();
    canvasRect.left = rect.left;
    canvasRect.top = rect.top;

    for (const [id, button] of proxies) {
      const entry = population.get(id);
      if (!entry) continue;
      entry.animal.anchor(anchor);
      // Sit the proxy on the animal's middle rather than its crown.
      anchor.y *= 0.6;
      zoo.screenPosition(anchor, screen);
      button.style.transform =
        `translate(-50%, -50%) translate(${screen.x - rect.left}px, ${screen.y - rect.top}px)`;
      button.style.display = screen.visible ? '' : 'none';
    }

    if (hoveredId && !hoverCard.hidden) {
      const entry = population.get(hoveredId);
      if (entry) {
        entry.animal.anchor(anchor);
        anchor.y += 0.28;
        zoo.screenPosition(anchor, screen);
        hoverCard.style.left = `${screen.x - rect.left}px`;
        hoverCard.style.top = `${screen.y - rect.top}px`;
      }
    }
  });

  return {
    sync: syncProxies,

    /** Silence hover and clicks while a sheet, modal or release owns the screen. */
    setSuspended(value) {
      suspended = value;
      if (value) setHovered(null);
      proxyRoot.style.display = value ? 'none' : '';
    },

    /** Move keyboard focus onto a specific animal. */
    focusAnimal(taskId) {
      proxies.get(taskId)?.focus();
    },

    dispose() {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      for (const button of proxies.values()) button.remove();
      proxies.clear();
    },
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
