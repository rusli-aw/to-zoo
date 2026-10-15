/**
 * To-Zoo — application state.
 *
 * A small observable store: one state object, a set of actions that replace
 * it, and subscribers that get told what changed. No framework, because the
 * 3D scene wants to diff tasks itself rather than be re-rendered.
 *
 * Every action returns something useful (the created task, the reward) so the
 * caller can drive an animation without reading state back out.
 */

import {
  DAY,
  DAILY_GOAL,
  dailyUpkeep,
  dayKey,
  isOverdue,
  makeTask,
  makeUser,
  rewardFor,
  startOfDay,
  todayStats,
  uid,
  zooMood,
} from './model.js';
import { CATALOGUE, demoTasks } from './data/seed.js';

const KEY = 'to-zoo:v1';
const SCHEMA = 2;

/** @typedef {import('./model.js').Task} Task */

const listeners = new Set();

/** @type {any} */
let state = load();

/* ----------------------------------------------------------- lifecycle --- */

function blank() {
  return {
    version: SCHEMA,
    user: makeUser({ name: 'You', tokens: 0 }),
    /** @type {Task[]} */
    tasks: [],

    /* --- v2: stock and world are separate ---------------------------------
       v1 kept one record per catalogue entry, which could not express two oak
       trees, a rotation, or an upgrade level. `inventory` is what you own;
       `placements` is where the copies stand. */

    /** @type {Record<string, {count: number, level: number}>} */
    inventory: {},
    /** @type {{uid: string, itemId: string, x: number, z: number, rot: number}[]} */
    placements: [],

    fenceStyle: 'starter',
    theme: 'safari',           // safari | tropical | mountain
    season: 'island',          // island | spring | summer | autumn | winter
    unlocked: { fences: ['starter'], themes: ['safari'], seasons: ['island', 'summer'] },

    /** The last local day upkeep was charged for. */
    upkeep: { lastDay: null },

    settings: {
      theme: 'system',         // system | light | dark
      motion: 'system',        // system | full | reduced
      graphics: 'smooth',      // smooth | retro
      skipRelease: false,      // remember the user's choice to skip the animation
      upkeepNotices: true,
      sound: false,
    },
    onboarded: false,
    lastSeen: Date.now(),
    /** The group zoo you are in, {id, name}, or null for your own zoo. */
    group: null,
    /** Your own tasks, parked while you are in a group zoo. */
    personalTasks: null,
  };
}

/**
 * Bring a v1 save forward.
 *
 * v1's `owned: { [id]: { placed } }` becomes one level-1 placement per owned
 * item. The only thing that genuinely must survive is the token balance —
 * losing someone's piggy bank because the schema changed would be
 * unforgivable, so it is copied first and never derived.
 */
function migrate(parsed, base) {
  // Species rename: sheep became rabbits. Runs on every load regardless of
  // schema version, because a v2 save written before the rename still holds
  // `animalType: 'sheep'` and those tasks would otherwise spawn nothing.
  if (Array.isArray(parsed.tasks)) {
    parsed.tasks = parsed.tasks.map((t) => (
      t?.animalType === 'sheep' ? { ...t, animalType: 'rabbit' } : t
    ));
  }

  // The island restyle: every save gets the Island season for free, and is
  // moved onto it once. After that, whatever the player picks sticks.
  const seasons = parsed.unlocked?.seasons;
  if (Array.isArray(seasons) && !seasons.includes('island')) {
    parsed.unlocked = { ...parsed.unlocked, seasons: ['island', ...seasons] };
    parsed.season = 'island';
  }

  if ((parsed.version ?? 1) >= SCHEMA) return parsed;

  const inventory = {};
  const placements = [];

  for (const [itemId, record] of Object.entries(parsed.owned ?? {})) {
    inventory[itemId] = { count: 1, level: 1 };
    if (record?.placed === false) continue;
    placements.push({
      uid: uid('place'),
      itemId,
      // v1 never stored a real position; the placement system will scatter
      // anything at 0,0 to a sensible spot on first load.
      x: record?.position?.x ?? 0,
      z: record?.position?.z ?? 0,
      rot: 0,
    });
  }

  return {
    ...parsed,
    version: SCHEMA,
    inventory,
    placements,
    fenceStyle: base.fenceStyle,
    theme: base.theme,
    season: base.season,
    unlocked: base.unlocked,
    upkeep: { lastDay: null },
    owned: undefined,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const base = blank();
    const parsed = migrate(JSON.parse(raw), base);
    // Shallow-merge against a fresh blank so a state written by an older
    // build gains new fields instead of throwing on read.
    return {
      ...base,
      ...parsed,
      user: { ...base.user, ...(parsed.user ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      unlocked: { ...base.unlocked, ...(parsed.unlocked ?? {}) },
      upkeep: { ...base.upkeep, ...(parsed.upkeep ?? {}) },
      inventory: parsed.inventory ?? {},
      placements: Array.isArray(parsed.placements) ? parsed.placements : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(makeTask) : [],
    };
  } catch (err) {
    console.warn('[to-zoo] could not read saved zoo, starting fresh', err);
    return blank();
  }
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
    } catch (err) {
      // Quota or private-mode. The app keeps working in memory; the user is
      // told once by main.js rather than on every keystroke.
      emitError('storage', err);
    }
  }, 120);
}

