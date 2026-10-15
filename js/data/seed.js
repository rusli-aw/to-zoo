/**
 * To-Zoo — seed data.
 *
 * Everything a real backend would eventually own lives behind this one module:
 * the shop catalogue, the friend list, and the optional demo zoo. Views import
 * from here rather than hard-coding, so swapping in a fetch() later touches
 * this file and nothing else.
 */

import { DAY, makeTask } from '../model.js';

/**
 * Shop catalogue. `build` is the key decorations.js switches on to construct
 * geometry; `slot` decides where in the world it is allowed to land.
 *
 * Prices are tuned against the token curve: a rabbit is 8, an elephant 25, so
 * a 60-token meadow is roughly a good morning's work and the 320-token
 * waterfall is something to save toward.
 */
export const CATALOGUE = [
  // --- ground -------------------------------------------------------------
  {
    id: 'meadow', name: 'Wildflower meadow', type: 'ground', cost: 60,
    build: 'meadow', slot: 'ground',
    blurb: 'Scatters ox-eye and poppy through the grass.',
  },
  {
    id: 'stone-path', name: 'Stone path', type: 'ground', cost: 80,
    build: 'stonePath', slot: 'path',
    blurb: 'Flat river stones from the gate to the watering hole.',
  },
  {
    id: 'termite-mounds', name: 'Termite mounds', type: 'ground', cost: 70,
    build: 'termiteMounds', slot: 'ground',
    blurb: 'Little red spires. The rabbit like to lean on them.',
  },

  // --- flora --------------------------------------------------------------
  {
    id: 'acacia', name: 'Acacia grove', type: 'flora', cost: 90,
    build: 'acacia', slot: 'ground',
    blurb: 'Three flat-topped acacias for afternoon shade.',
  },
  {
    id: 'baobab', name: 'Old baobab', type: 'flora', cost: 140,
    build: 'baobab', slot: 'landmark',
    blurb: 'A fat, ancient trunk that anchors the whole view.',
  },
  {
    id: 'fever-trees', name: 'Fever trees', type: 'flora', cost: 110,
    build: 'feverTrees', slot: 'ground',
    blurb: 'Pale green bark, the colour of a good morning.',
  },

  // --- water --------------------------------------------------------------
  {
    id: 'watering-hole', name: 'Watering hole', type: 'water', cost: 160,
    build: 'wateringHole', slot: 'landmark',
    blurb: 'Animals wander over for a drink between idles.',
  },
  {
    id: 'stream', name: 'Winding stream', type: 'water', cost: 200,
    build: 'stream', slot: 'path',
    blurb: 'Cuts across the enclosure and catches the light.',
  },
  {
    id: 'waterfall', name: 'Waterfall', type: 'water', cost: 320,
    build: 'waterfall', slot: 'landmark',
    blurb: 'Falls off the back ridge into a pool of its own.',
  },

  // --- structures ---------------------------------------------------------
  {
    id: 'observation-deck', name: 'Observation deck', type: 'structure', cost: 280,
    build: 'observationDeck', slot: 'landmark',
    blurb: 'Raised timber platform with a very small ladder.',
  },
  {
    id: 'ranger-station', name: 'Ranger station', type: 'structure', cost: 240,
    build: 'rangerStation', slot: 'landmark',
    blurb: 'Someone has to file the paperwork around here.',
  },
  {
    id: 'wooden-bridge', name: 'Wooden bridge', type: 'structure', cost: 180,
    build: 'woodenBridge', slot: 'path',
    blurb: 'Rope handrails that sway a beat behind the grass.',
  },
  {
    id: 'campsite', name: 'Campsite', type: 'structure', cost: 220,
    build: 'campsite', slot: 'ground',
    blurb: 'Canvas tent, cold fire pit, two folding chairs.',
  },
  {
    id: 'safari-jeep', name: 'Safari jeep', type: 'structure', cost: 200,
    build: 'safariJeep', slot: 'path',
    blurb: 'Parked by the gate with the roof hatch open.',
  },

  // --- cosmetics ----------------------------------------------------------
  {
    id: 'sun-hats', name: 'Straw hat', type: 'cosmetic', cost: 70,
    build: 'sunHats', slot: 'animal',
    blurb: 'Perfect accessory to become the King of The Pirates.',
  },
  {
    id: 'sunglasses', name: 'Sunglasses', type: 'cosmetic', cost: 85,
    build: 'sunglasses', slot: 'animal',
    blurb: 'Dark round lenses. Instantly unbothered.',
  },
  {
    id: 'udeng', name: 'Balinese udeng', type: 'cosmetic', cost: 130,
    build: 'udeng', slot: 'animal',
    blurb: 'Folded cloth with a gold thread, knotted at the brow.',
  },
  {
    id: 'flower-crowns', name: 'Flower crown', type: 'cosmetic', cost: 90,
    build: 'flowerCrowns', slot: 'animal',
    blurb: 'Woven blooms behind the ears.',
  },
  {
    id: 'lanterns', name: 'String lanterns', type: 'cosmetic', cost: 120,
    build: 'lanterns', slot: 'landmark',
    blurb: 'Warm bulbs strung between posts. Best at dusk.',
  },
  {
    id: 'butterflies', name: 'Butterflies', type: 'cosmetic', cost: 110,
    build: 'butterflies', slot: 'ambient',
    blurb: 'They loop lazily around whatever is nearest.',
  },
  {
    id: 'fireflies', name: 'Fireflies', type: 'cosmetic', cost: 130,
    build: 'fireflies', slot: 'ambient',
    blurb: 'Only come out when your zoo is thriving.',
  },
];

