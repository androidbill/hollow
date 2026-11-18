// A room: the one shared record every player's device reads and writes.
// All the rules about WHO may do WHAT live here as pure functions, so they can be
// tested without a network and reused unchanged over any transport.
//
// Every function takes a room and returns { ok: true, room } (a fresh copy, rev
// bumped) or { ok: false, error }. The transport applies one of these inside a
// transaction, so two devices acting at once cannot both win: the loser's function
// runs against the winner's result and is refused.
//
// The game itself is stored as a JSON *string* (room.game), and so is the move
// history. Realtime Database silently drops empty arrays and empty objects, and
// a game state is full of them; a string survives the trip intact.
//
// room = {
//   code, rev, status: 'lobby' | 'playing' | 'over', hostId,
//   seats: { factionId: { kind: 'open' }
//                     | { kind: 'human', id, name, misses? }
//                     | { kind: 'bot', level, away? } },   // away: the human a bot is covering for
//   game: string | null, hist: string,
//   turnLimit: seconds a human may sit idle (0 = no timer),
//   deadline?: ms epoch by which the acting human must move, when a timer is running,
//   last?: { f?: faction, t: move type | 'timeout' | 'start' } - the latest event, for sound
// }
//
// THE CLOCK. Functions that touch time take `now` as an argument instead of reading
// a clock, which keeps them pure and testable. The caller passes server-corrected
// time (transport.now()), so every device agrees on it to within a network round
// trip. A device that lies about `now` could expire someone's turn early; rooms are
// open by design and there is no server to check, so this is the honour system.

import { applyMove, createGame, currentFaction, legalMoves } from './engine.js';
import { DEFAULT_ORDER } from './factions/index.js';

export const BOT_LEVELS = ['easy', 'medium', 'hard'];
export const TURN_LIMITS = [0, 30, 60, 90, 120, 180]; // seconds; 0 = off
export const MISSES_BEFORE_AWAY = 2; // timeouts in a row before a bot covers the seat
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they read as 1 and 0 aloud

export const makeCode = (rand = Math.random) =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

const fail = (error) => ({ ok: false, error });

// Copy the room, let `edit` change the copy, bump the revision.
function next(room, edit) {
  const copy = structuredClone(room);
  edit(copy);
  copy.rev = room.rev + 1;
  return { ok: true, room: copy };
}

export function newRoom(code, hostId, hostName, hostSeat = 'humans', turnLimit = 0) {
  const seats = {};
  for (const f of DEFAULT_ORDER) seats[f] = { kind: 'open' };
  if (hostSeat) seats[hostSeat] = { kind: 'human', id: hostId, name: hostName };
  return { code, rev: 1, status: 'lobby', hostId, seats, game: null, hist: '[]', turnLimit };
}

// Add a line to the room's history, keeping the last 60.
function addHist(r, who, text) {
  const hist = JSON.parse(r.hist || '[]');
  hist.push({ who, text });
  r.hist = JSON.stringify(hist.slice(-60));
}

// Start (or clear) the idle clock for whoever acts next. A clock only runs for a
// human who is expected to move; bots and finished games have none.
function stamp(r, game, now) {
  delete r.deadline;
  if (!r.turnLimit || now === undefined || game.winner) return;
  if (r.seats[currentFaction(game)]?.kind === 'human') r.deadline = now + r.turnLimit * 1000;
}

export const seatOf = (room, id) => DEFAULT_ORDER.find((f) => room.seats[f].kind === 'human' && room.seats[f].id === id) || null;
export const roomGame = (room) => (room.game ? JSON.parse(room.game) : null);
export const roomHistory = (room) => JSON.parse(room.hist || '[]');

// ------------------------------------------------------------------- lobby
export function claimSeat(room, id, name, faction) {
  if (room.status !== 'lobby') return fail('the game has already started');
  const seat = room.seats[faction];
  if (!seat) return fail('no such seat');
  if (seat.kind !== 'open' && !(seat.kind === 'human' && seat.id === id)) return fail('that seat is taken');
  return next(room, (r) => {
    for (const f of DEFAULT_ORDER) if (r.seats[f].kind === 'human' && r.seats[f].id === id) r.seats[f] = { kind: 'open' };
    r.seats[faction] = { kind: 'human', id, name };
  });
}

