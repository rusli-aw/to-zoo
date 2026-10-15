/**
 * To-Zoo — the seasons.
 *
 * A season is not a colour filter. Winter takes the leaves off the trees;
 * summer turns the ground to sand and puts an ocean past the fence. So this
 * module owns everything beyond the enclosure — hills, background trees, the
 * outside grass, the sea — and rebuilds the lot when the season changes,
 * because those things have to agree with each other. Bare branches standing
 * in green grass would look broken in a way no amount of tinting could fix.
 *
 * The zoo's own ground and the weather overhead are driven from the same
 * table, so there is exactly one place to look up what autumn means.
 */

import * as THREE from 'three';
import { color } from './palette.js';
import { blob, box, cyl, mergeGeometries, place, rng } from './geom.js';
import { LAYOUT } from './environment.js';
import { reduced } from '../ui/motion.js';

/**
 * Each season is a complete description of the world outside.
 * `cost` of 0 means it is available from the start.
 */
export const SEASONS = {
  island: {
    id: 'island', name: 'Island', emoji: '\u{1F3DD}\u{FE0F}', cost: 0,
    blurb: 'Soft round trees, cedars, gentle hills and a few flowers.',
    tree: 'island',
    ground: 'grass', wild: 'grass-lush', path: 'stone',
    canopy: '#79c05c', canopy2: '#4f9a55', trunk: 'bark',
    hillColor: '#94cf74',
    grassOutside: 1,
    flowers: true,
    weather: null,
  },
  spring: {
    id: 'spring', name: 'Spring', emoji: '\u{1F338}', cost: 120,
    blurb: 'Cherry blossom, and petals on the wind.',
    tree: 'cherry',
    ground: 'grass-lush', wild: 'grass-lush', path: 'sand',
    canopy: '#f2b8cf', trunk: 'bark',
    grassOutside: 1,
    weather: { kind: 'petals', color: '#f7c9dc', count: 90, fall: 0.5, drift: 0.9 },
  },
  summer: {
    id: 'summer', name: 'Summer', emoji: '\u{2600}\u{FE0F}', cost: 0,
    blurb: 'Sand underfoot, coconut palms, and the sea beyond.',
    tree: 'coconut',
    ground: 'sand', wild: 'sand-deep', path: 'sand-deep',
    canopy: '#6f9455', trunk: 'earth',
    grassOutside: 0.35,
    ocean: true,
    // No hills. Tinted sand and lit from above they read as beige domes
    // sitting on a beach, and they crowd the horizon the sea should own.
    hills: false,
    weather: null,
  },
  autumn: {
    id: 'autumn', name: 'Autumn', emoji: '\u{1F342}', cost: 120,
    blurb: 'Rust and orange, and leaves coming down.',
    tree: 'broad',
    ground: 'grass-dry', wild: 'grass-dry', path: 'earth',
    canopy: '#d4823a', trunk: 'earth-deep',
    grassOutside: 0.8,
    weather: { kind: 'leaves', color: '#c96f2e', count: 110, fall: 0.85, drift: 1.5 },
  },
  winter: {
    id: 'winter', name: 'Winter', emoji: '\u{2744}\u{FE0F}', cost: 160,
    blurb: 'Bare branches, and snow over everything.',
    tree: 'bare',
    ground: '#e8eef2', wild: '#dfe7ee', path: '#cfd8e0',
    canopy: null, trunk: '#5a4636',
    grassOutside: 0,
    snow: true,
    weather: { kind: 'snow', color: '#ffffff', count: 200, fall: 0.45, drift: 0.7 },
  },
};

export const SEASON_ORDER = ['island', 'spring', 'summer', 'autumn', 'winter'];

/**
 * The nearest the sea is ever allowed to come, in world z. The enclosure ends
 * at LAYOUT.minZ (-6.2), so there are nearly thirty units of beach between the
 * water and the fence — no wave or lapping edge can reach the garden.
 */
export const SHORE_Z = -35;

