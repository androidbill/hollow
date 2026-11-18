// Bot-vs-bot games. `levels` maps faction id -> bot level.
import { applyMove, createGame, currentFaction } from './engine.js';
import { chooseMove } from './bot.js';

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

export function botGame(seed, levels, { order, maxMoves = 5000 } = {}) {
  const rng = mulberry(seed ^ 0x51ed270b);
  let g = createGame({ seed, factions: order ?? Object.keys(levels) });
  let moves = 0;
  let illegal = 0;
  while (!g.winner) {
    const f = currentFaction(g);
    const m = chooseMove(g, { level: levels[f], rng });
    const r = applyMove(g, f, m);
    if (!r.ok) { illegal++; throw new Error(`${f} (${levels[f]}) made an illegal move ${JSON.stringify(m)}: ${r.error}`); }
    g = r.game;
    if (++moves > maxMoves) throw new Error(`bot game ${seed} did not finish`);
  }
  return { game: g, moves, illegal };
}
