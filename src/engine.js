// The whole game as pure functions - no DOM, no network, no clock.
//
//   createGame({ seed, factions })   -> game
//   legalMoves(game)                 -> every move the current faction may make
//   applyMove(game, factionId, move) -> { ok, game } | { ok: false, error }
//
// applyMove never mutates its input and re-validates against legalMoves, so a
// human tap, a bot, and a move arriving over the network all go through the same
// door. The state is plain JSON.

import { CLEARINGS } from './map.js';
import { FACTIONS, DEFAULT_ORDER } from './factions/index.js';
import { MAX_ROUNDS, WIN_VP, log } from './helpers.js';

export { FACTIONS, WIN_VP, MAX_ROUNDS };

export function createGame({ seed = 1, factions = DEFAULT_ORDER } = {}) {
  const g = {
    seed,
    rng: seed >>> 0,
    round: 1,
    order: [...factions],
    current: 0,
    phase: 0,
    vp: {},
    board: CLEARINGS.map(() => ({ w: {}, b: [], k: [] })),
    supply: {},
    fs: {}, // per-faction private bookkeeping
    log: [],
    winner: null,
    reason: null,
  };
  for (const f of g.order) {
    g.vp[f] = 0;
    g.supply[f] = { ...FACTIONS[f].pieces };
    g.fs[f] = {};
    FACTIONS[f].setup(g);
  }
  enterPhase(g);
  return g;
}

export const currentFaction = (g) => g.order[g.current];
export const currentPhase = (g) => FACTIONS[currentFaction(g)].phases[g.phase].name;

export function legalMoves(g) {
  if (g.winner) return [];
  return FACTIONS[currentFaction(g)].moves(g, currentPhase(g));
}

export function applyMove(game, faction, move) {
  if (game.winner) return { ok: false, error: 'the game is over' };
  if (faction !== currentFaction(game)) return { ok: false, error: `it is ${currentFaction(game)}'s turn` };
  const key = stableKey(move);
  if (!legalMoves(game).some((m) => stableKey(m) === key)) return { ok: false, error: 'illegal move' };

  const g = structuredClone(game);
  if (move.type === 'endPhase') {
    step(g);
    enterPhase(g);
  } else {
    FACTIONS[faction].apply(g, move);
    checkEnd(g);
  }
  return { ok: true, game: g };
}

// ------------------------------------------------------------------ plumbing
function stableKey(move) {
  return JSON.stringify(move, Object.keys(move).sort());
}

function step(g) {
  g.phase++;
  if (g.phase >= FACTIONS[currentFaction(g)].phases.length) {
    g.phase = 0;
    g.current++;
    if (g.current >= g.order.length) {
      g.current = 0;
      g.round++;
    }
  }
}

// Enter the current phase, running automatic phases straight through.
function enterPhase(g) {
  for (;;) {
    checkEnd(g);
    if (g.winner) return;
    const fm = FACTIONS[currentFaction(g)];
    const ph = fm.phases[g.phase];
    fm.enter(g, ph.name);
    checkEnd(g);
    if (g.winner || !ph.auto) return;
    step(g);
  }
}

function checkEnd(g) {
  if (g.winner) return;
  const leader = [...g.order].sort((a, b) => g.vp[b] - g.vp[a])[0];
  if (g.vp[leader] >= WIN_VP) {
    g.winner = leader;
    g.reason = 'points';
  } else if (g.round > MAX_ROUNDS) {
    g.winner = leader;
    g.reason = 'rounds';
  }
  if (g.winner) log(g, `${g.winner} wins (${g.reason}) with ${g.vp[g.winner]} VP`);
}