export function leaveSeat(room, id) {
  if (room.status !== 'lobby') return fail('the game has already started');
  const f = seatOf(room, id);
  if (!f) return fail('you have no seat');
  return next(room, (r) => { r.seats[f] = { kind: 'open' }; });
}

// Host only: open a seat, fill it with a bot, or kick whoever sits there.
export function setSeat(room, actor, faction, spec) {
  if (actor !== room.hostId) return fail('only the host can do that');
  if (room.status !== 'lobby') return fail('the game has already started');
  if (!room.seats[faction]) return fail('no such seat');
  let seat;
  if (spec.kind === 'open') seat = { kind: 'open' };
  else if (spec.kind === 'bot' && BOT_LEVELS.includes(spec.level)) seat = { kind: 'bot', level: spec.level };
  else return fail('bad seat setting');
  return next(room, (r) => { r.seats[faction] = seat; });
}

// Host only: how long a human may sit idle before their turn is passed (0 = no timer).
export function setTimer(room, actor, seconds) {
  if (actor !== room.hostId) return fail('only the host can do that');
  if (room.status !== 'lobby') return fail('the game has already started');
  if (!TURN_LIMITS.includes(seconds)) return fail('bad timer setting');
  return next(room, (r) => { r.turnLimit = seconds; });
}

export function startGame(room, actor, seed, now) {
  if (actor !== room.hostId) return fail('only the host can start the game');
  if (room.status !== 'lobby') return fail('the game has already started');
  const factions = DEFAULT_ORDER.filter((f) => room.seats[f].kind !== 'open');
  if (factions.length < 2) return fail('fill at least two seats');
  return next(room, (r) => {
    const game = createGame({ seed, factions });
    r.game = JSON.stringify(game);
    r.hist = '[]';
    r.status = 'playing';
    r.last = { t: 'start' };
    for (const f of DEFAULT_ORDER) if (r.seats[f].kind === 'human') r.seats[f].misses = 0;
    stamp(r, game, now);
  });
}

export function backToLobby(room, actor) {
  if (actor !== room.hostId) return fail('only the host can do that');
  if (room.status === 'lobby') return fail('already in the lobby');
  return next(room, (r) => {
    r.game = null;
    r.hist = '[]';
    r.status = 'lobby';
    delete r.deadline;
    delete r.last;
    // a bot that was covering for someone who went away hands the seat back
    for (const f of DEFAULT_ORDER) {
      const s = r.seats[f];
      if (s.kind === 'bot' && s.away) r.seats[f] = { kind: 'human', id: s.away.id, name: s.away.name };
    }
  });
}

// -------------------------------------------------------------------- play
// `rev` is the revision the sender was looking at when they chose the move. If the
// room has moved on, the move is refused - this is what stops a double-tap from
// playing twice, and a slow device from playing into a position it never saw.
// A human may play their own seat; the host also plays for every bot seat.
export function submitMove(room, actor, faction, move, rev, text, now) {
  if (room.status !== 'playing') return fail('no game in progress');
  if (rev !== room.rev) return fail('stale: the room has moved on');
  const seat = room.seats[faction];
  const allowed = seat && ((seat.kind === 'human' && seat.id === actor) || (seat.kind === 'bot' && actor === room.hostId));
  if (!allowed) return fail('that is not your seat');
  const game = JSON.parse(room.game);
  if (currentFaction(game) !== faction) return fail(`it is ${currentFaction(game)}'s turn`);
  const res = applyMove(game, faction, move);
  if (!res.ok) return fail(res.error);
  return next(room, (r) => {
    r.game = JSON.stringify(res.game);
    r.last = { f: faction, t: move.type }; // what just happened, so every device can play the right sound
    if (text) addHist(r, faction, text);
    if (res.game.winner) r.status = 'over';
    if (r.seats[faction].kind === 'human') r.seats[faction].misses = 0; // they are here
    stamp(r, res.game, now); // the clock restarts after every move
  });
}

