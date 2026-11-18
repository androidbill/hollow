// Random-mover statistics. Usage: node scripts/tournament.mjs [games]
// Not a balance measurement - random players say little about balance - but it
// shows game length, how games end, and whether one faction is wildly off.
import { randomPlayout } from '../src/sim.js';

const games = Number(process.argv[2]) || 200;
const wins = {};
const vp = {};
const reasons = {};
let rounds = 0;
let moves = 0;

for (let seed = 1; seed <= games; seed++) {
  const r = randomPlayout(seed, { check: false });
  const g = r.game;
  wins[g.winner] = (wins[g.winner] || 0) + 1;
  reasons[g.reason] = (reasons[g.reason] || 0) + 1;
  for (const f of g.order) vp[f] = (vp[f] || 0) + g.vp[f];
  rounds += g.round;
  moves += r.moves;
}

console.log(`${games} games, avg ${(rounds / games).toFixed(1)} rounds, ${(moves / games).toFixed(0)} moves`);
console.log('endings   ', reasons);
console.log('wins      ', wins);
console.log('avg final VP', Object.fromEntries(Object.entries(vp).map(([f, v]) => [f, +(v / games).toFixed(1)])));
