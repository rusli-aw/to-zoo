/**
 * To-Zoo — liquid glass.
 *
 * The HUD floats over the zoo as panes of liquid glass: the live world shows
 * through them, frosted, bent at the rounded edges like a thick lens, with a
 * bright rim catching the light.
 *
 * The shader is liquid-glass-js's own (dashersw/liquid-glass-js), but that
 * library refracts a one-off
 * html2canvas snapshot of the page. Our backdrop is a WebGL scene that moves
 * every frame, so a snapshot would show a frozen — and, for a WebGL canvas,
 * blank — picture. Instead the zoo renders into a texture and one final pass
 * composites the glass in, reading where each pane is from the DOM every
 * frame. The panes stay real, accessible HTML; only their backgrounds come
 * from here.
 */

import * as THREE from 'three';

const MAX = 24;

/** What gets glass, and its tint opacity. 0.2 is the library's default;
 *  the task sheet takes a little more because it holds paragraphs. */
const TARGETS = [
  ['.sheet', 0.4],
  ['.health', 0.2],
  ['.nav', 0.2],
  ['.status-line', 0.2],
  ['.today', 0.2],
  ['.piggy', 0.2],
  ['.avatar-btn', 0.2],
  ['.hover-card', 0.3],
  ['.release-skip .btn', 0.2],
  ['.mood-bar', 0.2],
];
const SELECTOR = TARGETS.map(([s]) => s).join(',');

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/* Halve the scene once with a 4-tap box filter; sampling that small copy
   with a handful of taps is what makes the frost cheap. */
const downFragment = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb
           + texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
    gl_FragColor = vec4(c * 0.25, 1.0);
  }
