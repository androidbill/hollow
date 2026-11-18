import assert from 'node:assert/strict';
import { applyMove, createGame, currentFaction, legalMoves } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';
import { diffGames, sameGame } from '../ui/fx-diff.js';
import { LESSONS } from '../ui/tutorial-script.js';
import * as renderModule from '../ui/render.js';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
};

// What the room records after each move: who, and what kind.
const lastOf = (g, move) => ({ f: currentFaction(g), t: move.type });

function play(g, move) {
  const last = lastOf(g, move);
  const next = applyMove(g, currentFaction(g), move).game;
  return { next, last, d: diffGames(g, next, last) };
}

const key = (p) => `${p.f}:${p.t}`;
const multiset = (list) => {
  const m = {};
  for (const p of list) m[key(p)] = (m[key(p)] || 0) + 1;
  return m;
};

// The strongest check: the description must be COMPLETE and CORRECT. Starting from the old
// board and applying exactly the events described has to give the new board, everywhere.
function assertReconstructs(prev, next, d) {
  for (let c = 0; c < prev.board.length; c++) {
    const w = { ...prev.board[c].w };
    for (const m of d.moves) {
      if (m.from === c) w[m.f] = (w[m.f] || 0) - m.n;
      if (m.to === c) w[m.f] = (w[m.f] || 0) + m.n;
    }
    for (const x of d.gains) if (x.c === c) w[x.f] = (w[x.f] || 0) + x.n;
    for (const x of d.losses) if (x.c === c) w[x.f] = (w[x.f] || 0) - x.n;
    for (const f of Object.keys(w)) if (w[f] === 0) delete w[f];
    assert.deepEqual(w, next.board[c].w, `warriors in clearing ${c}`);

    for (const [kind, key2] of [['building', 'b'], ['token', 'k']]) {
      const have = multiset(prev.board[c][key2]);
      for (const p of d.built) if (p.c === c && p.kind === kind) have[key(p)] = (have[key(p)] || 0) + 1;
      for (const p of d.destroyed) if (p.c === c && p.kind === kind) have[key(p)] = (have[key(p)] || 0) - 1;
      for (const k of Object.keys(have)) if (have[k] === 0) delete have[k];
      assert.deepEqual(have, multiset(next.board[c][key2]), `${kind}s in clearing ${c}`);
    }
  }
  for (const f of next.order) {
    assert.equal(prev.vp[f] + (d.vp[f] || 0), next.vp[f], `score of ${f}`);
  }
  // indices must point at real places
  for (const p of d.destroyed) assert.ok(p.index < prev.board[p.c][p.kind === 'building' ? 'b' : 'k'].length, 'destroyed index is inside the old list');
  for (const p of d.built) assert.ok(p.index < next.board[p.c][p.kind === 'building' ? 'b' : 'k'].length, 'built index is inside the new list');
}

await test('a march is one army leaving one clearing and arriving in another', () => {
  const g = LESSONS.humans.scenario();
  const { d } = play(g, { type: 'move', from: 0, to: 1, n: 1 });
  assert.deepEqual(d.moves, [{ f: 'humans', from: 0, to: 1, n: 1 }]);
  assert.deepEqual([d.gains, d.losses, d.built, d.destroyed], [[], [], [], []]);
});

await test('a build is a new building at the next slot; nothing else changes', () => {
  let g = LESSONS.humans.scenario();
  g = play(g, { type: 'move', from: 0, to: 1, n: 1 }).next;
  const { d } = play(g, { type: 'build', at: 1, building: 'mill' });
  assert.deepEqual(d.built, [{ c: 1, kind: 'building', f: 'humans', t: 'mill', index: 0 }]);
  assert.deepEqual([d.moves, d.gains, d.losses, d.destroyed], [[], [], [], []]);
});

await test('an attack reports the dice and what died: the warrior, the warcamp and one casualty back', () => {
  let g = LESSONS.humans.scenario();
  for (const m of [{ type: 'move', from: 0, to: 1, n: 1 }, { type: 'build', at: 1, building: 'mill' }, { type: 'move', from: 0, to: 4, n: 4 }]) g = play(g, m).next;
  const { d } = play(g, { type: 'battle', at: 4, target: 'orcs' });
  assert.deepEqual(d.battle, { c: 4, att: 'humans', def: 'orcs', a: 3, b: 1, hi: 3, lo: 1, dealt: 3, back: 1 });
  assert.deepEqual(d.losses.sort((x, y) => x.f.localeCompare(y.f)), [{ c: 4, f: 'humans', n: 1 }, { c: 4, f: 'orcs', n: 1 }]);
  assert.deepEqual(d.destroyed, [{ c: 4, kind: 'building', f: 'orcs', t: 'warcamp', index: 0 }]);
  assert.deepEqual(d.vp, { humans: 1 }, 'destroying the warcamp scored a point');
});

await test('a tunnel hop is a march between clearings that are not neighbours', () => {
  let g = LESSONS.dwarves.scenario();
  g = play(g, { type: 'dig', at: 1 }).next;
  const { d } = play(g, { type: 'move', from: 11, to: 1, n: 6 });
  assert.deepEqual(d.moves, [{ f: 'dwarves', from: 11, to: 1, n: 6 }]);
});

