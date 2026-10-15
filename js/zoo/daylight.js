/**
 * To-Zoo — the sun.
 *
 * The zoo runs on your real local clock. Open it at seven in the morning and
 * the light comes in low and orange from the east; open it at midnight and the
 * enclosure is dark under stars. That is a deliberate product choice rather
 * than a graphics one: this is a tool you use across a working day, and having
 * the world agree with the window behind you is most of what makes it feel
 * like a place rather than a screen.
 *
 * Everything about the look of a moment comes from one number — `elevation`,
 * how high the sun is, from -1 to 1. Sky, sun colour, fog, shadow length,
 * ambient bounce and the star field are all functions of it, so they cannot
 * drift out of agreement with each other.
 */

import * as THREE from 'three';
import { color } from './palette.js';

/** Sunrise and sunset, in local hours. Kept simple and readable on purpose. */
const SUNRISE = 6;
const SUNSET = 18.5;

/** Where the pinned modes park the sun. */
const PINNED = { day: 13, night: 23 };

export const localHours = (now = Date.now()) => {
  const d = new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
};

/**
 * Is it night right now?
 *
 * Exported as a plain function because main.js has to resolve the interface
 * theme during boot, before the scene — and therefore the daylight — exists.
 */
export const clockIsNight = () => false;   // there is no night any more

/**
 * The vendored three.js (r169) uses physically correct lights: a Lambert
 * surface returns albedo × irradiance / π. The intensities below are written
 * as a fraction of full light instead — 1.0 on a face turned to the light
 * gives back its true colour — and scaled by π once, here.
 *
 * The keys used to hold raw intensities tuned for the old legacy lights,
 * which left every surface at about a third of its colour and the whole zoo
 * looking overcast.
 */
const LIGHT_SCALE = Math.PI;

/**
 * Keyframes down the day. Each is a complete description of a moment, and the
 * renderer only ever lerps between two neighbours — so adding a new time of
 * day is a matter of writing one more of these.
 *
 * Most of the light is the hemisphere bounce rather than the sun. Shadowed
 * flanks are what read as gloom, and the bounce is the only thing that
 * reaches them.
 */
/*
 * Two sets of keyframes, because morning and evening share a sun height but
 * not a mood: the day drifts from cream at dawn, to apricot at midday, to
 * lilac in the evening and indigo at night. Each set is lerped by elevation
 * as before; the two are then blended by the clock (AM before late morning,
 * PM after early afternoon). Noon and night are identical in both sets, so
 * the blend has no seam at midday or midnight.
 */
const NIGHT = {
  at: -1.0, name: 'night',
  sky: ['#141a3a', '#2c2c58'], sun: '#2a3450', sunI: 0.0,
  hemiSky: '#5a62a0', hemiGround: '#3a3a58', hemiI: 0.36,
  fill: '#2b3450', fillI: 0.0, stars: 1,
  moon: '#c4d6f4', moonI: 0.24,
};
const NOON = {
  at: 1.0, name: 'noon',
  sky: ['#a9c6c4', '#f3c9a0'], sun: '#ffe2c0', sunI: 0.44,
  hemiSky: '#f2dccb', hemiGround: '#9a8f86', hemiI: 0.72,
  fill: '#e8d6dc', fillI: 0.12, stars: 0,
  moon: '#c4d6f4', moonI: 0,
};

const KEYS_AM = [
  NIGHT,
  {
    at: -0.06, name: 'twilight',
    sky: ['#4e5a8a', '#c7a2b4'], sun: '#c08a98', sunI: 0.05,
    hemiSky: '#8a8ab0', hemiGround: '#5a5068', hemiI: 0.42,
    fill: '#8a8ab0', fillI: 0.06, stars: 0.5,
    moon: '#c4d6f4', moonI: 0.1,
  },
  {
    at: 0.06, name: 'golden',
    sky: ['#b8ccd0', '#f6dcc0'], sun: '#ffd8b0', sunI: 0.34,
    hemiSky: '#f0e2d6', hemiGround: '#9a8e88', hemiI: 0.6,
    fill: '#dcd6e0', fillI: 0.1, stars: 0.08,
    moon: '#c4d6f4', moonI: 0.02,
  },
  {
    at: 0.32, name: 'morning',
    // Cream: the softest light of the day.
    sky: ['#c3d6d2', '#f7ead4'], sun: '#fff0d8', sunI: 0.42,
    hemiSky: '#f6ecdf', hemiGround: '#a09a8c', hemiI: 0.72,
    fill: '#e6e0e4', fillI: 0.12, stars: 0,
    moon: '#c4d6f4', moonI: 0,
  },
  NOON,
];