const errorListeners = new Set();
export const onError = (fn) => {
  errorListeners.add(fn);
  return () => errorListeners.delete(fn);
};
function emitError(kind, err) {
  for (const fn of errorListeners) fn(kind, err);
}

/* ------------------------------------------------------------ plumbing --- */

export const getState = () => state;

/**
 * @param {(state: any, change: {type: string, [k: string]: any}) => void} fn
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(change, mutate) {
  state = mutate({ ...state });
  persist();
  for (const fn of listeners) fn(state, change);
  return state;
}

/* ------------------------------------------------------------- selectors -- */

export const openTasks = (s = state) => s.tasks.filter((t) => !t.completed);
export const doneTasks = (s = state) => s.tasks.filter((t) => t.completed);
export const taskById = (id, s = state) => s.tasks.find((t) => t.id === id) ?? null;

/** The zoo's average mood. Named `mood`, not `health`, to keep the shift honest. */
export const mood = (s = state) => zooMood(s.tasks);

/** Catalogue entries decorated with what the user owns and has placed. */
export function shopItems(s = state) {
  return CATALOGUE.map((item) => {
    const stock = s.inventory[item.id];
    const placed = s.placements.filter((p) => p.itemId === item.id);
    return {
      ...item,
      owned: Boolean(stock?.count),
      count: stock?.count ?? 0,
      level: stock?.level ?? 1,
      placedCount: placed.length,
      /** Copies owned but not currently standing in the zoo. */
      spare: (stock?.count ?? 0) - placed.length,
      affordable: s.user.tokens >= item.cost,
    };
  });
}

export const ownedItems = (s = state) => shopItems(s).filter((i) => i.owned);

/** Placements joined to their catalogue entry, for the world builder. */
export function placedItems(s = state) {
  return s.placements
    .map((p) => {
      const item = CATALOGUE.find((i) => i.id === p.itemId);
      if (!item) return null;
      return { ...item, ...p, level: s.inventory[p.itemId]?.level ?? 1 };
    })
    .filter(Boolean);
}

/* --------------------------------------------------------------- tasks --- */

/** @returns {Task} the created task, so the caller can focus its animal */
export function addTask(input) {
  const by = state.group ? { name: state.user.name, avatar: state.user.avatar } : null;
  const task = makeTask({ ...input, order: Date.now(), by });
  commit({ type: 'task:add', task }, (s) => ({ ...s, tasks: [...s.tasks, task] }));
  return task;
}

export function updateTask(id, patch) {
  let updated = null;
  commit({ type: 'task:update', id }, (s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...patch, id: t.id, updatedAt: Date.now() };
      return updated;
    }),
  }));
  return updated;
}

export function deleteTask(id) {
  const task = taskById(id);
  commit({ type: 'task:delete', id, task }, (s) => ({
    ...s,
    tasks: s.tasks.filter((t) => t.id !== id),
  }));
  return task;
}

