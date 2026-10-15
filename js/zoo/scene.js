/**
 * To-Zoo — the scene shell.
 *
 * Owns the renderer, the camera rig, the lights and the frame loop, and
 * nothing about tasks. Subsystems (environment, grass, animals, clutter,
 * decorations) register an update function and are otherwise independent,
 * which keeps this file readable as the world grows.
 *
 * The camera is the product decision that matters most here: low, looking
 * across the zoo rather than down at it, so the animals stand between you and
 * the horizon and the whole thing reads as a place rather than a board.
 */

import * as THREE from 'three';
import { color, refresh as refreshPalette } from './palette.js';
import { Ink } from './inkline.js';
import { createGlass } from './glass.js';

/** Rough device tiers. Cheaper than benchmarking and stable across frames. */
export function qualityTier() {
  const w = window.innerWidth;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (w < 768 || cores <= 4) return 'low';
  if (w < 1200) return 'mid';
  return 'high';
}

const TIERS = {
  low:  { dpr: 1.5, shadows: false, grass: 600,  clutter: 0.5, segments: 1 },
  mid:  { dpr: 1.75, shadows: true, grass: 1500, clutter: 0.8, segments: 1 },
  high: { dpr: 2,   shadows: true,  grass: 2800, clutter: 1,   segments: 2 },
};

export class ZooScene {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.tier = qualityTier();
    this.quality = TIERS[this.tier];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.tier !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    /** Retro renders at a fixed low resolution and lets CSS upscale it
     *  with hard pixel edges; smooth renders at the device's resolution. */
    this.retro = false;
    this.renderer.setPixelRatio(this.#pixelRatio(window.innerWidth, window.innerHeight));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (this.quality.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.scene = new THREE.Scene();
    this.scene.background = color('sky-low').clone();
    // Aerial haze rather than a whiteout: far enough out that hills and sea keep
    // their colour, and the same colour as the horizon so the join is invisible.
    this.scene.fog = new THREE.Fog(color('sky-low').clone(), 34, 150);

    // Far enough to see the sea all the way out to where it meets the sky.
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 260);

    /* The resting shot, and where a focused animal pulls it. Both are lerped
       toward every frame rather than set, so a focus change never snaps. */
    this.camBase = new THREE.Vector3(0, 3.8, 13);
    this.lookBase = new THREE.Vector3(0, 1.4, -2);
    this.camFocus = this.camBase.clone();
    this.lookFocus = this.lookBase.clone();
    this.focusAmount = 0;
    this.focusTarget = 0;

    this.camera.position.copy(this.camBase);
    this._look = this.lookBase.clone();

    this.pointer = new THREE.Vector2(0, 0);
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.parallax = 1;

    /** Set once zoo/daylight.js takes over sky, fog and lights. */
    this.ownsLighting = false;

    /**
     * One description of the sky, shared by every shader that needs it — the
     * sky dome, the sea, anything reflective. Daylight writes it; nobody else
     * does. Created here rather than in daylight so the seasons, which are
     * built first, can hold references to the same uniform objects.
     */
    this.atmosphere = {
      uZenith: { value: new THREE.Color('#8cc4e8') },
      uHorizon: { value: new THREE.Color('#e6f2ee') },
      uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
      uSunColor: { value: new THREE.Color('#fff6e2') },
      uSunI: { value: 1 },        // 0 below the horizon, 1 at full day
      uAmbient: { value: 0.62 },  // the hemisphere fraction, i.e. how lit things are
      uNight: { value: 0 },       // 0 day, 1 deep night
      uMoonDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    };

    this.ink = new Ink();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.running = false;
    this.reduced = false;

    /** @type {((dt: number, elapsed: number) => void)[]} */
    this.updaters = [];

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();

    /** Liquid-glass compositing for the HUD; null falls back to CSS frost. */
    this.glass = null;
    try {
      this.glass = createGlass(this);
      document.documentElement.classList.add('glass-on');
    } catch (err) {
      console.warn('[to-zoo] liquid glass unavailable, using CSS frost', err);
    }

