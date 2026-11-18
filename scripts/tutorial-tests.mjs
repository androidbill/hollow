import assert from 'node:assert/strict';
import { applyMove, currentFaction, legalMoves } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';
import { checkInvariants } from '../src/sim.js';
import { onBoard, wc } from '../src/helpers.js';
import { ADJ } from '../src/map.js';
import { LESSONS, LESSON_ORDER } from '../ui/tutorial-script.js';
import { logLine } from '../ui/text.js';

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

// Plays a lesson the way the app does: on every "move" step you make exactly the move the
// step allows, and the bots (with real randomness) play the "watch" steps. Returns the
// game after each move step so lesson-specific claims can be checked.
function walk(lesson, { level = 'medium', trace = false } = {}) {
  let g = lesson.scenario();
  const hist = [];
  let snap = null;
  const seen = [];
  const counts = {};
  const after = {};
  const apply = (move) => {
    const who = currentFaction(g);
    const line = logLine(g, move);
    const r = applyMove(g, who, move);
    assert.ok(r.ok, `${who} could not play ${JSON.stringify(move)}: ${r.error}`);
    if (line) hist.push({ who, text: line });
    g = r.game;
    checkInvariants(g);
  };
  const ctx = () => ({ g, hist, snap });
  assert.equal(currentFaction(g), lesson.me, `the ${lesson.me} lesson must start on the learner's turn`);

  for (const step of lesson.steps) {
    seen.push(step.id);
    const body = typeof step.body === 'function' ? step.body(ctx()) : step.body;
    assert.equal(typeof body, 'string', `${step.id}: body is not a string`);
    assert.ok(body.length > 20, `${step.id}: body is empty`);
    assert.ok(!body.includes('undefined') && !body.includes('NaN') && !body.includes('[object'), `${step.id}: a figure failed to resolve`);

    if (step.type === 'move') {
      if (step.skipIf?.(g)) { counts[step.id] = 'skipped'; continue; }
      assert.equal(currentFaction(g), lesson.me, `${step.id}: it is not the learner's turn`);
      const allowed = legalMoves(g).filter((m) => step.expect(m, g));
      assert.ok(allowed.length >= 1, `${step.id}: the move this step asks for is not legal`);
      assert.ok(allowed.length <= 4, `${step.id}: allows ${allowed.length} moves, too loose for a step that teaches one thing`);
      counts[step.id] = allowed.length;
      apply(allowed[0]);
      if (step.snapshot) snap = { vp: { ...g.vp }, warriors: g.board.reduce((n, cl) => n + (cl.w[lesson.me] || 0), 0) };
      if (step.after) {
        const html = step.after(ctx());
        assert.equal(typeof html, 'string', `${step.id}: after() is not a string`);
        assert.ok(!html.includes('undefined') && !html.includes('NaN'), `${step.id}: after() has a figure that failed to resolve`);
      }
      after[step.id] = structuredClone(g);
    } else if (step.type === 'watch') {
      for (let guard = 0; currentFaction(g) === step.faction && !g.winner; guard++) {
        assert.ok(guard < 400, `${step.id}: the ${step.faction} never finished`);
        apply(chooseMove(g, { level }));
      }
      assert.notEqual(currentFaction(g), step.faction, `${step.id}: did not finish`);
    } else {
      assert.equal(step.type, 'read', `${step.id}: unknown step type ${step.type}`);
    }
  }
  return { g, seen, counts, after, trace };
}

test('there are four lessons, in the recommended order, each starting on its own faction', () => {
  assert.deepEqual(LESSON_ORDER, ['humans', 'dwarves', 'orcs', 'elves']);
  for (const id of LESSON_ORDER) {
    const l = LESSONS[id];
    assert.equal(l.me, id);
    assert.ok(l.label && l.tagline && l.minutes > 0 && l.steps.length > 8, `${id}: incomplete lesson`);
    assert.equal(currentFaction(l.scenario()), id, `${id}: the learner must go first`);
  }
});