/**
 * Complete a task and pay for it.
 *
 * State is committed here and now — the release animation is cosmetic and
 * runs afterwards off the returned reward. That ordering is deliberate: a
 * user who closes the tab mid-animation still keeps their tokens.
 *
 * @returns {{task: Task, reward: {parts: {label: string, amount: number}[], total: number},
 *            moodBefore: number, moodAfter: number, streakUp: boolean} | null}
 */
export function completeTask(id, now = Date.now()) {
  const task = taskById(id);
  if (!task || task.completed) return null;

  const moodBefore = zooMood(state.tasks, now);
  const wasOverdue = isOverdue(task, now);
  const done = { ...task, completed: true, completedAt: now, updatedAt: now };
  const tasksAfter = state.tasks.map((t) => (t.id === id ? done : t));

  // Streak first, so the reward can quote the streak the user just extended.
  const key = dayKey(now);
  const user = { ...state.user };
  let streakUp = false;
  if (user.lastActiveDay !== key) {
    streakUp = true;
    user.streak = user.lastActiveDay === dayKey(now - DAY) ? user.streak + 1 : 1;
    user.lastActiveDay = key;
  }
  user.released += 1;

  const reward = rewardFor(done, tasksAfter, user, now);

  // Mark the daily-goal payout as spent for today if it was part of this reward.
  const stats = todayStats(tasksAfter, now);
  if (stats.completedToday >= DAILY_GOAL && user.lastGoalDay !== key) {
    user.lastGoalDay = key;
  }
  user.tokens += reward.total;

  commit(
    { type: 'task:complete', task: done, reward, wasOverdue },
    (s) => ({ ...s, tasks: tasksAfter, user }),
  );

  return {
    task: done,
    reward,
    moodBefore,
    moodAfter: zooMood(tasksAfter, now),
    streakUp,
  };
}

/** Undo, for the toast. Returns the tokens as well as the animal. */
export function uncompleteTask(id) {
  const task = taskById(id);
  if (!task || !task.completed) return null;
  const restored = { ...task, completed: false, completedAt: null, updatedAt: Date.now() };
  commit({ type: 'task:uncomplete', task: restored }, (s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? restored : t)),
    user: { ...s.user, released: Math.max(0, s.user.released - 1) },
  }));
  return restored;
}

/** Manual ordering from the Tasks view drag-and-drop. */
export function reorderTasks(orderedIds) {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  commit({ type: 'task:reorder' }, (s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      rank.has(t.id) ? { ...t, order: rank.get(t.id) } : t),
  }));
}

/* ------------------------------------------------- shop and inventory --- */

/**
 * Buy one copy. Buying the same thing twice is allowed and adds stock — the
 * inventory shows "Owned: 2" and both copies can stand in the zoo at once.
 *
 * @returns {boolean} false if they could not afford it
 */
export function buyItem(itemId) {
  const item = CATALOGUE.find((i) => i.id === itemId);
  if (!item) return false;
  if (state.user.tokens < item.cost) return false;

  commit({ type: 'shop:buy', item }, (s) => {
    const stock = s.inventory[itemId] ?? { count: 0, level: 1 };
    return {
      ...s,
      user: { ...s.user, tokens: s.user.tokens - item.cost },
      inventory: { ...s.inventory, [itemId]: { ...stock, count: stock.count + 1 } },
    };
  });
  return true;
}

/** Upgrade every copy of an item. Levels run 1..3. */
export function upgradeItem(itemId) {
  const item = CATALOGUE.find((i) => i.id === itemId);
  const stock = state.inventory[itemId];
  if (!item || !stock || stock.level >= 3) return false;

  const cost = upgradeCost(item, stock.level);
  if (state.user.tokens < cost) return false;

  commit({ type: 'shop:upgrade', itemId, level: stock.level + 1 }, (s) => ({
    ...s,
    user: { ...s.user, tokens: s.user.tokens - cost },
    inventory: { ...s.inventory, [itemId]: { ...stock, level: stock.level + 1 } },
  }));
  return true;
}

/** Rising curve, so levelling something up stays a real decision. */
export const upgradeCost = (item, level) => Math.round(item.cost * (0.6 + level * 0.5));

