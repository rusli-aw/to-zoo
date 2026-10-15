/**
 * To-Zoo — the hand-drawn ink system.
 *
 * Every solid thing in the zoo is a low-poly mesh wearing a second, slightly
 * larger copy of itself rendered inside-out in ink. That inverted hull is the
 * outline. WebGL caps `lineWidth` at 1px on essentially every desktop driver,
 * so drawing real strokes with LineSegments would give a thin, sickly edge —
 * the hull gives a fat, confident one instead, and it scales with the object,
 * which means a big animal is drawn with a bigger pen.
 *
 * (Cozy restyle: bodies are soft-toon shaded with smooth normals and the pen
 * is thin, warm brown and still. The machinery is unchanged.)
 *
 * The dancing comes from a shared vertex displacement: two sine terms at
 * unrelated frequencies, offset per vertex by a random seed baked into the
 * geometry. Body and outline run the *same* wobble so the silhouette moves as
 * one drawing rather than the ink sliding off the animal.
 *
 * Under reduced motion the time input freezes but the seed offset stays, so
 * the lines keep their imperfect hand-drawn character and simply stop moving.
 */

import * as THREE from 'three';
import { color } from './palette.js';

/* The displacement, shared verbatim by both materials. `wobbleAt` returns a
   scalar in roughly [-1, 1] that both the body and the hull push along the
   normal by — different amounts, same shape. */
const WOBBLE_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uWobble;
  uniform float uEnergy;
  attribute float aSeed;

  float inkWobble(float seed) {
    float p = seed * 6.2831853;
    return sin(uTime * 1.7 + p) * 0.62 + sin(uTime * 3.1 + p * 2.3) * 0.38;
  }
