// The animation layer. It never decides anything about the game: it reads a description of
// what just changed (fx-diff.js) and plays it on a persistent layer drawn over the board.
//
//   an army marches     a ghost of the token slides from where it was to where it is
//   something is built   a copy of the piece pops in, with a ring
//   warriors recruited   a ring and a floating "+n"
//   casualties           a ghost of the fallen fades and drifts, "-n" floats, a red ring flashes
//   a piece destroyed    it breaks up where it stood, and "+1" floats for the point it scored
//   a battle             two dice tumble onto the clearing and say who hit whom
//
// EVERYTHING here is drawn on the persistent effects layer, never on the board's own pieces.
// The board is repainted from the game state on every change (and a repaint can come at any
// moment: a tutorial step, a hover), which would instantly destroy any animation running on a
// piece it replaced. Ghosts on the effects layer survive repaints. Where a real piece would
// show up too early (an army still sliding, a building still popping in), the board is told
// to draw it invisible until its ghost has landed (see `hidden`).
//
// The board itself is redrawn from the game state on every change and is always already
// correct; these are decorations on top, so if one is cut short or never plays, the game is
// still right. While an army slides in, its real token waits invisible (see `hidden`) so it
// does not appear at the destination before the ghost arrives.

import { diffGames, sameGame } from './fx-diff.js';
import { COLORS, NAMES, R as CLEARING_R, layout, pieceSrc } from './render.js';

const SLIDE_MIN = 420;
const SLIDE_MAX = 720;
const POP_MS = 480;
const FLOAT_MS = 1150;
const DICE_TUMBLE = 650;
const DICE_HOLD = 1500;

const plural = (n) => (n === 1 ? '' : 's');