/** Stand a spare copy in the world. @returns {string | null} the placement uid */
export function placeItem(itemId, x, z, rot = 0) {
  const stock = state.inventory[itemId];
  if (!stock) return null;
  const placed = state.placements.filter((p) => p.itemId === itemId).length;
  if (placed >= stock.count) return null;      // nothing spare to place

  const entry = { uid: uid('place'), itemId, x, z, rot };
  commit({ type: 'world:place', entry }, (s) => ({
    ...s,
    placements: [...s.placements, entry],
  }));
  return entry.uid;
}

export function moveItem(placementUid, x, z, rot) {
  commit({ type: 'world:move', placementUid }, (s) => ({
    ...s,
    placements: s.placements.map((p) => (
      p.uid === placementUid ? { ...p, x, z, rot: rot ?? p.rot } : p
    )),
  }));
}

/** Back into the inventory — the copy is kept, just not standing anywhere. */
export function storeItem(placementUid) {
  commit({ type: 'world:store', placementUid }, (s) => ({
    ...s,
    placements: s.placements.filter((p) => p.uid !== placementUid),
  }));
}

/* --------------------------------------------------------- world style --- */

export function setFenceStyle(id) {
  commit({ type: 'world:fence', id }, (s) => ({ ...s, fenceStyle: id }));
}
export function setTheme(id) {
  commit({ type: 'world:theme', id }, (s) => ({ ...s, theme: id }));
}
export function setSeason(id) {
  commit({ type: 'world:season', id }, (s) => ({ ...s, season: id }));
}

/** @param {'fences'|'themes'|'seasons'} kind */
export function unlock(kind, id, cost) {
  if (state.unlocked[kind].includes(id)) return true;
  if (state.user.tokens < cost) return false;
  commit({ type: 'world:unlock', kind, id }, (s) => ({
    ...s,
    user: { ...s.user, tokens: s.user.tokens - cost },
    unlocked: { ...s.unlocked, [kind]: [...s.unlocked[kind], id] },
  }));
  return true;
}

/* -------------------------------------------------------------- upkeep --- */

/**
 * Charge for every whole day since we last charged.
 *
 * Two rules keep this from feeling like a punishment:
 *
 *   - Only *neglected* animals cost anything. A zoo of thirty fresh tasks
 *     settles to zero, every single day. Workload is never billed.
 *   - The piggy bank floors at zero. Upkeep can empty it, but it can never
 *     put the user in debt, and there is nothing to "pay back" later.
 *
 * Days away are charged in full, which is what the user asked for — so the
 * ledger this returns is shown to them on open rather than applied silently.
 *
 * @returns {{ledger: {taskId: string, title: string, animalType: string,
 *             amount: number}[], days: number, total: number, capped: boolean}}
 */
export function settleUpkeep(now = Date.now()) {
  const today = dayKey(now);
  const last = state.upkeep.lastDay;

  // First run just starts the clock — nobody is charged for the past.
  if (!last) {
    commit({ type: 'upkeep:init' }, (s) => ({ ...s, upkeep: { lastDay: today } }));
    return { ledger: [], days: 0, total: 0, capped: false };
  }
  if (last === today) return { ledger: [], days: 0, total: 0, capped: false };

  const elapsed = Math.max(
    0,
    Math.round((startOfDay(now) - startOfDay(new Date(`${last}T00:00:00`).getTime())) / DAY),
  );
  if (elapsed <= 0) return { ledger: [], days: 0, total: 0, capped: false };

  /** @type {Map<string, any>} */
  const perTask = new Map();
  let total = 0;

  // Walk each missed day and price the zoo as it stood *on that day*, so an
  // animal that only became restless yesterday is not billed for last week.
  for (let d = elapsed; d >= 1; d -= 1) {
    const when = startOfDay(now) - (d - 1) * DAY;
    for (const task of state.tasks) {
      if (task.completed) continue;
      const amount = dailyUpkeep(task, when);
      if (amount <= 0) continue;
      total += amount;
      const row = perTask.get(task.id) ?? {
        taskId: task.id, title: task.title, animalType: task.animalType, amount: 0,
      };
      row.amount += amount;
      perTask.set(task.id, row);
    }
  }

  const balance = state.user.tokens;
  const charged = Math.min(total, balance);
  const capped = total > balance;

  commit({ type: 'upkeep:settle', total: charged, days: elapsed }, (s) => ({
    ...s,
    user: { ...s.user, tokens: Math.max(0, s.user.tokens - total) },
    upkeep: { lastDay: today },
  }));

  return {
    ledger: [...perTask.values()].sort((a, b) => b.amount - a.amount),
    days: elapsed,
    total: charged,
    /** True when the bill was larger than the bank — the rest is forgiven. */
    capped,
  };
}