export const CATEGORIES = [
  { id: 'ground', label: 'Ground' },
  { id: 'flora', label: 'Plants' },
  { id: 'water', label: 'Water' },
  { id: 'structure', label: 'Structures' },
  { id: 'cosmetic', label: 'Cosmetics' },
];

/**
 * Mock friends. Framed to be encouraging rather than competitive — the copy
 * in friendsView compares in whichever direction is kind.
 */
export const FRIENDS = [
  {
    id: 'f_alex', name: 'Alex Moreno', avatar: '\u{1F98A}',
    completed: 14, released: 12, tokens: 320, health: 87, streak: 5,
    lastActive: 'Released a lion this morning',
  },
  {
    id: 'f_priya', name: 'Priya Raman', avatar: '\u{1F99C}',
    completed: 23, released: 21, tokens: 145, health: 94, streak: 11,
    lastActive: 'Cleared every elephant this week',
  },
  {
    id: 'f_tomas', name: 'Tomás Ferreira', avatar: '\u{1F422}',
    completed: 6, released: 5, tokens: 410, health: 52, streak: 1,
    lastActive: 'Bought a waterfall instead of doing the essay',
  },
  {
    id: 'f_yuki', name: 'Yuki Tanaka', avatar: '\u{1F41D}',
    completed: 19, released: 18, tokens: 88, health: 78, streak: 7,
    lastActive: 'On a 7-day streak',
  },
];

/**
 * The optional demo zoo. Offered at the end of onboarding for anyone who
 * wants to see a populated world before committing their own tasks to it.
 * Deliberately includes one overdue elephant so the urgency treatment and
 * the messiness system are both visible on the first screen.
 */
export function demoTasks(now = Date.now()) {
  return [
    makeTask({
      title: 'Finish economics essay',
      notes: '2,000 words on price elasticity. Intro is written, the rest is not.',
      animalType: 'elephant',
      dueDate: isoAt(now, -2),
      createdAt: now - 9 * DAY,
    }),
    makeTask({
      title: 'Prepare consulting case interview',
      notes: 'Two market-sizing drills and one profitability case.',
      animalType: 'elephant',
      dueDate: isoAt(now, 3),
      createdAt: now - 4 * DAY,
    }),
    makeTask({
      title: 'Reply to internship email',
      animalType: 'lion',
      dueDate: isoAt(now, 1),
      createdAt: now - 2 * DAY,
    }),
    makeTask({
      title: 'Book flights home for winter',
      animalType: 'lion',
      dueDate: isoAt(now, 6),
      createdAt: now - 1 * DAY,
    }),
    makeTask({
      title: 'Organise downloads folder',
      animalType: 'rabbit',
      dueDate: null,
      createdAt: now - 12 * DAY,
    }),
    makeTask({
      title: 'Water the monstera',
      animalType: 'rabbit',
      dueDate: isoAt(now, 0),
      createdAt: now - 3 * DAY,
    }),
  ];
}

function isoAt(now, dayOffset) {
  const d = new Date(now + dayOffset * DAY);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