export function createFx({ getSvg, enabled }) {
  let batch = []; // Animations in the current batch, finished early if a newer batch starts
  let nodes = []; // nodes created for the current batch, removed when it ends
  let diceNode = null; // the dice stay up a little longer than a batch, so they have their own slot
  // Real pieces kept invisible while their ghost plays on the effects layer. Keys: 'w:clearing:faction'
  // (an army), 'b:clearing:slot' (a building), 't:clearing:index' (a token). The board reads this set
  // on every repaint, so a repaint in the middle of an animation cannot reveal a piece too early.
  const hidden = new Set();

  const layer = () => getSvg()?.querySelector('#fx-layer');

  function add(markup, { keep = false } = {}) {
    const L = layer();
    L.insertAdjacentHTML('beforeend', markup);
    const node = L.lastElementChild;
    if (!keep) nodes.push(node);
    return node;
  }

  const selectorFor = (key) => {
    const [kind, c, x] = key.split(':');
    if (kind === 'w') return `[data-c="${c}"] .warriors[data-f="${x}"]`;
    if (kind === 'b') return `[data-c="${c}"] .building[data-slot="${x}"]`;
    return `[data-c="${c}"] .token[data-ti="${x}"]`;
  };
  function hide(key) {
    hidden.add(key);
    const el = getSvg()?.querySelector(selectorFor(key));
    if (el) el.style.visibility = 'hidden';
  }
  function show(key) {
    hidden.delete(key);
    const el = getSvg()?.querySelector(selectorFor(key));
    if (el) el.style.visibility = '';
  }
  function reveal() {
    for (const key of [...hidden]) show(key);
  }

  // Cut the previous batch short (so a fast sequence of moves never piles up) and tidy.
  function endBatch() {
    for (const a of batch) { try { a.finish(); } catch { /* already gone */ } }
    batch = [];
    for (const n of nodes) n.remove();
    nodes = [];
    reveal();
  }

  const run = (el, keyframes, options, then) => {
    const a = el.animate(keyframes, { fill: 'forwards', ...options });
    batch.push(a);
    if (then) a.finished.then(then).catch(() => {});
    return a;
  };

  function floatText(x, y, text, color, delay = 0) {
    const t = add(`<text class="fx-float" x="${x}" y="${y}" fill="${color}">${text}</text>`);
    run(t, [
      { transform: 'translateY(6px)', opacity: 0 },
      { transform: 'translateY(-4px)', opacity: 1, offset: 0.18 },
      { transform: 'translateY(-38px)', opacity: 0 },
    ], { duration: FLOAT_MS, delay, easing: 'ease-out' }, () => t.remove());
  }

  function burst(x, y, color, delay = 0) {
    const ring = add(`<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${color}" stroke-width="4"/>`);
    run(ring, [
      { transform: 'scale(0.4)', opacity: 0.9 },
      { transform: 'scale(3.4)', opacity: 0 },
    ], { duration: 620, delay, easing: 'ease-out' }, () => ring.remove());
  }

  const find = (sel) => getSvg()?.querySelector(sel);

  // ----------------------------------------------------------------- the effects
  function slide(m, prev, next) {
    const a = layout(prev, m.from).warriors[m.f] || layout(prev, m.from).center;
    const b = layout(next, m.to).warriors[m.f] || layout(next, m.to).center;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const duration = Math.max(SLIDE_MIN, Math.min(SLIDE_MAX, 260 + dist * 1.1));
    const key = `w:${m.to}:${m.f}`;
    hide(key);

    const ghost = add(
      `<g class="fx-ghost" style="transform:translate(${a.x}px,${a.y}px)">` +
      `<image href="assets/piece-warrior-${m.f}.png" x="-20" y="-20" width="40" height="40"/>` +
      `<circle class="badge" cx="14" cy="17" r="9.5"/><text x="14" y="21.5">${m.n}</text></g>`);
    const far = dist > 230; // a tunnel hop: rise a little as it crosses the forest
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - (far ? 36 : 0) };
    run(ghost, [
      { transform: `translate(${a.x}px,${a.y}px) scale(1)` },
      { transform: `translate(${mid.x}px,${mid.y}px) scale(${far ? 1.3 : 1.08})`, offset: 0.5 },
      { transform: `translate(${b.x}px,${b.y}px) scale(1)` },
    ], { duration: far ? duration + 140 : duration, easing: 'cubic-bezier(.3,.75,.3,1)' }, () => {
      ghost.remove();
      show(key);
      burst(b.x, b.y, COLORS[m.f]); // a soft landing
    });
  }

  function gained(x, prev, next) {
    const p = layout(next, x.c).warriors[x.f] || layout(next, x.c).center;
    burst(p.x, p.y, COLORS[x.f]);
    floatText(p.x, p.y - 26, `+${x.n}`, COLORS[x.f]);
  }

  // A new building or token: its real piece waits invisible while a copy pops in on the
  // effects layer (the effects layer is never repainted, so the pop can't be cut off).
  function built(x, next) {
    const L = layout(next, x.c);
    const at = x.kind === 'building' ? L.slotAt(x.index) : L.tokens[x.index];
    if (!at) return;
    const size = x.kind === 'building' ? 34 : 30;
    const key = `${x.kind === 'building' ? 'b' : 't'}:${x.c}:${x.index}`;
    hide(key);
    const ghost = add(
      `<g class="fx-ghost" style="transform:translate(${at.x}px,${at.y}px) scale(0.2)"><image href="${pieceSrc(x.f, x.t)}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}"/></g>`);
    run(ghost, [
      { transform: `translate(${at.x}px,${at.y}px) scale(0.2)`, opacity: 0 },
      { transform: `translate(${at.x}px,${at.y}px) scale(1.35)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${at.x}px,${at.y}px) scale(1)`, opacity: 1 },
    ], { duration: POP_MS, easing: 'ease-out' }, () => { ghost.remove(); show(key); });
    burst(at.x, at.y, COLORS[x.f]);
  }

  function lost(x, prev, next, delay) {
    const L = layout(prev, x.c);
    const at = L.warriors[x.f] || L.center;
    const ghost = add(
      `<g class="fx-ghost" style="transform:translate(${at.x}px,${at.y}px)"><image href="assets/piece-warrior-${x.f}.png" x="-20" y="-20" width="40" height="40"/></g>`);
    run(ghost, [
      { transform: `translate(${at.x}px,${at.y}px) scale(1)`, opacity: 0.95 },
      { transform: `translate(${at.x}px,${at.y - 14}px) scale(1.5) rotate(14deg)`, opacity: 0 },
    ], { duration: 650, delay, easing: 'ease-out' }, () => ghost.remove());
    floatText(at.x, at.y - 24, `−${x.n}`, '#ff7a6b', delay);
    burst(at.x, at.y, '#ff7a6b', delay);
  }

  function destroyed(x, prev, delay) {
    const L = layout(prev, x.c);
    const at = x.kind === 'building' ? L.buildings[x.index] : L.tokens[x.index];
    if (!at) return;
    const size = x.kind === 'building' ? 34 : 30;
    const ghost = add(
      `<g class="fx-ghost" style="transform:translate(${at.x}px,${at.y}px)"><image href="${pieceSrc(x.f, x.t)}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}"/></g>`);
    run(ghost, [
      { transform: `translate(${at.x}px,${at.y}px) scale(1) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${at.x}px,${at.y}px) scale(1.2) rotate(-6deg)`, opacity: 0.9, offset: 0.25 },
      { transform: `translate(${at.x}px,${at.y + 8}px) scale(0.5) rotate(18deg)`, opacity: 0 },
    ], { duration: 720, delay, easing: 'ease-in' }, () => ghost.remove());
    burst(at.x, at.y, '#d6c39a', delay);
    floatText(at.x, at.y - 22, '+1', '#e0c068', delay + 120); // the point it scored
  }

  // The dice sit just OUTSIDE the clearing (above it, or below it for the top row where there
  // is no room above), so they never cover the pieces or the casualties: attacker's die on the
  // left (the higher of the two), defender's on the right (the lower), each with the hits it caused.
  function showDice(b, next) {
    if (diceNode) { diceNode.remove(); diceNode = null; }
    const { cx, cy } = layout(next, b.c);
    const above = cy - CLEARING_R - 46 - 18 >= 4;
    const ay = above ? cy - CLEARING_R - 46 : cy + CLEARING_R + 30;
    const L = { x: cx - 27, y: ay };
    const R = { x: cx + 27, y: ay };
    const die = (p, value, color, hits) =>
      `<g class="die" style="transform:translate(${p.x}px,${p.y}px)">` +
      `<rect x="-18" y="-18" width="36" height="36" rx="9" fill="#f6f0df" stroke="${color}" stroke-width="4"/>` +
      `<text y="9" text-anchor="middle" font-size="25" font-weight="800" fill="#1b1b1b">${value}</text>` +
      `<text class="die-hits" y="38" text-anchor="middle" font-size="13" font-weight="800" fill="${color}">${hits} hit${plural(hits)}</text></g>`;
    diceNode = add(`<g class="fx-dice">${die(L, b.hi, COLORS[b.att], b.dealt)}${die(R, b.lo, COLORS[b.def], b.back)}</g>`, { keep: true });
    const dieEls = diceNode.querySelectorAll('.die');
    [L, R].forEach((p, i) => {
      dieEls[i].animate([
        { transform: `translate(${p.x}px,${p.y - 40}px) scale(0.3) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${p.x}px,${p.y - 14}px) scale(1.2) rotate(${i ? -300 : 330}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${p.x}px,${p.y}px) scale(1) rotate(${i ? -720 : 720}deg)`, opacity: 1 },
      ], { duration: DICE_TUMBLE, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
      dieEls[i].querySelector('.die-hits').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: DICE_TUMBLE - 100, fill: 'both' });
    });
    const node = diceNode;
    node.animate([{ opacity: 1 }, { opacity: 0 }], { delay: DICE_TUMBLE + DICE_HOLD, duration: 380, fill: 'forwards' })
      .finished.then(() => { node.remove(); if (diceNode === node) diceNode = null; }).catch(() => {});
  }

  // ------------------------------------------------------------------ the entry point
  return {
    // real tokens the board must draw invisible right now (an army is still on its way)
    get hidden() { return hidden; },

    // prev, next: game states; last: the room's latest event. Never throws.
    play(prev, next, last) {
      try {
        endBatch();
        if (!enabled() || !layer() || !sameGame(prev, next) || (typeof document !== 'undefined' && document.hidden)) return;
        const d = diffGames(prev, next, last);
        const fought = !!d.battle;
        const after = fought ? DICE_TUMBLE - 80 : 0; // casualties wait for the dice

        for (const m of d.moves) slide(m, prev, next);
        for (const x of d.gains) gained(x, prev, next);
        for (const x of d.built) built(x, next);

        if (fought) showDice(d.battle, next);
        for (const x of d.losses) lost(x, prev, next, after);
        for (const x of d.destroyed) destroyed(x, prev, after);
        // a revolt has no dice, but the clearing still erupts
        if (!fought && (d.destroyed.length || d.losses.length)) {
          for (const c of new Set([...d.destroyed, ...d.losses].map((x) => x.c))) {
            const { cx, cy } = layout(next, c);
            burst(cx, cy, '#ffffff', 0);
          }
        }
      } catch (err) {
        console.warn('animation skipped:', err);
        endBatch();
      }
    },

    // stop everything at once (leaving a game, starting another)
    cancel() {
      endBatch();
      if (diceNode) { diceNode.remove(); diceNode = null; }
    },
  };
}
