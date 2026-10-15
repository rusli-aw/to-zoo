/**
 * To-Zoo — domain model.
 *
 * Pure functions only. Nothing here touches the DOM, the store, or Three.js,
 * which is what lets the 3D world and the 2D task list stay in agreement:
 * both ask these same functions what a task means.
 *
 * @typedef {"elephant" | "lion" | "rabbit"} AnimalType
 *
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} notes
 * @property {AnimalType} animalType
 * @property {string | null} dueDate     ISO date string, or null for someday
 * @property {boolean} completed
 * @property {number} createdAt          epoch ms
 * @property {number | null} completedAt epoch ms
 * @property {boolean} reminder
 * @property {number} order              manual sort position, low is first
 *
 * @typedef {object} User
 * @property {string} id
 * @property {string} name
 * @property {string} avatar             an emoji, kept simple on purpose
 * @property {number} tokens
 * @property {number} streak
 * @property {string | null} lastGoalDay day key the daily goal last paid out
 * @property {string | null} lastActiveDay
 * @property {number} released           lifetime animals released
 *
 * @typedef {object} Customization
 * @property {string} id
 * @property {string} name
 * @property {"ground" | "flora" | "water" | "structure" | "cosmetic"} type
 * @property {number} cost
 * @property {boolean} owned
 * @property {boolean} placed
 * @property {{x: number, z: number} | null} position
 */

export const DAY = 86400000;

/**
 * Everything that differs between the three species lives here, so adding a
 * fourth animal later is a data change rather than a hunt through the code.
 */
export const ANIMALS = {
  elephant: {
    type: 'elephant',
    label: 'Elephant',
    plural: 'Elephants',
    article: 'an',
    sizeWord: 'Major',
    tagline: 'The Elephant in the Room',
    hint: 'The thing you keep not doing.',
    emoji: '\u{1F418}',
    tokens: 25,
    scale: 1,
    speed: 0.55,
    /** Days from creation to a mood of zero, if never touched. */
    patienceDays: 16,
    /** Tokens per day once neglected — scaled by mood, never by animal count. */
    upkeep: 5,
  },
  lion: {
    type: 'lion',
    label: 'Lion',
    plural: 'Lions',
    article: 'a',
    sizeWord: 'Medium',
    tagline: 'Important but manageable',
    hint: 'Worth tackling today.',
    emoji: '\u{1F981}',
    tokens: 15,
    scale: 0.62,
    speed: 0.85,
    patienceDays: 12,
    upkeep: 3,
  },
  rabbit: {
    type: 'rabbit',
    label: 'Rabbit',
    plural: 'Rabbits',
    article: 'a',
    sizeWord: 'Small',
    tagline: 'Quick win',
    hint: 'Two minutes, tops.',
    emoji: '\u{1F407}',
    tokens: 8,
    scale: 0.4,
    speed: 1.1,
    patienceDays: 8,
    upkeep: 1,
  },
};

/** Display order everywhere: biggest first, because that is the priority order. */
export const ANIMAL_ORDER = /** @type {AnimalType[]} */ (['elephant', 'lion', 'rabbit']);

export const DAILY_GOAL = 3;
export const OVERDUE_BONUS = 5;
export const DAILY_GOAL_BONUS = 10;

/* ---------------------------------------------------------------- time --- */

export const startOfDay = (t = Date.now()) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Stable local-day key, used for streaks and "completed today". */
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Whole days from today to a due date. Negative means overdue. */
export function daysUntil(dueDate, now = Date.now()) {
  if (!dueDate) return null;
  const due = startOfDay(new Date(dueDate).getTime());
  return Math.round((due - startOfDay(now)) / DAY);
}

export const ageDays = (task, now = Date.now()) =>
  Math.max(0, (now - task.createdAt) / DAY);

export function isOverdue(task, now = Date.now()) {
  if (task.completed || !task.dueDate) return false;
  const d = daysUntil(task.dueDate, now);
  return d !== null && d < 0;
}

/**
 * Human due label. Deliberately short — it has to fit on a floating 3D
 * name tag as well as in a task card.
 */