`;

/* A port of liquid-glass-js's container shader (dashersw/liquid-glass-js,
   MIT), with its default control values baked in. Differences are only in
   plumbing: it runs once over the whole screen instead of once per pane,
   reads a live render target instead of an html2canvas snapshot, and blurs
   a quarter-size copy so the same Gaussian costs far fewer taps. */
const compositeFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBlur;
  uniform vec2 uRes;
  uniform float uScale;          // drawing-buffer pixels per CSS pixel
  uniform int uCount;
  uniform vec4 uRects[${MAX}];   // x, y (bottom-left, buffer px), w, h
  uniform vec2 uShape[${MAX}];   // corner radius (CSS px), tint opacity
  varying vec2 vUv;

  // liquid-glass-js defaults (controls.js)
  const float EDGE_INTENSITY = 0.01;
  const float RIM_INTENSITY = 0.05;
  const float EDGE_DISTANCE = 0.15;
  const float RIM_DISTANCE = 0.8;
  const float CORNER_BOOST = 0.02;
  const float RIPPLE = 0.1;
  const float BLUR_RADIUS = 5.0;

  vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }

  float roundedRectDistance(vec2 px, vec2 size, float radius) {
    vec2 toCorner = abs(px - size * 0.5) - (size * 0.5 - radius);
    return length(max(toCorner, 0.0)) + min(max(toCorner.x, toCorner.y), 0.0) - radius;
  }
  bool isPill(vec2 size, float radius) {
    return abs(radius - size.y * 0.5) < 2.0 && size.x > size.y + 4.0;
  }
  bool isCircle(vec2 size, float radius) {
    return abs(radius - min(size.x, size.y) * 0.5) < 1.0 && abs(size.x - size.y) < 4.0;
  }

  // The library's Gaussian: sigma = blurRadius / 2 taps, one tap every sigma
  // texels, cut off at six taps. Here on the quarter-size copy.
  vec3 gaussian(vec2 uv) {
    float sigmaTaps = BLUR_RADIUS / 2.0;
    vec2 stepUv = (sigmaTaps * 2.0 * uScale) / uRes;   // CSS-px-scaled taps
    vec3 c = vec3(0.0);
    float total = 0.0;
    for (float i = -3.0; i <= 3.0; i += 1.0) {
      for (float j = -3.0; j <= 3.0; j += 1.0) {
        float d = length(vec2(i, j)) * 2.0;
        if (d > 6.0) continue;
        float w = exp(-(d * d) / (2.0 * sigmaTaps * sigmaTaps));
        c += texture2D(tBlur, uv + vec2(i, j) * stepUv).rgb * w;
        total += w;
      }
    }
    return c / total;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec3 col = texture2D(tScene, vUv).rgb;

    for (int i = 0; i < ${MAX}; i++) {
      if (i >= uCount) break;
      vec4 r = uRects[i];
      if (frag.x < r.x || frag.y < r.y || frag.x > r.x + r.z || frag.y > r.y + r.w) continue;

      // Everything below is in the pane's own CSS pixels, top-left origin,
      // exactly as the library sees its canvas.
      vec2 size = r.zw / uScale;
      vec2 coord = vec2((frag.x - r.x) / r.z, 1.0 - (frag.y - r.y) / r.w);
      vec2 px = coord * size;
      float radius = min(uShape[i].x, min(size.x, size.y) * 0.5);

      float dist;
      vec2 normal;
      if (isPill(size, radius)) {
        vec2 a = vec2(radius, size.y * 0.5);
        vec2 b = vec2(size.x - radius, size.y * 0.5);
        vec2 axis = b - a;
        float t = clamp(dot(px - a, axis) / dot(axis, axis), 0.0, 1.0);
        vec2 toAxis = px - (a + t * axis);
        dist = length(toAxis) - radius;
        normal = length(toAxis) > 0.0 ? normalize(toAxis) : vec2(0.0, 1.0);
      } else if (isCircle(size, radius)) {
        dist = length(px - size * 0.5) - radius;
        normal = normalize(coord - 0.5);
      } else {
        dist = roundedRectDistance(px, size, radius);
        normal = normalize(coord - 0.5);
      }
      if (dist > 0.5) continue;

      float minRes = min(size.x, size.y);
      float edgeDist = max(-dist, 0.0);
      float edgeIntensity = exp(-edgeDist * EDGE_DISTANCE);
      float rimIntensity = exp(-edgeDist * RIM_DISTANCE);
      vec2 refraction = normal * (edgeIntensity * EDGE_INTENSITY + rimIntensity * RIM_INTENSITY);

      float cornerDistance = max(min(coord.x, 1.0 - coord.x), min(coord.y, 1.0 - coord.y)) * minRes;
      refraction += normal * exp(-cornerDistance * 0.3) * CORNER_BOOST;

      vec2 perpendicular = vec2(-normal.y, normal.x);
      refraction += perpendicular * sin(edgeDist / minRes * 25.0) * RIPPLE * rimIntensity;

      // Library offsets are in its page texture's uv with y down; ours is y up.
      vec2 uv = vUv + vec2(refraction.x, -refraction.y);
      vec3 glass = toSRGB(gaussian(uv));

      // Vertical white-to-grey tint, then a faint pull toward the colours
      // sampled across the pane's top, middle and bottom.
      float tint = uShape[i].y;
      glass = mix(glass, mix(vec3(1.0), vec3(0.7), coord.y), tint);
      float cx = (r.x + r.z * 0.5) / uRes.x;
      float top = (r.y + r.w * 0.9) / uRes.y;
      float mid = (r.y + r.w * 0.5) / uRes.y;
      float bot = (r.y + r.w * 0.1) / uRes.y;
      vec3 sTop = toSRGB(texture2D(tBlur, vec2(cx, top)).rgb);
      vec3 sMid = toSRGB(texture2D(tBlur, vec2(cx, mid)).rgb);
      vec3 sBot = toSRGB(texture2D(tBlur, vec2(cx, bot)).rgb);
      vec3 sampled = coord.y < 0.5 ? mix(sTop, sMid, coord.y * 2.0) : mix(sMid, sBot, coord.y * 2.0 - 1.0);
      glass = mix(glass, sampled, tint * 0.3);

      // Antialiased shape mask.
      float mask = 1.0 - smoothstep(-0.5, 0.5, dist);
      col = mix(col, toLinear(glass), mask);
      break;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * @param {import('./scene.js').ZooScene} zoo
 */
export function createGlass(zoo) {
  const { renderer } = zoo;
  const opts = { type: THREE.HalfFloatType, depthBuffer: true };
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: zoo.tier === 'low' ? 0 : 4 });
  const blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const pass = new THREE.Scene();
  pass.add(quad);

  const down = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: downFragment,
    uniforms: { tSrc: { value: sceneRT.texture }, uTexel: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
  });

  const rects = Array.from({ length: MAX }, () => new THREE.Vector4());
  const shapes = Array.from({ length: MAX }, () => new THREE.Vector2());
  const composite = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: compositeFragment,
    uniforms: {
      tScene: { value: sceneRT.texture },
      tBlur: { value: blurRT.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uScale: { value: 1 },
      uCount: { value: 0 },
      uRects: { value: rects },
      uShape: { value: shapes },
    },
    depthTest: false,
    depthWrite: false,
  });

  const size = new THREE.Vector2();
  /** Corner radius per element, in CSS px. Read once — computed style is not free. */
  const radii = new WeakMap();
  const tints = new Map(TARGETS);

  function effectiveOpacity(el, cs) {
    let o = parseFloat(cs.opacity);
    for (let a = el.parentElement; a && a !== document.body && o > 0.35; a = a.parentElement) {
      o *= parseFloat(getComputedStyle(a).opacity);
    }
    return o;
  }

  function tintFor(el) {
    for (const [sel, t] of tints) if (el.matches(sel)) return t;
    return 0.5;
  }

  function radiusOf(el) {
    let r = radii.get(el);
    if (r === undefined) {
      r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      radii.set(el, r);
    }
    return r;
  }

  /* The library's tint is the same in every theme; nothing to re-read. */
  function applyTheme() {}

  /** Collect the panes on screen this frame, in buffer pixels. */
  function collect(canvasRect, scale, bufferH) {
    let n = 0;
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (n >= MAX) break;
      const cs = getComputedStyle(el);
      if (!el.offsetParent && cs.position !== 'fixed') continue;
      // Faded-out panes should not leave glass behind — including ones whose
      // HUD corner is fading, so walk up and multiply the opacities.
      if (cs.visibility === 'hidden' || effectiveOpacity(el, cs) < 0.35) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < canvasRect.top || r.top > canvasRect.bottom) continue;
      const x = (r.left - canvasRect.left) * scale;
      const y = bufferH - (r.bottom - canvasRect.top) * scale;
      rects[n].set(x, y, r.width * scale, r.height * scale);
      shapes[n].set(radiusOf(el), tintFor(el));
      n += 1;
    }
    return n;
  }

  return {
    applyTheme,

    render(scene, camera3d) {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.floor(size.x));
      const h = Math.max(1, Math.floor(size.y));
      if (sceneRT.width !== w || sceneRT.height !== h) {
        sceneRT.setSize(w, h);
        blurRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
      }

      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera3d);

      quad.material = down;
      down.uniforms.uTexel.value.set(1 / w, 1 / h);
      renderer.setRenderTarget(blurRT);
      renderer.render(pass, camera);

      const canvasRect = renderer.domElement.getBoundingClientRect();
      const scale = w / Math.max(1, canvasRect.width);
      composite.uniforms.uRes.value.set(w, h);
      composite.uniforms.uScale.value = scale;
      composite.uniforms.uCount.value = collect(canvasRect, scale, h);

      quad.material = composite;
      renderer.setRenderTarget(null);
      renderer.render(pass, camera);
    },

    dispose() {
      sceneRT.dispose();
      blurRT.dispose();
      down.dispose();
      composite.dispose();
      quad.geometry.dispose();
    },
  };
}
