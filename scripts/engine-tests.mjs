import assert from 'node:assert/strict';
import { applyMove, createGame, currentFaction, legalMoves } from '../src/engine.js';
import { checkInvariants, checkMap, randomPlayout } from '../src/sim.js';

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

test('map is connected and every path runs both ways', checkMap);

test('a new game is dealt for all four factions and conserves pieces', () => {
  const g = createGame({ seed: 7 });
  assert.deepEqual(g.order, ['humans', 'orcs', 'elves', 'dwarves']);
  checkInvariants(g);
  assert.ok(legalMoves(g).length > 0);
});

test('applyMove does not mutate the game it was given', () => {
  const g = createGame({ seed: 3 });
  const before = JSON.stringify(g);
  applyMove(g, currentFaction(g), legalMoves(g)[0]);
  assert.equal(JSON.stringify(g), before);
});

test('applyMove rejects an illegal move and a move out of turn', () => {
  const g = createGame({ seed: 3 });
  const bad = applyMove(g, currentFaction(g), { type: 'battle', at: 99, target: 'nobody' });
  assert.equal(bad.ok, false);
  const wrongSeat = applyMove(g, 'dwarves', { type: 'endPhase' });
  assert.equal(wrongSeat.ok, false);
});

test('the same seed plays out the same way', () => {
  const a = randomPlayout(11);
  const b = randomPlayout(11);
  assert.equal(JSON.stringify(a.game), JSON.stringify(b.game));
});

test('every faction pair also plays to a finish', () => {
  const ids = ['humans', 'orcs', 'elves', 'dwarves'];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let s = 1; s <= 5; s++) randomPlayout(s, { factions: [ids[i], ids[j]] });
    }
  }
});

test('200 random four-player games finish with no illegal move and no lost piece', () => {
  const used = {};
  const reasons = {};
  for (let seed = 1; seed <= 200; seed++) {
    const { game, used: u } = randomPlayout(seed);
    reasons[game.reason] = (reasons[game.reason] || 0) + 1;
    for (const [k, n] of Object.entries(u)) used[k] = (used[k] || 0) + n;
  }
  // every kind of move in the rules was exercised at least once
  const expected = [
    'humans:move', 'humans:battle', 'humans:build',
    'orcs:addOrder', 'orcs:recruit', 'orcs:move', 'orcs:battle', 'orcs:build', 'orcs:frenzy',
    'elves:spread', 'elves:revolt', 'elves:organize', 'elves:move', 'elves:battle',
    'dwarves:move', 'dwarves:battle', 'dwarves:dig', 'dwarves:forge',
  ];
  const missing = expected.filter((k) => !used[k]);
  assert.deepEqual(missing, [], `never exercised: ${missing.join(', ')}`);
  console.log('     endings:', JSON.stringify(reasons));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
