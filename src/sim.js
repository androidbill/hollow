// Random playouts: the engine's regression test and, later, the bot tournament.
// A random mover is the harshest cheap test there is - it will try every legal
// corner of the rules that a sensible player would never visit.

import { applyMove, createGame, currentFaction, legalMoves, FACTIONS } from './engine.js';
import { CLEARINGS, ADJ } from './map.js';

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Throws on the first broken invariant. Returns nothing.
export function checkInvariants(g) {
  for (const f of g.order) {
    // every piece is either in the supply or on the board - none created, none lost
    const total = { ...FACTIONS[f].pieces };
    const have = { ...g.supply[f] };
    for (const cl of g.board) {
      have.warriors += cl.w[f] || 0;
      for (const p of [...cl.b, ...cl.k]) if (p.f === f) have[p.t]++;
    }
    for (const key of Object.keys(total)) {
      if (have[key] !== total[key]) throw new Error(`${f} ${key}: ${have[key]} accounted for, expected ${total[key]}`);
    }
    if (g.vp[f] < 0 || !Number.isInteger(g.vp[f])) throw new Error(`${f} has bad VP ${g.vp[f]}`);
  }
  g.board.forEach((cl, c) => {
    if (cl.b.length > CLEARINGS[c].slots) throw new Error(`clearing ${c} holds ${cl.b.length} buildings`);
    for (const [f, n] of Object.entries(cl.w)) if (!(n > 0)) throw new Error(`clearing ${c}: ${f} has ${n} warriors listed`);
  });
}

export function checkMap() {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) for (const n of ADJ[queue.pop()]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  if (seen.size !== CLEARINGS.length) throw new Error('the map is not connected');
  ADJ.forEach((list, a) => list.forEach((b) => {
    if (!ADJ[b].includes(a)) throw new Error(`path ${a}-${b} is one-way`);
  }));
}

export function randomPlayout(seed, { factions, maxMoves = 20000, check = true } = {}) {
  const pick = mulberry(seed ^ 0x9e3779b9);
  let g = createGame({ seed, factions });
  const used = {};
  let moves = 0;
  if (check) checkInvariants(g);
  while (!g.winner) {
    const options = legalMoves(g);
    if (options.length === 0) throw new Error(`no legal moves for ${currentFaction(g)} (round ${g.round})`);
    const m = options[Math.floor(pick() * options.length)];
    const who = currentFaction(g);
    const r = applyMove(g, who, m);
    if (!r.ok) throw new Error(`engine refused its own legal move ${JSON.stringify(m)}: ${r.error}`);
    g = r.game;
    used[`${who}:${m.type}`] = (used[`${who}:${m.type}`] || 0) + 1;
    if (check) checkInvariants(g);
    if (++moves > maxMoves) throw new Error(`game ${seed} did not finish in ${maxMoves} moves`);
  }
  return { game: g, moves, used };
}
