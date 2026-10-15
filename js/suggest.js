/**
 * To-Zoo — "which animal is this?"
 *
 * Task entry has to be fast, so the quick-add box tries to answer both
 * questions the user would otherwise have to answer by hand: how big is this,
 * and when is it due. It reads the title, guesses, and shows its reasoning so
 * the guess is correctable rather than magic.
 *
 * Everything here is a heuristic on purpose. It is allowed to be wrong; it is
 * not allowed to be silent about why it said what it said.
 */

import { ANIMALS, DAY, startOfDay } from './model.js';

/** Words that imply weight. Scores are additive and deliberately blunt. */
const WEIGHT_WORDS = [
  // heavy
  [2.4, /\b(dissertation|thesis|finals?|exam|coursework|essay)\b/i],
  [2.2, /\b(presentation|pitch|deck|report|proposal|application)\b/i],
  [2.0, /\b(project|assignment|submission|submit|deadline)\b/i],
  [1.8, /\b(revise|revision|study|prepare|research|write|draft)\b/i],
  [1.6, /\b(interview|assessment|portfolio|cv|resume)\b/i],
  // middling
  [1.2, /\b(email|reply|respond|call|meeting|book|schedule|arrange)\b/i],
  [1.1, /\b(review|read|plan|update|fix|check|follow[\s-]?up)\b/i],
  [1.0, /\b(apply|register|sign\s?up|renew|pay|invoice)\b/i],
  // light
  [0.4, /\b(organi[sz]e|tidy|clean|sort|rename|delete|archive|backup)\b/i],
  [0.4, /\b(buy|order|grab|pick\s?up|water|print|scan|download)\b/i],
  [0.3, /\b(text|message|remind|note|bookmark)\b/i],
];

const INTENSIFIERS = /\b(urgent|asap|important|critical|final|major|big)\b/i;
const DIMINISHERS = /\b(quick|small|tiny|minor|little|just|simple)\b/i;

/* ----------------------------------------------------------- dates --- */

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/**
 * Pull a date out of the title if one is sitting there in plain English.
 * Returns the date plus the exact text it matched, so the caller can strip
 * that text from the saved title.
 *
 * @returns {{ date: Date, matched: string, phrase: string } | null}
 */
export function parseDate(text, now = Date.now()) {
  const t = text.toLowerCase();

  const at = (days) => new Date(startOfDay(now) + days * DAY);

  let m = t.match(/\b(today|tonight|this evening)\b/);
  if (m) return { date: at(0), matched: m[0], phrase: 'today' };

  m = t.match(/\btomorrow\b/);
  if (m) return { date: at(1), matched: m[0], phrase: 'tomorrow' };

  m = t.match(/\bday after tomorrow\b/);
  if (m) return { date: at(2), matched: m[0], phrase: 'in 2 days' };

  m = t.match(/\bin (\d{1,2}) (day|days|week|weeks)\b/);
  if (m) {
    const n = Number(m[1]) * (m[2].startsWith('week') ? 7 : 1);
    return { date: at(n), matched: m[0], phrase: `in ${n} days` };
  }

  m = t.match(/\bnext (week|month)\b/);
  if (m) {
    const n = m[1] === 'week' ? 7 : 30;
    return { date: at(n), matched: m[0], phrase: `next ${m[1]}` };
  }

  m = t.match(/\b(this |next |on |by )?(sun|mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?)(day)?\b/);
  if (m) {
    const stem = m[2];
    const index = WEEKDAYS.findIndex((d) => d.startsWith(stem.replace(/s$/, '')));
    if (index >= 0) {
      const today = new Date(now).getDay();
      let delta = (index - today + 7) % 7;
      if (delta === 0) delta = 7;                       // "friday" on a Friday means the next one
      if (m[1] && m[1].trim() === 'next') delta += 7;
      return { date: at(delta), matched: m[0], phrase: `on ${WEEKDAYS[index]}` };
    }
  }

  m = t.match(/\b(end of (the )?(week|month))\b/);
  if (m) {
    if (m[3] === 'week') {
      const today = new Date(now).getDay();
      return { date: at((5 - today + 7) % 7 || 5), matched: m[0], phrase: 'end of week' };
    }
    const d = new Date(now);
    return {
      date: new Date(d.getFullYear(), d.getMonth() + 1, 0),
      matched: m[0],
      phrase: 'end of month',
    };
  }

  return null;
}

/** ISO yyyy-mm-dd in local time, which is what <input type="date"> expects. */
export function toDateInput(date) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ------------------------------------------------------- suggestion --- */

/**
 * Suggest an animal for a task in progress.
 *
 * @param {string} title
 * @param {string | null} dueDate   an explicitly chosen date, if any
 * @returns {{ animalType: import('./model.js').AnimalType,
 *             confident: boolean,
 *             reason: string,
 *             date: { date: Date, matched: string, phrase: string } | null }}
 */
export function suggestAnimal(title, dueDate = null, now = Date.now()) {
  const text = (title || '').trim();
  const found = parseDate(text, now);

  if (!text) {
    return { animalType: 'rabbit', confident: false, reason: '', date: null };
  }

  let score = 0.9;
  let because = '';

  for (const [weight, re] of WEIGHT_WORDS) {
    const m = text.match(re);
    if (m) {
      score = Math.max(score, weight);
      if (weight >= 1.6 || weight <= 0.4) because = `"${m[0].toLowerCase()}"`;
      break;
    }
  }

  const intensifier = text.match(INTENSIFIERS);
  if (intensifier) {
    score += 0.7;
    because = `"${intensifier[0].toLowerCase()}"`;
  }
  const diminisher = text.match(DIMINISHERS);
  if (diminisher) {
    score -= 0.6;
    because = `"${diminisher[0].toLowerCase()}"`;
  }

  // A near deadline makes anything heavier, whichever way it was written.
  const effective = dueDate ? new Date(dueDate) : found?.date ?? null;
  let deadlineNote = '';
  if (effective) {
    const days = Math.round((startOfDay(effective.getTime()) - startOfDay(now)) / DAY);
    if (days <= 0) {
      score += 1.1;
      deadlineNote = 'due today';
    } else if (days === 1) {
      score += 0.9;
      deadlineNote = 'due tomorrow';
    } else if (days <= 3) {
      score += 0.5;
      deadlineNote = 'due this week';
    } else if (days > 14) {
      score -= 0.2;
    }
  }

  // Long titles tend to describe involved work.
  if (text.split(/\s+/).length >= 8) score += 0.3;

  const animalType = score >= 2.3 ? 'elephant' : score >= 1.35 ? 'lion' : 'rabbit';
  const spec = ANIMALS[animalType];

  let reason;
  if (because && deadlineNote) reason = `${because} and ${deadlineNote}`;
  else if (because) reason = because;
  else if (deadlineNote) reason = deadlineNote;
  else reason = 'no deadline pressure';

  return {
    animalType,
    confident: Math.abs(score - 2.3) > 0.35 && Math.abs(score - 1.35) > 0.35,
    reason: `${spec.label} — ${reason}`,
    date: found,
  };
}

/** Remove the date phrase the parser consumed, so titles stay clean. */
export function stripDatePhrase(title, matched) {
  if (!matched) return title.trim();
  return title
    .replace(new RegExp(`\\b${matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[\s,]+$/, '')
    .trim();
}
