/**
 * To-Zoo — the shop.
 *
 * Cosmetic only, and it says so out loud. Nothing here makes the task manager
 * work better, which is the line that keeps the game layer from turning into
 * a tax on the productivity layer.
 *
 * Items you cannot afford are shown, not hidden — the gap between what you
 * have and what the waterfall costs is the whole progression.
 */

import { CATEGORIES } from '../data/seed.js';
import { SEASONS, SEASON_ORDER } from '../zoo/seasons.js';
import {
  buyItem, getState, placeItem, setSeason, shopItems, storeItem, unlock,
} from '../store.js';
import { toast } from './toast.js';
import { artIcon, glyph } from './icons.js';
import { thumbnailOf } from '../zoo/thumbnails.js';

let category = 'all';

export function renderCustomizeView(root, ctx) {
  const state = getState();
  const items = shopItems(state);
  const owned = items.filter((i) => i.owned);
  const shown = category === 'all' ? items : items.filter((i) => i.type === category);

  const nextUp = items
    .filter((i) => !i.owned)
    .sort((a, b) => a.cost - b.cost)
    .find((i) => i.cost > state.user.tokens);

  root.innerHTML = `
    <div class="shop-head">
      <div class="shop-balance">
        <span class="coin" aria-hidden="true"></span>
        <b>${state.user.tokens}</b> tokens
      </div>
      <p class="shop-note">
        ${owned.length} of ${items.length} unlocked${
          nextUp ? ` · ${nextUp.cost - state.user.tokens} more for the ${nextUp.name.toLowerCase()}` : ''
        }
      </p>
    </div>

    <!-- Seasons change the whole world outside, so they sit above the
         individual props rather than among them. -->
    <section class="season-picker">
      <h3 class="block-title">Season</h3>
      <div class="seasons" role="radiogroup" aria-label="Season">
        ${SEASON_ORDER.map((id) => {
          const season = SEASONS[id];
          const owned = state.unlocked.seasons.includes(id) || season.cost === 0;
          const on = state.season === id;
          const affordable = state.user.tokens >= season.cost;
          return `
            <button class="season${on ? ' is-on' : ''}${owned ? '' : ' is-locked'}"
                    type="button" role="radio" aria-checked="${on}"
                    data-season="${id}" data-keep-focus="season-${id}" title="${season.blurb}">
              <span class="season__emoji" aria-hidden="true">${glyph(season.emoji)}</span>
              <span class="season__name">${season.name}</span>
              <span class="season__foot">${
                owned
                  ? (on ? 'Current' : 'Switch')
                  : `<span class="coin coin--sm" aria-hidden="true"></span>${season.cost}${
                      ''}`
              }</span>
            </button>`;
        }).join('')}
      </div>
    </section>

    <div class="chips chips--filter" role="group" aria-label="Filter by kind">
      <button class="chip${category === 'all' ? ' is-on' : ''}" type="button"
              data-cat="all" aria-pressed="${category === 'all'}">Everything</button>
      ${CATEGORIES.map((c) => `
        <button class="chip${category === c.id ? ' is-on' : ''}" type="button"
                data-cat="${c.id}" aria-pressed="${category === c.id}">${c.label}</button>`).join('')}
    </div>

    <ul class="shop-grid">
      ${shown.map((item) => `
        <li class="shop-card${item.owned ? ' is-owned' : ''}${
              !item.owned && !item.affordable ? ' is-locked' : ''}">
          <div class="shop-card__art" data-art="${item.build}" aria-hidden="true">${
            thumbnailOf(item.build) ? `<img class="shop-card__img" src="${thumbnailOf(item.build)}" alt="">` : artIcon(item.build)}</div>
          <h3 class="shop-card__name">${escapeHtml(item.name)}</h3>
          <p class="shop-card__blurb">${escapeHtml(item.blurb)}</p>
          <div class="shop-card__foot">
            ${item.owned
              ? `<button class="btn btn--quiet btn--sm" type="button" data-place="${item.id}"
                         data-keep-focus="place-${item.id}">
                   ${item.placedCount > 0 ? 'Store away' : 'Place in zoo'}
                 </button>
                 <span class="shop-card__owned">Owned ${item.count}</span>`
              : `<span class="shop-card__cost${item.affordable ? '' : ' is-short'}">
                   <span class="coin coin--sm" aria-hidden="true"></span>${item.cost}
                 </span>
                 <button class="btn ${item.affordable ? 'btn--primary' : 'btn--quiet'} btn--sm"
                         type="button" data-buy="${item.id}"
                         data-keep-focus="buy-${item.id}"
                         ${item.affordable ? '' : 'disabled aria-disabled="true"'}>
                   ${item.affordable ? 'Buy' : `Need ${item.cost - state.user.tokens}`}
                 </button>`}
          </div>
        </li>`).join('')}
    </ul>`;

  for (const button of root.querySelectorAll('[data-season]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.season;
      const season = SEASONS[id];
      const state2 = getState();
      const owned = state2.unlocked.seasons.includes(id) || season.cost === 0;

      if (!owned) {
        if (!unlock('seasons', id, season.cost)) {
          toast({
            title: `${season.name} costs ${season.cost}`,
            emoji: season.emoji,
            tone: 'warn',
            note: `You have ${state2.user.tokens}. Send a few animals home first.`,
          });
          return;
        }
        toast({ title: `${season.name} unlocked`, emoji: season.emoji, duration: 2600 });
      }

      setSeason(id);
      ctx.syncWorld();
    });
  }

  for (const chip of root.querySelectorAll('[data-cat]')) {
    chip.addEventListener('click', () => {
      category = chip.dataset.cat;
      ctx.views.render();
    });
  }

  for (const button of root.querySelectorAll('[data-buy]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.buy;
      const item = shopItems().find((i) => i.id === id);
      if (!buyItem(id)) return;
      // Straight into the zoo (or onto every animal, for accessories).
      placeItem(id, 0, 0, 0);
      ctx.syncWorld();
      toast({
        title: item.slot === 'animal' ? `Everyone's wearing the ${item.name.toLowerCase()}` : `${item.name} added to your zoo`,
        emoji: '✨',
        duration: 3000,
      });
    });
  }

  for (const button of root.querySelectorAll('[data-place]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.place;
      const state = getState();
      const standing = state.placements.filter((p) => p.itemId === id);
      // Phase 4 replaces this with real placement; for now it is a toggle
      // between "somewhere sensible" and back in the inventory.
      if (standing.length) storeItem(standing[standing.length - 1].uid);
      else placeItem(id, 0, 0, 0);
      ctx.syncWorld();
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