/** Palette token or raw hex, whichever the season gave us. */
const tone = (value) => (value.startsWith('#') ? new THREE.Color(value) : color(value).clone());

/* --------------------------------------------------------------- trees --- */

/**
 * One background tree, built in the season's species. Returns pieces grouped
 * by which material they belong to, so a whole forest is still two draw calls.
 */
function tree(kind, x, z, scale, r, out) {
  const h = (1.8 + r() * 2.2) * scale;

  switch (kind) {
    case 'island': {
      // The two island trees: a cedar of three stacked cones, or a hardwood
      // with one fat round canopy on a short trunk.
      if (r() < 0.45) {
        const ch = h * 1.25;
        out.trunks.push(place(cyl(0.12 * scale, 0.16 * scale, ch * 0.3, {}, 6), {
          pos: [x, ch * 0.15, z],
        }));
        for (let i = 0; i < 3; i += 1) {
          const rad = (1.15 - i * 0.3) * scale;
          out.canopy2.push(place(new THREE.ConeGeometry(rad, ch * 0.42, 16), {
            pos: [x, ch * (0.36 + i * 0.22), z],
          }));
        }
      } else {
        out.trunks.push(place(cyl(0.14 * scale, 0.2 * scale, h * 0.55, {}, 6), {
          pos: [x, h * 0.275, z],
        }));
        out.canopy.push(blob(1.05 * scale, [1, 0.92, 1], { pos: [x, h * 0.55 + 0.8 * scale, z] }, 10));
        out.canopy.push(blob(0.55 * scale, [1, 0.9, 1], {
          pos: [x + 0.6 * scale, h * 0.55 + 0.5 * scale, z + 0.3 * scale],
        }, 8));
      }
      break;
    }

    case 'coconut': {
      // A palm: a trunk that leans and curves, with fronds radiating from the
      // very top and drooping at the ends.
      const lean = (r() - 0.5) * 0.5;
      const segments = 5;
      for (let i = 0; i < segments; i += 1) {
        const t = i / segments;
        out.trunks.push(place(cyl(0.13 * scale, 0.19 * scale, (h / segments) * 1.1, {}, 6), {
          pos: [x + lean * t * t * 1.6, h * t + h / segments / 2, z + lean * t * 0.4],
          rot: [0, 0, -lean * 0.35],
        }));
      }
      const topX = x + lean * 1.6;
      const fronds = 7;
      for (let i = 0; i < fronds; i += 1) {
        const a = (i / fronds) * Math.PI * 2 + r();
        out.canopy.push(blob(0.9 * scale, [1, 0.1, 0.34], {
          pos: [topX + Math.cos(a) * 0.72 * scale, h - 0.1 * scale, z + Math.sin(a) * 0.72 * scale],
          rot: [0, -a, -0.42],
        }, 6));
      }
      out.canopy.push(blob(0.22 * scale, [1, 0.9, 1], { pos: [topX, h - 0.16 * scale, z] }, 6));
      break;
    }

    case 'cherry': {
      out.trunks.push(place(cyl(0.11 * scale, 0.2 * scale, h * 0.62, {}, 6), {
        pos: [x, h * 0.31, z],
      }));
      // Two low branches, so the blossom sits on a shape rather than a pole.
      for (const side of [-1, 1]) {
        out.trunks.push(place(cyl(0.06 * scale, 0.1 * scale, h * 0.5, {}, 5), {
          pos: [x + side * 0.32 * scale, h * 0.6, z],
          rot: [0, 0, -side * 0.5],
        }));
      }
      // Blossom: a cloud of small puffs rather than one dome.
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        const rad = i === 0 ? 0.86 : 0.5 + r() * 0.28;
        out.canopy.push(blob(rad * scale, [1, 0.78, 1], {
          pos: [
            x + (i === 0 ? 0 : Math.cos(a) * 0.72 * scale),
            h * 0.86 + (i === 0 ? 0 : Math.sin(a * 1.3) * 0.24 * scale),
            z + (i === 0 ? 0 : Math.sin(a) * 0.72 * scale),
          ],
        }, 7));
      }
      break;
    }

    case 'bare': {
      // Winter: trunk plus a spray of branches, and nothing else. The gaps in
      // the silhouette are the point.
      out.trunks.push(place(cyl(0.1 * scale, 0.22 * scale, h, {}, 6), { pos: [x, h / 2, z] }));
      const limbs = 5 + Math.floor(r() * 3);
      for (let i = 0; i < limbs; i += 1) {
        const a = (i / limbs) * Math.PI * 2 + r() * 0.6;
        const up = 0.55 + r() * 0.35;
        const len = (0.7 + r() * 0.7) * scale;
        out.trunks.push(place(cyl(0.028 * scale, 0.07 * scale, len, {}, 4), {
          pos: [x + Math.cos(a) * len * 0.3, h * up + len * 0.35, z + Math.sin(a) * len * 0.3],
          rot: [Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85],
        }));
        // A second, thinner fork off each limb.
        out.trunks.push(place(cyl(0.016 * scale, 0.03 * scale, len * 0.6, {}, 4), {
          pos: [x + Math.cos(a) * len * 0.72, h * up + len * 0.75, z + Math.sin(a) * len * 0.72],
          rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1],
        }));
      }
      break;
    }

    default: {
      // Broad canopy — autumn's shape, and the safe fallback.
      out.trunks.push(place(cyl(0.13 * scale, 0.22 * scale, h, {}, 6), { pos: [x, h / 2, z] }));
      out.canopy.push(blob(1.15 * scale, [1, 0.62, 1], { pos: [x, h + 0.4 * scale, z] }, 8));
      out.canopy.push(blob(0.78 * scale, [1, 0.7, 1], {
        pos: [x + 0.42 * scale, h + 0.75 * scale, z - 0.2 * scale],
      }, 7));
      out.canopy.push(blob(0.66 * scale, [1, 0.7, 1], {
        pos: [x - 0.46 * scale, h + 0.62 * scale, z + 0.24 * scale],
      }, 7));
    }
  }
}

