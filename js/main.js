/**
 * To-Zoo — boot and wiring.
 *
 * Resolves preferences, builds the world, and keeps the store and the scene in
 * step. Deliberately thin: it decides *when* things happen and delegates
 * *what* they look like to the zoo and ui modules.
 */

import * as THREE from 'three';
import { ZooScene } from './zoo/scene.js';
import { buildEnvironment } from './zoo/environment.js';
import { buildGrass } from './zoo/grass.js';
import { buildFence } from './zoo/fence.js';
import { createAudio } from './zoo/audio.js';
import { setStepListener } from './zoo/animals.js';
import { buildDuskLife } from './zoo/dusklife.js';
import { renderPortraits } from './zoo/portraits.js';
import { renderThumbnails } from './zoo/thumbnails.js';
import { createGroupSync, parseInvite } from './group.js';
import { avatarMark, icon } from './ui/icons.js';
import { createSpace } from './zoo/space.js';
import { createDaylight, clockIsNight } from './zoo/daylight.js';
import { buildSeasons } from './zoo/seasons.js';
import { createPopulation } from './zoo/animalTask.js';
import { createPicking } from './zoo/picking.js';
import { createRelease } from './zoo/release.js';
import { buildClutter } from './zoo/clutter.js';
import { buildDecorations } from './zoo/decorations.js';
import { refresh as refreshPalette } from './zoo/palette.js';

import {
  getState, subscribe, onError, mood as zooMoodOf, setSetting,
  taskById, completeTask, uncompleteTask, setUser, finishOnboarding, loadDemo,
  shopItems, settleUpkeep, placedItems, updateTask, moveItem,
} from './store.js';
import { ANIMALS, mood as moodOfTask } from './model.js';