/* ------------------------------------------------------------- settings --- */

export function setSetting(key, value) {
  commit({ type: 'settings', key, value }, (s) => ({
    ...s,
    settings: { ...s.settings, [key]: value },
  }));
}

export function setUser(patch) {
  commit({ type: 'user', patch }, (s) => ({ ...s, user: { ...s.user, ...patch } }));
}

export function finishOnboarding() {
  commit({ type: 'onboarded' }, (s) => ({ ...s, onboarded: true }));
}

/** Fill the zoo with the demo set. Offered at the end of onboarding. */
export function loadDemo() {
  const tasks = demoTasks();
  commit({ type: 'demo' }, (s) => ({
    ...s,
    tasks: [...s.tasks, ...tasks],
    user: { ...s.user, tokens: Math.max(s.user.tokens, 180) },
  }));
  return tasks;
}

/** Back to a quiet zoo. Keeps tokens and purchases; only the animals go. */
export function clearTasks() {
  commit({ type: 'task:clear' }, (s) => ({ ...s, tasks: [] }));
}

/** Full reset, including the onboarding flag. */
export function resetEverything() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to do if storage is unavailable */ }
  state = blank();
  for (const fn of listeners) fn(state, { type: 'reset' });
}

/* ---------------------------------------------------------- group zoo --- */

/**
 * Step into a group zoo. Your own list is parked, untouched, and the group's
 * tasks take its place, so every view and the 3D world work unchanged.
 */
export function enterGroup(group, tasks = []) {
  commit({ type: 'group:enter', group }, (s) => ({
    ...s,
    personalTasks: s.group ? s.personalTasks : s.tasks,
    group: { id: group.id, name: group.name },
    tasks: tasks.map(makeTask),
  }));
}

/** Back to your own zoo, exactly as you left it. */
export function leaveGroup() {
  commit({ type: 'group:leave' }, (s) => ({
    ...s,
    group: null,
    tasks: s.personalTasks ?? s.tasks.filter((t) => !t.by),
    personalTasks: null,
  }));
}

/**
 * The group's tasks changed somewhere else. Newest edit wins per task; a
 * task missing from the remote list was deleted by someone.
 */
export function applyRemoteTasks(remote) {
  commit({ type: 'remote' }, (s) => {
    const mine = new Map(s.tasks.map((t) => [t.id, t]));
    const tasks = remote.map((r) => {
      const local = mine.get(r.id);
      return local && (local.updatedAt ?? 0) > (r.updatedAt ?? 0) ? local : makeTask(r);
    });
    return { ...s, tasks };
  });
}

/* ------------------------------------------------------ share snapshot --- */

/**
 * A compact, URL-safe summary of the zoo for the share link. Only counts and
 * a display name travel — never task titles, which are nobody else's business.
 */
export function shareCode(s = state) {
  const stats = todayStats(s.tasks);
  const payload = {
    n: s.user.name,
    a: s.user.avatar,
    c: doneTasks(s).length,
    r: s.user.released,
    t: s.user.tokens,
    h: zooMood(s.tasks),
    k: s.user.streak,
    o: stats.open,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function readShareCode(code) {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const p = JSON.parse(json);
    return {
      id: uid('shared'),
      name: String(p.n ?? 'A friend').slice(0, 40),
      avatar: String(p.a ?? '\u{1F33F}').slice(0, 4),
      completed: Number(p.c) || 0,
      released: Number(p.r) || 0,
      tokens: Number(p.t) || 0,
      health: Number(p.h) || 0,
      streak: Number(p.k) || 0,
      open: Number(p.o) || 0,
      shared: true,
    };
  } catch {
    return null;
  }
}
