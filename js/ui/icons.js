/**
 * To-Zoo — icons.
 *
 * The interface uses no emoji. Everything that used to be one is drawn here
 * as a single-weight line icon on a 24px grid, stroked in currentColor so it
 * takes whatever colour its text would have had.
 *
 * The data layer still carries its old emoji fields (saves, the seed
 * catalogue and the model all have them), so `glyph()` translates an emoji
 * into the matching icon at the point of rendering. That keeps one mapping
 * in one file instead of touching every record.
 */

const dot = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r=".9" fill="currentColor" stroke="none"/>`;
const face = (mouth, extra = '') => `<circle cx="12" cy="12" r="9"/>${dot(9, 10)}${dot(15, 10)}<path d="${mouth}"/>${extra}`;

const ICONS = {
  // animals
  elephant: `<path d="M7.5 6.6A3.6 3.6 0 1 0 6 13.4M16.5 6.6a3.6 3.6 0 1 1 1.5 6.8"/><circle cx="12" cy="10" r="5"/><path d="M12 15v2.5a2 2 0 0 0 3.2 1.6"/>${dot(10, 9)}${dot(14, 9)}`,
  lion: `<circle cx="12" cy="12" r="9" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="5.4"/>${dot(10, 11)}${dot(14, 11)}<path d="M11 13.6h2l-1 1z"/>`,
  rabbit: `<path d="M10 9.6C8.6 6.4 8.8 2.6 10.2 2.6s2 3.8 1.3 7M14 9.6c1.4-3.2 1.2-7-.2-7s-2 3.8-1.3 7"/><circle cx="12" cy="15" r="5.6"/>${dot(10, 14.6)}${dot(14, 14.6)}`,

  // moods
  happy: face('M8.5 14a4 4 0 0 0 7 0'),
  content: face('M9.5 14.5a3 3 0 0 0 5 0'),
  neutral: face('M9 15h6'),
  worried: face('M9 16.2a3.4 3.4 0 0 1 6 0'),
  crying: face('M8.6 16.6a4 4 0 0 1 6.8 0', '<path d="M8.6 12.5v2.3"/>'),

  // navigation
  zoo: `<path d="M3 20l6-9 4 5 3-4 5 8z"/><circle cx="16.5" cy="6" r="2"/>`,
  tasks: `<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>`,
  customize: `<circle cx="12" cy="7" r="3"/><circle cx="17" cy="12" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="7" cy="12" r="3"/><circle cx="12" cy="12" r="1.4"/>`,
  friends: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
  profile: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,

  // achievements, toasts, seasons
  sprout: `<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6zM12 10c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/>`,
  basket: `<path d="M3.5 10h17l-1.6 8.6a2 2 0 0 1-2 1.6H7.1a2 2 0 0 1-2-1.6z"/><path d="M8 10l4-6 4 6M9 14v3M15 14v3"/>`,
  flame: `<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z"/>`,
  calendar: `<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>`,
  sparkle: `<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>`,
  coin: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>`,
  piggy: `<path d="M4.5 12a7 6 0 0 1 13-3h2.5v4.5H18a7 6 0 0 1-3 3.6V20h-3v-2H9v2H6v-3.6A6 6 0 0 1 4.5 12z"/>${dot(15, 10.5)}<path d="M10 6.6h3"/>`,
  leaf: `<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3"/>`,
  blossom: `<circle cx="12" cy="12" r="2"/><path d="M12 10c-2-2.5-2-5 0-6.5 2 1.5 2 4 0 6.5zM14 12c2.5-2 5-2 6.5 0-1.5 2-4 2-6.5 0zM12 14c2 2.5 2 5 0 6.5-2-1.5-2-4 0-6.5zM10 12c-2.5 2-5 2-6.5 0 1.5-2 4-2 6.5 0z"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`,
  snow: `<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4.2 12 6l2.5-1.8M9.5 19.8 12 18l2.5 1.8"/>`,
  tree: `<circle cx="12" cy="9" r="6"/><path d="M12 15v6M9 21h6"/>`,
  pine: `<path d="M12 2.5 6.5 10H9l-4 6h14l-4-6h2.5z"/><path d="M12 16v5.5"/>`,

  // shop art
  drop: `<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>`,
  waves: `<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>`,
  rock: `<path d="M3.5 19l3-8 5-3.5 5.5 4.5 3.5 7z"/><path d="M11.5 7.5 10 13l-3.5 2"/>`,
  binoculars: `<circle cx="7" cy="15.5" r="4"/><circle cx="17" cy="15.5" r="4"/><path d="M7 11.5V6h3.5v6M17 11.5V6h-3.5v6M10.5 15h3"/>`,
  hut: `<path d="M2.5 11.5 12 4l9.5 7.5"/><path d="M5 10v10.5h14V10M10 20.5V15h4v5.5"/>`,
  tent: `<path d="M12 4 2.5 20.5h19z"/><path d="M12 4v4M9 20.5l3-6 3 6"/>`,
  bridge: `<path d="M2 16h20M5 16v4M19 16v4M2 16c4-6.5 16-6.5 20 0M8 12.3V16M12 11v5M16 12.3V16"/>`,
  jeep: `<path d="M3 16v-4.5L5 7h10l4 4.5h2V16z"/><circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>`,
  hat: `<path d="M2.5 16c3 2.4 16 2.4 19 0"/><path d="M7 15.2c0-5 2.2-8 5-8s5 3 5 8"/>`,
  glasses: `<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 14 2 9M20.5 14 22 9"/>`,
  crown: `<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>`,
  lantern: `<rect x="7" y="7" width="10" height="12" rx="3"/><path d="M12 3v4M9.5 19v2h5v-2M12 11v4"/>`,
  butterfly: `<path d="M12 8v11"/><path d="M12 11C9 5 3 5 4 10c1 4 5 3 8 1zM12 11c3-6 9-6 8-1-1 4-5 3-8 1zM12 13c-3 0-6 2-5 5 1 2 4 0 5-3zM12 13c3 0 6 2 5 5-1 2-4 0-5-3z"/>`,

  dot: `<circle cx="12" cy="12" r="3"/>`,
  soundOn: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
  soundOff: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>`,
};

/** Every emoji the app has ever shown, and the icon that replaces it. */
const EMOJI = {
  '\u{1F418}': 'elephant', '\u{1F981}': 'lion', '\u{1F407}': 'rabbit', '\u{1F411}': 'rabbit',
  '\u{1F60A}': 'happy', '\u{1F642}': 'content', '\u{1F610}': 'neutral', '\u{1F61F}': 'worried', '\u{1F62D}': 'crying',
  '\u{1F3DE}\u{FE0F}': 'zoo', '\u{1F3DE}': 'zoo', '\u{1F4CB}': 'tasks', '\u{1F33B}': 'customize', '\u{1F44B}': 'friends',
  '\u{1F331}': 'sprout', '\u{1F9FA}': 'basket', '\u{1F525}': 'flame', '\u{1F4C6}': 'calendar', '✨': 'sparkle',
  '\u{1FA99}': 'coin', '\u{1F437}': 'piggy', '\u{1F33F}': 'leaf', '\u{1F33E}': 'leaf', '\u{1FAB6}': 'leaf',
  '\u{1F3DD}\u{FE0F}': 'tree', '\u{1F3DD}': 'tree', '\u{1F338}': 'blossom', '☀\u{FE0F}': 'sun', '☀': 'sun',
  '\u{1F342}': 'leaf', '❄\u{FE0F}': 'snow', '❄': 'snow',
};

/** Shop items by their builder id. */
const ART = {
  meadow: 'customize', stonePath: 'rock', termiteMounds: 'rock', acacia: 'tree', baobab: 'tree',
  feverTrees: 'pine', wateringHole: 'drop', stream: 'waves', waterfall: 'waves',
  observationDeck: 'binoculars', rangerStation: 'hut', woodenBridge: 'bridge', campsite: 'tent',
  safariJeep: 'jeep', sunHats: 'hat', sunglasses: 'glasses', flowerCrowns: 'crown',
  lanterns: 'lantern', butterflies: 'butterfly', fireflies: 'sparkle',
};

/**
 * @param {string} name   an icon name from the table above
 * @param {string} [cls]  extra class names
 */
export function icon(name, cls = '') {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
    + ` stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`
    + ` focusable="false">${ICONS[name] ?? ICONS.dot}</svg>`;
}

/** The icon for something the data layer still describes with an emoji. */
export const glyph = (emoji, cls) => icon(EMOJI[emoji] ?? 'dot', cls);

/** The icon for a shop item, by its builder id. */
export const artIcon = (build, cls) => icon(ART[build] ?? 'sparkle', cls);

/* ------------------------------------------------------------- avatars --- */

/** Avatar swatches. Older saves stored an emoji here; any string works as a seed. */
export const AVATAR_SWATCHES = ['sage', 'sky', 'peach', 'lilac', 'honey', 'rose', 'mint', 'slate'];

const DEFAULT_SWATCH = '#c9ad8c';

const SWATCH = {
  sage: '#9aab84', sky: '#a9c6c4', peach: '#e3a36e', lilac: '#a8969f',
  honey: '#d9a85c', rose: '#d99a8a', mint: '#b5bf8c', slate: '#8e7389',
};

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/**
 * The avatar: a person silhouette on a coloured disc, like a default contact
 * photo. Anything that is not a known swatch (including the emoji older saves
 * stored) gets the neutral default.
 * @param {string} _name  kept for the call sites; the mark no longer shows it
 * @param {string} seed   the stored avatar value
 */
export function avatarMark(_name, seed) {
  const bg = SWATCH[seed] ?? DEFAULT_SWATCH;
  return `<span class="avatar-mark" style="--swatch:${bg}" aria-hidden="true">`
    + '<svg viewBox="0 0 40 40" focusable="false">'
    + '<circle cx="20" cy="15.5" r="7.5" fill="currentColor"/>'
    + '<path d="M5 40c0-8.8 6.7-14.5 15-14.5S35 31.2 35 40z" fill="currentColor"/>'
    + '</svg></span>';
}

/** A friend's avatar: the same silhouette, on a colour picked from their name. */
export const friendMark = (name) => avatarMark(name, AVATAR_SWATCHES[hash(name) % AVATAR_SWATCHES.length]);