    this.#buildLights();
    this.#bindEvents();
    this.resize();
  }

  /* --------------------------------------------------------------- setup -- */

  #buildLights() {
    // Intensities are fractions of full light × π — see LIGHT_SCALE in
    // zoo/daylight.js, which takes these over once it exists.
    // Sky/ground bounce does most of the work — it is what makes the stylised
    // shading feel like daylight rather than a spotlight in a void.
    this.hemi = new THREE.HemisphereLight(color('sky-high').clone(), color('grass-deep').clone(), 0.62 * Math.PI);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 0.5 * Math.PI);
    this.sun.position.set(7, 13, 8);
    if (this.quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -16; c.right = 16; c.top = 16; c.bottom = -12;
      c.near = 1; c.far = 46;
      this.sun.shadow.bias = -0.0016;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // A cool fill from the opposite side so shadowed flanks keep their shape.
    this.fill = new THREE.DirectionalLight(color('sky-high').clone(), 0.14 * Math.PI);
    this.fill.position.set(-9, 6, -4);
    this.scene.add(this.fill);
  }

  #bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });

    // The scene is built while .app is still hidden behind the loader, so the
    // stage measures zero. A resize event alone would never correct that —
    // watch the element instead and pick up the real size the moment it has one.
    if ('ResizeObserver' in window) {
      this._observer = new ResizeObserver(() => this.resize());
      if (this.canvas.parentElement) this._observer.observe(this.canvas.parentElement);
    }

    this._onPointerMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointerTarget.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        ((e.clientY - r.top) / r.height) * 2 - 1,
      );
    };
    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });

    // A pointer that has left the canvas should not keep the camera leaning.
    this._onPointerLeave = () => this.pointerTarget.set(0, 0);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
  }

  /* ------------------------------------------------------------- controls -- */

  /** @param {(dt: number, elapsed: number) => void} fn */
  onFrame(fn) {
    this.updaters.push(fn);
    return () => {
      const i = this.updaters.indexOf(fn);
      if (i >= 0) this.updaters.splice(i, 1);
    };
  }

  /**
   * Switch between chunky pixels and full resolution.
   * @param {boolean} retro
   */
  setRetro(retro) {
    this.retro = retro;
    this.canvas.style.imageRendering = retro ? 'pixelated' : '';
    this.resize();
  }

  /**
   * Retro aims for about 380 lines tall, whatever the screen, so the pixels
   * are the same chunky size on a phone and a monitor. It never drops below
   * 240 columns, which is where a portrait phone would turn to mush.
   */
  #pixelRatio(w, h) {
    if (!this.retro) return Math.min(window.devicePixelRatio || 1, this.quality.dpr);
    return Math.min(1, Math.max(380 / h, 240 / w));
  }

  setReducedMotion(reduced) {
    this.reduced = reduced;
    this.ink.setReducedMotion(reduced);
    this.parallax = reduced ? 0 : 1;
    if (reduced) this.pointerTarget.set(0, 0);
  }

  /**
   * Pull the camera in on a point in the world — used when a task opens, so
   * the animal you are reading about is the one you are looking at.
   *
   * @param {THREE.Vector3 | null} point  null returns to the resting shot
   */
  focusOn(point) {
    if (!point) {
      this.focusTarget = 0;
      return;
    }
    // Sit down and to the side of the subject rather than dead in front, and
    // stay low: the animal should still be standing in its zoo, not on a plinth.
    this.camFocus.set(point.x * 0.55 + 1.6, point.y + 3.1, point.z + 8.2);
    this.lookFocus.set(point.x, point.y + 0.35, point.z);
    this.focusTarget = 1;
  }

  /** Screen position of a world point, in CSS pixels relative to the canvas. */
  screenPosition(worldPoint, out = { x: 0, y: 0, visible: true }) {
    this._tmp.copy(worldPoint).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    out.x = r.left + ((this._tmp.x + 1) / 2) * r.width;
    out.y = r.top + ((1 - this._tmp.y) / 2) * r.height;
    out.visible = this._tmp.z < 1;
    return out;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Object3D[]} objects
   */
  raycast(clientX, clientY, objects) {
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._ndc, this.camera);
    return this._raycaster.intersectObjects(objects, true);
  }

  /* --------------------------------------------------------------- theme -- */

  /**
   * After <html data-theme> changes: re-read tokens and retint the fixed bits.
   *
   * Sky, fog and every light belong to zoo/daylight.js, which sets them from
   * the real time of day. When it is running this must not touch them, or the
   * two would fight over the same properties every frame and the zoo would
   * flicker between dusk and noon.
   */
  applyTheme() {
    refreshPalette();
    this.glass?.applyTheme();
    if (this.ownsLighting) return;
    this.scene.background = color('sky-low').clone();
    if (this.scene.fog) this.scene.fog.color.copy(color('sky-low'));
    this.hemi.color.copy(color('sky-high'));
    this.hemi.groundColor.copy(color('grass-deep'));
    this.fill.color.copy(color('sky-high'));
    const dusk = document.documentElement.dataset.theme === 'dark';
    this.sun.intensity = (dusk ? 0 : 0.5) * Math.PI;
    this.hemi.intensity = (dusk ? 0.36 : 0.62) * Math.PI;
  }

  /* ---------------------------------------------------------------- loop -- */

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.camera.aspect = w / h;

    // The shot leaves the top third of the frame for sky and sea, so the sun
    // has somewhere to be. These were solved numerically, not eyeballed: the
    // horizon sits ~32% down, the back fence ~55%, and an elephant is the same
    // height on screen as it was under the old, steeper camera.
    // Portrait backs off and widens so the animals stay in frame.
    const portrait = h > w;
    this.camera.fov = portrait ? 48 : 42;
    this.camBase.set(0, portrait ? 5 : 3.8, portrait ? 16.5 : 13);
    this.lookBase.set(0, portrait ? 1.8 : 1.4, -2);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.#pixelRatio(w, h));
    this.renderer.setSize(w, h, false);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      this._frame = requestAnimationFrame(tick);
      this.#render();
    };
    this._frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this._frame) cancelAnimationFrame(this._frame);
  }

  #render() {
    // Clamped so a backgrounded tab does not resume with a huge step and
    // teleport every animal across the enclosure.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;

    this.ink.advance(this.elapsed);

    // Frame-rate independent damping.
    const damp = (k) => 1 - Math.exp(-k * dt);

    this.pointer.lerp(this.pointerTarget, damp(4));
    this.focusAmount += (this.focusTarget - this.focusAmount) * damp(3.4);

    this._desired.copy(this.camBase).lerp(this.camFocus, this.focusAmount);
    this._desiredLook.copy(this.lookBase).lerp(this.lookFocus, this.focusAmount);

    if (this.parallax > 0) {
      // Slow idle breathing, plus a lean toward the pointer. Both are small:
      // the world should feel handheld, not motion-sick.
      const drift = Math.sin(this.elapsed * 0.16) * 0.5;
      const bob = Math.sin(this.elapsed * 0.23 + 1.1) * 0.16;
      this._desired.x += (drift + this.pointer.x * 1.35) * this.parallax;
      this._desired.y += (bob - this.pointer.y * 0.55) * this.parallax;
    }

    this.camera.position.lerp(this._desired, damp(3.6));
    this._look.lerp(this._desiredLook, damp(4.2));
    this.camera.lookAt(this._look);

    for (const fn of this.updaters) fn(dt, this.elapsed);

    if (this.glass) this.glass.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    this._observer?.disconnect();
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.ink.dispose();
    this.glass?.dispose();
    this.scene.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      mesh.geometry?.dispose?.();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    this.renderer.dispose();
  }
}
