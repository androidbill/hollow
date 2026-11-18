// What do the bots actually do? Average count of each move type per faction per
// game, for all-hard tables. Usage: node scripts/move-stats.mjs [games] [level]
import { applyMove, createGame, currentFaction } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';

const N = Number(process.argv[2]) || 30;
const level = process.argv[3] || 'hard';
const stat = {};
let s = 1;
const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

for (let i = 0; i < N; i++) {
  let g = createGame({ seed: i + 1 });
  while (!g.winner) {
    const f = currentFaction(g);
    const m = chooseMove(g, { level, rng });
    const k = `${f}:${m.type}${m.building ? ':' + m.building : ''}`;
    stat[k] = (stat[k] || 0) + 1;
    g = applyMove(g, f, m).game;
  }
}
for (const k of Object.keys(stat).sort()) console.log(k.padEnd(26), (stat[k] / N).toFixed(1));