export function dueLabel(task, now = Date.now()) {
  const d = daysUntil(task.dueDate, now);
  if (d === null) return 'Someday';
  if (d < -1) return `${Math.abs(d)} days overdue`;
  if (d === -1) return 'Overdue by a day';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return `Due in ${d} days`;
  if (d < 14) return 'Due next week';
  return new Date(task.dueDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/* ------------------------------------------------------------- urgency --- */

/**
 * How loudly this task should ask for attention, 0..1.
 *
 * Drives three things at once: the animal's animation energy, the amount of
 * mess around it, and how prominent its card is. Keeping it one number is
 * what stops those three from drifting out of sync.
 */
export function urgency(task, now = Date.now()) {
  if (task.completed) return 0;
  const d = daysUntil(task.dueDate, now);
  let u;
  if (d === null) {
    // No deadline: builds very slowly, so a someday task never shouts.
    u = 0.1 + Math.min(0.25, ageDays(task, now) * 0.012);
  } else if (d < 0) {
    u = Math.min(1, 0.82 + Math.abs(d) * 0.06);
  } else if (d === 0) {
    u = 0.78;
  } else if (d === 1) {
    u = 0.6;
  } else if (d <= 3) {
    u = 0.44;
  } else if (d <= 7) {
    u = 0.28;
  } else {
    u = 0.15;
  }
  // A neglected elephant is more urgent than a neglected rabbit.
  const weight = task.animalType === 'elephant' ? 1.12
    : task.animalType === 'lion' ? 1 : 0.88;
  return Math.max(0, Math.min(1, u * weight));
}

/** Coarse band, for anything that needs a class name rather than a number. */
export function urgencyBand(task, now = Date.now()) {
  if (isOverdue(task, now)) return 'overdue';
  const d = daysUntil(task.dueDate, now);
  if (d !== null && d <= 1) return 'soon';
  if (d !== null && d <= 3) return 'near';
  return 'calm';
}

/* -------------------------------------------------------------- mood --- */

/**
 * The heart of the product, and the thing v1 had backwards.
 *
 * Mood belongs to one animal and is driven by how long *that task* has been
 * waiting. It is deliberately not a function of how many other animals exist:
 * a zoo of thirty fresh tasks is a thriving zoo, and nothing in this file may
 * say otherwise. Animal count is workload. Animal age is neglect. Only the
 * second one is a problem.
 *
 * A missed deadline accelerates the decay — a task you promised to do
 * yesterday is being neglected faster than one with no date at all — but it is
 * a multiplier on age, never a substitute for it.
 *
 * @returns {number} 0..100
 */
export function mood(task, now = Date.now()) {
  if (task.completed) return 100;

  const spec = ANIMALS[task.animalType];
  const age = ageDays(task, now);

  // Overdue animals age faster, up to twice as fast once a week past due.
  const late = daysUntil(task.dueDate, now);
  const impatience = late !== null && late < 0
    ? 1 + Math.min(1, Math.abs(late) / 7)
    : 1;

  const spent = Math.min(1, Math.max(0, (age * impatience) / spec.patienceDays));

  // Eased rather than linear, so the first day barely registers. This is what
  // makes the grace period feel generous instead of merely stated.
  return Math.round(100 - (spent ** 0.85) * 100);
}

/**
 * The five stages, with the copy each one speaks in. Playful on purpose: the
 * animal is impatient to leave, never unwell, and never the user's victim.
 */
export const MOOD_STAGES = [
  {
    key: 'fresh', min: 80, label: 'Happy', emoji: '\u{1F60A}', upkeepFactor: 0,
    quips: {
      elephant: 'Ready for an adventure!',
      lion: 'Feeling rather magnificent.',
      rabbit: 'Everything is lovely.',
    },
  },
  {
    key: 'waiting', min: 60, label: 'Waiting', emoji: '\u{1F642}', upkeepFactor: 0,
    quips: {
      elephant: 'Happy to wait. For now.',
      lion: 'Keeping one eye on the gate.',
      rabbit: 'Still very patient.',
    },
  },
  {
    key: 'restless', min: 35, label: 'Restless', emoji: '\u{1F610}', upkeepFactor: 0.4,
    quips: {
      elephant: 'Has started pacing a little.',
      lion: 'Bored of this particular rock.',
      rabbit: 'Keeps glancing at the gate.',
    },
  },
  {
    key: 'impatient', min: 15, label: 'Impatient', emoji: '\u{1F61F}', upkeepFactor: 0.7,
    quips: {
      elephant: 'Waiting by the gate. Pointedly.',
      lion: 'Yawning at you, specifically.',
      rabbit: 'Thumping. Repeatedly.',
    },
  },
  {
    key: 'desperate', min: 0, label: 'Desperate', emoji: '\u{1F62D}', upkeepFactor: 1,
    quips: {
      elephant: 'He would really like to go now.',
      lion: 'Flopped over. Utterly done.',
      rabbit: 'Flopped over. Ears down. Done.',
    },
  },
];

/** @param {number} value 0..100 */
export function moodStage(value) {
  return MOOD_STAGES.find((stage) => value >= stage.min)
    ?? MOOD_STAGES[MOOD_STAGES.length - 1];
}

export const moodOf = (task, now = Date.now()) => moodStage(mood(task, now));

/** The stage's line, in this species' voice. */
export const moodQuip = (task, now = Date.now()) =>
  moodOf(task, now).quips[task.animalType];

/** How long this animal has been waiting, phrased for a status line. */
export function waitingLabel(task, now = Date.now()) {
  const days = Math.floor(ageDays(task, now));
  if (days === 0) return 'arrived today';
  if (days === 1) return 'waiting 1 day';
  return `waiting ${days} days`;
}

/* ------------------------------------------------------------ upkeep --- */

/** No animal costs anything for its first two days, whatever its mood. */
export const GRACE_DAYS = 2;

/**
 * What this animal costs per day *today*.
 *
 * Zero for anything fresh, waiting, or still inside its grace period — which
 * is the whole point. You are never charged for having tasks, only for letting
 * one sit. Elephants cost most because they represent the biggest commitment.
 */
export function dailyUpkeep(task, now = Date.now()) {
  if (task.completed) return 0;
  if (ageDays(task, now) < GRACE_DAYS) return 0;
  const spec = ANIMALS[task.animalType];
  return Math.round(spec.upkeep * moodOf(task, now).upkeepFactor);
}

/** Total daily drain across the zoo, for the piggy bank's forecast. */
export const totalUpkeep = (tasks, now = Date.now()) =>
  tasks.reduce((sum, task) => sum + dailyUpkeep(task, now), 0);

/* ---------------------------------------------------------- zoo mood --- */

/**
 * The headline number, replacing v1's zooHealth.
 *
 * It is a *mean*, not a sum, and that single difference is the entire
 * redesign: adding a fresh animal to a happy zoo cannot drag this down, but
 * letting one animal sit for a fortnight will.
 */
export function zooMood(tasks, now = Date.now()) {
  const open = tasks.filter((t) => !t.completed);
  if (open.length === 0) return 100;
  const total = open.reduce((sum, task) => sum + mood(task, now), 0);
  return Math.round(total / open.length);
}

export function zooMoodLabel(value) {
  if (value >= 85) return { word: 'Thriving', tone: 'thrive' };
  if (value >= 65) return { word: 'Content', tone: 'thrive' };
  if (value >= 45) return { word: 'Getting restless', tone: 'caution' };
  if (value >= 25) return { word: 'Impatient', tone: 'caution' };
  return { word: 'Needs you', tone: 'overdue' };
}

/**
 * The single animal that has been waiting longest — the one the HUD names.
 * Returns null while everything is still happy, so the callout only appears
 * when there is genuinely something to point at.
 */
export function mostNeglected(tasks, now = Date.now()) {
  const open = tasks.filter((t) => !t.completed);
  if (open.length === 0) return null;

  let worst = open[0];
  let worstMood = mood(worst, now);
  for (const task of open.slice(1)) {
    const value = mood(task, now);
    if (value < worstMood) { worst = task; worstMood = value; }
  }
  return worstMood >= 80 ? null : { task: worst, mood: worstMood };
}

/* --------------------------------------------------------------- stats --- */

export function todayStats(tasks, now = Date.now()) {
  const key = dayKey(now);
  const completedToday = tasks.filter(
    (t) => t.completed && t.completedAt && dayKey(t.completedAt) === key,
  ).length;
  const open = tasks.filter((t) => !t.completed);
  const dueToday = open.filter((t) => daysUntil(t.dueDate, now) === 0).length;
  const overdue = open.filter((t) => isOverdue(t, now)).length;
  return {
    completedToday,
    dueToday,
    overdue,
    open: open.length,
    goal: DAILY_GOAL,
    goalMet: completedToday >= DAILY_GOAL,
    progress: Math.min(1, completedToday / DAILY_GOAL),
  };
}

export const countByType = (tasks) => {
  const out = { elephant: 0, lion: 0, rabbit: 0 };
  for (const t of tasks) if (!t.completed) out[t.animalType] += 1;
  return out;
};

/**
 * The line under the wordmark. It is the app's only voice, so it answers
 * "what should I do next" rather than reporting a number back at the user.
 *
 * It must never scold anyone for the size of their zoo. A busy zoo full of
 * happy animals gets told it is thriving, however many animals that is; the
 * line only turns pointed when a specific animal has been left waiting.
 */
export function statusLine(tasks, zooMoodValue, now = Date.now()) {
  const open = tasks.filter((t) => !t.completed);
  if (open.length === 0) return 'Your zoo is wonderfully quiet';

  const neglected = mostNeglected(tasks, now);
  if (neglected) {
    const stage = moodStage(neglected.mood);
    const spec = ANIMALS[neglected.task.animalType];
    if (stage.key === 'desperate') {
      return spec.type === 'elephant'
        ? 'The elephant in the room would really like to go now…'
        : `A ${spec.label.toLowerCase()} has been waiting a very long time…`;
    }
    if (stage.key === 'impatient') {
      return `Your ${spec.label.toLowerCase()} is waiting by the gate`;
    }
    if (stage.key === 'restless') {
      const restless = open.filter((t) => mood(t, now) < 60).length;
      return restless === 1
        ? '1 animal is getting restless'
        : `${restless} animals are getting restless`;
    }
  }

  const dueToday = open.filter((t) => daysUntil(t.dueDate, now) === 0);
  if (dueToday.length) {
    return dueToday.length === 1
      ? '1 animal needs you today'
      : `${dueToday.length} animals need you today`;
  }

  // Everything is happy — so say so, and say it louder the fuller the zoo is.
  if (zooMoodValue >= 85) {
    if (open.length >= 12) return `A thriving zoo of ${open.length} happy animals`;
    if (open.length >= 5) return 'Your zoo is thriving';
    return 'Your zoo is thriving';
  }
  return `${open.length} animals are settled in`;
}

/* ------------------------------------------------------------ factories --- */

let idSeed = 0;
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${(idSeed++).toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

/** @returns {Task} */
export function makeTask(input = {}) {
  const now = Date.now();
  return {
    id: input.id ?? uid('task'),
    title: (input.title ?? '').trim() || 'Untitled task',
    notes: input.notes ?? '',
    animalType: ANIMALS[input.animalType] ? input.animalType : 'rabbit',
    dueDate: input.dueDate ?? null,
    completed: input.completed ?? false,
    createdAt: input.createdAt ?? now,
    completedAt: input.completedAt ?? null,
    reminder: input.reminder ?? false,
    order: input.order ?? now,
    /** Group zoos: who added it ({name, avatar}), and when it last changed. */
    by: input.by ?? null,
    updatedAt: input.updatedAt ?? now,
  };
}

/** @returns {User} */
export function makeUser(input = {}) {
  return {
    id: input.id ?? uid('user'),
    name: input.name ?? 'You',
    avatar: input.avatar ?? 'default',
    tokens: input.tokens ?? 0,
    streak: input.streak ?? 0,
    lastGoalDay: input.lastGoalDay ?? null,
    lastActiveDay: input.lastActiveDay ?? null,
    released: input.released ?? 0,
  };
}

/**
 * What a completed task is worth, broken out so the reward toast can show
 * the reasoning rather than a single opaque number.
 *
 * `user` must already carry the streak this completion earned — the store
 * updates the streak first, precisely so the bonus can name it correctly.
 * `task` must be the completed copy, and `tasksAfter` the list including it.
 */
export function rewardFor(task, tasksAfter, user, now = Date.now()) {
  const spec = ANIMALS[task.animalType];
  const parts = [{
    label: `Released ${spec.article} ${spec.label.toLowerCase()}`,
    amount: spec.tokens,
  }];

  // isOverdue() short-circuits on completed tasks, so ask the dates directly.
  const days = daysUntil(task.dueDate, now);
  if (days !== null && days < 0) {
    parts.push({ label: 'Cleared an overdue task', amount: OVERDUE_BONUS });
  }

  const stats = todayStats(tasksAfter, now);
  const key = dayKey(now);
  if (stats.completedToday >= DAILY_GOAL && user.lastGoalDay !== key) {
    parts.push({ label: 'Daily goal', amount: DAILY_GOAL_BONUS });
    if (user.streak > 1) {
      parts.push({
        label: `${user.streak}-day streak`,
        amount: Math.min(25, user.streak * 2),
      });
    }
  }

  return { parts, total: parts.reduce((sum, p) => sum + p.amount, 0) };
}