// --------------------------------------------------------------- host handover
// The host's device plays the bots and holds the lobby controls, so a room needs
// somebody to be host at all times. A host can hand over on purpose, and if they
// vanish a present player claims it (who is "present" is a transport matter - see
// presence() - so these functions only check the rules, not who is online).
const isSeatedHuman = (room, id) =>
  DEFAULT_ORDER.some((f) => room.seats[f].kind === 'human' && room.seats[f].id === id);
const seatedName = (room, id) => DEFAULT_ORDER.map((f) => room.seats[f]).find((s) => s.kind === 'human' && s.id === id)?.name;

function noteHost(r, id) {
  if (r.status === 'playing') {
    const f = DEFAULT_ORDER.find((x) => r.seats[x].kind === 'human' && r.seats[x].id === id);
    addHist(r, f, `${seatedName(r, id)} is now the host`);
  }
}

// The current host gives the room to another seated player.
export function setHost(room, actor, newHost) {
  if (actor !== room.hostId) return fail('only the host can do that');
  if (newHost === actor) return fail('you are already the host');
  if (!isSeatedHuman(room, newHost)) return fail('the new host must be a seated player');
  return next(room, (r) => { r.hostId = newHost; noteHost(r, newHost); });
}

// A seated player takes over an abandoned room. `rev` is the revision they saw, so if
// anything changed meanwhile (the host came back and moved, someone else claimed)
// the claim is refused rather than overriding it.
export function claimHost(room, actor, rev) {
  if (rev !== room.rev) return fail('stale: the room has moved on');
  if (actor === room.hostId) return fail('you are already the host');
  if (!isSeatedHuman(room, actor)) return fail('only a seated player can take over');
  return next(room, (r) => { r.hostId = actor; noteHost(r, actor); });
}

// -------------------------------------------------------------------- timer
// Anyone's device may call this once the clock has run out; the first call wins and
// the rest are refused (the new deadline is in the future). It passes the stalled
// human's WHOLE turn: end each phase, or take the chant's forced orders as they come.
// After MISSES_BEFORE_AWAY timeouts in a row a bot covers the seat until they return.
export function expireTurn(room, now) {
  if (room.status !== 'playing') return fail('no game in progress');
  if (!room.turnLimit || room.deadline === undefined) return fail('no timer is running');
  if (now < room.deadline) return fail('the clock has not run out');
  let game = JSON.parse(room.game);
  const faction = currentFaction(game);
  const seat = room.seats[faction];
  if (seat.kind !== 'human') return fail('only a human seat has a timer');

  for (let guard = 0; !game.winner && currentFaction(game) === faction; guard++) {
    if (guard > 80) return fail('could not pass the turn');
    const moves = legalMoves(game);
    const move = moves.find((m) => m.type === 'endPhase') || moves.find((m) => m.type === 'frenzy') || moves[0];
    const res = applyMove(game, faction, move);
    if (!res.ok) return fail(res.error);
    game = res.game;
  }

  return next(room, (r) => {
    r.game = JSON.stringify(game);
    r.last = { f: faction, t: 'timeout' };
    if (game.winner) r.status = 'over';
    const s = r.seats[faction];
    const misses = (s.misses || 0) + 1;
    addHist(r, faction, `${s.name} ran out of time; their turn was passed`);
    if (misses >= MISSES_BEFORE_AWAY) {
      r.seats[faction] = { kind: 'bot', level: 'medium', away: { id: s.id, name: s.name } };
      addHist(r, faction, `${s.name} is away: a bot plays for them`);
    } else {
      s.misses = misses;
    }
    stamp(r, game, now);
  });
}

// The player a bot is covering for takes their seat back. If it is their turn the
// clock starts afresh, so they are not handed a turn that is already running out.
export function reclaimSeat(room, actor, now) {
  if (room.status !== 'playing') return fail('no game in progress');
  const faction = DEFAULT_ORDER.find((f) => room.seats[f].kind === 'bot' && room.seats[f].away?.id === actor);
  if (!faction) return fail('no seat to take back');
  return next(room, (r) => {
    const { id, name } = r.seats[faction].away;
    r.seats[faction] = { kind: 'human', id, name, misses: 0 };
    addHist(r, faction, `${name} is back`);
    stamp(r, JSON.parse(r.game), now);
  });
}