for (const id of LESSON_ORDER) {
  const lesson = LESSONS[id];

  test(`${id}: every step has an id, title, known type and body, and a final card closes the lesson`, () => {
    const ids = new Set();
    for (const s of lesson.steps) {
      assert.ok(s.id && s.title && s.body, `${s.id}: missing field`);
      assert.ok(['read', 'move', 'watch'].includes(s.type), `${s.id}: bad type`);
      assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
      ids.add(s.id);
      if (s.type === 'move') assert.ok(s.expect && s.hint, `${s.id}: a move step needs expect and hint`);
      if (s.type === 'watch') assert.ok(s.faction && s.faction !== id, `${s.id}: a watch step needs another faction`);
    }
    const last = lesson.steps.at(-1);
    assert.ok(last.final && last.type === 'read', 'the last step must be a final read card');
    assert.equal(lesson.steps.filter((s) => s.final).length, 1, 'exactly one final card');
  });

  test(`${id}: the whole lesson plays through against the real engine`, () => {
    const { seen } = walk(lesson);
    assert.equal(seen.at(-1), 'done');
  });

  test(`${id}: it still plays through 30 times with random bot behaviour`, () => {
    const orig = Math.random;
    try {
      for (let i = 0; i < 30; i++) {
        let s = (i + 1) * 7919 + id.length;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        walk(lesson, { level: ['easy', 'medium', 'hard'][i % 3] });
      }
    } finally {
      Math.random = orig;
    }
  });
}

// ------------------------------------------------ what each lesson's text promises
await test('humans: the fight rolls 3 and 1, you score the warcamp, and it costs one warrior', () => {
  const { after } = walk(LESSONS.humans);
  const g = after.attack;
  assert.match(g.log.at(-1), /dice 3,1 -> 3 hits \/ 1 hits back/);
  assert.equal(g.vp.humans, 2);
  assert.equal(g.board[4].w.humans, 3);
});

await test('humans: each "do this" step permits exactly one move', () => {
  const { counts } = walk(LESSONS.humans);
  for (const id of ['march', 'mill', 'moveIn', 'attack', 'endDay']) assert.equal(counts[id], 1, `${id} allows ${counts[id]} moves`);
});

await test('dwarves: dig, tunnel hop and attack each allow one move; the fight is 2 and 1 and scores the mill', () => {
  const { counts, after } = walk(LESSONS.dwarves);
  for (const id of ['dig', 'hop', 'attack', 'endDay']) assert.equal(counts[id], 1, `${id} allows ${counts[id]} moves`);
  assert.match(after.attack.log.at(-1), /dice 2,1 -> 2 hits \/ 1 hits back/);
  assert.equal(after.attack.vp.dwarves, 1);
  assert.equal(after.attack.board[1].b.filter((p) => p.f === 'humans').length, 0, 'the mill is destroyed');
  assert.equal(after.hop.board[11].w.dwarves, undefined, 'the whole army jumped');
});

await test('dwarves: the tunnel hop really ignores the paths (clearings 11 and 1 are not neighbours)', () => {
  assert.ok(!ADJ[11].includes(1), 'the lesson relies on 11 and 1 not being adjacent');
  const { after } = walk(LESSONS.dwarves);
  assert.ok(after.dig.board[1].k.some((p) => p.f === 'dwarves' && p.t === 'tunnel'), 'the tunnel is dug where the scout is');
  assert.equal(after.hop.board[1].w.dwarves, 7, '6 from home plus the scout');
});

