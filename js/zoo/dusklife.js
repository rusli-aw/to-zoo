/**
 * To-Zoo — the painted frame, pollen and fireflies.
 *
 * Set dressing for the dusk look:
 *
 *   - Vines in the top corners, hung on the camera rather than in the world,
 *     so they frame the view like the edge of an illustration whatever the
 *     camera does. One side carries a cluster of pale sage grapes.
 *
 * Both are flat-shaded paper shapes in the palette, and both hold still under
 * reduced motion.
 */

import * as THREE from 'three';
import { reduced } from '../ui/motion.js';

const LEAF_TONES = ['#8fa07c', '#a3b28f', '#7d8f6b', '#99aa86'];
const STEM = '#6f7d55';
const GRAPES = ['#c3cdaa', '#b5c09c', '#cbd3b4'];

/** A pointed ovate leaf, curled a little so it is not a flat card. */
function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.32, 0.12, 0.42, 0.5, 0, 1);
  s.bezierCurveTo(-0.42, 0.5, -0.32, 0.12, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, x * x * 0.9 + y * y * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function buildDuskLife(zoo) {
  const toon = (hex, extra = {}) => new THREE.MeshToonMaterial({
    color: new THREE.Color(hex), side: THREE.DoubleSide, ...extra,
  });

  /* ------------------------------------------------------------ vines --- */

  // The camera has to be in the scene graph for its children to render.
  if (!zoo.camera.parent) zoo.scene.add(zoo.camera);
  const frame = new THREE.Group();
  zoo.camera.add(frame);

  const leaf = leafGeometry();
  const leafMats = LEAF_TONES.map((c) => toon(c));
  const stemMat = toon(STEM);
  const grapeMats = GRAPES.map((c) => toon(c));
  const grape = new THREE.SphereGeometry(1, 16, 12);

  /** @type {{mesh: THREE.Object3D, base: THREE.Euler, phase: number}[]} */
  const swaying = [];

  /**
   * One corner's vine: a curving stem in from the edge with leaves along it.
   * @param {number} side  -1 left, 1 right
   */
  function vine(side, withGrapes) {
    const group = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25 * side, 0.15, 0),
      new THREE.Vector3(-0.15 * side, -0.05, 0.02),
      new THREE.Vector3(-0.45 * side, -0.32, 0.04),
      new THREE.Vector3(-0.62 * side, -0.66, 0.02),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 6), stemMat));

    const leaves = [
      { t: 0.05, s: 0.42, a: 2.4 }, { t: 0.2, s: 0.5, a: 0.4 }, { t: 0.32, s: 0.38, a: 2.9 },
      { t: 0.46, s: 0.46, a: 0.9 }, { t: 0.6, s: 0.34, a: 3.3 }, { t: 0.74, s: 0.4, a: 1.4 },
      { t: 0.9, s: 0.3, a: 2.2 },
    ];
    leaves.forEach((l, i) => {
      const mesh = new THREE.Mesh(leaf, leafMats[i % leafMats.length]);
      mesh.position.copy(curve.getPointAt(l.t));
      mesh.scale.setScalar(l.s);
      const base = new THREE.Euler(0.3, 0.2 * side, side * l.a);
      mesh.rotation.copy(base);
      group.add(mesh);
      swaying.push({ mesh, base, phase: i * 1.7 + side });
    });

    if (withGrapes) {
      // A loose cone of berries hanging from partway along the stem.
      const cluster = new THREE.Group();
      const at = curve.getPointAt(0.42);
      cluster.position.set(at.x, at.y - 0.02, at.z + 0.06);
      let k = 0;
      for (let row = 0; row < 6; row += 1) {
        const n = Math.max(1, 5 - Math.floor(row * 0.8));
        for (let j = 0; j < n; j += 1) {
          const a = (j / n) * Math.PI * 2 + row;
          const rad = (5 - row) * 0.012;
          const berry = new THREE.Mesh(grape, grapeMats[k++ % grapeMats.length]);
          berry.scale.set(0.035, 0.04, 0.035);
          berry.position.set(Math.cos(a) * rad, -row * 0.05, Math.sin(a) * rad);
          cluster.add(berry);
        }
      }
      group.add(cluster);
      swaying.push({ mesh: cluster, base: new THREE.Euler(0, 0, 0), phase: 4.2 });
    }
    return group;
  }

  const left = vine(-1, false);
  const right = vine(1, true);
  frame.add(left, right);

  /** Pin the vines to the frustum's top corners at a fixed depth. */
  const DEPTH = 3;
  function place() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(zoo.camera.fov / 2)) * DEPTH;
    const halfW = halfH * zoo.camera.aspect;
    const scale = Math.min(0.85, halfH * 0.7, halfW * 0.75);
    left.position.set(-halfW - 0.22 * scale, halfH + 0.12 * scale, -DEPTH);   // clear of the status text
    right.position.set(halfW + 0.08, halfH + 0.05, -DEPTH);
    left.scale.setScalar(scale);
    right.scale.setScalar(scale);
  }

  /* ----------------------------------------------------------- pollen --- */

  // Warm specks hanging in the low sun, drifting up and sideways and
  // twinkling — the dust you see in late-afternoon light.
  const MOTES = 90;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i += 1) {
    motePos[i * 3] = (Math.random() - 0.5) * 30;
    motePos[i * 3 + 1] = Math.random() * 6;
    motePos[i * 3 + 2] = -14 + Math.random() * 22;
    moteSeed[i] = Math.random();
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixel;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float t = uTime * (0.15 + aSeed * 0.2);
        p.y = mod(p.y + t * 1.2, 6.0);
        p.x += sin(t * 1.7 + aSeed * 30.0) * 0.8;
        p.z += cos(t * 1.3 + aSeed * 17.0) * 0.6;
        vGlow = (0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 40.0))
              * smoothstep(0.0, 0.8, p.y) * smoothstep(6.0, 5.0, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + aSeed * 3.0) * uPixel * (14.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * vGlow * 0.7;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a);
      }
    `,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.raycast = () => {};
  zoo.scene.add(motes);

  /* -------------------------------------------------------- fireflies --- */

  // After sunset the pollen gives way to a few fireflies low over the
  // meadow: soft green-gold points that drift and pulse, never in unison.
  const FLIES = 36;
  const flyGeo = new THREE.BufferGeometry();
  const flyPos = new Float32Array(FLIES * 3);
  const flySeed = new Float32Array(FLIES);
  for (let i = 0; i < FLIES; i += 1) {
    flyPos[i * 3] = (Math.random() - 0.5) * 22;
    flyPos[i * 3 + 1] = 0.25 + Math.random() * 1.6;
    flyPos[i * 3 + 2] = -9 + Math.random() * 16;
    flySeed[i] = Math.random();
  }
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('aSeed', new THREE.BufferAttribute(flySeed, 1));
  const flyMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uNight: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixel;
      varying float vGlow;
      void main() {
        vec3 p = position;
        float t = uTime * (0.2 + aSeed * 0.25) + aSeed * 50.0;
        p.x += sin(t * 0.9) * 1.2 + sin(t * 2.3) * 0.3;
        p.z += cos(t * 0.7) * 1.0;
        p.y += sin(t * 1.3) * 0.25;
        // A slow pulse with a long dark gap, like the real thing.
        float pulse = pow(max(0.0, sin(uTime * (0.7 + aSeed * 0.6) + aSeed * 30.0)), 3.0);
        vGlow = pulse;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (5.0 + aSeed * 4.0) * uPixel * (12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float a = (core * core * 0.9 + core * 0.25) * vGlow * uNight;
        gl_FragColor = vec4(vec3(0.95, 0.92, 0.55) * a, a);
      }
    `,
  });
  const fireflies = new THREE.Points(flyGeo, flyMat);
  fireflies.frustumCulled = false;
  fireflies.raycast = () => {};
  zoo.scene.add(fireflies);

  /* ------------------------------------------------------------ frame --- */

  let t = 0;
  zoo.onFrame((dt) => {
    place();
    if (!reduced()) t += dt;
    moteMat.uniforms.uTime.value = t;
    moteMat.uniforms.uPixel.value = zoo.renderer.getPixelRatio();
    // Pollen is a daylight thing; it fades out after dusk, and the
    // fireflies come out.
    motes.visible = (zoo.atmosphere.uSunI.value ?? 1) > 0.05;
    const night = zoo.atmosphere.uNight.value;
    flyMat.uniforms.uTime.value = t;
    flyMat.uniforms.uPixel.value = zoo.renderer.getPixelRatio();
    flyMat.uniforms.uNight.value = THREE.MathUtils.smoothstep(night, 0.2, 0.7);
    fireflies.visible = night > 0.2;

    for (const s of swaying) {
      s.mesh.rotation.set(
        s.base.x + Math.sin(t * 0.8 + s.phase) * 0.05,
        s.base.y,
        s.base.z + Math.sin(t * 0.6 + s.phase) * 0.06,
      );
    }

  });

  return { frame };
}
