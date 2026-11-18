// How good are the bot levels? Usage: node scripts/bot-tournament.mjs [games]
//
// Two experiments. Seats rotate between games so first-player advantage cancels.
//  1. LEVEL LADDER: one faction played at a test level, the other three at easy.
//     The "easy" row is each faction's own baseline (an all-easy table), because the
//     factions are not equally strong; read the other rows against it.
//  2. FACTION BALANCE: all four bots at hard. Wins should be spread around 25% each.
import { botGame } from '../src/arena.js';

const games = Number(process.argv[2]) || 40;
const IDS = ['humans', 'orcs', 'elves', 'dwarves'];

function rotated(i) {
  const k = i % IDS.length;
  return [...IDS.slice(k), ...IDS.slice(0, k)];
}

function run(levels, n) {
  const wins = Object.fromEntries(IDS.map((f) => [f, 0]));
  const vp = Object.fromEntries(IDS.map((f) => [f, 0]));
  let rounds = 0;
  let capped = 0;
  for (let i = 0; i < n; i++) {
    const { game } = botGame(i + 1, levels, { order: rotated(i) });
    wins[game.winner]++;
    if (game.reason === 'rounds') capped++;
    for (const f of IDS) vp[f] += game.vp[f];
    rounds += game.round;
  }
  return { wins, vp: Object.fromEntries(IDS.map((f) => [f, +(vp[f] / n).toFixed(1)])), rounds: +(rounds / n).toFixed(1), capped };
}

const pct = (x) => `${Math.round((100 * x) / games)}%`;

const balanceOnly = process.argv[3] === 'balance';

if (!balanceOnly) console.log(`LEVEL LADDER (${games} games each, a fair table wins 25%)`);
for (const level of balanceOnly ? [] : ['random', 'easy', 'medium', 'hard']) {
  const row = IDS.map((f) => {
    const levels = Object.fromEntries(IDS.map((o) => [o, o === f ? level : 'easy']));
    return `${f} ${pct(run(levels, games).wins[f])}`;
  });
  console.log(`  ${level.padEnd(7)} vs three easy:  ${row.join('   ')}`);
}

console.log(`\nFACTION BALANCE (all hard, ${games} games)`);
const bal = run(Object.fromEntries(IDS.map((f) => [f, 'hard'])), games);
console.log('  wins    ', Object.fromEntries(IDS.map((f) => [f, pct(bal.wins[f])])));
console.log('  avg VP  ', bal.vp);
console.log(`  avg ${bal.rounds} rounds, ${bal.capped} games hit the round cap`);