await test('a revolt: enemies die, a stronghold appears, warriors arrive and the point is scored', () => {
  let g = LESSONS.elves.scenario();
  g = play(g, { type: 'spread', at: 4 }).next;
  const { d } = play(g, { type: 'revolt', at: 4 });
  assert.deepEqual(d.built, [{ c: 4, kind: 'building', f: 'elves', t: 'stronghold', index: 0 }]);
  assert.deepEqual(d.destroyed, [{ c: 4, kind: 'building', f: 'humans', t: 'mill', index: 0 }]);
  assert.deepEqual(d.gains, [{ c: 4, f: 'elves', n: 2 }]);
  assert.deepEqual(d.losses, [{ c: 4, f: 'humans', n: 1 }]);
  assert.equal(d.battle, null, 'a revolt has no dice');
  assert.deepEqual(d.vp, { elves: 1 });
});

await test('the engine\'s own automatic phases (recruits at dawn, points at dusk) show up as gains and score', () => {
  const g = createGame({ seed: 5 });
  // end the Humans\' day: the Orcs\' dawn is manual, but the Dwarves\' automatic dawn happens later; just chain endPhase
  let cur = g;
  let sawGain = false;
  for (let i = 0; i < 40 && !sawGain; i++) {
    const m = legalMoves(cur).find((x) => x.type === 'endPhase') || legalMoves(cur)[0];
    const { next, d } = play(cur, m);
    assertReconstructs(cur, next, d);
    if (d.gains.length || Object.keys(d.vp).length) sawGain = true;
    cur = next;
  }
  assert.ok(sawGain, 'an automatic phase should produce a visible gain or score change');
});

await test('two consecutive positions of one game are the same game; a new game or a lesson is not', () => {
  const g = createGame({ seed: 5 });
  const next = applyMove(g, 'humans', { type: 'endPhase' }).game;
  assert.equal(sameGame(g, next), true);
  assert.equal(sameGame(g, createGame({ seed: 6 })), false);
  assert.equal(sameGame(g, LESSONS.orcs.scenario()), false, 'rotated order is a different game');
  assert.equal(sameGame(null, g), false);
});

const view = { targets: new Set(), sel: null, dest: null, hoverPath: null };

await test('layout() puts every piece exactly where the board draws it, so a sliding army lands on its token', () => {
  const { layout, renderBoardInner } = renderModule;
  // a position with warriors, buildings and tokens of several factions
  let g = LESSONS.elves.scenario();
  g = play(g, { type: 'spread', at: 4 }).next;
  g = play(g, { type: 'revolt', at: 4 }).next;
  const dw = LESSONS.dwarves.scenario();
  for (const game of [g, dw, LESSONS.humans.scenario()]) {
    const markup = renderBoardInner(game, view);
    let checked = 0;
    for (let c = 0; c < game.board.length; c++) {
      const L = layout(game, c);
      for (const [f, p] of Object.entries(L.warriors)) {
        assert.ok(markup.includes(`href="assets/piece-warrior-${f}.png" x="${p.x - 20}" y="${p.y - 20}"`), `warriors ${f} in ${c}`);
        checked++;
      }
      for (const b of L.buildings) { assert.ok(markup.includes(`x="${b.x - 17}" y="${b.y - 17}" width="34"`), `building ${b.i} in ${c}`); checked++; }
      for (const t of L.tokens) { assert.ok(markup.includes(`x="${t.x - 15}" y="${t.y - 15}" width="30"`), `token ${t.i} in ${c}`); checked++; }
    }
    assert.ok(checked > 8, 'the position should have had pieces to check');
  }
});

await test('the board draws exactly the pieces it is told to hide as invisible, and no others', () => {
  const { renderBoardInner } = renderModule;
  const g = LESSONS.dwarves.scenario();
  const hide = new Set(['w:11:dwarves', 'b:11:0', 't:11:0']);
  const html = renderBoardInner(g, { ...view, hide });
  assert.equal((html.match(/style="visibility:hidden"/g) || []).length, 3, 'the army, the stronghold and the tunnel');
  assert.equal((renderBoardInner(g, view).match(/visibility:hidden/g) || []).length, 0, 'nothing hidden by default');
});

await test('the description is complete and correct for every move of 150 random games (all four factions)', () => {
  const origRandom = Math.random;
  let moves = 0;
  const kinds = new Set();
  try {
    for (let seed = 1; seed <= 150; seed++) {
      let s = seed * 2654435761;
      Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      let g = createGame({ seed });
      while (!g.winner && moves < 1e7) {
        const level = ['random', 'easy', 'medium'][seed % 3];
        const move = chooseMove(g, { level });
        const { next, d } = play(g, move);
        assertReconstructs(g, next, d);
        if (d.moves.length) kinds.add('move');
        if (d.gains.length) kinds.add('gain');
        if (d.losses.length) kinds.add('loss');
        if (d.built.length) kinds.add('built');
        if (d.destroyed.length) kinds.add('destroyed');
        if (d.battle) kinds.add('battle');
        if (Object.keys(d.vp).length) kinds.add('vp');
        g = next;
        moves++;
      }
    }
  } finally {
    Math.random = origRandom;
  }
  for (const k of ['move', 'gain', 'loss', 'built', 'destroyed', 'battle', 'vp']) assert.ok(kinds.has(k), `the fuzz never produced a "${k}" event`);
  assert.ok(moves > 5000, `only ${moves} moves checked`);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
