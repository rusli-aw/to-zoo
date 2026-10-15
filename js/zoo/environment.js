/**
 * To-Zoo — the world the animals live in.
 *
 * Laid out so the camera reads it as a place with a beyond: the enclosure sits
 * in front of you, the gate is at the back of it, and past the gate the ground
 * keeps going into hills and trees. Releasing an animal therefore means
 * walking it *away* from you into somewhere that is visibly nicer, which is
 * the whole emotional point of the mechanic.
 *
 * Health drives colour and dressing here; the animals handle their own moods.
 */

import * as THREE from 'three';
import { color, mixTokens } from './palette.js';
import { paperTexture } from './inkline.js';
import { blob, box, cone, cyl, mergeGeometries, place, plane, rng } from './geom.js';

/** Shared world layout. Anything that needs to know where the zoo ends asks here. */
export const LAYOUT = {
  minX: -9,
  maxX: 9,
  minZ: -6.2,      // the fence line, where the gate is
  maxZ: 7.4,       // the open front edge, nearest the camera
  gate: { x: 0, z: -6.2, width: 3.6 },
  /** Where a released animal walks to, well past the gate and out of frame. */
  wildTarget: new THREE.Vector3(0, 0, -26),
};

/**
 * A flat ribbon following a curve — the paths and the stream are both this.
 * Built by hand because it needs to lie exactly on the ground and take a
 * width that varies along its length.
 */