const KEYS_PM = [
  NIGHT,
  {
    at: -0.06, name: 'twilight',
    // Indigo coming down over a last lilac rim.
    sky: ['#3c4278', '#a682a8'], sun: '#a86a90', sunI: 0.05,
    hemiSky: '#7470a8', hemiGround: '#4e4462', hemiI: 0.4,
    fill: '#7a74b0', fillI: 0.06, stars: 0.6,
    moon: '#c4d6f4', moonI: 0.12,
  },
  {
    at: 0.06, name: 'golden',
    // Lilac overhead, apricot fire at the horizon.
    sky: ['#a99cc4', '#f2a07a'], sun: '#ffb080', sunI: 0.4,
    hemiSky: '#e6c6cc', hemiGround: '#8e7a86', hemiI: 0.58,
    fill: '#c8b4d8', fillI: 0.12, stars: 0.1,
    moon: '#c4d6f4', moonI: 0.02,
  },
  {
    at: 0.32, name: 'afternoon',
    sky: ['#a9c0c4', '#f2bf98'], sun: '#ffd8b4', sunI: 0.44,
    hemiSky: '#f0d6c8', hemiGround: '#968a86', hemiI: 0.7,
    fill: '#e2d0da', fillI: 0.12, stars: 0,
    moon: '#c4d6f4', moonI: 0,
  },
  NOON,
];

const _c2 = new THREE.Color();

function lerpKeys(elevation, KEYS) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (elevation >= KEYS[i].at && elevation <= KEYS[i + 1].at) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (elevation <= KEYS[0].at) { a = KEYS[0]; b = KEYS[0]; }
  if (elevation >= KEYS[KEYS.length - 1].at) {
    a = KEYS[KEYS.length - 1];
    b = a;
  }
  const span = b.at - a.at;
  const t = span <= 0 ? 0 : (elevation - a.at) / span;
  return { a, b, t };
}

const mix = (ca, cb, t, out) => out.set(ca).lerp(_c2.set(cb), t);
const num = (na, nb, t) => na + (nb - na) * t;