import { createHud } from './ui/hud.js';
import { createMoodBars } from './ui/moodBars.js';
import { openAddTask } from './ui/addTask.js';
import { openTaskPanel } from './ui/taskPanel.js';
import { flyTokens, toast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { openPostcard } from './ui/postcard.js';
import { ensureName, finishGoogleSignIn } from './ui/identity.js';
import { isDialogOpen } from './ui/dialog.js';
import { mountViews } from './ui/views.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------- theme --- */

/**
 * Resolve stored preferences into the two attributes everything else reads.
 * Done before the first frame so the scene never has to repaint.
 */
/**
 * Resolve the preference into a world mode and an interface theme.
 *
 * The two are the same decision now: Day means a midday sun *and* light
 * panels, Night means a moonlit zoo *and* dark panels, and Auto follows the
 * real clock for both. `clockIsNight()` is a plain function rather than a
 * method on the daylight because this runs during boot, before the scene —
 * and therefore the daylight — exists.
 */
export function applyPreferences() {
  const { settings } = getState();
  const root = document.documentElement;

  // Always daylight, always light panels. "Time of day" now only chooses
  // between following the clock (morning to golden hour) and a fixed midday.
  const mode = settings.theme === 'light' ? 'day' : 'auto';
  const dark = false;
  root.dataset.theme = dark ? 'dark' : 'light';

  const prefersLess = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = settings.motion === 'reduced' || (settings.motion === 'system' && prefersLess);
  root.dataset.motion = reduced ? 'reduced' : 'full';

  return { dark, reduced, mode };
}

/* -------------------------------------------------------------- boot --- */

function failGracefully(message, detail) {
  console.error('[to-zoo]', message, detail ?? '');
  // Tell the watchdog we got far enough to explain ourselves.
  window.__toZooBooted = true;
  const loader = $('loader');
  if (loader) { loader.dataset.done = ''; loader.hidden = true; }
  $('app')?.removeAttribute('hidden');
  const root = $('modal-root');
  if (root) {
    root.innerHTML = `
      <div class="fallback-card" role="alert">
        <h2>The zoo could not open</h2>
        <p>${message}</p>
        <p class="fallback-card__hint">Your tasks are safe. They are stored on this
        device, not in the 3D scene.</p>
      </div>`;
  }
}

async function boot() {
  const prefs = applyPreferences();

  const canvas = /** @type {HTMLCanvasElement} */ ($('zoo-canvas'));
  if (!canvas) return failGracefully('The page did not load correctly. Try refreshing.');

  // Check WebGL before Three throws its own, less helpful, error.
  let probe;
  try {
    probe = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  } catch { /* handled below */ }
  if (!probe) {
    return failGracefully(
      'This browser or device could not start WebGL, which To-Zoo needs to draw the zoo.',
    );
  }

  let zoo;
  try {
    zoo = new ZooScene(canvas);
  } catch (err) {
    return failGracefully('Something went wrong starting the 3D scene.', err);
  }

  zoo.setReducedMotion(prefs.reduced);
  zoo.setRetro(getState().settings.graphics === 'retro');

  // One register of who is standing where. Built before anything that
  // occupies ground, because every one of them reports into it.
  const space = createSpace();

  const environment = buildEnvironment(zoo, space);
  const grass = buildGrass(zoo);
  const fence = buildFence(zoo);
  const clutter = buildClutter(zoo);
  const decorations = buildDecorations(zoo, space);
  // Set a prop down somewhere new: remember it, and let the animals re-route.
  decorations.onMoved((itemId, x, z, rot) => {
    const spot = getState().placements.filter((p) => p.itemId === itemId).at(-1);
    if (spot) moveItem(spot.uid, x, z, rot);
  });
  // The sun runs on the real clock and owns sky, fog and every light from
  // here on; scene.applyTheme() steps aside for it.
  // Seasons own everything past the fence, so they are built before the
  // daylight takes over the sky.
  const seasons = buildSeasons(zoo, environment);
  buildDuskLife(zoo);

  const daylight = createDaylight(zoo, environment);
  zoo.ownsLighting = true;
  daylight.setMode(prefs.mode);

  // ?debug exposes the scene so lighting can be measured rather than eyeballed.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__zoo = { zoo, daylight, seasons, environment };
  }

  // In Auto the interface follows the sun, so a crossing into night has to
  // repaint the panels as well as the sky.
  daylight.onNightChange(() => {
    if (getState().settings.theme === 'system') repaintTheme();
    applyBedtime();
  });

  const population = createPopulation(zoo, space);
  try {
    renderPortraits(zoo);
    renderThumbnails(zoo);
  } catch (err) {
    console.warn('[to-zoo] portraits unavailable', err);
  }
  const release = createRelease(zoo, population, environment);
  const hud = createHud({ onFocusTask: focusTask });

  /** Night means bedtime: animals settle, bars snooze, the HUD says so. */
  function applyBedtime() {
    const night = daylight.isNight;
    population.setSleeping(night);
    moodBars?.setSleeping(night);
    hud.setSleeping(night);
  }

  const audio = createAudio(zoo, {
    treeSpots: () => seasons.group.children.at(-1)?.userData.treeSpots ?? [],
    animals: () => population.positions(),
  });
  setStepListener((type, pos, foot) => audio.step(type, pos.x, pos.z, foot));

  // The speaker in the corner: one tap to mute or unmute.
  const soundBtn = $('sound-btn');
  function paintSoundBtn() {
    const on = !!getState().settings.sound;
    soundBtn.innerHTML = icon(on ? 'soundOn' : 'soundOff');
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
  }
  soundBtn.addEventListener('click', () => {
    setSetting('sound', !getState().settings.sound);
    audio.setEnabled(!!getState().settings.sound);
    paintSoundBtn();
  });
  paintSoundBtn();

  // Sound needs a user gesture. If it was left on, the first click starts it.
  if (getState().settings.sound) {
    window.addEventListener('pointerdown', () => {
      if (getState().settings.sound) audio.setEnabled(true);
    }, { once: true });
  }

  const picking = createPicking(zoo, population, { onSelect: openTask });
  const moodBars = createMoodBars(zoo, population);
  applyBedtime();

  /** True while coins are mid-flight, so the counter lands with them. */
  let tokensInFlight = false;
  const anchor = new THREE.Vector3();

  /* ---------------------------------------------------------- syncing -- */

  let lastPlacedKey = null;
  function syncWorld() {
    const state = getState();

    // The gate sign: the keeper's name if they have given one.
    const name = (state.user.name || '').trim();
    environment.setSign(state.group ? state.group.name
      : name && name !== 'You' ? `${name}\u2019s Zoo` : 'My Zoo');

    /* What dresses the world is the *share* of animals being neglected, not
       how many animals there are. A ratio cannot grow just because the zoo is
       busy, which is exactly the property v1 lacked: thirty fresh animals and
       three fresh animals both produce zero here. */
    const open = state.tasks.filter((t) => !t.completed);
    const neglected = open.filter((t) => moodOfTask(t) < 35).length;
    const neglectRatio = open.length ? neglected / open.length : 0;

    environment.setMessiness(neglectRatio * 0.5);
    grass.setMessiness(0);          // the lawn no longer reports on your backlog
    clutter.setMessiness(neglectRatio);
    fence.setStyle(state.fenceStyle);
    seasons.setSeason(state.season);
    grass.setVisible(!['summer', 'winter'].includes(seasons.season));

    const items = shopItems(state);
    const placedKey = state.placements.map((p) => `${p.itemId}@${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(",");
    decorations.sync(items, state.placements);
    if (placedKey !== lastPlacedKey) {
      lastPlacedKey = placedKey;
      population.replan();
    }
    // Accessories: one thing on the head (the most recent) plus glasses.
    const wearing = items.filter((i) => i.owned && i.placedCount > 0 && i.slot === 'animal');
    const latest = (ids) => state.placements.filter((p) => ids.includes(p.itemId)).at(-1)?.itemId;
    const head = latest(wearing.filter((i) => i.build !== 'sunglasses').map((i) => i.id));
    const builds = [
      wearing.find((i) => i.id === head)?.build,
      wearing.find((i) => i.build === 'sunglasses')?.build,
    ].filter(Boolean);
    population.setCosmetic(builds);

    population.sync(state.tasks);
    picking.sync();
    hud.render(state, { holdTokens: tokensInFlight });
  }

  subscribe(syncWorld);

  onError((kind) => {
    if (kind !== 'storage') return;
    toast({
      title: 'This browser will not let To-Zoo save',
      tone: 'warn',
      duration: 8000,
    });
  });

  /* ------------------------------------------------------ interaction -- */

  /** Fly to an animal without opening its panel — the HUD callout uses this. */
  function focusTask(taskId) {
    const point = population.anchorOf(taskId, anchor);
    if (!point) return;
    zoo.focusOn(point);
    picking.focusAnimal(taskId);
    setTimeout(() => zoo.focusOn(null), 2600);
  }

  function openTask(taskId) {
    const task = taskById(taskId);
    if (!task) return;

    // Move the camera in on the animal being discussed, so the panel and the
    // thing it describes are the same object on screen.
    const point = population.anchorOf(taskId, anchor);
    if (point) zoo.focusOn(point);
    const picked = population.get(taskId);
    if (picked) {
      picked.animal.boing();
      audio.call(task.animalType, picked.animal.root.position.x, picked.animal.root.position.z);
    }
    picking.setSuspended(true);

    openTaskPanel(task, {
      onComplete: completeAndRelease,
      onChanged: syncWorld,
      onClosed: () => {
        // Only hand the camera back if a release is not now flying it.
        if (!release.isPlaying) {
          zoo.focusOn(null);
          picking.setSuspended(false);
        }
      },
    });
  }

  /**
   * The single door every completion goes through.
   *
   * Order matters and is easy to get wrong: committing to the store re-runs
   * sync(), which despawns the animal for the now-completed task. Reserving
   * it first is what keeps it alive long enough to walk out of the gate.
   *
   * @param {string} taskId
   */
  function completeAndRelease(taskId) {
    population.reserve(taskId);
    // Hold the counter *before* committing. completeTask() notifies
    // subscribers synchronously, so setting this afterwards would let the HUD
    // paint the new balance a beat before the coins arrive to explain it.
    tokensInFlight = true;

    const result = completeTask(taskId);
    if (!result) {
      population.unreserve(taskId);
      tokensInFlight = false;
      return null;
    }
    playRelease(result);
    return result;
  }

  /**
   * @param {{task: any, reward: any}} result  already committed by the store
   */
  function playRelease(result) {
    const { task, reward } = result;
    const spec = ANIMALS[task.animalType];

    picking.setSuspended(true);
    zoo.focusOn(null);
    setSkipVisible(true);

    const leaving = population.get(task.id);
    if (leaving) {
      leaving.animal.boing(1.3);
      audio.release(leaving.animal.root.position.x, leaving.animal.root.position.z);
    }

    const handle = release.release(task.id, {
      onExit(screen) {
        flyTokens(screen, reward.total, () => {
          audio.coins(Math.ceil(reward.total / 8));
          tokensInFlight = false;
          hud.releaseTokens(getState());
        });

        toast({
          title: `${spec.label} went home!`,
          emoji: spec.emoji,
          tone: 'reward',
          parts: reward.parts.length > 1 ? reward.parts : null,
          total: reward.total,
          action: {
            label: 'Undo',
            onClick: () => undoCompletion(task.id, reward.total),
          },
        });
      },
    });

    skipHandler = handle.skip;

    handle.promise.then(() => {
      setSkipVisible(false);
      skipHandler = null;
      picking.setSuspended(false);
      // A safety net: if the exit hook never fired the counter would stick.
      if (tokensInFlight) {
        tokensInFlight = false;
        hud.releaseTokens(getState());
      }
      syncWorld();
    });
  }

  function undoCompletion(taskId, refund) {
    const restored = uncompleteTask(taskId);
    if (!restored) return;
    // Give back exactly what the completion paid, so undo is not a token farm.
    const { user } = getState();
    setUser({ tokens: Math.max(0, user.tokens - refund) });
    hud.setTokensImmediately(getState().user.tokens);
    syncWorld();
    toast({ title: 'Brought them back in', emoji: ANIMALS[restored.animalType].emoji });
  }

  /* ----------------------------------------------------------- upkeep -- */

  /**
   * Settle what the neglected animals cost, and show it.
   *
   * The charge itself is the user's stated choice — days away are billed in
   * full. What is not negotiable is that it happens *visibly*: a balance that
   * quietly dropped by ninety tokens overnight would be the single most
   * alienating thing this app could do.
   */
  function runUpkeep() {
    const result = settleUpkeep();
    if (result.total <= 0) {
      hud.render(getState(), { holdTokens: tokensInFlight });
      return;
    }

    hud.setTokensImmediately(getState().user.tokens);

    if (result.days > 1) {
      // Came back after a while: one summary, not a stack of notices.
      toast({
        title: `While you were away · ${result.days} days`,
        emoji: '\u{1F437}',
        tone: 'warn',
        parts: result.ledger.slice(0, 4).map((row) => ({
          label: `${ANIMALS[row.animalType].label}: ${row.title}`,
          amount: -row.amount,
        })),
        total: -result.total,
        duration: 9000,
        note: result.capped
          ? 'That was more than the piggy bank held, so the rest is forgiven.'
          : 'Only animals left waiting cost anything.',
      });
      return;
    }

    if (!getState().settings.upkeepNotices) return;

    // A normal day: pay each animal in turn, coins leaving the piggy bank.
    for (const [i, row] of result.ledger.entries()) {
      setTimeout(() => {
        const point = population.anchorOf(row.taskId, anchor);
        const screen = point ? zoo.screenPosition(point) : null;
        if (screen) flyTokens(screen, row.amount, null, { direction: 'out' });
        toast({
          title: `${ANIMALS[row.animalType].label} upkeep`,
          emoji: ANIMALS[row.animalType].emoji,
          tone: 'warn',
          total: -row.amount,
          duration: 3200,
        });
      }, i * 700);
    }
  }

  /* ------------------------------------------------------------- skip -- */

  let skipHandler = null;
  const skipBar = $('release-skip');

  function setSkipVisible(visible) {
    skipBar.hidden = !visible;
  }

  $('skip-release').addEventListener('click', () => skipHandler?.());

  /* --------------------------------------------------------- shortcuts -- */

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && skipHandler) {
      skipHandler();
      return;
    }
    if (isDialogOpen()) return;
    if (event.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      addTask();
    }
  });

  /* ------------------------------------------------------------ views -- */

  /* --------------------------------------------------------- group zoo -- */

  const groupChip = $('group-chip');
  const group = createGroupSync({
    onPeople(people) {
      renderGroupChip(people);
      if (document.getElementById('app').dataset.view === 'friends') views.render();
    },
    onError(err) {
      toast({ title: 'Group zoo is offline', note: String(err?.message ?? err) });
    },
  });

  function renderGroupChip(people = group.people) {
    const g = getState().group;
    groupChip.hidden = !g;
    if (!g) return;
    groupChip.innerHTML = `
      <span class="group-chip__faces">${people.slice(0, 4).map((p) => `<span>${avatarMark(p.name, p.avatar)}</span>`).join('')}</span>
      <span class="group-chip__name">${g.name.replace(/[<>&]/g, '')}</span>`;
    groupChip.title = `${g.name}: ${people.length} here now`;
  }
  groupChip?.addEventListener('click', () => views.show('friends'));
  renderGroupChip();
  subscribe((_, change) => { if (change.type.startsWith('group:')) renderGroupChip(); });

  // A name was just given: relabel this person's pets in the group, and tell
  // everyone else who is here.
  function relabelMine() {
    const s = getState();
    if (!s.group) return;
    for (const t of s.tasks) {
      if (t.by && t.by.id === s.user.id && t.by.name !== s.user.name) {
        updateTask(t.id, { by: { ...t.by, name: s.user.name, avatar: s.user.avatar } });
      }
    }
    group.reannounce();
  }
  window.addEventListener('to-zoo:renamed', relabelMine);
  finishGoogleSignIn().then((signedIn) => {
    if (signedIn) {
      relabelMine();
      toast({ title: `Hi ${getState().user.name}` });
    }
  });

  /** Testing: open the app with ?coins to get a mountain of tokens. */
  function grantTestCoins() {
    const params = new URLSearchParams(location.search);
    if (!params.has('coins')) return;
    const amount = Math.min(10_000_000, Number(params.get('coins')) || 99_999);
    params.delete('coins');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    setUser({ tokens: getState().user.tokens + amount });
    toast({ title: `+${amount.toLocaleString()} test tokens`, note: 'Go wild in Customize.' });
  }

  /** Opened from an invite link: offer to join. */
  async function joinFromUrl() {
    const params = new URLSearchParams(location.search);
    const id = parseInvite(`?zoo=${params.get('zoo') ?? ''}`);
    if (!id) return;
    params.delete('zoo');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
    if (getState().group?.id === id) return;
    try {
      const zoo = await group.peek(id);
      if (!zoo) { toast({ title: 'That group zoo doesn\u2019t exist any more' }); return; }
      const yes = await confirmDialog({
        title: `Join ${zoo.name}?`,
        body: `${zoo.count} animal${zoo.count === 1 ? '' : 's'} waiting. Your own zoo is kept safe, and you can go back to it from Friends any time.`,
        confirmLabel: 'Join the zoo',
      });
      if (!yes) return;
      if (!(await ensureName())) return;
      await group.join(id);
      syncWorld();
      toast({ title: `Welcome to ${zoo.name}` });
    } catch (err) {
      toast({ title: 'Could not open the invite', note: String(err?.message ?? err) });
    }
  }

  const views = mountViews({
    zoo, population, picking, hud, group,
    onAddTask: addTask,
    onOpenTask: openTask,
    onComplete: completeAndRelease,
    syncWorld,
  });

  async function addTask() {
    // In a group zoo every pet carries its owner's name, so get one first.
    if (getState().group && !(await ensureName())) return;
    picking.setSuspended(true);
    openAddTask({
      onCreated(task) {
        syncWorld();
        // Show them where it landed.
        const point = population.anchorOf(task.id, anchor);
        if (point) {
          zoo.focusOn(point);
          setTimeout(() => zoo.focusOn(null), 1600);
        }
        toast({
          title: `${ANIMALS[task.animalType].label} added to your zoo`,
          emoji: ANIMALS[task.animalType].emoji,
          duration: 2600,
        });
      },
    }).finally(() => picking.setSuspended(false));
  }

  $('add-task').addEventListener('click', addTask);
  $('empty-add').addEventListener('click', addTask);
  $('tokens').addEventListener('click', () => views.show('customize'));
  $('avatar-btn').addEventListener('click', () => views.show('profile'));
  $('brand').addEventListener('click', () => openPostcard(zoo));

  /* ------------------------------------------------------------ theme -- */

  function repaintTheme() {
    const next = applyPreferences();
    daylight.setMode(next.mode);
    refreshPalette();
    zoo.applyTheme();
    environment.applyTheme();
    grass.applyTheme();
    fence.applyTheme();
    seasons.applyTheme();
    clutter.applyTheme();
    population.applyTheme();
    release.applyTheme();
    daylight.refresh();
    // Decorations tear down and are rebuilt by the sync below, because their
    // materials bake a colour rather than holding the live token.
    decorations.applyTheme();
    syncWorld();
  }

  window.addEventListener('to-zoo:preferences', () => {
    // Order matters: resolve the preference, point the sun at it, and only
    // then repaint — otherwise the world would be relit from the old mode.
    const next = applyPreferences();
    daylight.setMode(next.mode);
    repaintTheme();
    zoo.setReducedMotion(document.documentElement.dataset.motion === 'reduced');
    zoo.setRetro(getState().settings.graphics === 'retro');
    audio.setEnabled(!!getState().settings.sound);
  });

  // A tab left open across midnight should still settle up when you return to
  // it, rather than waiting for the next reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runUpkeep();
  });

  // Auto follows the sun rather than the OS, so a system dark-mode change is
  // deliberately not listened for any more — the clock is the source of truth.
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    if (getState().settings.motion !== 'system') return;
    applyPreferences();
    zoo.setReducedMotion(document.documentElement.dataset.motion === 'reduced');
  });

  /* ------------------------------------------------------------- open -- */

  syncWorld();
  zoo.start();

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;

    // Dismiss the loader first and unconditionally. Anything below can throw;
    // none of it is allowed to leave the user staring at a spinner, which is
    // the one failure mode with no way out from the user's side.
    const loader = $('loader');
    if (loader) {
      loader.dataset.done = '';
      setTimeout(() => { loader.hidden = true; }, 420);
    }
    $('app').hidden = false;
    window.__toZooBooted = true;

    try {
      zoo.resize();               // the stage only has a size now it is shown
    } catch (err) {
      console.error('[to-zoo] could not size the stage', err);
    }

    // First visit: straight into an empty zoo; the "add your first task"
    // card does the explaining.
    if (!getState().onboarded) finishOnboarding();
    joinFromUrl();
    grantTestCoins();

    // Settle the bill after the zoo is on screen, so the coins have something
    // to fly to and from.
    setTimeout(runUpkeep, 900);
  };
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  // Belt and braces: a tab that loads in the background gets no animation
  // frames at all, so the timer is what actually reveals the app there.
  setTimeout(reveal, 1500);

  window.addEventListener('to-zoo:show', (e) => views.show(e.detail));

  // Exposed for debugging and for driving the app from the console.
  window.toZoo = {
    zoo, environment, grass, fence, clutter, decorations, population, picking, release, views,
    space, daylight, moodBars, seasons,
    syncWorld, addTask, openTask, completeAndRelease,
  };
}

boot().catch((err) => failGracefully('Something went wrong starting To-Zoo.', err));
