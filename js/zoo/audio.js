/**
 * To-Zoo — sound.
 *
 * Spatial audio through Google's Resonance Audio (resonance-audio-web-sdk,
 * Apache-2.0, vendored in vendor/): every sound has a position in the zoo,
 * and the listener rides on the camera, so a bird in the left-hand trees is
 * heard on the left and an elephant by the gate sounds further off than the
 * rabbit at your feet.
 *
 * There are no audio files. Everything is synthesised with Web Audio — a
 * breeze from filtered noise, birdsong from short swept sines, the animals'
 * little calls, a chime for a release and a plink for coins — kept quiet and
 * soft so it sits under a working afternoon rather than on top of it.
 *
 * Off by default. Browsers only allow audio after a user gesture, and the
 * Settings toggle is that gesture; on a reload with sound on, the first click
 * anywhere starts it.
 */

let resonanceLoading = null;
function loadResonance() {
  if (window.ResonanceAudio) return Promise.resolve(window.ResonanceAudio);
  resonanceLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/resonance-audio.min.js';
    script.onload = () => (window.ResonanceAudio ? resolve(window.ResonanceAudio) : reject(new Error('no ResonanceAudio')));
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return resonanceLoading;
}

/** C major pentatonic, for anything melodic: nothing can clash. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

/**
 * @param {import('./scene.js').ZooScene} zoo
 * @param {object} hooks
 * @param {() => {x: number, z: number}[]} hooks.treeSpots  where birds can sing from
 * @param {() => {type: string, x: number, z: number}[]} hooks.animals
 */
export function createAudio(zoo, hooks) {
  let ctx = null;
  let scene = null;
  let master = null;
  let enabled = false;
  let starting = null;
  let breeze = null;
  let nextBird = 0;
  let nextCall = 0;

  async function start() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    try {
      const ResonanceAudio = await loadResonance();
      scene = new ResonanceAudio(ctx, { ambisonicOrder: 1 });
      // Outdoors: a huge room with transparent walls, i.e. no reflections.
      scene.setRoomProperties(
        { width: 60, height: 30, depth: 60 },
        { left: 'transparent', right: 'transparent', front: 'transparent',
          back: 'transparent', down: 'grass', up: 'transparent' },
      );
      scene.output.connect(master);
    } catch (err) {
      // Without the spatialiser, everything still plays — just in stereo.
      console.warn('[to-zoo] spatial audio unavailable, playing flat', err);
      scene = null;
    }

    breeze = makeBreeze();
  }

  /** A source at a point in the world. Falls back to a plain gain. */
  function at(x, y, z) {
    if (scene) {
      const source = scene.createSource({ rolloff: 'logarithmic', minDistance: 2, maxDistance: 60 });
      source.setPosition(x, y, z);
      return source.input;
    }
    const g = ctx.createGain();
    g.connect(master);
    return g;
  }

  function noiseBuffer(seconds = 2) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Brown-ish noise: soft, low, like air rather than hiss.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  /* ------------------------------------------------------------ voices --- */

  function makeBreeze() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    // Slow gusts.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    lfo.start();
    return { src, lfo };
  }

  /** One bird: two to five quick upward-sweeping chirps. */
  function bird(x, z) {
    const out = at(x, 4 + Math.random() * 2, z);
    const base = 2200 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 4);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i += 1) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const f = base * (1 + (Math.random() - 0.3) * 0.25);
      osc.frequency.setValueAtTime(f * 0.8, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.07);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
      t += 0.09 + Math.random() * 0.08;
    }
  }

  /** Each species' small call. Soft and short: a toy, not a documentary. */
  function call(type, x, z) {
    const out = at(x, 1, z);
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vib.connect(vibGain).connect(osc.frequency);

    if (type === 'elephant') {
      // A little toot through the trunk.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, t);
      osc.frequency.linearRampToValueAtTime(440, t + 0.12);
      osc.frequency.linearRampToValueAtTime(392, t + 0.45);
      vib.frequency.value = 7;
      vibGain.gain.value = 9;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    } else if (type === 'lion') {
      // A sleepy purr-rumble: low, wobbling.
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.linearRampToValueAtTime(80, t + 0.6);
      vib.frequency.value = 22;
      vibGain.gain.value = 14;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(lp).connect(g).connect(out);
      osc.start(t); vib.start(t);
      osc.stop(t + 0.75); vib.stop(t + 0.75);
      return;
    } else {
      // Rabbit: a tiny squeak.
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(1900, t + 0.06);
      vib.frequency.value = 30;
      vibGain.gain.value = 20;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    }
    osc.connect(g).connect(out);
    osc.start(t); vib.start(t);
    osc.stop(t + 0.6); vib.stop(t + 0.6);
  }

  /** A soft bell. */
  function bell(freq, when, out, level = 0.08) {
    const osc = ctx.createOscillator();
    const over = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    over.type = 'sine';
    osc.frequency.value = freq;
    over.frequency.value = freq * 2.76;   // the inharmonic partial that says "bell"
    const og = ctx.createGain();
    og.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(level, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);
    osc.connect(g);
    over.connect(og).connect(g);
    g.connect(out);
    osc.start(when); over.start(when);
    osc.stop(when + 1.3); over.stop(when + 1.3);
  }

  /* -------------------------------------------------------------- loop --- */

  zoo.onFrame((dt, elapsed) => {
    if (!enabled || !ctx) return;
    if (scene) scene.setListenerFromMatrix(zoo.camera.matrixWorld);

    if (elapsed > nextBird) {
      const trees = hooks.treeSpots();
      if (trees.length) {
        const tree = trees[Math.floor(Math.random() * trees.length)];
        bird(tree.x, tree.z);
      }
      nextBird = elapsed + 3 + Math.random() * 7;
    }
    if (elapsed > nextCall) {
      const animals = hooks.animals();
      if (animals.length) {
        const a = animals[Math.floor(Math.random() * animals.length)];
        call(a.type, a.x, a.z);
      }
      nextCall = elapsed + 9 + Math.random() * 14;
    }
  });

  return {
    get enabled() { return enabled; },

    /** Must be called from a user gesture the first time. */
    async setEnabled(on) {
      enabled = on;
      if (on) {
        starting ??= start();
        await starting;
        if (!ctx) return;
        await ctx.resume();
        master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4);
      } else if (ctx) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      }
    },

    /** An animal's call, where it stands. */
    call(type, x, z) { if (enabled && ctx) call(type, x, z); },

    /** A rising pentatonic arpeggio, from wherever the animal was released. */
    release(x, z) {
      if (!enabled || !ctx) return;
      const out = at(x, 1.5, z);
      const t = ctx.currentTime + 0.02;
      [0, 2, 4, 5, 7].forEach((n, i) => bell(PENTA[n], t + i * 0.11, out, 0.07));
    },

    /** Coins landing in the piggy bank: a couple of quick high plinks. */
    coins(count = 3) {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime + 0.02;
      for (let i = 0; i < Math.min(5, count); i += 1) bell(PENTA[5 + (i % 3)] * 2, t + i * 0.07, master, 0.035);
    },

    dispose() {
      breeze?.src.stop();
      breeze?.lfo.stop();
      ctx?.close();
    },
  };
}