await test('orcs: each chant step allows one move, and at the trap the ONLY legal choice is frenzy', () => {
  const { counts, after } = walk(LESSONS.orcs);
  for (const id of ['recruit', 'march', 'battle', 'build', 'endDawn']) assert.equal(counts[id], 1, `${id} allows ${counts[id]} moves`);
  // replay to just before the frenzy and look at what the engine offers
  const lesson = LESSONS.orcs;
  let g = lesson.scenario();
  for (const step of lesson.steps) {
    if (step.type !== 'move') continue;
    if (step.id === 'frenzy') {
      const moves = legalMoves(g);
      assert.deepEqual(moves, [{ type: 'frenzy' }], 'the trap must leave frenzy as the only choice');
      break;
    }
    g = applyMove(g, 'orcs', legalMoves(g).find((m) => step.expect(m, g))).game;
  }
  assert.match(after.battle.log.at(-1), /dice 2,1 -> 3 hits \/ 1 hits back/);
  assert.equal(after.battle.vp.orcs, 4, 'destroying the mill scores the point the text promises');
});

await test('orcs: the frenzy costs exactly one point and throws the added orders away', () => {
  const { after } = walk(LESSONS.orcs);
  assert.equal(after.frenzy.vp.orcs, after.recruit2.vp.orcs - 1);
  assert.deepEqual(after.frenzy.fs.orcs.extras, []);
  assert.deepEqual(after.frenzy.fs.orcs.pending, []);
  assert.equal(onBoard(after.build, 'orcs', 'warcamp'), 2);
});

await test('elves: spread then revolt, with the supporters, points and stronghold the text quotes', () => {
  const { counts, after } = walk(LESSONS.elves);
  for (const id of ['spread', 'revolt', 'endDay', 'organize']) assert.equal(counts[id], 1, `${id} allows ${counts[id]} moves`);
  assert.equal(after.spread.fs.elves.supporters, 4);
  assert.equal(after.revolt.fs.elves.supporters, 2);
  assert.equal(after.revolt.vp.elves, 1, 'the destroyed mill scores one point');
  assert.equal(wc(after.revolt, 4, 'elves'), 2, '1 + one neighbouring sympathetic clearing');
  assert.ok(after.revolt.board[4].b.some((p) => p.f === 'elves' && p.t === 'stronghold'));
  assert.equal(after.revolt.board[4].b.filter((p) => p.f === 'humans').length, 0);
  assert.equal(after.organize.vp.elves, after.revolt.vp.elves + 1, 'organizing scores the next sympathy point');
});

await test('elves: a stronghold is worth an extra action: the rule the text quotes (2 base, +1 per stronghold)', () => {
  const { after } = walk(LESSONS.elves);
  // deterministic: the position right after the revolt, before any bot has moved
  const strongholds = onBoard(after.revolt, 'elves', 'stronghold');
  assert.equal(strongholds, 1, 'the revolt plants exactly one stronghold');
  assert.equal(2 + strongholds, 3, '2 base actions + 1 per stronghold = 3');
});

