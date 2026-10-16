/**
 * To-Zoo — the heads-up display.
 *
 * Answers the questions the dashboard has to answer at a glance: what I have,
 * which animal needs me, how the zoo is feeling, what it costs me, and how far
 * I have got today.
 *
 * The important discipline here is what the mood bar is *not*. It is the mean
 * mood of the animals, so it cannot fall just because there are more of them.
 * Nothing in this file may take the task count as an input to a "how bad is
 * it" number — that was v1's mistake and it is the whole reason for v2.
 */

import {
  ANIMAL_ORDER, ANIMALS, countByType, mood as moodOfTask, moodStage,
  mostNeglected, statusLine, todayStats, totalUpkeep, waitingLabel, zooMoodLabel,
} from '../model.js';
import { mood as zooMoodOf } from '../store.js';
import { mood as taskMood } from '../model.js';
import { reduced } from './motion.js';
import { avatarMark, glyph } from './icons.js';

const RING = 2 * Math.PI * 15.5;
const $ = (id) => document.getElementById(id);

/**
 * @param {{ onFocusTask?: (taskId: string) => void }} [handlers]
 */
export function createHud(handlers = {}) {
  const els = {
    status: $('status-line'),
    ring: $('ring-fill'),
    today: $('today'),
    todayCount: $('today-count'),
    todayGoal: $('today-goal'),
    tokens: $('tokens'),
    tokenValue: $('token-value'),
    piggyFill: $('piggy-fill'),
    avatar: $('avatar'),
    streak: $('streak-pip'),
    health: $('health'),
    healthWord: $('health-word'),
    healthPct: $('health-pct'),
    healthFill: $('health-fill'),
    healthLegend: $('health-legend'),
    neglect: $('neglect'),
    neglectEmoji: $('neglect-emoji'),
    neglectTitle: $('neglect-title'),
    neglectWait: $('neglect-wait'),
    navBadge: $('nav-badge'),
  };

  els.ring.style.strokeDasharray = String(RING);

  /** The task the callout currently names, so clicking it can fly there. */
  let neglectedId = null;

  els.neglect.addEventListener('click', () => {
    if (neglectedId) handlers.onFocusTask?.(neglectedId);
  });

  /** The number currently shown, which is not always the number owed. */
  let shownTokens = null;
  let countTimer = 0;

  function setTokens(target, { animate = true } = {}) {
    if (shownTokens === null || !animate || reduced()) {
      shownTokens = target;
      els.tokenValue.textContent = String(target);
      paintPiggy(target);
      return;
    }
    if (shownTokens === target) return;

    clearInterval(countTimer);
    const from = shownTokens;
    const delta = target - from;
    const steps = Math.min(18, Math.max(6, Math.abs(delta)));
    let i = 0;
    countTimer = setInterval(() => {
      i += 1;
      const t = i / steps;
      shownTokens = Math.round(from + delta * (1 - (1 - t) ** 3));
      els.tokenValue.textContent = String(shownTokens);
      paintPiggy(shownTokens);
      if (i >= steps) {
        clearInterval(countTimer);
        shownTokens = target;
        els.tokenValue.textContent = String(target);
        paintPiggy(target);
      }
    }, 34);
  }

  /** The piggy visibly fills. 500 tokens reads as full; it is a feeling, not a cap. */
  function paintPiggy(value) {
    const level = Math.max(0, Math.min(1, value / 500));
    els.piggyFill.style.height = `${Math.round(level * 100)}%`;
    els.tokens.dataset.level = level >= 0.999 ? 'full' : level > 0.05 ? 'some' : 'empty';
  }

  let sleeping = false;
  let lastState = null;

  const strip = document.getElementById('announce');
  const app = document.getElementById('app');
  strip?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('to-zoo:show', { detail: 'tasks' })));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /** "2 animals waiting since Tuesday" — the restless ones, by oldest. */
  function announce(open) {
    if (!strip) return;
    const restless = open.filter((t) => taskMood(t) < 35);
    let text = '';
    if (restless.length) {
      const oldest = Math.min(...restless.map((t) => t.createdAt));
      const days = (Date.now() - oldest) / 86400000;
      const since = days < 1 ? 'today' : days < 6.5 ? `since ${DAYS[new Date(oldest).getDay()]}`
        : `for ${Math.round(days)} days`;
      const n = restless.length;
      text = `${n === 1 ? 'One animal has' : `${n} animals have`} been waiting ${since}. Visit them \u2192`;
    }
    strip.hidden = !text;
    if (text && strip.textContent !== text) strip.textContent = text;
    app?.classList.toggle('has-announce', !!text);
  }

  return {
    /** At night the status line says so, whatever else is going on. */
    setSleeping(on) {
      sleeping = on;
      if (lastState) this.render(lastState);
    },

    /**
     * @param {any} state
     * @param {{ holdTokens?: boolean }} [opts]  hold the counter back while
     *        coins are still in the air, so the number lands with them
     */
    render(state, opts = {}) {
      lastState = state;
      const { tasks, user } = state;
      const open = tasks.filter((t) => !t.completed);
      const zooMood = zooMoodOf(state);
      const stats = todayStats(tasks);
      const label = zooMoodLabel(zooMood);

      // ── the one sentence ──
      const line = sleeping && open.length ? 'The zoo is sleeping. Zzz.' : statusLine(tasks, zooMood);
      if (els.status.textContent !== line) els.status.textContent = line;
      els.status.dataset.tone = sleeping ? '' : label.tone === 'overdue' ? 'overdue'
        : zooMood >= 85 ? 'thrive' : '';

      // ── the strip: one gentle nudge, only when there is something to say ──
      announce(open);

      // ── today ──
      els.todayCount.textContent = String(stats.completedToday);
      els.todayGoal.textContent = `/${stats.goal}`;
      els.ring.style.strokeDashoffset = String(RING * (1 - stats.progress));
      els.today.classList.toggle('is-met', stats.goalMet);
      els.today.title = stats.goalMet
        ? `Daily goal met with ${stats.completedToday} done today`
        : `${stats.completedToday} of ${stats.goal} completed today`;

      // ── the piggy bank ──
      if (!opts.holdTokens) setTokens(user.tokens);
      const drain = totalUpkeep(tasks);
      els.tokens.title = drain > 0
        ? `${user.tokens} tokens · ${drain}/day upkeep on neglected animals`
        : `${user.tokens} tokens · nothing is costing you anything`;

      // ── self ──
      els.avatar.innerHTML = avatarMark(user.name, user.avatar);
      els.streak.hidden = user.streak < 2;
      els.streak.textContent = `${user.streak}`;
      els.streak.title = `${user.streak}-day streak`;

      // ── zoo mood ──
      els.healthWord.textContent = label.word;
      els.healthPct.textContent = `${zooMood}%`;
      els.healthFill.style.width = `${zooMood}%`;
      els.health.dataset.tone = label.tone;

      const counts = countByType(tasks);
      els.healthLegend.innerHTML = ANIMAL_ORDER
        .filter((type) => counts[type] > 0)
        .map((type) => `<span title="${counts[type]} ${
          counts[type] === 1 ? ANIMALS[type].label.toLowerCase() : ANIMALS[type].plural.toLowerCase()
        }">${glyph(ANIMALS[type].emoji)} ${counts[type]}</span>`)
        .join('') || '<span>No animals waiting</span>';

      // ── who needs you ──
      // Named rather than counted: "that rabbit has been here two weeks" is a
      // thought someone can act on; "you have 14 tasks" is not.
      const worst = mostNeglected(tasks);
      if (worst) {
        neglectedId = worst.task.id;
        const spec = ANIMALS[worst.task.animalType];
        const stage = moodStage(worst.mood);
        els.neglect.hidden = false;
        els.neglect.dataset.stage = stage.key;
        els.neglectEmoji.innerHTML = glyph(spec.emoji);
        els.neglectTitle.textContent = worst.task.title;
        els.neglectWait.textContent = `${stage.label} · ${waitingLabel(worst.task)}`;
        els.neglect.setAttribute(
          'aria-label',
          `${spec.label}: ${worst.task.title}, ${stage.label}, ${waitingLabel(worst.task)}. Show me.`,
        );
      } else {
        neglectedId = null;
        els.neglect.hidden = true;
      }

      // ── overdue count on the Tasks tab ──
      els.navBadge.hidden = stats.overdue === 0;
      els.navBadge.textContent = String(stats.overdue);
      els.navBadge.title = `${stats.overdue} overdue`;

    },

    /** Called when flying coins land. */
    releaseTokens(state) { setTokens(state.user.tokens); },

    setTokensImmediately(value) { setTokens(value, { animate: false }); },
  };
}

/** Re-exported for the task panel's meter, so both use one source of truth. */
export { moodOfTask };
