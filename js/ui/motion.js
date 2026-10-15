/**
 * To-Zoo — small motion helpers.
 *
 * Enough tweening for the release choreography and the token flight, and one
 * place that knows whether the user wants motion at all. Everything that
 * animates asks `reduced()` rather than reading the media query itself, so
 * the in-app toggle and the OS setting can never disagree.
 */

export const reduced = () => document.documentElement.dataset.motion === 'reduced';

export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Run `onUpdate(t)` with t going 0..1 over `duration` ms.
 *
 * Returns a promise that resolves when it finishes, and a `cancel` that
 * settles it immediately at t = 1 — which is exactly what "skip" needs, so a
 * skipped animation leaves the world in the same state a watched one does.
 *
 * @param {{duration: number, ease?: (t: number) => number,
 *          onUpdate: (t: number) => void, onDone?: () => void}} spec
 */
export function tween({ duration, ease = easeOut, onUpdate, onDone }) {
  let raf = 0;
  let settled = false;
  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });

  const settle = () => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(raf);
    onUpdate(1);
    onDone?.();
    resolveFn();
  };

  if (duration <= 0 || reduced()) {
    // Reduced motion still needs the end state applied, just not the journey.
    settle();
    return { promise, cancel: settle, skip: settle };
  }

  const start = performance.now();
  const step = (now) => {
    if (settled) return;
    const t = clamp01((now - start) / duration);
    onUpdate(ease(t));
    if (t >= 1) settle();
    else raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return { promise, cancel: settle, skip: settle };
}

/** A cancellable pause, so a sequence can be skipped mid-wait. */
export function wait(ms) {
  let timer = 0;
  let resolveFn;
  const promise = new Promise((resolve) => { resolveFn = resolve; });
  const settle = () => { clearTimeout(timer); resolveFn(); };
  if (reduced() || ms <= 0) settle();
  else timer = setTimeout(settle, ms);
  return { promise, cancel: settle, skip: settle };
}

/**
 * A timeline: one clock, phases addressed by absolute time.
 *
 * Chained tweens are the obvious way to choreograph something like the
 * release, and they are the wrong way — skipping half way through leaves you
 * settling a queue of handles and hoping each one's end state is right. A
 * single tween whose `onUpdate` positions *everything* from one normalised
 * time cannot get that wrong: cancelling jumps to t = 1, and t = 1 is the
 * finished world by construction.
 *
 * @param {number} duration total ms
 * @param {(t: number, seconds: number) => void} onUpdate
 */
export function timeline(duration, onUpdate, onDone) {
  return tween({
    duration,
    ease: (t) => t,                       // phases do their own easing
    onUpdate: (t) => onUpdate(t, t * duration / 1000),
    onDone,
  });
}

/**
 * Map an absolute window of a timeline onto 0..1.
 * `phase(0.4, 0.2, 0.5)` is "how far through the 0.2–0.5 window are we".
 */
export function phase(t, from, to, ease = easeInOut) {
  return ease(clamp01((t - from) / (to - from)));
}

/** Linear interpolation that is safe to call with any numbers. */
export const lerp = (a, b, t) => a + (b - a) * clamp01(t);