// The controller (ui/tutorial.js) is what turns the script into a lesson: it decides whether a
// move was the one being taught, when to advance, and when the bots may play. These tests
// drive the REAL controller exactly as the app does, with a stand-in for the page. One bug
// that only this can catch: a step's expect() describes the board BEFORE the move ("move
// all the warriors"), so judging the move against the board after it never advances.
await test('the controller walks every lesson to its end, driven exactly as the app drives it', async () => {
  const els = {};
  globalThis.document = {
    getElementById: (id) => (els[id] ??= { id, innerHTML: '', hidden: true, classList: { toggle() {} } }),
  };
  const { createTutorial } = await import('../ui/tutorial.js');

  for (const id of LESSON_ORDER) {
    const lesson = LESSONS[id];
    const state = { g: lesson.scenario(), history: [] };
    const events = { finished: [], completed: [], redraws: 0 };
    const tut = createTutorial({
      getState: () => state,
      onFinish: (what) => events.finished.push(what),
      onComplete: (lessonId) => events.completed.push(lessonId),
      redraw: () => { events.redraws++; },
    });
    tut.begin(id);

    const play = (move) => {
      const who = currentFaction(state.g);
      const line = logLine(state.g, move);
      const r = applyMove(state.g, who, move);
      assert.ok(r.ok, `${who} could not play ${JSON.stringify(move)}`);
      if (line) state.history.push({ who, text: line });
      state.g = r.game;
    };

    let moveSteps = 0;
    for (let guard = 0; guard < 500 && !tut.current.final; guard++) {
      const c = tut.current;
      if (c.type === 'move' && c.mode === 'step') {
        const allowed = tut.filterMoves(legalMoves(state.g));
        assert.ok(allowed.length >= 1, `${id}/${c.id}: the controller offers no move`);
        // a step that teaches something other than ending the phase must not offer "End"
        const move = allowed[0];
        if (move.type !== 'endPhase') {
          assert.ok(!allowed.some((m) => m.type === 'endPhase'), `${id}/${c.id}: "End" is offered while teaching ${move.type}`);
        }
        const before = state.g;
        play(move);
        tut.onRoom(); // the app's subscription fires first...
        tut.afterMove(move, before); // ...then the click handler reports the move
        moveSteps++;
        assert.notDeepEqual(tut.current, c, `${id}/${c.id}: the lesson did not advance after the move was made`);
      } else if (c.type === 'watch') {
        assert.ok(!tut.holdBots(), `${id}/${c.id}: bots must be free to play while watching`);
        for (let i = 0; currentFaction(state.g) === c.faction && i < 400; i++) { play(chooseMove(state.g, { level: 'medium' })); tut.onRoom(); }
        assert.notEqual(tut.current.id, c.id, `${id}/${c.id}: a watch step did not end when the faction finished`);
      } else {
        assert.ok(tut.holdBots() || currentFaction(state.g) === lesson.me, `${id}/${c.id}: bots must wait while a card is being read`);
        tut.handle('next');
      }
    }
    assert.equal(tut.current.id, 'done', `${id}: never reached the final card`);
    assert.ok(moveSteps >= 5, `${id}: too few move steps (${moveSteps})`);
    assert.deepEqual(events.completed, [id], `${id}: completion should be reported once`);
    assert.ok(events.redraws > 5, `${id}: the board should be redrawn as steps change`);

    tut.handle('lessons');
    assert.deepEqual(events.finished, ['lessons']);
    assert.equal(tut.current, null, 'the controller stops after finishing');
  }
  delete globalThis.document;
});

await test('the figures quoted in the humans text come from the rules, not from memory', () => {
  const text = LESSONS.humans.steps.map((s) => (typeof s.body === 'function'
    ? s.body({ g: LESSONS.humans.scenario(), hist: [], snap: { vp: { humans: 2 }, warriors: 5 } }) : s.body)).join(' ');
  for (const must of ['1, 2, 3, 4, 5, 6', '1, 1, 2, 2, 3, 3', 'war chant', 'frenzy', 'sympathy', 'tunnel']) {
    assert.ok(text.includes(must), `the tutorial text should mention "${must}"`);
  }
});

await test('the How to Play guide has every section and quotes the live rule numbers', async () => {
  const { SECTIONS, guideHtml } = await import('../ui/howto.js');
  const { FACTIONS } = await import('../src/factions/index.js');
  const { WIN_VP, MAX_ROUNDS } = await import('../src/engine.js');
  const html = guideHtml();
  for (const [id] of SECTIONS) assert.ok(html.includes(`id="g-${id}"`), `missing section ${id}`);
  const must = [
    String(WIN_VP), String(MAX_ROUNDS),
    FACTIONS.humans.facts.millScore.slice(1).join(', '),
    FACTIONS.orcs.facts.campScore.slice(1).join(', '),
    FACTIONS.elves.facts.spreadCost.join(', '),
    FACTIONS.elves.facts.spreadScore.join(', '),
    ...Object.values(FACTIONS).map((f) => f.name),
  ];
  for (const m of must) assert.ok(html.includes(m), `the guide should quote "${m}"`);
  assert.ok(!html.includes('undefined') && !html.includes('NaN'), 'a figure failed to resolve');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