`;

let seedCounter = 0;

/**
 * Bake a stable per-vertex random into a geometry. Idempotent, and safe to
 * call on a geometry shared between the body and its hull — they must have
 * the same seeds or the two drawings would disagree.
 */
export function addSeeds(geometry) {
  if (geometry.getAttribute('aSeed')) return geometry;
  const count = geometry.attributes.position.count;
  const seeds = new Float32Array(count);
  // Deterministic: the same geometry always gets the same imperfections,
  // so a reload does not redraw every animal slightly differently.
  let s = (seedCounter += 1) * 9301;
  for (let i = 0; i < count; i += 1) {
    s = (s * 9301 + 49297) % 233280;
    seeds[i] = s / 233280;
  }
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

let ramp = null;
/**
 * The light ramp every body shares. Linear-filtered and shallow — the shade
 * side never drops much below three-quarters bright — so shapes read as soft
 * plush under a hazy afternoon sun rather than hard-lit plastic.
 */
function toonRamp() {
  if (ramp) return ramp;
  // Light from the sunset: the shade band leans mauve, the lit band peach.
  // (The shader is patched below to read all three channels, not just red.)
  const v = [[176, 156, 186], [208, 192, 204], [240, 226, 220], [255, 244, 228]];
  const steps = new Uint8Array(v.flatMap(([r, g, b]) => [r, g, b, 255]));
  ramp = new THREE.DataTexture(steps, v.length, 1, THREE.RGBAFormat);
  ramp.minFilter = THREE.LinearFilter;
  ramp.magFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

export class Ink {
  /**
   * @param {object} [opts]
   * @param {number} [opts.wobble]  world-units of body wander
   */
  constructor(opts = {}) {
    /** Shared by every ink material; advanced once per frame. */
    this.time = { value: 0 };
    // No wander at all. Any wobble opens hairline cracks between triangles
    // (each vertex has its own seed) and the ink hull shows through them as
    // scribbles — right for a sketchbook, wrong for crisp toy plastic.
    this.baseWobble = opts.wobble ?? 0;
    /** Every pen is scaled by this — thin, even lines, like a cel cartoon. */
    this.penScale = opts.penScale ?? 0.5;
    /** The cozy look has no ink lines at all: shapes are defined by soft
     *  shading alone. The hull is still built (callers hold references to
     *  it) but never added to the scene, so it costs no draw calls. */
    this.outlines = opts.outlines ?? false;
    /** @type {{material: THREE.Material, uniforms: any}[]} */
    this.registry = [];
    this.reduced = false;
  }

  /** Freeze or resume the dance without rebuilding any material. */
  setReducedMotion(reduced) {
    this.reduced = reduced;
  }

  advance(elapsed) {
    // Freezing time rather than amplitude keeps the static jitter that makes
    // the lines look drawn instead of extruded.
    if (!this.reduced) this.time.value = elapsed;
  }

  /**
   * A soft toon body: smooth round shapes, gentle shading from a shallow
   * ramp, the cozy Animal Crossing look. Smooth normals by default so a
   * sphere reads as a ball, not a gem.
   *
   * @param {THREE.Color | string | number} col
   * @param {object} [opts]
   * @param {number} [opts.wobble]
   * @param {boolean} [opts.flat]
   */
  bodyMaterial(col, opts = {}) {
    const material = new THREE.MeshToonMaterial({
      color: col instanceof THREE.Color ? col : new THREE.Color(col),
      gradientMap: toonRamp(),
    });
    material.flatShading = opts.flat ?? false;

    const uniforms = {
      uTime: this.time,
      uWobble: { value: opts.wobble ?? this.baseWobble },
      uEnergy: { value: 1 },
      uWind: { value: opts.wind ?? 0 },
      uWindBase: { value: opts.windBase ?? 0.4 },
    };
    const windy = (opts.wind ?? 0) > 0;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <gradientmap_pars_fragment>',
        THREE.ShaderChunk.gradientmap_pars_fragment.replace(
          'return vec3( texture2D( gradientMap, coord ).r );',
          'return texture2D( gradientMap, coord ).rgb;',
        ),
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WOBBLE_GLSL}\nuniform float uWind;\nuniform float uWindBase;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed += normalize(objectNormal) * inkWobble(aSeed) * uWobble * uEnergy;
           ${windy ? `
           // Wind: a slow gust plus a quicker flutter, phased by position so
           // neighbouring trees never move in lockstep, and growing with
           // height so roots stay planted while crowns sway.
           {
             vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
             float lift = max(position.y - uWindBase, 0.0);
             float bend = pow(lift, 1.25);
             float gust = sin(uTime * 0.9 + wp.x * 0.21 + wp.z * 0.13) * 0.5
                        + sin(uTime * 2.3 + wp.x * 0.7 + wp.z * 0.5) * 0.2
                        // the meadow wave (grass.js), so everything leans together
                        + smoothstep(-0.3, 1.0, sin(uTime * 0.55 - wp.x * 0.32 - wp.z * 0.12)) * 0.6;
             transformed.x += gust * uWind * bend;
             transformed.z += cos(uTime * 0.7 + wp.z * 0.19) * uWind * 0.45 * bend;
           }` : ''}`,
        );
    };
    // Materials with different shader source must not share a program.
    material.customProgramCacheKey = () => (windy ? 'toZooInkBodyWind' : 'toZooInkBody');

    material.userData.ink = uniforms;
    this.registry.push({ material, uniforms });
    return material;
  }

  /**
   * The outline: same geometry, same wobble, pushed further out along the
   * normal and rendered back-faces-only so it appears only where it pokes
   * past the body.
   *
   * @param {object} [opts]
   * @param {number} [opts.width]   world units of pen thickness
   * @param {THREE.Color} [opts.color]
   */
  outlineMaterial(opts = {}) {
    const uniforms = {
      uTime: this.time,
      uWobble: { value: Math.min(opts.wobble ?? this.baseWobble, this.baseWobble) },
      uEnergy: { value: 1 },
      uWidth: { value: (opts.width ?? 0.035) * this.penScale },
      uColor: { value: opts.color ?? color('outline') },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      // The hull sits behind the body everywhere except at the silhouette,
      // so it must still write depth or overlapping animals lose their edges.
      depthWrite: true,
      vertexShader: /* glsl */ `
        ${WOBBLE_GLSL}
        uniform float uWidth;
        void main() {
          vec3 n = normalize(normal);
          float w = inkWobble(aSeed);
          vec3 displaced = position + n * (uWidth + w * uWobble * uEnergy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });

    material.userData.ink = uniforms;
    this.registry.push({ material, uniforms });
    return material;
  }

  /**
   * Draw a shape: body plus its outline, returned as one group you can move,
   * scale and add to the scene as a unit.
   *
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Color | string | number} col
   * @param {object} [opts]
   * @param {number} [opts.width]    pen thickness
   * @param {number} [opts.wobble]   wander amplitude
   * @param {boolean} [opts.shadow]
   * @returns {THREE.Group & {body: THREE.Mesh, outline: THREE.Mesh}}
   */
  draw(geometry, col, opts = {}) {
    addSeeds(geometry);

    const body = new THREE.Mesh(geometry, this.bodyMaterial(col, {
      ...opts,
      wobble: Math.min(opts.wobble ?? this.baseWobble, this.baseWobble),
    }));
    const outline = new THREE.Mesh(geometry, this.outlineMaterial(opts));
    outline.renderOrder = -1;

    if (opts.shadow !== false) {
      body.castShadow = true;
      body.receiveShadow = true;
    }

    const group = /** @type {any} */ (new THREE.Group());
    if (this.outlines) group.add(outline, body);
    else group.add(body);
    group.body = body;
    group.outline = outline;
    return group;
  }

  /**
   * Retune every ink material on a subtree — used when a task's urgency
   * changes and its animal should start drawing itself more agitatedly.
   */
  setEnergy(object3d, energy) {
    object3d.traverse((child) => {
      const mat = /** @type {any} */ (child).material;
      if (mat?.userData?.ink) mat.userData.ink.uEnergy.value = energy;
    });
  }

  dispose() {
    for (const { material } of this.registry) material.dispose();
    this.registry.length = 0;
  }
}

/**
 * A sheet of hand-made paper, generated rather than loaded so the app ships
 * with no image assets. Used to keep large flat areas (the ground) from
 * reading as vector-flat.
 *
 * @returns {THREE.CanvasTexture}
 */
export function paperTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Speckle, then a few long fibres, then a very soft blotch pass.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 236 + Math.random() * 19;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#7a6a52';
  for (let i = 0; i < 40; i += 1) {
    ctx.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
    ctx.lineWidth = Math.random() * 1.2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