function ribbon(curve, width, segments = 48, y = 0.02) {
  const positions = [];
  const uvs = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  const left = [];
  const right = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, up).normalize();
    // Taper the ends so a path fades into the grass instead of stopping dead.
    const w = (typeof width === 'function' ? width(t) : width) *
      (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 3)) ** 0.4);
    left.push(point.clone().addScaledVector(side, -w / 2).setY(y));
    right.push(point.clone().addScaledVector(side, w / 2).setY(y));
  }

  for (let i = 0; i < segments; i += 1) {
    const a = left[i], b = right[i], c = left[i + 1], d = right[i + 1];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    positions.push(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
    const v0 = i / segments, v1 = (i + 1) / segments;
    uvs.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildEnvironment(zoo, space = null) {
  const { ink, scene, quality } = zoo;
  const group = new THREE.Group();
  scene.add(group);

  const paper = paperTexture();

  /* ------------------------------------------------------------ sky ---- */

  // The dome is a painted-realistic sky rather than a gradient: it deepens
  // overhead, hazes at the horizon, glows around a real sun disc and warms on
  // the sun's side at dawn and dusk. Every colour and direction comes from
  // zoo.atmosphere, which zoo/daylight.js writes — this shader only draws it.
  const skyGeo = new THREE.SphereGeometry(110, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // Spread, not copied: these are the same uniform objects daylight writes.
    uniforms: { ...zoo.atmosphere, uTime: zoo.ink.time },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        // The dome follows the camera, so its local position is a view direction.
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunI;
      uniform float uNight;
      uniform float uAmbient;
      uniform float uTime;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(17.1, 9.7);
          a *= 0.5;
        }
        return v;
      }

      // The disc is drawn larger than the real sun's half a degree. At true
      // size it would be a dot you have to hunt for.
      const float SUN_COS = 0.99945;   // cos(1.9 degrees)

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        // Altitude: horizon colour gives way to the zenith quickly, the way
        // scattered light does, so most of the visible sky is properly blue.
        float up = 1.0 - exp(-max(h, 0.0) * 4.5);
        vec3 sky = mix(uHorizon, uZenith, up);

        // A pale haze band sitting on the horizon.
        float haze = exp(-abs(h) * 18.0) * (1.0 - uNight * 0.8);
        sky = mix(sky, uHorizon * 1.04 + 0.01, haze * 0.45);

        // Below the horizon nothing should show, but if it does it is haze.
        if (h < 0.0) sky = mix(uHorizon, uHorizon * 0.9, clamp(-h * 6.0, 0.0, 1.0));

        // The sun: a wide faint halo, a tight glow, and warmth along the
        // horizon on its side when it is low.
        vec3 sunDir = normalize(uSunDir);
        float mu = dot(dir, sunDir);
        float toward = max(mu, 0.0);
        // The last term is a tight bloom hugging the disc, so the disc sits in
        // its own light instead of reading as a pale ring on a pale sky.
        float halo = pow(toward, 6.0) * 0.08 + pow(toward, 90.0) * 0.16 + pow(toward, 3000.0) * 0.6;
        sky += uSunColor * halo * uSunI;

        float low = (1.0 - smoothstep(0.02, 0.2, sunDir.y)) * uSunI;
        float warmBand = pow(toward, 2.5) * exp(-max(h, 0.0) * 6.0);
        sky = mix(sky, uSunColor * vec3(1.0, 0.78, 0.58), low * warmBand * 0.35);

        // The disc, evenly bright with a soft one-pixel edge. Limb darkening
        // was tried and read as a hollow ring at this size.
        float edge = smoothstep(SUN_COS - 0.00007, SUN_COS + 0.00005, mu);
        vec3 disc = mix(vec3(1.0, 0.98, 0.9), uSunColor, 0.3) * 1.3;
        // Only above the horizon; below it the ground and sea take over.
        sky = mix(sky, disc, edge * uSunI * smoothstep(-0.004, 0.006, h));

        // Clouds, painted into the dome: soft fbm projected onto a high flat
        // layer, drifting slowly, thinning to nothing at the horizon so they
        // read as far away. Lit on the sun's side, blue-grey underneath, and
        // dimmed with the rest of the world at night.
        if (h > 0.0) {
          vec2 layer = dir.xz / (h + 0.08) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(layer * 0.55);
          float cover = smoothstep(0.56, 0.8, n) * smoothstep(0.015, 0.14, h);
          float thick = smoothstep(0.55, 0.9, n);
          vec3 lit = mix(vec3(1.0), uSunColor, 0.35) + uSunColor * pow(toward, 8.0) * 0.25;
          vec3 shade = mix(uZenith, uHorizon, 0.55) * 0.92;
          vec3 cloud = mix(lit, shade, thick * 0.55);
          cloud *= mix(0.22, 1.0, clamp(uAmbient / 0.62, 0.0, 1.0));
          sky = mix(sky, cloud, cover * 0.9);
        }

        // Dither, so a gradient this smooth does not band on an 8-bit screen.
        sky += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

        gl_FragColor = vec4(sky, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  /* --------------------------------------------------------- ground ---- */

  // The wild: everything, all the way out. Lush, and never dirtied.
  const wildGeo = plane(240, 240, { rot: [-Math.PI / 2, 0, 0], pos: [0, -0.02, -40] });
  const wildMat = new THREE.MeshLambertMaterial({ color: color('grass-lush').clone() });
  wildMat.map = paper;
  paper.repeat.set(24, 24);
  const wildGround = new THREE.Mesh(wildGeo, wildMat);
  wildGround.receiveShadow = quality.shadows;
  group.add(wildGround);

  // The enclosure floor, gently undulating so it never reads as a sheet of card.
  const zooGeo = plane(
    LAYOUT.maxX - LAYOUT.minX + 2.5,
    LAYOUT.maxZ - LAYOUT.minZ + 2.5,
    { rot: [-Math.PI / 2, 0, 0], pos: [0, 0.01, (LAYOUT.minZ + LAYOUT.maxZ) / 2] },
    18, 14,
  );
  {
    const pos = zooGeo.attributes.position;
    const r = rng(7);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i);
      const edge = Math.min(1, Math.hypot(x / 11, y / 9));
      pos.setZ(i, Math.sin(x * 0.7) * 0.06 + Math.cos(y * 0.55) * 0.05 + (r() - 0.5) * 0.03 - edge * 0.05);
    }
    zooGeo.computeVertexNormals();
  }
  const zooMat = new THREE.MeshLambertMaterial({ color: color('grass').clone(), map: paper });
  const zooGround = new THREE.Mesh(zooGeo, zooMat);
  zooGround.receiveShadow = quality.shadows;
  group.add(zooGround);

  /* ---------------------------------------------------------- paths ---- */

  // One curved path from the open front edge to the gate. Curved, because a
  // straight line through the middle would cut the zoo in half.
  const mainPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.2, 0, 7.2),
    new THREE.Vector3(2.1, 0, 4.2),
    new THREE.Vector3(-0.4, 0, 1.6),
    new THREE.Vector3(0.6, 0, -1.8),
    new THREE.Vector3(0, 0, -4.4),
    new THREE.Vector3(0, 0, LAYOUT.gate.z - 0.4),
  ]);
  const pathMat = new THREE.MeshLambertMaterial({
    color: color('sand').clone(),
    map: paper,
    transparent: true,
    opacity: 0.96,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const pathMesh = new THREE.Mesh(ribbon(mainPath, (t) => 1.5 - t * 0.35, 60, 0.035), pathMat);
  pathMesh.receiveShadow = quality.shadows;
  group.add(pathMesh);

  /* ---------------------------------------------------------- fence ----
     The boundary now lives in zoo/fence.js, which walks the perimeter as a
     closed loop so it cannot end up with the open edge v1 had. */

  /* ----------------------------------------------------------- gate ---- */

  const gate = new THREE.Group();
  gate.position.set(LAYOUT.gate.x, 0, LAYOUT.gate.z);
  group.add(gate);

  const gatePosts = mergeGeometries([
    place(cyl(0.14, 0.16, 2.1, {}, 7), { pos: [-LAYOUT.gate.width / 2, 1.05, 0] }),
    place(cyl(0.14, 0.16, 2.1, {}, 7), { pos: [LAYOUT.gate.width / 2, 1.05, 0] }),
    box(LAYOUT.gate.width + 0.5, 0.22, 0.2, { pos: [0, 2.05, 0] }),
    // A little carved sign over the arch.
    box(1.5, 0.42, 0.1, { pos: [0, 2.42, 0] }),
  ]);
  gate.add(ink.draw(gatePosts, color('bark').clone(), { width: 0.03 }));

  /** Two doors on their own pivots, so `openGate` can swing them outward. */
  const doorGeoFor = (dir) => mergeGeometries([
    box(LAYOUT.gate.width / 2, 0.1, 0.07, { pos: [(dir * LAYOUT.gate.width) / 4, 1.4, 0] }),
    box(LAYOUT.gate.width / 2, 0.1, 0.07, { pos: [(dir * LAYOUT.gate.width) / 4, 0.95, 0] }),
    box(LAYOUT.gate.width / 2, 0.1, 0.07, { pos: [(dir * LAYOUT.gate.width) / 4, 0.5, 0] }),
    box(0.1, 1.35, 0.07, { pos: [(dir * LAYOUT.gate.width) / 2 - dir * 0.06, 0.95, 0] }),
  ]);

  const doorL = new THREE.Group();
  doorL.position.set(-LAYOUT.gate.width / 2, 0, 0);
  doorL.add(ink.draw(doorGeoFor(1), color('bark').clone(), { width: 0.024 }));
  const doorR = new THREE.Group();
  doorR.position.set(LAYOUT.gate.width / 2, 0, 0);
  doorR.add(ink.draw(doorGeoFor(-1), color('bark').clone(), { width: 0.024 }));
  gate.add(doorL, doorR);

  /* ----------------------------------------------------- wild beyond ----
     Hills, background trees, the ocean and the weather all belong to
     zoo/seasons.js. They have to change as a set — bare branches over green
     grass would look broken — so one module owns the lot. */

  /* ------------------------------------------------- ambient dressing ---- */

  // Rocks and bushes that belong to the zoo rather than to any task, so an
  // empty zoo still looks like somewhere rather than a lawn.
  const rockParts = [];
  const bushParts = [];
  /** Footprints handed to the occupancy register so animals walk around them. */
  const obstacles = [];
  const ar = rng(1207);
  for (let i = 0; i < 7; i += 1) {
    const x = LAYOUT.minX + 1 + ar() * (LAYOUT.maxX - LAYOUT.minX - 2);
    const z = LAYOUT.minZ + 1.4 + ar() * (LAYOUT.maxZ - LAYOUT.minZ - 2.6);
    if (Math.hypot(x, z + 1) < 3) continue;   // keep the centre clear for animals
    if (ar() < 0.5) {
      const s = 0.22 + ar() * 0.26;
      rockParts.push(blob(s, [1, 0.7, 0.85], { pos: [x, s * 0.5, z], rot: [0, ar() * 3, 0] }, 6));
      obstacles.push({ x, z, r: s * 1.05 });
    } else {
      const s = 0.34 + ar() * 0.3;
      bushParts.push(blob(s, [1, 0.75, 1], { pos: [x, s * 0.6, z] }, 7));
      bushParts.push(blob(s * 0.7, [1, 0.8, 1], { pos: [x + s * 0.6, s * 0.45, z + s * 0.3] }, 6));
      obstacles.push({ x: x + s * 0.25, z: z + s * 0.15, r: s * 1.15 });
    }
  }
  if (rockParts.length) {
    group.add(ink.draw(mergeGeometries(rockParts), color('sand-deep').clone(), { width: 0.02 }));
  }
  const bushes = bushParts.length
    ? ink.draw(mergeGeometries(bushParts), color('grass-deep').clone(), { width: 0.025, wobble: 0.02 })
    : null;
  if (bushes) group.add(bushes);

  // Scenery is static: it pushes animals out of itself and never moves.
  if (space) {
    obstacles.forEach((o, i) => {
      space.register(`scenery_${i}`, { x: o.x, z: o.z, r: o.r, mobile: false });
    });
    // The gate posts, so nobody stands in the doorway.
    for (const side of [-1, 1]) {
      space.register(`gatepost_${side}`, {
        x: LAYOUT.gate.x + (side * LAYOUT.gate.width) / 2,
        z: LAYOUT.gate.z,
        r: 0.35,
        mobile: false,
      });
    }
  }

  /* ---------------------------------------------------------- state ---- */

  let gateOpen = 0;        // 0 shut, 1 wide
  let gateTarget = 0;
  let messy = 0;           // 0 pristine, 1 as bad as it gets

  // Season sets the base colour; messiness dulls it slightly on top. Keeping
  // them as separate inputs to one function is what stops the two systems
  // overwriting each other every frame.
  const seasonGround = color('grass').clone();
  const seasonWild = color('grass-lush').clone();
  const seasonPath = color('sand').clone();
  const grassColor = new THREE.Color();
  const pathColor = new THREE.Color();

  function applyGround() {
    grassColor.copy(seasonGround).lerp(color('grass-dry'), messy * 0.35);
    zooMat.color.copy(grassColor);
    wildMat.color.copy(seasonWild);
    pathColor.copy(seasonPath).lerp(color('earth'), messy * 0.4);
    pathMat.color.copy(pathColor);
    pathMat.opacity = 0.96 - messy * 0.1;
  }

  zoo.onFrame((dt, elapsed) => {
    // Centred on the camera every frame, so the horizon never slides.
    sky.position.copy(zoo.camera.position);

    const damp = 1 - Math.exp(-3 * dt);
    gateOpen += (gateTarget - gateOpen) * damp;
    const swing = gateOpen * 1.15;
    doorL.rotation.y = -swing;
    doorR.rotation.y = swing;

    // The bushes used to lean on a wind by rotating their merged mesh, which
    // pivots about the world origin and bobbed the outer ones up and down.
    // They stay put; the ink wobble is enough.
  });

  return {
    group,
    gate,
    doors: [doorL, doorR],
    path: mainPath,

    /** @param {number} amount 0..1 */
    openGate(amount) { gateTarget = Math.max(0, Math.min(1, amount)); },
    get gateOpenness() { return gateOpen; },

    /** The wild ground plane, so the season can retint it too. */
    wildGround,

    /**
     * Ground colours, owned by the season.
     * @param {THREE.Color} ground   the enclosure floor
     * @param {THREE.Color} wild     everything beyond the fence
     * @param {THREE.Color} path
     */
    setGround(ground, wild, path) {
      seasonGround.copy(ground);
      seasonWild.copy(wild);
      seasonPath.copy(path);
      applyGround();
    },

    /**
     * A small local dulling around neglected animals. Deliberately weak: the
     * ground is the season's to colour, not the backlog's.
     * @param {number} messiness 0..1
     */
    setMessiness(messiness) {
      messy = Math.max(0, Math.min(1, messiness));
      applyGround();
    },

    get messiness() { return messy; },

    // The sky has no setter: its uniforms are zoo.atmosphere, written by
    // zoo/daylight.js.

    applyTheme() {
      applyGround();
    },
  };
}
