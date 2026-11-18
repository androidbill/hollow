// The opponents. A bot is a pure function of the game state: it looks at the
// legal moves, tries each one on a copy of the game, scores the result, and
// returns the best. It never touches the state it is given, and its move goes
// through the same applyMove a human's tap does - so a bot cannot cheat.
//
// There is one brain. The levels differ only in how hard it thinks:
//   random  picks any legal move
//   easy    scores moves but ignores what its opponents have, and is very noisy
//   medium  sees opponents' pieces, averages two samples of a dice roll, and looks
//           one of its own follow-up moves ahead on its two best candidates
//   hard    averages four samples, does that lookahead on its five best, and
//           keeps its noise small
// Nothing is hidden from easy that hard can see; hard just reasons further.

import { applyMove, currentFaction, legalMoves } from './engine.js';
import { ADJ, CLEARINGS } from './map.js';
import { wc } from './helpers.js';

export const LEVELS = {
  random: { random: true },
  easy: { noise: 2.5, samples: 1, lookahead: 0, aware: false, extraOrders: 0 },
  medium: { noise: 0.5, samples: 2, lookahead: 2, aware: true, extraOrders: 1 },
  hard: { noise: 0.15, samples: 4, lookahead: 5, aware: true, extraOrders: 1 },
};

// What a building or token is worth to its owner, in rough "warrior equivalents".
const ASSET = { mill: 4, barracks: 3, warcamp: 4, stronghold: 4, sympathy: 2, tunnel: 1.5 };

// Shortest path between every pair of clearings, computed once.
const DIST = CLEARINGS.map((_, from) => {
  const d = CLEARINGS.map(() => Infinity);
  d[from] = 0;
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const n of ADJ[queue[i]]) if (d[n] === Infinity) { d[n] = d[queue[i]] + 1; queue.push(n); }
  }
  return d;
});

// How good is this position for faction f? Higher is better.
export function evaluate(g, f, aware = true) {
  if (g.winner) return g.winner === f ? 10000 : -10000;
  let v = g.vp[f] * 6 + (g.fs[f].supporters || 0);
  const foes = g.order.filter((o) => o !== f);
  for (let c = 0; c < g.board.length; c++) {
    const cl = g.board[c];
    const mine = wc(g, c, f);
    v += mine;
    for (const p of [...cl.b, ...cl.k]) if (p.f === f) v += ASSET[p.t] || 0;
    if (!aware) continue;
    let foeHere = 0;
    for (const o of foes) {
      foeHere += (cl.w[o] || 0);
      v -= (cl.w[o] || 0) * 0.3;
      for (const p of [...cl.b, ...cl.k]) if (p.f === o) { v -= 1; foeHere++; }
    }
    if (mine > 0) {
      // march towards trouble: small pull towards the nearest enemy
      let near = Infinity;
      for (let t = 0; t < g.board.length; t++) {
        if (t === c) continue;
        if (foes.some((o) => wc(g, t, o) > 0 || g.board[t].b.some((p) => p.f === o))) near = Math.min(near, DIST[c][t]);
      }
      if (near < Infinity) v -= 0.06 * near * mine;
    }
  }
  return v;
}

// Score of making move m: the evaluation of the state after it, averaged over
// a few samples when the move involves dice.
function valueOf(g, f, m, cfg) {
  const n = m.type === 'battle' ? cfg.samples : 1;
  let total = 0;
  let after = null;
  for (let i = 0; i < n; i++) {
    const sample = i === 0 ? g : { ...g, rng: (g.rng + i * 7919) >>> 0 };
    const r = applyMove(sample, f, m);
    if (!r.ok) return { value: -Infinity, after: null };
    if (i === 0) after = r.game;
    total += evaluate(r.game, f, cfg.aware);
  }
  return { value: total / n, after };
}

// Orcs may lengthen their war chant at dawn. Extra recruit orders cannot fail,
// so they are free strength; the level decides how many a bot dares.
function bonus(g, m, cfg) {
  if (m.type === 'addOrder' && m.order === 'recruit') {
    return g.fs.orcs.extras.length < cfg.extraOrders ? 0.6 : -1;
  }
  if (m.type === 'addOrder') return -1;
  return 0;
}

export function chooseMove(game, { level = 'medium', rng = Math.random } = {}) {
  const f = currentFaction(game);
  const moves = legalMoves(game);
  if (moves.length === 0) return null;
  const cfg = LEVELS[level];
  if (!cfg) throw new Error(`unknown bot level "${level}"`);
  if (cfg.random || moves.length === 1) return moves[Math.floor(rng() * moves.length)];

  const base = evaluate(game, f, cfg.aware);
  let scored = moves.map((m) => {
    if (m.type === 'endPhase') return { m, value: base, after: null };
    const r = valueOf(game, f, m, cfg);
    let value = r.value + bonus(game, m, cfg);
    // Never walk into a forced frenzy: if the very next thing this faction would
    // have to do is break its chant, the move is a mistake.
    if (cfg.aware && r.after && !r.after.winner && currentFaction(r.after) === f &&
        legalMoves(r.after).some((n) => n.type === 'frenzy')) value -= 8;
    return { m, value, after: r.after };
  });

  // Hard thinks one of its own moves further, on its few best candidates.
  if (cfg.lookahead > 0) {
    scored.sort((a, b) => b.value - a.value);
    for (const s of scored.slice(0, cfg.lookahead)) {
      if (!s.after || s.after.winner || currentFaction(s.after) !== f) continue;
      let best = evaluate(s.after, f, cfg.aware);
      for (const next of legalMoves(s.after)) {
        if (next.type === 'endPhase') continue;
        const r = applyMove(s.after, f, next);
        if (r.ok) best = Math.max(best, evaluate(r.game, f, cfg.aware));
      }
      s.value = 0.4 * s.value + 0.6 * best;
    }
  }

  let pick = scored[0];
  let top = -Infinity;
  for (const s of scored) {
    const v = s.value + (rng() - 0.5) * 2 * cfg.noise;
    if (v > top) { top = v; pick = s; }
  }
  return pick.m;
}