/* ------------------------------------------------------------- weather --- */

/**
 * Petals, leaves or snow. One instanced mesh that falls, drifts and wraps —
 * the same trick the release leaf-burst uses, but looping forever.
 */
function createWeather(zoo, spec) {
  const geometry = spec.kind === 'snow'
    ? blob(0.05, [1, 1, 1], {}, 5)
    : blob(0.075, [1, 0.28, 0.62], {}, 5);

  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(spec.color),
    transparent: true,
    opacity: spec.kind === 'snow' ? 0.95 : 0.9,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, spec.count);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  zoo.scene.add(mesh);

  const dummy = new THREE.Object3D();
  const r = rng(3141);
  const flakes = Array.from({ length: spec.count }, () => ({
    x: (r() - 0.5) * 46,
    y: r() * 16,
    z: -18 + r() * 34,
    spin: (r() - 0.5) * 3,
    phase: r() * Math.PI * 2,
    speed: 0.6 + r() * 0.8,
    size: 0.7 + r() * 0.7,
  }));

  const stop = zoo.onFrame((dt, elapsed) => {
    // Reduced motion keeps the weather on screen but stops it moving, so the
    // season still reads without anything drifting in the corner of your eye.
    const step = reduced() ? 0 : dt;
    for (let i = 0; i < spec.count; i += 1) {
      const f = flakes[i];
      f.y -= spec.fall * f.speed * step;
      if (f.y < -0.5) {
        f.y = 15 + Math.random() * 3;
        f.x = (Math.random() - 0.5) * 46;
        f.z = -18 + Math.random() * 34;
      }
      // Leaves and petals swing as they fall; snow just wanders.
      const swing = Math.sin(elapsed * f.speed + f.phase) * spec.drift;
      dummy.position.set(f.x + swing, f.y, f.z + Math.cos(elapsed * 0.6 + f.phase) * spec.drift * 0.5);
      dummy.rotation.set(elapsed * f.spin * 0.5, elapsed * f.spin, f.phase);
      dummy.scale.setScalar(f.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return {
    dispose() {
      stop();
      zoo.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/**
 * Move a tree out of any hill it would be standing inside.
 *
 * A tree planted inside a hill's footprint sinks into it and reads as one
 * lumpy shape. Rather than skipping the tree — which would change how many
 * random numbers get drawn and reshuffle everything after it — push it out
 * radially to just clear the hill, never toward the enclosure.
 */
function clearOfHills(x, z, scale, hills) {
  const canopy = 2.2 * scale;
  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false;
    for (const hill of hills) {
      const need = hill.r + canopy;
      let dx = x - hill.x;
      let dz = z - hill.z;
      const d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-3) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
      x = hill.x + dx * need;
      z = hill.z + dz * need;
      // Pushed toward the fence? Put it behind the hill instead.
      if (Math.abs(x) < LAYOUT.maxX + 3 && z > LAYOUT.minZ - 4) {
        x = hill.x + (x - hill.x) * 0.3;
        z = hill.z - need;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

/* ----------------------------------------------------------------- sea --- */

/**
 * The summer sea.
 *
 * One shader rather than a lit plane, because what makes water read as water
 * is almost none of what a Lambert material does: colour that deepens away
 * from the shore, the sky reflected more strongly at grazing angles, a
 * glittering path under the sun, and foam where it meets the sand. The sky's
 * colours and the sun's direction come from zoo.atmosphere, so the sea always
 * agrees with the sky above it — glitter sits under the visible sun disc, and
 * at night it becomes a dim moon path.
 *
 * Waves roll toward the camera and die away to nothing at the shoreline, so the
 * surface can never climb the beach toward the fence.
 *
 * @returns {() => void} unsubscribe, for teardown
 */
function buildSea(zoo, world, sand) {
  const DEPTH = 150;            // how far out it goes; the far edge hazes into the sky
  const WIDTH = 380;
  const DRY = 1.9;              // how far up the beach the lapping edge can reach

  const geometry = new THREE.PlaneGeometry(WIDTH, DEPTH + DRY, 120, 60);
  geometry.rotateX(-Math.PI / 2);
  // Plane is centred on the origin; slide it so its near edge is DRY units up
  // the beach from the shore and it runs DEPTH units out to sea.
  geometry.translate(0, 0.03, SHORE_Z + DRY - (DEPTH + DRY) / 2);

  const uniforms = {
    ...zoo.atmosphere,
    uTime: zoo.ink.time,
    uShoreZ: { value: SHORE_Z },
    uShallow: { value: color('sea-shallow').clone() },
    uMid: { value: color('sea').clone() },
    uDeep: { value: color('sea-deep').clone() },
    uFoam: { value: color('foam').clone() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: false,                 // it hazes into the horizon itself
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uShoreZ;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vOut;
      varying float vCrest;

      // One travelling sine and its slope. d points the way the crest moves;
      // every wave here has d.y > 0, which is toward the camera.
      float wave(vec2 p, vec2 d, float amp, float len, float speed, inout vec2 slope) {
        float k = 6.2831853 / len;
        float phase = k * dot(d, p) - speed * k * uTime;
        slope += d * (amp * k * cos(phase));
        return amp * sin(phase);
      }

      void main() {
        vec3 p = position;
        float outToSea = uShoreZ - p.z;
        // Nothing moves at the waterline; the swell builds over the first
        // fifteen units out.
        float calm = smoothstep(0.0, 15.0, outToSea);

        vec2 slope = vec2(0.0);
        float h = 0.0;
        h += wave(p.xz, normalize(vec2(0.12, 1.0)), 0.07, 9.0, 1.6, slope);
        h += wave(p.xz, normalize(vec2(-0.35, 1.0)), 0.04, 5.3, 1.25, slope);
        h += wave(p.xz, normalize(vec2(0.6, 1.0)), 0.022, 2.9, 0.95, slope);
        h *= calm;
        slope *= calm;

        p.y += h;
        vCrest = h;
        vOut = outToSea;
        vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uMoonDir;
      uniform float uSunI;
      uniform float uAmbient;
      uniform float uNight;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uMid;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vOut;
      varying float vCrest;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 q = vWorld.xz;
        vec3 toEye = cameraPosition - vWorld;
        float dist = length(toEye);
        vec3 V = toEye / dist;

        // Fine ripples on top of the swell, faded out with distance so the far
        // sea does not shimmer into noise.
        float detail = 1.0 - smoothstep(18.0, 80.0, dist);
        vec3 N = vNormal;
        N.x += (sin(q.x * 1.7 + uTime * 1.3) + sin((q.x * 0.9 + q.y * 1.3) * 2.1 - uTime * 1.7)) * 0.035 * detail;
        N.z += (cos(q.y * 1.9 - uTime * 1.1) + cos((q.x * 1.4 - q.y * 0.7) * 1.8 + uTime * 1.4)) * 0.035 * detail;
        N = normalize(N);

        // The lapping edge: the waterline slides up and down the sand, ragged.
        float edgeNoise = noise(q * vec2(0.3, 1.1) + vec2(0.0, uTime * 0.25)) - 0.5;
        float lap = sin(uTime * 0.8) * 0.9 + sin(uTime * 1.37 + 1.3) * 0.4;
        float wet = vOut + lap + edgeNoise * 0.8;
        if (wet < 0.0) discard;

        // Colour by depth: turquoise over the sand, blue further out.
        vec3 water = mix(uShallow, uMid, smoothstep(0.0, 12.0, vOut));
        water = mix(water, uDeep, smoothstep(12.0, 80.0, vOut));
        water *= clamp(uAmbient * 1.35 + 0.08, 0.1, 1.05);

        // The sky, reflected — strongly at a grazing angle, faintly underfoot.
        vec3 R = reflect(-V, N);
        float up = 1.0 - exp(-max(R.y, 0.0) * 4.5);
        vec3 skyRef = mix(uHorizon, uZenith, up);
        float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // Capped well short of a mirror: from this low a camera, full Fresnel
        // turns the whole sea into a copy of the pale horizon.
        vec3 col = mix(water, skyRef, clamp(fresnel * 0.75, 0.0, 0.55));

        // Glitter under the sun: a sharp highlight broken into sparkles, over
        // a broad soft sheen. At night the same thing, dimmer, under the moon.
        float sparkle = smoothstep(0.62, 0.9, noise(q * 2.6 + vec2(uTime * 0.8, -uTime * 1.3)));
        float sunSpec = pow(max(dot(R, normalize(uSunDir)), 0.0), 420.0);
        float sheen = pow(max(dot(R, normalize(uSunDir)), 0.0), 28.0);
        col += uSunColor * (sunSpec * (0.6 + sparkle * 5.0) + sheen * 0.14) * uSunI;
        float moonSpec = pow(max(dot(R, normalize(uMoonDir)), 0.0), 260.0);
        col += vec3(0.78, 0.85, 1.0) * moonSpec * (0.3 + sparkle * 2.5) * uNight;

        // Foam: where the water meets the sand, lines rolling in toward the
        // shore, and a little on the highest crests.
        float shoreFoam = 1.0 - smoothstep(0.0, 1.4 + edgeNoise, wet);
        float lines = smoothstep(0.8, 1.0, sin(vOut * 1.15 + uTime * 1.15 + edgeNoise * 4.0))
                    * (1.0 - smoothstep(1.5, 10.0, vOut));
        float caps = smoothstep(0.085, 0.13, vCrest) * detail * 0.45;
        float foam = clamp(shoreFoam + lines * 0.55 + caps, 0.0, 1.0);
        foam *= smoothstep(0.15, 0.55, noise(q * 1.7 - vec2(0.0, uTime * 0.4)) + 0.3);
        col = mix(col, uFoam * clamp(uAmbient * 1.5, 0.18, 1.0), foam * 0.85);

        // Into the horizon: the far edge becomes sky before it can be seen.
        col = mix(col, uHorizon, smoothstep(75.0, 200.0, dist));

        // A soft waterline rather than a cut.
        float alpha = smoothstep(0.0, 0.45, wet);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const sea = new THREE.Mesh(geometry, material);
  sea.frustumCulled = false;
  sea.raycast = () => {};
  sea.renderOrder = 1;
  world.add(sea);

  // Wet sand: darker toward the water, matching the dry beach at its far side
  // so there is no visible seam.
  const beach = new THREE.PlaneGeometry(WIDTH, 9, 1, 6);
  beach.rotateX(-Math.PI / 2);
  beach.translate(0, 0.005, SHORE_Z + 2.5);
  const tints = [];
  const bp = beach.attributes.position;
  for (let i = 0; i < bp.count; i += 1) {
    const out = SHORE_Z - bp.getZ(i);                       // + is toward the sea
    const t = THREE.MathUtils.smoothstep(out, -7, 1.5);     // 0 dry, 1 soaked
    const k = 1 - t * 0.34;
    tints.push(sand.r * k, sand.g * k, sand.b * k * 0.97);
  }
  beach.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  const beachMesh = new THREE.Mesh(beach, new THREE.MeshLambertMaterial({ vertexColors: true }));
  beachMesh.receiveShadow = zoo.quality.shadows;
  beachMesh.raycast = () => {};
  world.add(beachMesh);

  // Nothing to animate per frame on the CPU: the waves, lapping and foam all
  // run on zoo.ink.time. Return a no-op so the caller's bookkeeping is uniform.
  return () => {};
}

/* ------------------------------------------------------------ flowers --- */

const FLOWER_TOKENS = ['flower-pink', 'flower-yellow', 'flower-lilac', 'flower-peach', 'cloth'];

/**
 * Little five-petal flowers, scattered thick outside the fence and in a thin
 * border just inside it. One instanced mesh with per-instance colour, so a
 * meadow is a single draw call.
 */
function flowerField(zoo, r) {
  const petals = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    petals.push(blob(0.05, [1, 0.45, 1], { pos: [Math.cos(a) * 0.05, 0.075, Math.sin(a) * 0.05], rot: [0, -a, 0.35] }, 5));
  }
  petals.push(blob(0.032, [1, 0.7, 1], { pos: [0, 0.09, 0] }, 5));
  const geometry = mergeGeometries(petals);

  const material = new THREE.MeshToonMaterial({ color: 0xffffff });
  const count = zoo.quality.grass > 1000 ? 170 : 90;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i += 1) {
    const border = r() < 0.18;
    let x;
    let z;
    if (border) {
      // A strip just inside the fence, where animals rarely stand.
      const side = Math.floor(r() * 3);
      const t = r();
      if (side === 0) { x = LAYOUT.minX + 0.35 + r() * 0.5; z = LAYOUT.minZ + t * (LAYOUT.maxZ - LAYOUT.minZ); }
      else if (side === 1) { x = LAYOUT.maxX - 0.35 - r() * 0.5; z = LAYOUT.minZ + t * (LAYOUT.maxZ - LAYOUT.minZ); }
      else { x = LAYOUT.minX + t * (LAYOUT.maxX - LAYOUT.minX); z = LAYOUT.minZ + 0.35 + r() * 0.5; }
      if (Math.abs(x - LAYOUT.gate.x) < LAYOUT.gate.width && z < LAYOUT.minZ + 1) continue;
    } else {
      x = (r() - 0.5) * 70;
      z = -40 + r() * 52;
      const inside = x > LAYOUT.minX - 0.6 && x < LAYOUT.maxX + 0.6
        && z > LAYOUT.minZ - 0.6 && z < LAYOUT.maxZ + 0.6;
      if (inside) continue;
      // Keep the walk out through the gate clear.
      if (Math.abs(x) < 2.4 && z < LAYOUT.minZ) continue;
    }
    // Flowers grow in little clumps of one colour.
    const clump = 1 + Math.floor(r() * 3);
    const col = color(FLOWER_TOKENS[Math.floor(r() * FLOWER_TOKENS.length)]);
    for (let k = 0; k < clump && placed < count; k += 1) {
      dummy.position.set(x + (r() - 0.5) * 0.5, 0, z + (r() - 0.5) * 0.5);
      dummy.rotation.set(0, r() * Math.PI * 2, 0);
      dummy.scale.setScalar(1.1 + r() * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      mesh.setColorAt(placed, tint.copy(col));
      placed += 1;
    }
  }
  mesh.count = placed;
  return mesh;
}

/* --------------------------------------------------------------- build --- */

/**
 * @param {import('./scene.js').ZooScene} zoo
 * @param {ReturnType<import('./environment.js').buildEnvironment>} environment
 */
export function buildSeasons(zoo, environment) {
  const group = new THREE.Group();
  zoo.scene.add(group);

  let current = null;
  let built = null;
  let weather = null;
  /** Unsubscribers for this build's frame callbacks. teardown() used to leave
   *  them running on disposed meshes, one more set per season change. */
  let frameStops = [];

  function teardown() {
    for (const stop of frameStops) stop();
    frameStops = [];
    if (built) {
      group.remove(built);
      built.traverse((o) => {
        const mesh = /** @type {any} */ (o);
        mesh.geometry?.dispose?.();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      });
      built = null;
    }
    weather?.dispose();
    weather = null;
  }

  function build(id) {
    const season = SEASONS[id] ?? SEASONS.island;
    teardown();

    const world = new THREE.Group();
    const r = rng(4801);
    const parts = { trunks: [], canopy: [], canopy2: [] };

    /* ---- hills ---- */
    // A flat horizon is the right horizon for a coast, so seasons can decline
    // them. Keep the rng call count identical either way, or every tree and
    // tuft downstream would shift when the setting changes.
    const hills = [];
    /** Footprints on the ground, so trees can be kept out of them. */
    const hillSpots = [];
    for (let i = 0; i < 9; i += 1) {
      const x = (r() - 0.5) * 96;
      const z = -22 - r() * 60;
      const s = 3.5 + r() * 8;
      hills.push(blob(s, [1, 0.34 + r() * 0.2, 1], { pos: [x, -0.3, z] }, 9));
      hillSpots.push({ x, z, r: s });
    }
    const hasHills = season.hills !== false;
    if (!hasHills) {
      for (const h of hills) h.dispose();
    } else {
      world.add(zoo.ink.draw(mergeGeometries(hills), tone(season.hillColor ?? season.wild), {
        width: 0.09, wobble: 0.02, shadow: false,
      }));
    }

    /* ---- trees ---- */
    const count = zoo.quality.grass > 1000 ? 26 : 14;
    const treeSpots = [];
    for (let i = 0; i < count; i += 1) {
      const side = r() < 0.5 ? -1 : 1;
      let x = side * (7 + r() * 38);
      // On a coast the trees stop a few units short of the water instead of
      // standing in it. Same single r() call either way.
      const reach = season.ocean ? -(SHORE_Z + 3) - 10 : 46;
      let z = -10 - r() * reach;
      const scale = 0.8 + r() * 0.9;
      if (hasHills) [x, z] = clearOfHills(x, z, scale, hillSpots);
      tree(season.tree, x, z, scale, r, parts);
      treeSpots.push({ x, z, scale });
    }
    world.userData.treeSpots = treeSpots;
    world.userData.hillSpots = hasHills ? hillSpots : [];
    world.add(zoo.ink.draw(mergeGeometries(parts.trunks), tone(season.trunk), {
      width: 0.035, shadow: false,
    }));
    let canopyDraw = null;
    if (season.canopy && parts.canopy.length) {
      canopyDraw = zoo.ink.draw(mergeGeometries(parts.canopy), new THREE.Color(season.canopy), {
        width: 0.05, wobble: 0.028, shadow: false,
      });
      world.add(canopyDraw);
    }
    if (season.canopy2 && parts.canopy2.length) {
      world.add(zoo.ink.draw(mergeGeometries(parts.canopy2), new THREE.Color(season.canopy2), {
        width: 0.05, shadow: false,
      }));
    }

    /* ---- flowers ---- */
    if (season.flowers) world.add(flowerField(zoo, rng(2207)));

    /* ---- grass outside the fence ---- */
    // The wild used to be a bare plane, which read as a backdrop rather than a
    // place. This is the same short tuft as inside, scattered thinly over a
    // much larger area, skipping the enclosure itself.
    if (season.grassOutside > 0) {
      const blades = Math.round(1400 * season.grassOutside * (zoo.quality.grass > 1000 ? 1 : 0.5));
      const tuft = new THREE.BufferGeometry();
      const pos = [];
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const h = 0.13 * (0.7 + r() * 0.5);
        pos.push(-0.02, 0, 0, 0.02, 0, 0, Math.cos(a) * h * 0.35, h, Math.sin(a) * h * 0.35);
      }
      tuft.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      tuft.computeVertexNormals();

      const outsideMat = new THREE.MeshLambertMaterial({
        color: tone(season.wild).multiplyScalar(1.05),
        side: THREE.DoubleSide,
      });
      const field = new THREE.InstancedMesh(tuft, outsideMat, blades);
      field.frustumCulled = false;
      field.raycast = () => {};
      const dummy = new THREE.Object3D();
      let placed = 0;
      for (let i = 0; i < blades * 2 && placed < blades; i += 1) {
        const x = (r() - 0.5) * 110;
        const z = -70 + r() * 88;
        // Skip the enclosure — it has its own grass.
        const inside = x > LAYOUT.minX - 1 && x < LAYOUT.maxX + 1
          && z > LAYOUT.minZ - 1 && z < LAYOUT.maxZ + 2;
        if (inside) continue;
        if (season.ocean && z < SHORE_Z + 1) continue;   // nothing grows in the sea
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, r() * Math.PI * 2, 0);
        dummy.scale.setScalar(1 + r() * 1.6);
        dummy.updateMatrix();
        field.setMatrixAt(placed, dummy.matrix);
        placed += 1;
      }
      field.count = placed;
      world.add(field);
    }

    /* ---- the sea ---- */
    if (season.ocean) {
      frameStops.push(buildSea(zoo, world, tone(season.wild)));
      /** Asserted in the tests: the water never enters the enclosure. */
      world.userData.shoreZ = SHORE_Z;
    }

    /* ---- snow on the ground beyond ---- */
    if (season.snow) {
      const drifts = [];
      for (let i = 0; i < 22; i += 1) {
        const x = (r() - 0.5) * 90;
        const z = -14 - r() * 54;
        drifts.push(blob(1.4 + r() * 2.6, [1, 0.16, 1], { pos: [x, -0.1, z] }, 7));
      }
      world.add(zoo.ink.draw(mergeGeometries(drifts), new THREE.Color('#eef3f7'), {
        width: 0.05, wobble: 0.01, shadow: false,
      }));
    }

    group.add(world);
    built = world;

    /* ---- the enclosure itself, and the weather ---- */
    environment.setGround(tone(season.ground), tone(season.wild), tone(season.path));
    if (season.weather) weather = createWeather(zoo, season.weather);

    // No sway on the canopies. They are one merged mesh, so rotating it
    // pivoted every tree about the world origin: a tree forty units out rose
    // and fell by more than a unit and slid off its own trunk. The ink wobble
    // already keeps them alive.

    current = season.id;
  }

  build('island');

  return {
    group,
    get season() { return current; },

    setSeason(id) {
      if (id === current || !SEASONS[id]) return;
      build(id);
    },

    applyTheme() { if (current) build(current); },

    dispose() { teardown(); },
  };
}
