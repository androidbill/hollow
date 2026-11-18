// Shared rules machinery. Everything here is plain functions over a plain-data
// game state, so the state can be cloned, saved, sent over the wire and replayed.
//
// Board model, per clearing:
//   w: { factionId: warriorCount }
//   b: [{ f, t }]   buildings - these occupy the clearing's slots
//   k: [{ f, t }]   tokens    - these do not (sympathy, tunnels)

import { CLEARINGS, ADJ } from './map.js';

// Factions register themselves here (see factions/index.js). Helpers look them
// up at call time, which keeps the import graph free of cycles.
export const registry = {};

export const WIN_VP = 30;
export const MAX_ROUNDS = 40;

// ---------------------------------------------------------------- randomness
// mulberry32. The state lives in game.rng so a game is reproducible from its seed.
export function rand(g) {
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const roll = (g) => Math.floor(rand(g) * 4); // a die faces 0-3

// -------------------------------------------------------------------- basics
export function log(g, text) {
  g.log.push(text);
  if (g.log.length > 60) g.log.shift();
}

export function score(g, f, n) {
  g.vp[f] = Math.max(0, g.vp[f] + n);
}

export const wc = (g, c, f) => g.board[c].w[f] || 0;
export const bldgs = (g, c, f, t) =>
  g.board[c].b.filter((p) => p.f === f && (!t || p.t === t)).length;
export const toks = (g, c, f, t) =>
  g.board[c].k.filter((p) => p.f === f && (!t || p.t === t)).length;
export const anyPieces = (g, c, f) => wc(g, c, f) + bldgs(g, c, f) + toks(g, c, f) > 0;
export const freeSlots = (g, c) => CLEARINGS[c].slots - g.board[c].b.length;

// Total of one building/token type for a faction, across the whole board.
export function onBoard(g, f, t) {
  let n = 0;
  for (let c = 0; c < g.board.length; c++) n += bldgs(g, c, f, t) + toks(g, c, f, t);
  return n;
}

// Who rules a clearing: most warriors + buildings. A tie, or an empty clearing, is nobody.
export function ruler(g, c) {
  let best = null;
  let top = 0;
  let tied = false;
  for (const f of g.order) {
    const s = wc(g, c, f) + bldgs(g, c, f);
    if (s > top) {
      best = f;
      top = s;
      tied = false;
    } else if (s === top && s > 0) tied = true;
  }
  return tied || top === 0 ? null : best;
}

// ----------------------------------------------------------------- placement
export function placeWarriors(g, c, f, n) {
  const k = Math.min(n, g.supply[f].warriors);
  if (k <= 0) return 0;
  g.supply[f].warriors -= k;
  g.board[c].w[f] = wc(g, c, f) + k;
  return k;
}

export function placeBuilding(g, c, f, t) {
  g.supply[f][t]--;
  g.board[c].b.push({ f, t });
}

export function placeToken(g, c, f, t) {
  g.supply[f][t]--;
  g.board[c].k.push({ f, t });
}

export function moveWarriors(g, from, to, f, n) {
  g.board[from].w[f] = wc(g, from, f) - n;
  if (g.board[from].w[f] === 0) delete g.board[from].w[f];
  g.board[to].w[f] = wc(g, to, f) + n;
}

// Take one piece of `victim` off a clearing: warriors first, then buildings,
// then tokens. Buildings and tokens score a point for whoever destroyed them.
export function removeOne(g, c, victim, scorer) {
  const cl = g.board[c];
  if ((cl.w[victim] || 0) > 0) {
    cl.w[victim]--;
    if (cl.w[victim] === 0) delete cl.w[victim];
    g.supply[victim].warriors++;
    return 'warrior';
  }
  for (const list of [cl.b, cl.k]) {
    const i = list.findIndex((p) => p.f === victim);
    if (i >= 0) {
      const [p] = list.splice(i, 1);
      g.supply[victim][p.t]++;
      score(g, scorer, 1);
      return p.t;
    }
  }
  return null;
}

// Clear every piece that is not `keeper`'s off a clearing (a revolt does this).
export function purge(g, c, keeper) {
  for (const f of g.order) {
    if (f === keeper) continue;
    while (removeOne(g, c, f, keeper)) { /* keep going */ }
  }
}

// -------------------------------------------------------------------- combat
// Attacker rolls two dice. The higher is the attacker's hits, the lower is the
// defender's, each capped by how many warriors that side has in the clearing.
// A defender with no warriors left is defenceless and takes one extra hit.
// Factions can bend the numbers through their battleMods(ctx, role) hook.
export function battle(g, c, att, def) {
  const a = roll(g);
  const b = roll(g);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const aw = wc(g, c, att);
  const dw = wc(g, c, def);
  const ctx = { g, c, att, def, ah: Math.min(hi, aw), dh: Math.min(lo, dw) };
  if (dw === 0) ctx.ah += 1;
  registry[att].battleMods?.(ctx, 'attacker');
  registry[def].battleMods?.(ctx, 'defender');
  for (let i = 0; i < ctx.ah; i++) removeOne(g, c, def, att);
  for (let i = 0; i < ctx.dh; i++) removeOne(g, c, att, def);
  log(g, `${att} attacks ${def} at ${c}: dice ${a},${b} -> ${ctx.ah} hits / ${ctx.dh} hits back`);
}

// ----------------------------------------------------------- move generation
// Marching: any number of warriors from one clearing to an adjacent one. Unless
// `rule` is false, the mover must rule the clearing it leaves or the one it enters.
// With `tunnel`, clearings that both hold one of the faction's tunnels are linked too.
export function moveMoves(g, f, { rule = true, tunnel = false } = {}) {
  const out = [];
  const seen = new Set();
  const push = (from, to, w) => {
    for (const n of new Set([1, w])) {
      const key = `${from}>${to}:${n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: 'move', from, to, n });
    }
  };
  for (let from = 0; from < g.board.length; from++) {
    const w = wc(g, from, f);
    if (w < 1) continue;
    for (const to of ADJ[from]) {
      if (!rule || ruler(g, from) === f || ruler(g, to) === f) push(from, to, w);
    }
    if (tunnel && toks(g, from, f, 'tunnel') > 0) {
      for (let to = 0; to < g.board.length; to++) {
        if (to !== from && toks(g, to, f, 'tunnel') > 0) push(from, to, w);
      }
    }
  }
  return out;
}

export function battleMoves(g, f) {
  const out = [];
  for (let at = 0; at < g.board.length; at++) {
    if (wc(g, at, f) < 1) continue;
    for (const target of g.order) {
      if (target !== f && anyPieces(g, at, target)) out.push({ type: 'battle', at, target });
    }
  }
  return out;
}

export function doMove(g, f, m) {
  moveWarriors(g, m.from, m.to, f, m.n);
}
