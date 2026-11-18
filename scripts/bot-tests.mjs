import assert from 'node:assert/strict';
import { botGame } from '../src/arena.js';
import { chooseMove, LEVELS } from '../src/bot.js';
import { checkInvariants } from '../src/sim.js';
import { createGame, legalMoves } from '../src/engine.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

const IDS = ['humans', 'orcs', 'elves', 'dwarves'];

test('chooseMove does not mutate the game and always returns a legal move', () => {
  const g = createGame({ seed: 5 });
  const before = JSON.stringify(g);
  for (const level of Object.keys(LEVELS)) {
    const m = chooseMove(g, { level });
    assert.ok(legalMoves(g).some((l) => JSON.stringify(l) === JSON.stringify(m)), `${level} chose an illegal move`);
  }
  assert.equal(JSON.stringify(g), before);
});

test('an unknown level is an error, not a silent default', () => {
  assert.throws(() => chooseMove(createGame({ seed: 1 }), { level: 'godlike' }), /unknown bot level/);
});

test('60 bot games at mixed levels: no illegal move, every game finishes, no lost pieces', () => {
  const levelNames = ['easy', 'medium', 'hard', 'random'];
  for (let i = 0; i < 60; i++) {
    const levels = Object.fromEntries(IDS.map((f, j) => [f, levelNames[(i + j) % levelNames.length]]));
    const { game } = botGame(i + 1, levels);
    assert.ok(game.winner, `game ${i + 1} had no winner`);
    checkInvariants(game);
  }
});

test('a bot game is reproducible from its seed', () => {
  const levels = Object.fromEntries(IDS.map((f) => [f, 'medium']));
  const a = botGame(9, levels).game;
  const b = botGame(9, levels).game;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('hard beats random: a hard bot at the table out-wins a random one', () => {
  let hard = 0;
  let random = 0;
  for (let i = 0; i < 24; i++) {
    const order = [...IDS.slice(i % 4), ...IDS.slice(0, i % 4)];
    const levels = { humans: 'hard', orcs: 'random', elves: 'hard', dwarves: 'random' };
    const w = botGame(i + 1, levels, { order }).game.winner;
    if (levels[w] === 'hard') hard++;
    else random++;
  }
  assert.ok(hard > random * 3, `hard won ${hard}, random won ${random}`);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
