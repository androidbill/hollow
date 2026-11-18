import assert from 'node:assert/strict';
import { createMemoryTransport } from '../src/transport-memory.js';
import {
  backToLobby, claimHost, claimSeat, expireTurn, leaveSeat, makeCode, newRoom, normalizeCode,
  reclaimSeat, roomGame, roomHistory, seatOf, setHost, setSeat, setTimer, startGame, submitMove,
} from '../src/room.js';
import { currentFaction } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}\n     ${err.stack?.split('\n').slice(0, 3).join('\n     ')}`);
    process.exitCode = 1;
  }
};

// Realtime Database drops empty arrays and empty objects without telling you.
// Anything we store must survive that, so the room itself may contain none.
function findEmpty(value, path = 'room') {
  if (Array.isArray(value)) {
    if (value.length === 0) return path;
    for (let i = 0; i < value.length; i++) { const f = findEmpty(value[i], `${path}[${i}]`); if (f) return f; }
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return path;
    for (const k of keys) { const f = findEmpty(value[k], `${path}.${k}`); if (f) return f; }
  }
  return null;
}

const setup = async () => {
  const net = createMemoryTransport();
  await net.create('ABCD', newRoom('ABCD', 'host', 'Ana'));
  return net;
};

await test('codes are four letters with no I or O, and typed codes are cleaned up', () => {
  for (let i = 0; i < 200; i++) assert.match(makeCode(), /^[A-HJ-NP-Z]{4}$/);
  assert.equal(normalizeCode(' ab-cd9x '), 'ABCD');
});

await test('a new room seats the host and leaves the rest open', () => {
  const r = newRoom('ABCD', 'host', 'Ana');
  assert.equal(seatOf(r, 'host'), 'humans');
  assert.equal(r.seats.orcs.kind, 'open');
  assert.equal(findEmpty(r), null);
});

await test('a seat can be taken once; taking another seat frees the first', async () => {
  const net = await setup();
  assert.equal((await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'))).ok, true);
  const second = await net.update('ABCD', (r) => claimSeat(r, 'cy', 'Cy', 'orcs'));
  assert.equal(second.ok, false);
  assert.match(second.error, /taken/);
  const moved = await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'elves'));
  assert.equal(moved.room.seats.orcs.kind, 'open');
  assert.equal(moved.room.seats.elves.id, 'bo');
});

await test('two devices grabbing the same seat in the same instant: exactly one wins', async () => {
  const net = await setup();
  const [a, b] = await Promise.all([
    net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'dwarves')),
    net.update('ABCD', (r) => claimSeat(r, 'cy', 'Cy', 'dwarves')),
  ]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
});

await test('only the host sets seats and starts, and starting needs two seats', async () => {
  const net = await setup();
  assert.equal((await net.update('ABCD', (r) => setSeat(r, 'bo', 'orcs', { kind: 'bot', level: 'easy' }))).ok, false);
  assert.equal((await net.update('ABCD', (r) => startGame(r, 'host', 1))).ok, false); // host alone
  assert.equal((await net.update('ABCD', (r) => setSeat(r, 'host', 'orcs', { kind: 'bot', level: 'godlike' }))).ok, false);
  assert.equal((await net.update('ABCD', (r) => setSeat(r, 'host', 'orcs', { kind: 'bot', level: 'easy' }))).ok, true);
  assert.equal((await net.update('ABCD', (r) => startGame(r, 'bo', 1))).ok, false); // not the host
  const started = await net.update('ABCD', (r) => startGame(r, 'host', 1));
  assert.equal(started.ok, true);
  assert.equal(started.room.status, 'playing');
  // an open seat is simply not in the game
  assert.deepEqual(roomGame(started.room).order, ['humans', 'orcs']);
});

await test('the host can kick a player out of a seat', async () => {
  const net = await setup();
  await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  const kicked = await net.update('ABCD', (r) => setSeat(r, 'host', 'orcs', { kind: 'open' }));
  assert.equal(kicked.room.seats.orcs.kind, 'open');
  assert.equal((await net.update('ABCD', (r) => leaveSeat(r, 'host'))).ok, true);
});

await test('moves: right player only, right revision only, never twice', async () => {
  const net = await setup();
  await net.update('ABCD', (r) => setSeat(r, 'host', 'orcs', { kind: 'bot', level: 'easy' }));
  await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'elves'));
  const room = (await net.update('ABCD', (r) => startGame(r, 'host', 5))).room;
  const g = roomGame(room);
  assert.equal(currentFaction(g), 'humans');
  const move = { type: 'endPhase' };

  // Bo has the elves; it is the humans' turn
  assert.match((await net.update('ABCD', (r) => submitMove(r, 'bo', 'humans', move, room.rev))).error, /not your seat/);
  // the host holds the humans seat, but is quoting an old revision
  assert.match((await net.update('ABCD', (r) => submitMove(r, 'host', 'humans', move, room.rev - 1))).error, /stale/);
  // the host cannot play the elves' seat either
  assert.match((await net.update('ABCD', (r) => submitMove(r, 'host', 'elves', move, room.rev))).error, /not your seat/);

  // the legal one goes through once; the identical double-tap is refused as stale
  const [first, second] = await Promise.all([
    net.update('ABCD', (r) => submitMove(r, 'host', 'humans', move, room.rev, 'humans end')),
    net.update('ABCD', (r) => submitMove(r, 'host', 'humans', move, room.rev, 'humans end')),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(roomHistory(first.room).length, 1);
});

await test('only the host may play for a bot seat', async () => {
  const net = await setup();
  await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  await net.update('ABCD', (r) => setSeat(r, 'host', 'elves', { kind: 'bot', level: 'easy' }));
  let room = (await net.update('ABCD', (r) => startGame(r, 'host', 3))).room;
  // walk the game to the elves' turn is long; instead check the rule directly on a hand-made room
  room = structuredClone(room);
  const g = roomGame(room);
  g.current = g.order.indexOf('elves');
  g.phase = 1;
  room.game = JSON.stringify(g);
  const asBo = submitMove(room, 'bo', 'elves', { type: 'endPhase' }, room.rev);
  assert.equal(asBo.ok, false);
  const asHost = submitMove(room, 'host', 'elves', { type: 'endPhase' }, room.rev);
  assert.equal(asHost.ok, true);
});

await test('a whole online game: two humans on their own clients, two bots run by the host', async () => {
  const net = createMemoryTransport();
  await net.create('GAME', newRoom('GAME', 'ana', 'Ana', 'humans'));
  await net.update('GAME', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  await net.update('GAME', (r) => setSeat(r, 'ana', 'elves', { kind: 'bot', level: 'medium' }));
  await net.update('GAME', (r) => setSeat(r, 'ana', 'dwarves', { kind: 'bot', level: 'easy' }));
  await net.update('GAME', (r) => startGame(r, 'ana', 77));

  let moves = 0;
  let refused = 0;
  for (;;) {
    const room = await net.get('GAME');
    assert.equal(findEmpty(room), null, 'the room must contain no empty array or object');
    assert.deepEqual(JSON.parse(JSON.stringify(room)), room, 'the room must survive a JSON round trip');
    if (room.status === 'over') break;
    const g = roomGame(room);
    const f = currentFaction(g);
    const seat = room.seats[f];
    const actor = seat.kind === 'bot' ? 'ana' : seat.id;
    const level = seat.kind === 'bot' ? seat.level : 'hard';
    const move = chooseMove(g, { level });
    const res = await net.update('GAME', (r) => submitMove(r, actor, f, move, room.rev, `${f}:${move.type}`));
    if (!res.ok) refused++;
    assert.ok(res.ok, `refused a legal move: ${res.error}`);
    if (++moves > 5000) throw new Error('game never finished');
  }
  const done = await net.get('GAME');
  assert.ok(roomGame(done).winner);
  assert.ok(roomHistory(done).length > 0);
  assert.equal(refused, 0);
});

await test('after a game the host can reset to the lobby and start again', async () => {
  const net = await setup();
  await net.update('ABCD', (r) => setSeat(r, 'host', 'orcs', { kind: 'bot', level: 'easy' }));
  await net.update('ABCD', (r) => startGame(r, 'host', 1));
  assert.equal((await net.update('ABCD', (r) => backToLobby(r, 'bo'))).ok, false);
  const lobby = await net.update('ABCD', (r) => backToLobby(r, 'host'));
  assert.equal(lobby.room.status, 'lobby');
  assert.equal(lobby.room.game, null);
  assert.equal((await net.update('ABCD', (r) => startGame(r, 'host', 2))).ok, true);
});

await test('subscribers hear about every change, and can stop listening', async () => {
  const net = await setup();
  const seen = [];
  const stop = net.subscribe('ABCD', (r) => seen.push(r?.rev));
  await new Promise((r) => setTimeout(r, 5));
  await net.update('ABCD', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  stop();
  await net.update('ABCD', (r) => claimSeat(r, 'cy', 'Cy', 'elves'));
  assert.deepEqual(seen, [1, 2]);
});

// ----------------------------------------------------------------- turn timers
const T0 = 1_000_000;
const timerRoom = async (limit = 60, hostSeat = 'humans') => {
  const net = createMemoryTransport();
  await net.create('TIME', newRoom('TIME', 'ana', 'Ana', hostSeat, limit));
  await net.update('TIME', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  await net.update('TIME', (r) => setSeat(r, 'ana', 'elves', { kind: 'bot', level: 'easy' }));
  return net;
};

await test('only the host sets the timer, only to an allowed value, only in the lobby', async () => {
  const net = await timerRoom(0);
  assert.equal((await net.update('TIME', (r) => setTimer(r, 'bo', 60))).ok, false);
  assert.equal((await net.update('TIME', (r) => setTimer(r, 'ana', 45))).ok, false);
  const ok = await net.update('TIME', (r) => setTimer(r, 'ana', 90));
  assert.equal(ok.room.turnLimit, 90);
  await net.update('TIME', (r) => startGame(r, 'ana', 1, T0));
  assert.equal((await net.update('TIME', (r) => setTimer(r, 'ana', 30))).ok, false);
});

await test('the clock starts for a human, restarts after every move, and stops for a bot', async () => {
  const net = await timerRoom(60);
  const started = (await net.update('TIME', (r) => startGame(r, 'ana', 1, T0))).room;
  assert.equal(started.deadline, T0 + 60_000); // the humans (Ana) move first
  const moved = (await net.update('TIME', (r) => submitMove(r, 'ana', 'humans', { type: 'endPhase' }, started.rev, 'x', T0 + 10_000))).room;
  assert.equal(currentFaction(roomGame(moved)), 'orcs');
  assert.equal(moved.deadline, T0 + 70_000); // Bo is human: fresh 60s from the move
  assert.equal(findEmpty(moved), null);
});

await test('no timer when the limit is 0, or when it is a bot who acts', async () => {
  const off = await timerRoom(0);
  assert.equal((await off.update('TIME', (r) => startGame(r, 'ana', 1, T0))).room.deadline, undefined);
  const botFirst = await timerRoom(60, null); // host has no seat; humans seat is open, orcs is Bo
  await botFirst.update('TIME', (r) => setSeat(r, 'ana', 'humans', { kind: 'bot', level: 'easy' }));
  assert.equal((await botFirst.update('TIME', (r) => startGame(r, 'ana', 1, T0))).room.deadline, undefined);
});

await test('a turn cannot be expired early, and expires exactly once when two devices race', async () => {
  const net = await timerRoom(60);
  await net.update('TIME', (r) => startGame(r, 'ana', 1, T0));
  assert.match((await net.update('TIME', (r) => expireTurn(r, T0 + 59_999))).error, /not run out/);
  const [a, b] = await Promise.all([
    net.update('TIME', (r) => expireTurn(r, T0 + 60_000)),
    net.update('TIME', (r) => expireTurn(r, T0 + 60_000)),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
});

await test('an expired turn passes the whole turn to the next faction and notes it', async () => {
  const net = await timerRoom(60);
  await net.update('TIME', (r) => startGame(r, 'ana', 1, T0));
  const after = (await net.update('TIME', (r) => expireTurn(r, T0 + 61_000))).room;
  assert.equal(currentFaction(roomGame(after)), 'orcs');
  assert.equal(after.seats.humans.misses, 1);
  assert.equal(after.deadline, T0 + 61_000 + 60_000);
  assert.match(roomHistory(after).at(-1).text, /ran out of time/);
});

await test('an Orc chant with forced orders can still be passed', async () => {
  const net = await timerRoom(60);
  // swap seats: Ana steps out of the humans, Bo takes them (freeing the orcs), Ana takes the orcs
  await net.update('TIME', (r) => leaveSeat(r, 'ana'));
  assert.equal((await net.update('TIME', (r) => claimSeat(r, 'bo', 'Bo', 'humans'))).ok, true);
  assert.equal((await net.update('TIME', (r) => claimSeat(r, 'ana', 'Ana', 'orcs'))).ok, true);
  let room = (await net.update('TIME', (r) => startGame(r, 'ana', 4, T0))).room;
  // Bo (humans) ends his turn, so the orcs (Ana) are up and must run the chant
  room = (await net.update('TIME', (r) => submitMove(r, 'bo', 'humans', { type: 'endPhase' }, room.rev, null, T0))).room;
  const g = roomGame(room);
  assert.equal(currentFaction(g), 'orcs');
  const res = await net.update('TIME', (r) => expireTurn(r, T0 + 61_000));
  assert.equal(res.ok, true, res.error);
  assert.notEqual(currentFaction(roomGame(res.room)), 'orcs');
});

await test('two timeouts in a row hand the seat to a bot; coming back takes it again', async () => {
  const net = await timerRoom(30);
  await net.update('TIME', (r) => startGame(r, 'ana', 2, T0));
  let now = T0;
  const tick = async () => { now += 31_000; return net.update('TIME', (r) => expireTurn(r, now)); };
  // Ana (humans) is first and last to be skipped; keep expiring whoever is up until her seat flips
  let room;
  for (let i = 0; i < 12; i++) {
    const cur = await net.get('TIME');
    if (cur.seats.humans.kind === 'bot') { room = cur; break; }
    const f = currentFaction(roomGame(cur));
    if (cur.seats[f].kind === 'bot') { // a bot's turn: the host plays it along
      const g = roomGame(cur);
      const m = chooseMove(g, { level: 'easy' });
      await net.update('TIME', (r) => submitMove(r, 'ana', f, m, cur.rev, null, now));
      continue;
    }
    await tick();
  }
  assert.equal(room.seats.humans.kind, 'bot');
  assert.deepEqual(room.seats.humans.away, { id: 'ana', name: 'Ana' });

  assert.equal((await net.update('TIME', (r) => reclaimSeat(r, 'bo', now))).ok, false); // not Bo's seat to take
  const back = await net.update('TIME', (r) => reclaimSeat(r, 'ana', now));
  assert.equal(back.room.seats.humans.kind, 'human');
  assert.equal(back.room.seats.humans.id, 'ana');
  assert.equal(back.room.seats.humans.misses, 0);
});

await test('a move resets the miss count, so only consecutive timeouts count', async () => {
  const net = await timerRoom(60);
  const started = (await net.update('TIME', (r) => startGame(r, 'ana', 1, T0))).room;
  const missed = (await net.update('TIME', (r) => expireTurn(r, T0 + 61_000))).room;
  assert.equal(missed.seats.humans.misses, 1);
  // play round to Ana again: Bo (orcs) acts, then the bot elves, then Ana
  let room = missed;
  let now = T0 + 61_000;
  for (let i = 0; i < 20 && currentFaction(roomGame(room)) !== 'humans'; i++) {
    const g = roomGame(room);
    const f = currentFaction(g);
    const seat = room.seats[f];
    const actor = seat.kind === 'bot' ? 'ana' : seat.id;
    const m = chooseMove(g, { level: 'easy' });
    room = (await net.update('TIME', (r) => submitMove(r, actor, f, m, room.rev, null, now))).room;
  }
  assert.equal(currentFaction(roomGame(room)), 'humans');
  room = (await net.update('TIME', (r) => submitMove(r, 'ana', 'humans', { type: 'endPhase' }, room.rev, null, now))).room;
  assert.equal(room.seats.humans.misses, 0);
  void started;
});

await test('a table of humans who all walk away still finishes: timeouts, then bots', async () => {
  const net = createMemoryTransport();
  await net.create('AFK1', newRoom('AFK1', 'a', 'A', 'humans', 30));
  await net.update('AFK1', (r) => claimSeat(r, 'b', 'B', 'orcs'));
  await net.update('AFK1', (r) => claimSeat(r, 'c', 'C', 'elves'));
  await net.update('AFK1', (r) => claimSeat(r, 'd', 'D', 'dwarves'));
  let now = T0;
  await net.update('AFK1', (r) => startGame(r, 'a', 9, now));
  for (let i = 0; i < 4000; i++) {
    const room = await net.get('AFK1');
    assert.equal(findEmpty(room), null);
    if (room.status === 'over') break;
    const g = roomGame(room);
    const f = currentFaction(g);
    if (room.seats[f].kind === 'bot') {
      const m = chooseMove(g, { level: 'medium' });
      const res = await net.update('AFK1', (r) => submitMove(r, 'a', f, m, room.rev, null, now));
      assert.ok(res.ok, res.error);
    } else {
      now += 31_000;
      const res = await net.update('AFK1', (r) => expireTurn(r, now));
      assert.ok(res.ok, res.error);
    }
  }
  const done = await net.get('AFK1');
  assert.equal(done.status, 'over');
  assert.ok(Object.values(done.seats).every((s) => s.kind === 'bot'), 'every seat ended up bot-covered');
});

// ------------------------------------------------------------------ last event
await test('the room records the latest event (start, a move, a timeout) for sound, and clears it in the lobby', async () => {
  const net = await timerRoom(60);
  const started = (await net.update('TIME', (r) => startGame(r, 'ana', 1, T0))).room;
  assert.deepEqual(started.last, { t: 'start' });
  const moved = (await net.update('TIME', (r) => submitMove(r, 'ana', 'humans', { type: 'endPhase' }, started.rev, null, T0))).room;
  assert.deepEqual(moved.last, { f: 'humans', t: 'endPhase' });
  const expired = (await net.update('TIME', (r) => expireTurn(r, T0 + 61_000))).room;
  assert.deepEqual(expired.last, { f: 'orcs', t: 'timeout' });
  assert.equal(findEmpty(expired), null);
  const lobby = (await net.update('TIME', (r) => backToLobby(r, 'ana'))).room;
  assert.equal(lobby.last, undefined);
});

// ------------------------------------------------------------- host handover
const hostRoom = async () => {
  const net = createMemoryTransport();
  await net.create('HAND', newRoom('HAND', 'ana', 'Ana', 'humans', 0));
  await net.update('HAND', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  await net.update('HAND', (r) => setSeat(r, 'ana', 'elves', { kind: 'bot', level: 'easy' }));
  await net.update('HAND', (r) => setSeat(r, 'ana', 'dwarves', { kind: 'bot', level: 'easy' }));
  return net;
};

await test('the host can hand over, but only to a seated player, and only the host can', async () => {
  const net = await hostRoom();
  assert.match((await net.update('HAND', (r) => setHost(r, 'bo', 'bo'))).error, /only the host/);
  assert.match((await net.update('HAND', (r) => setHost(r, 'ana', 'ana'))).error, /already/);
  assert.match((await net.update('HAND', (r) => setHost(r, 'ana', 'stranger'))).error, /seated/);
  const done = await net.update('HAND', (r) => setHost(r, 'ana', 'bo'));
  assert.equal(done.room.hostId, 'bo');
});

await test('after a handover the old host loses the controls and the new one has them', async () => {
  const net = await hostRoom();
  await net.update('HAND', (r) => setHost(r, 'ana', 'bo'));
  assert.equal((await net.update('HAND', (r) => setTimer(r, 'ana', 60))).ok, false);
  assert.equal((await net.update('HAND', (r) => setTimer(r, 'bo', 60))).ok, true);
  const started = (await net.update('HAND', (r) => startGame(r, 'ana', 1))).ok;
  assert.equal(started, false);
  assert.equal((await net.update('HAND', (r) => startGame(r, 'bo', 1))).ok, true);
});

await test('only the current host plays the bots: after a handover the old host is refused', async () => {
  const net = await hostRoom();
  let room = (await net.update('HAND', (r) => startGame(r, 'ana', 3))).room;
  // walk to the elves (a bot seat) by ending turns for the humans
  const play = async (actor, f, m) => { const res = await net.update('HAND', (r) => submitMove(r, actor, f, m, room.rev)); assert.ok(res.ok, res.error); room = res.room; };
  while (currentFaction(roomGame(room)) !== 'elves') {
    const g = roomGame(room);
    const f = currentFaction(g);
    // humans play their own seat; the host plays the bot seats on the way
    const actor = room.seats[f].kind === 'human' ? room.seats[f].id : 'ana';
    await play(actor, f, chooseMove(g, { level: 'easy' }));
  }
  const move = chooseMove(roomGame(room), { level: 'easy' });
  await net.update('HAND', (r) => setHost(r, 'ana', 'bo'));
  room = await net.get('HAND');
  assert.match(submitMove(room, 'ana', 'elves', move, room.rev).error, /not your seat/);
  assert.equal(submitMove(room, 'bo', 'elves', move, room.rev).ok, true);
});

await test('claiming an abandoned room: a seated player may, a stranger may not, a stale claim is refused', async () => {
  const net = await hostRoom();
  const room = await net.get('HAND');
  assert.match((await net.update('HAND', (r) => claimHost(r, 'stranger', room.rev))).error, /seated/);
  assert.match((await net.update('HAND', (r) => claimHost(r, 'ana', room.rev))).error, /already/);
  assert.match((await net.update('HAND', (r) => claimHost(r, 'bo', room.rev - 1))).error, /stale/);
  const won = await net.update('HAND', (r) => claimHost(r, 'bo', room.rev));
  assert.equal(won.room.hostId, 'bo');
});

await test('two players claiming the same abandoned room at once: exactly one wins', async () => {
  const net = await hostRoom();
  await net.update('HAND', (r) => claimSeat(r, 'cy', 'Cy', 'elves'));
  const room = await net.get('HAND');
  const [a, b] = await Promise.all([
    net.update('HAND', (r) => claimHost(r, 'bo', room.rev)),
    net.update('HAND', (r) => claimHost(r, 'cy', room.rev)),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
});

await test('a game keeps going when the host vanishes: another player claims and drives the bots to the end', async () => {
  // Ana only hosts (no seat); Bo plays the orcs against three bots that Ana's device drives
  const net = createMemoryTransport();
  await net.create('HAND', newRoom('HAND', 'ana', 'Ana', null, 0));
  await net.update('HAND', (r) => claimSeat(r, 'bo', 'Bo', 'orcs'));
  for (const f of ['humans', 'elves', 'dwarves']) await net.update('HAND', (r) => setSeat(r, 'ana', f, { kind: 'bot', level: 'easy' }));
  await net.update('HAND', (r) => startGame(r, 'ana', 21));
  let host = 'ana';
  for (let i = 0; i < 3000; i++) {
    let room = await net.get('HAND');
    assert.equal(findEmpty(room), null);
    if (room.status === 'over') break;
    if (i === 40 && host === 'ana') {
      // Ana's tab closes. Bo, the only seated human, claims the room.
      const claim = await net.update('HAND', (r) => claimHost(r, 'bo', room.rev));
      assert.ok(claim.ok, claim.error);
      host = 'bo';
      room = claim.room;
      assert.match(roomHistory(room).at(-1).text, /Bo is now the host/);
    }
    const g = roomGame(room);
    const f = currentFaction(g);
    const seat = room.seats[f];
    const actor = seat.kind === 'bot' ? host : seat.id;
    const move = chooseMove(g, { level: seat.kind === 'bot' ? seat.level : 'medium' });
    const res = await net.update('HAND', (r) => submitMove(r, actor, f, move, room.rev));
    assert.ok(res.ok, actor + ' as ' + f + ': ' + res.error);
    if (host === 'bo') { // the old host can no longer play the bots
      const stale = submitMove(res.room, 'ana', 'humans', { type: 'endPhase' }, res.room.rev);
      assert.equal(stale.ok, false);
    }
  }
  assert.equal((await net.get('HAND')).status, 'over');
});

await test('presence: announcing and leaving is seen by watchers', async () => {
  const net = createMemoryTransport();
  const seen = [];
  const stopWatch = net.watchPresence('PRES', (ids) => seen.push([...ids].sort().join(',')));
  await new Promise((r) => setTimeout(r, 5));
  const a = net.announce('PRES', 'ana');
  const b = net.announce('PRES', 'bo');
  a();
  b();
  stopWatch();
  net.announce('PRES', 'cy'); // after unsubscribing: not heard
  assert.deepEqual(seen, ['', 'ana', 'ana,bo', 'bo', '']);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