/**
 * One moment of light: the AM and PM sets sampled at this elevation and
 * blended by the clock. Returns a key-shaped object with hex strings, so the
 * rest of apply() reads exactly as it did with a single set.
 */
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function sampleKeys(elevation, hours) {
  const pm = THREE.MathUtils.smoothstep(hours, 11, 15) * (hours < 3 ? 0 : 1);
  const one = (set) => {
    const { a, b, t } = lerpKeys(elevation, set);
    const c = (ka, kb) => '#' + _ca.set(ka).lerp(_cb.set(kb), t).getHexString();
    return {
      name: b.name,
      sky: [c(a.sky[0], b.sky[0]), c(a.sky[1], b.sky[1])],
      sun: c(a.sun, b.sun), hemiSky: c(a.hemiSky, b.hemiSky), hemiGround: c(a.hemiGround, b.hemiGround),
      fill: c(a.fill, b.fill),
      sunI: num(a.sunI, b.sunI, t), hemiI: num(a.hemiI, b.hemiI, t), fillI: num(a.fillI, b.fillI, t),
      stars: num(a.stars, b.stars, t), moonI: num(a.moonI ?? 0, b.moonI ?? 0, t),
    };
  };
  const am = one(KEYS_AM);
  const p = one(KEYS_PM);
  const c = (x, y) => '#' + _ca.set(x).lerp(_cb.set(y), pm).getHexString();
  return {
    at: elevation,
    name: pm > 0.5 ? p.name : am.name,
    sky: [c(am.sky[0], p.sky[0]), c(am.sky[1], p.sky[1])],
    sun: c(am.sun, p.sun), hemiSky: c(am.hemiSky, p.hemiSky), hemiGround: c(am.hemiGround, p.hemiGround),
    fill: c(am.fill, p.fill),
    sunI: num(am.sunI, p.sunI, pm), hemiI: num(am.hemiI, p.hemiI, pm), fillI: num(am.fillI, p.fillI, pm),
    stars: num(am.stars, p.stars, pm), moonI: num(am.moonI, p.moonI, pm),
  };
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 * @param {ReturnType<import('./environment.js').buildEnvironment>} environment
 */
export function createDaylight(zoo, environment) {
  /* ------------------------------------------------------------ stars --- */

  const STAR_COUNT = 420;
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    // Upper hemisphere only — stars below the horizon are just wasted draw.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.92 + 0.04);
    const r = 96;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r * 0.9 + 6;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    sizes[i] = 0.5 + Math.random() ** 3 * 2.2;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying float vTwinkle;
      uniform float uTime;
      void main() {
        // Each star twinkles on its own clock, seeded by its position.
        float seed = position.x * 0.13 + position.z * 0.07;
        vTwinkle = 0.7 + 0.3 * sin(uTime * 1.6 + seed);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        // Round, soft-edged points rather than squares.
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float alpha = smoothstep(0.5, 0.06, r) * uOpacity * vTwinkle;
        gl_FragColor = vec4(1.0, 0.98, 0.92, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  stars.visible = false;
  zoo.scene.add(stars);

  /* ------------------------------------------------------------ moon --- */

  // A real light, not just a disc in the sky. Cool, soft, and deliberately
  // shadowless: moonlight this dim would not throw a shadow you could read,
  // and the user asked for none after dark.
  const moonLight = new THREE.DirectionalLight(0xb9cdf0, 0);
  moonLight.castShadow = false;
  zoo.scene.add(moonLight);
  zoo.scene.add(moonLight.target);
  zoo.moon = moonLight;

  // The moon itself: a plain lit disc that rides opposite the sun.
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xf4f0e2, transparent: true, opacity: 0, fog: false }),
  );
  moon.renderOrder = -9;
  moon.frustumCulled = false;
  zoo.scene.add(moon);

  /* ------------------------------------------------------------ state --- */

  const skyTop = new THREE.Color();
  const skyBottom = new THREE.Color();
  const sunColor = new THREE.Color();
  const hemiSky = new THREE.Color();
  const hemiGround = new THREE.Color();
  const fillColor = new THREE.Color();

  /** Set to a number of hours to freeze the clock, for testing. */
  let override = null;
  /** auto follows the clock; day and night pin it. */
  let mode = 'auto';
  let current = { elevation: 1, phase: 'noon', night: 0 };
  const listeners = new Set();

  /**
   * No night in this zoo. The real clock still drives the light, but it is
   * folded into daylight: the small hours read as early morning, and the
   * evening stops at a lilac golden hour rather than going dark.
   */
  const DAY_START = 7.5;
  const DAY_END = 17.6;
  function toDaylight(h) {
    if (h >= DAY_START && h <= DAY_END) return h;
    // Night maps back onto morning light, so it is never dark.
    return h > DAY_END ? DAY_END : DAY_START + (h / DAY_START) * 0.5;
  }
  function hoursNow(now = Date.now()) {
    if (mode === 'day') return PINNED.day;
    if (override !== null) return toDaylight(override);
    return toDaylight(localHours(now));
  }

  /**
   * Where the sun is, as a single number.
   * 1 is overhead, 0 is on the horizon, negative is below it.
   */
  function elevationAt(hours) {
    const dayLength = SUNSET - SUNRISE;
    const t = (hours - SUNRISE) / dayLength;      // 0..1 across daylight
    if (t >= 0 && t <= 1) return Math.sin(t * Math.PI);

    // Night: how deep into it, mapped to 0..-1 and back.
    const nightLength = 24 - dayLength;
    const nt = t < 0
      ? (hours + 24 - SUNSET) / nightLength
      : (hours - SUNSET) / nightLength;
    return -Math.sin(Math.max(0, Math.min(1, nt)) * Math.PI);
  }

  /**
   * The band of sky the resting camera can see, in radians: how high a disc
   * can sit and still clear the top bar, and how far left and right it can go.
   * Worked out from the camera rather than hard-coded, because portrait and
   * landscape frame the sky very differently.
   */
  function visibleArc() {
    const cam = zoo.camera;
    const pitch = Math.atan2(zoo.camBase.y - zoo.lookBase.y, zoo.camBase.z - zoo.lookBase.z);
    const halfV = THREE.MathUtils.degToRad(cam.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * cam.aspect);
    // The top of the frame is halfV - pitch above the horizon; keep a third
    // of the half-height clear for the top bar.
    const maxAlt = Math.max(THREE.MathUtils.degToRad(2), halfV - pitch - halfV * 0.34);
    return { maxAlt, maxYaw: halfH * 0.75 };
  }

  /** Yaw 0 is straight ahead (world -z), positive to the right (+x). */
  function toDirection(yaw, alt, out) {
    return out.set(Math.sin(yaw) * Math.cos(alt), Math.sin(alt), -Math.cos(yaw) * Math.cos(alt));
  }

  function apply(hours) {
    const elevation = elevationAt(hours);
    // Already blended; a and b are the same key, so t is irrelevant.
    const a = sampleKeys(elevation, hours);
    const b = a;
    const t = 0;

    mix(a.sky[0], b.sky[0], t, skyTop);
    mix(a.sky[1], b.sky[1], t, skyBottom);
    mix(a.sun, b.sun, t, sunColor);
    mix(a.hemiSky, b.hemiSky, t, hemiSky);
    mix(a.hemiGround, b.hemiGround, t, hemiGround);
    mix(a.fill, b.fill, t, fillColor);

    const sunI = num(a.sunI, b.sunI, t);
    const hemiI = num(a.hemiI, b.hemiI, t);
    const fillI = num(a.fillI, b.fillI, t);
    const starOpacity = num(a.stars, b.stars, t);
    const moonI = num(a.moonI ?? 0, b.moonI ?? 0, t);

    // Position: the light tracks from the left of the frame (-x) at sunrise
    // to the right at sunset, always from the camera's side of the zoo.
    const dayT = Math.max(0, Math.min(1, (hours - SUNRISE) / (SUNSET - SUNRISE)));
    const azimuth = Math.PI * (1 - dayT);
    const height = Math.max(0.08, elevation);
    zoo.sun.position.set(
      Math.cos(azimuth) * 16,
      height * 15 + 1,
      Math.sin(azimuth) * 9 + 3,
    );
    zoo.sun.color.copy(sunColor);
    zoo.sun.intensity = sunI * LIGHT_SCALE;
    zoo.sun.visible = sunI > 0.004;

    // No shadows after dark. The sun is what casts them, and once it is this
    // low there is nothing left to cast — leaving them on would only give
    // every animal a long smeared shadow from a light that is not there.
    zoo.sun.castShadow = zoo.quality.shadows && sunI > 0.09;

    zoo.hemi.color.copy(hemiSky);
    zoo.hemi.groundColor.copy(hemiGround);
    zoo.hemi.intensity = hemiI * LIGHT_SCALE;

    zoo.fill.color.copy(fillColor);
    zoo.fill.intensity = fillI * LIGHT_SCALE;

    zoo.scene.background = skyBottom.clone();
    if (zoo.scene.fog) zoo.scene.fog.color.copy(skyBottom);

    // The sun and moon you can see. Where they are drawn is a framing
    // decision, not astronomy: a real midday sun is overhead and out of shot.
    // So both ride an arc across the sky the camera actually shows, left to
    // right through the day — the same side the light comes from, so shading
    // and disc agree — while the light itself stays in front of the animals
    // so their faces are lit.
    const arc = visibleArc();
    const sunAlt = elevation > 0
      ? arc.maxAlt * Math.pow(elevation, 0.8)
      : elevation * 0.12;
    const sunYaw = (dayT * 2 - 1) * arc.maxYaw;
    toDirection(sunYaw, sunAlt, zoo.atmosphere.uSunDir.value);

    const nightLength = 24 - (SUNSET - SUNRISE);
    const nightT = (((hours - SUNSET) % 24) + 24) % 24 / nightLength;
    const moonYaw = (Math.min(1, nightT) * 2 - 1) * arc.maxYaw;
    const moonAlt = arc.maxAlt * 0.9 * Math.sin(Math.min(1, nightT) * Math.PI);
    toDirection(moonYaw, moonAlt, zoo.atmosphere.uMoonDir.value);

    const atmo = zoo.atmosphere;
    atmo.uZenith.value.copy(skyTop);
    atmo.uHorizon.value.copy(skyBottom);
    atmo.uSunColor.value.copy(sunColor);
    atmo.uSunI.value = Math.max(0, Math.min(1, (elevation + 0.05) / 0.15));
    atmo.uAmbient.value = hemiI;
    atmo.uNight.value = starOpacity;

    // The moon lights the animals from its side of the sky, from the front.
    moonLight.position.set(Math.sin(moonYaw) * 14, 12, 7);
    moonLight.intensity = moonI * LIGHT_SCALE;
    moonLight.visible = moonI > 0.004;

    // Stars and the moon disc ride together.
    starMat.uniforms.uOpacity.value = starOpacity;
    stars.visible = starOpacity > 0.01;
    moon.material.opacity = starOpacity * 0.95;
    moon.visible = starOpacity > 0.01;
    if (moon.visible) {
      moon.position.copy(zoo.camBase).addScaledVector(atmo.uMoonDir.value, 95);
      moon.lookAt(zoo.camBase);
    }

    current = {
      elevation,
      hours,
      mode,
      phase: starOpacity > 0.5 ? 'night' : b.name,
      night: starOpacity,
    };
    return current;
  }

  apply(hoursNow());

  // Re-evaluate once a minute; nothing here changes fast enough to need more,
  // and the twinkle runs on its own uniform every frame.
  let sinceCheck = 0;
  let framing = '';
  zoo.onFrame((dt, elapsed) => {
    starMat.uniforms.uTime.value = elapsed;
    const nextFraming = `${zoo.camera.fov}:${zoo.camera.aspect.toFixed(3)}`;
    if (nextFraming !== framing) {
      framing = nextFraming;
      apply(hoursNow());
    }
    sinceCheck += dt;
    if (sinceCheck < 20) return;
    sinceCheck = 0;

    // Notifying happens here and nowhere else. apply() used to announce the
    // crossing itself, but its listener repaints the interface, which
    // re-resolves the preference and calls setMode() straight back — so an
    // explicit switch to Day was immediately undone by its own side effect.
    // Only the clock can cross on its own, so only the clock announces it.
    const wasNight = current.night > 0.5;
    apply(hoursNow());
    if (wasNight !== (current.night > 0.5)) {
      for (const fn of listeners) fn(current);
    }
  });

  return {
    get state() { return current; },
    get isNight() { return current.night > 0.5; },

    get mode() { return mode; },

    /**
     * @param {'auto' | 'day' | 'night'} next
     * auto follows the real clock; the other two pin the sun where the user
     * asked for it, so "Night" genuinely means night rather than a repaint.
     */
    setMode(next) {
      mode = next;
      return apply(hoursNow());
    },

    /** Called when day flips to night or back. */
    onNightChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Force a time of day. Pass null to go back to the real clock. */
    setOverride(hours) {
      override = hours;
      return apply(hoursNow());
    },

    refresh() { return apply(hoursNow()); },
  };
}
