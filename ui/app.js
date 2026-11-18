// The interface: menu, lobby, board, side panel, and the loop that lets the host's
// device play the bots. All rules come from src/engine.js and src/room.js; nothing
// here decides what is legal.
//
// Solo and online are the same thing: a room. Solo is a room in a private in-memory
// transport with you and some bots in it; online is a room in a shared transport.
// One code path, so solo exercises everything online does.

import { currentFaction, legalMoves, WIN_VP } from '../src/engine.js';
import { chooseMove } from '../src/bot.js';
import { DEFAULT_ORDER } from '../src/factions/index.js';
import {
  TURN_LIMITS, backToLobby, claimHost, claimSeat, expireTurn, leaveSeat, makeCode, newRoom,
  normalizeCode, reclaimSeat, roomGame, roomHistory, seatOf, setHost, setSeat, setTimer, startGame,
  submitMove,
} from '../src/room.js';
import { createMemoryTransport } from '../src/transport-memory.js';
import { SOUND_FOR_MOVE, isMuted, play, setMuted, unlock } from './audio.js';
import { connectTransport } from './net/index.js';
import { SECTIONS, guideHtml } from './howto.js';
import { createTutorial } from './tutorial.js';
import { LESSONS, LESSON_ORDER } from './tutorial-script.js';
import { createFx } from './fx.js';
import { COLORS, NAMES, boardShell, crestSrc, renderBoardInner } from './render.js';
import { BLURB, clearingOf, label, logLine, statusLine } from './text.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Your identity (and saved room) live in localStorage, which every tab on this
// origin shares. To test with two tabs on one machine, open the second with
// ?player=2 - it gets its own identity, so the room sees two different people.
const SLOT = new URLSearchParams(location.search).get('player') || '';
const store = {
  get: (k) => { try { return localStorage.getItem(`hollow${SLOT}-${k}`); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`hollow${SLOT}-${k}`, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(`hollow${SLOT}-${k}`); } catch { /* private mode */ } },
};

const DEFAULT_TURN_LIMIT = 90; // seconds a human may sit idle, for rooms (solo has no timer)

const state = {
  vpSeen: null, // the scores as last drawn, so a change can be animated
  scoresHtml: null, // the scoreboard markup as last drawn; it is only rebuilt when it changes
  tutorialPending: false, // a lesson id while a lesson room is starting; begin the coach when its game arrives
  expiring: false, // a timeout request of ours is in flight
  lastTick: null, // which clock tick we last sounded, so each second sounds once
  present: null, // Set of player ids currently in the room (null until we hear)
  hostMissingSince: null, // when we first noticed the host was gone (local ms)
  claiming: false, // a request of ours to become host is in flight
  stopAnnounce: null,
  stopWatch: null,
  online: null, // { net, note } - the shared transport, once connected
  net: null, // the transport of the room we are in
  solo: false,
  code: null,
  room: null,
  g: null,
  history: [],
  myId: store.get('id') || (crypto.randomUUID?.() ?? String(Math.random()).slice(2)),
  myName: store.get('name') || '',
  unsubscribe: null,
  token: 0, // bumps on leaving a room, so a stale bot loop can tell it should stop
  driving: false,
  pending: false, // a move of mine is in flight; ignore taps until it lands
  sel: null,
  dest: null,
  hoverPath: null,
  note: '',
};
store.set('id', state.myId);

// ------------------------------------------------------------------- animation
// Animations are decorations drawn over the board (see fx.js); the board is always already
// correct underneath. They are off when the person asked for that here, or when their device
// asks for reduced motion.
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const animationsOn = () => store.get('anim') !== '0' && !reducedMotion?.matches;
const fx = createFx({ getSvg: () => document.getElementById('board').querySelector('svg'), enabled: animationsOn });

// The board lives in a persistent <svg>: its board layer is repainted on every change, its
// effects layer is left alone so a playing animation survives the repaint.
function paintBoard(g, view) {
  const host = document.getElementById('board');
  let svg = host.querySelector('svg');
  if (!svg) { host.innerHTML = boardShell(); svg = host.querySelector('svg'); }
  svg.querySelector('#board-layer').innerHTML = renderBoardInner(g, { ...view, hide: fx.hidden });
}

// The tutorial is an ordinary solo game plus a coach (see tutorial.js).
const tutorial = createTutorial({
  getState: () => state,
  onFinish: (what, id) => finishTutorial(what, id),
  onComplete: (id) => markLessonDone(id),
  redraw: () => draw(),
});

// ------------------------------------------------------------------ screens
function show(screen) {
  for (const id of ['menu', 'setup', 'lessons', 'lobby', 'over']) $(id).hidden = id !== screen;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

function myName() {
  const typed = $('name').value.trim() || state.myName || 'Player';
  state.myName = typed.slice(0, 14);
  store.set('name', state.myName);
  return state.myName;
}

// --------------------------------------------------------------- entering rooms
async function ensureOnline() {
  if (!state.online) state.online = await connectTransport();
  return state.online;
}

function enter(net, code, { solo = false } = {}) {
  leaveRoom({ quiet: true });
  state.net = net;
  state.code = code;
  state.solo = solo;
  state.room = null;
  state.g = null;
  state.history = [];
  state.token++;
  if (!solo) store.set('room', code);
  state.unsubscribe = net.subscribe(code, onRoom);
  if (!solo) {
    // say we are here, and watch who else is, so a vanished host can be replaced
    state.stopAnnounce = net.announce(code, state.myId);
    state.stopWatch = net.watchPresence(code, (ids) => { state.present = ids; });
  }
}

function leaveRoom({ quiet = false } = {}) {
  fx.cancel();
  state.vpSeen = null;
  state.scoresHtml = null;
  tutorial.stop();
  state.tutorialPending = false;
  state.token++;
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.stopAnnounce?.();
  state.stopWatch?.();
  state.stopAnnounce = state.stopWatch = null;
  state.present = null;
  state.hostMissingSince = null;
  state.room = null;
  state.g = null;
  state.code = null;
  state.sel = null;
  store.del('room');
  if (!quiet) { show('menu'); drawMenu(); draw(); }
}

async function createRoom() {
  const { net } = await ensureOnline();
  const name = myName();
  for (let tries = 0; tries < 20; tries++) {
    const code = makeCode();
    if (await net.create(code, newRoom(code, state.myId, name, 'humans', DEFAULT_TURN_LIMIT))) { enter(net, code); return; }
  }
  toast('Could not find a free room code. Try again.');
}

async function joinRoom(rawCode) {
  const code = normalizeCode(rawCode);
  if (code.length !== 4) { toast('A room code is four letters.'); return; }
  const { net } = await ensureOnline();
  const room = await net.get(code);
  if (!room) { toast(`No room "${code}". Check the code with whoever made it.`); return; }
  const name = myName();
  // a player a bot has been covering for may walk back in to a game in progress
  const awayHere = DEFAULT_ORDER.some((f) => room.seats[f].kind === 'bot' && room.seats[f].away?.id === state.myId);
  if (!seatOf(room, state.myId) && !awayHere) {
    const free = DEFAULT_ORDER.find((f) => room.seats[f].kind === 'open');
    if (room.status !== 'lobby') { toast('That game has already started.'); return; }
    if (!free) { toast('That room is full.'); return; }
    const r = await net.update(code, (cur) => claimSeat(cur, state.myId, name, free));
    if (!r.ok) { toast(r.error); return; }
  }
  enter(net, code);
}

// Solo: a private room with you in your faction and bots in the rest.
async function startSolo() {
  await beginSolo(document.querySelector('input[name="seat"]:checked').value, $('level').value);
}

async function beginSolo(seat, level, { lesson = null } = {}) {
  const net = createMemoryTransport();
  const code = 'SOLO';
  const room = newRoom(code, state.myId, myName(), seat || null);
  for (const f of DEFAULT_ORDER) if (room.seats[f].kind === 'open') room.seats[f] = { kind: 'bot', level };
  await net.create(code, room);
  await net.update(code, (r) => startGame(r, state.myId, (Math.random() * 2 ** 31) | 0, net.now()));
  // the tutorial replaces the dealt game with its hand-set position and fixed seed
  if (lesson) {
    await net.update(code, (r) => ({ ok: true, room: { ...r, game: JSON.stringify(LESSONS[lesson].scenario()), rev: r.rev + 1 } }));
  }
  state.noSave = !!lesson;
  enter(net, code, { solo: true });
  state.tutorialPending = lesson; // set after enter(), which clears it
}

// A solo game lives only in this tab's memory, so every position is also written to this
// device; the menu offers to pick it up again. Lessons are not saved, and a finished game
// is dropped.
function saveSolo(room) {
  if (!state.solo || state.noSave) return;
  if (room.status !== 'playing' || state.g?.winner) store.del('solo');
  else store.set('solo', JSON.stringify(room));
}

function savedSolo() {
  try {
    const r = JSON.parse(store.get('solo') || 'null');
    return r && r.status === 'playing' && r.hostId === state.myId ? r : null;
  } catch { return null; }
}

async function resumeSolo() {
  const room = savedSolo();
  if (!room) { store.del('solo'); drawMenu(); return; }
  const net = createMemoryTransport();
  await net.create('SOLO', room);
  state.noSave = false;
  enter(net, 'SOLO', { solo: true });
}

const startLesson = (id) => beginSolo(LESSONS[id].me, 'medium', { lesson: id });

function finishTutorial(what, id) {
  if (what === 'guide') { openGuide(); return; }
  leaveRoom(); // returns to the menu
  if (what === 'play') beginSolo(LESSONS[id].me, 'medium');
  else if (what === 'lessons') openLessons();
  else if (what.startsWith('lesson:')) startLesson(what.slice(7));
}

// -------------------------------------------------------------------- lessons
// Which lessons you have finished is remembered on this device (reaching a lesson's
// final card counts), so the chooser can tick them off.
const doneLessons = () => { try { return JSON.parse(store.get('lessons') || '[]'); } catch { return []; } };
function markLessonDone(id) {
  const done = doneLessons();
  if (!done.includes(id)) store.set('lessons', JSON.stringify([...done, id]));
}

function openLessons() {
  const done = doneLessons();
  const next = LESSON_ORDER.find((id) => !done.includes(id));
  $('lesson-list').innerHTML = LESSON_ORDER.map((id) => {
    const l = LESSONS[id];
    const tag = done.includes(id) ? '<span class="lesson-tag done">Done</span>' : id === next ? '<span class="lesson-tag next">Up next</span>' : '';
    return `<button class="lesson" data-lesson="${id}" style="--c:${COLORS[id]}">
      <img class="crest" src="${crestSrc(id)}" alt="">
      <span class="lesson-text"><span class="lesson-head"><b>${l.label}</b>${tag}</span><small>${l.tagline}</small><small class="lesson-min">about ${l.minutes} minutes</small></span>
    </button>`;
  }).join('');
  show('lessons');
}

// ---------------------------------------------------------------- how to play
function openGuide(section) {
  if (!$('howto-body').dataset.ready) {
    $('howto-body').innerHTML = guideHtml();
    $('howto-nav').innerHTML = SECTIONS.map(([id, label]) => `<button data-go="${id}">${label}</button>`).join('');
    $('howto-body').dataset.ready = '1';
  }
  $('howto').hidden = false;
  $('howto').scrollTop = 0;
  if (section) document.getElementById(`g-${section}`)?.scrollIntoView();
  $('howto-close').focus();
}
function closeGuide() { $('howto').hidden = true; }

// ------------------------------------------------------------- room updates
function onRoom(room) {
  if (room === null) {
    if (state.code) { toast('That room no longer exists.'); leaveRoom(); }
    return;
  }
  if (state.room && room.rev < state.room.rev) return; // an older snapshot arriving late
  if (state.room && room.rev === state.room.rev) return; // one we already have (our own move, echoed back)
  noteTimeouts(state.room, room);
  noteHost(state.room, room);
  const before = { room: state.room, g: state.g };
  state.room = room;
  saveSolo(room);
  if (room.status === 'lobby') {
    state.g = null;
    state.history = [];
    state.sel = null;
    show('lobby');
    drawLobby();
    draw();
    return;
  }
  state.g = roomGame(room);
  state.history = roomHistory(room);
  state.sel = null;
  state.dest = null;
  state.hoverPath = null;
  playEvents(before, room, state.g);
  if (state.tutorialPending) { const id = state.tutorialPending; state.tutorialPending = false; tutorial.begin(id); } // first snapshot of a lesson
  if (!state.g.winner) show(null); // in a game: no overlay (draw() raises the game-over one)
  draw();
  fx.play(before.g, state.g, room.last); // the board is already right; this just shows how it got there
  tutorial.onRoom();
  if (room.hostId === state.myId) driveBots();
}

// Scores move visibly: the bar fills, the number counts, a "+n" floats and the row flashes.
function countTo(el, from, to, ms) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function animateScores(g) {
  const prev = state.vpSeen;
  state.vpSeen = { ...g.vp };
  if (!prev || !animationsOn()) return;
  for (const f of g.order) {
    const d = g.vp[f] - (prev[f] ?? g.vp[f]);
    const li = $('scores').querySelector(`li[data-f="${f}"]`);
    if (!d || !li) continue;
    const pct = (v) => `${Math.min(100, (v / WIN_VP) * 100)}%`;
    li.querySelector('.bar i').animate([{ width: pct(prev[f]) }, { width: pct(g.vp[f]) }], { duration: 750, easing: 'ease-out' });
    countTo(li.querySelector('b'), prev[f], g.vp[f], 650);
    const tag = document.createElement('span');
    tag.className = `score-float ${d > 0 ? 'up' : 'down'}`;
    tag.textContent = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
    li.appendChild(tag);
    tag.animate([
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(-4px)', offset: 0.2 },
      { opacity: 0, transform: 'translateY(-26px)' },
    ], { duration: 1300, fill: 'forwards' }).finished.then(() => tag.remove()).catch(() => {});
    li.animate([{ boxShadow: `0 0 0 0 ${COLORS[f]}aa` }, { boxShadow: `0 0 0 9px ${COLORS[f]}00` }], { duration: 750 });
  }
}

// Tell the player when it was THEIR clock that ran out, since they may have looked away.
function noteTimeouts(before, after) {
  if (!before || after.status === 'lobby') return;
  const mine = seatOf(after, state.myId);
  const was = before.seats[mine]?.misses || 0;
  if (mine && (after.seats[mine].misses || 0) > was) toast('Time ran out: your turn was passed.');
  const wasAway = DEFAULT_ORDER.some((f) => before.seats[f].away?.id === state.myId);
  const isAway = DEFAULT_ORDER.some((f) => after.seats[f].away?.id === state.myId);
  if (isAway && !wasAway) toast('You were away, so a bot is playing for you. Tap "Take my seat back".');
}

// ---------------------------------------------------------------------- sound
// Sound is decided here, from what changed between two snapshots of the room, so it
// is identical for your own moves, other players' moves and bots'. Nothing is played
// for the first snapshot (joining or reloading) or for a repeat of one we have seen.
const piecesOnBoard = (g) => g.board.reduce((n, cl) => n + cl.b.length + cl.k.length, 0);

function playEvents(before, room, g) {
  if (!before.room || before.room.rev === room.rev) return;
  const last = room.last;
  const name = last && SOUND_FOR_MOVE[last.t];
  if (name) play(name);

  // something was knocked down: the building or token count dropped in a fight
  if (before.g && (last?.t === 'battle' || last?.t === 'revolt') && piecesOnBoard(g) < piecesOnBoard(before.g)) {
    setTimeout(() => play('crumble'), 220);
  }
  // the game just ended
  if (g.winner && !before.g?.winner) {
    const mine = seatOf(room, state.myId);
    setTimeout(() => play(!mine || g.winner === mine ? 'win' : 'lose'), 450);
    return;
  }
  // the turn just passed to me
  if (before.g && !g.winner && currentFaction(g) !== currentFaction(before.g) && seatOf(room, state.myId) === currentFaction(g)) {
    setTimeout(() => play('turn'), 350);
  }
}

// browsers only allow audio after a gesture, so the first click, tap or key unlocks it
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { once: false, passive: true });

// ----------------------------------------------------------------- host handover
// The host's device plays the bots. If the host vanishes (tab closed, phone locked,
// connection lost) the transport's presence drops them from `present`, and after a
// short grace the first present seated player after them claims the room. Everyone
// computes the same "first", so normally exactly one device tries; if it fails (the
// room moved on) it simply tries again on the next tick.
const HOST_GRACE_MS = 8000; // rides out a brief connection blip

const successorOf = (room, present) =>
  DEFAULT_ORDER.map((f) => room.seats[f]).find((s) => s.kind === 'human' && s.id !== room.hostId && present.has(s.id))?.id || null;

function checkHost() {
  const { room, present } = state;
  if (!room || !present || state.solo) return;
  if (present.has(room.hostId)) { state.hostMissingSince = null; return; }
  if (!present.has(state.myId)) return; // our own presence is not confirmed yet
  state.hostMissingSince ??= Date.now();
  if (Date.now() - state.hostMissingSince < HOST_GRACE_MS) return;
  if (successorOf(room, present) !== state.myId || state.claiming) return;
  state.claiming = true;
  const rev = room.rev;
  state.net.update(state.code, (r) => claimHost(r, state.myId, rev))
    .then((res) => { if (res.ok) { state.hostMissingSince = null; onRoom(res.room); } })
    .finally(() => { state.claiming = false; });
}
setInterval(checkHost, 1000);

// Leaving on purpose as the host: give the room to someone first, if there is anyone.
async function handOffHost() {
  const { room, present } = state;
  if (!room || state.solo || room.hostId !== state.myId) return;
  const to = successorOf(room, present || new Set());
  if (to) await state.net.update(state.code, (r) => setHost(r, state.myId, to));
}

function noteHost(before, after) {
  if (!before || before.hostId === after.hostId) return;
  const s = DEFAULT_ORDER.map((f) => after.seats[f]).find((x) => x.kind === 'human' && x.id === after.hostId);
  toast(after.hostId === state.myId ? 'You are now the host.' : `${s?.name || 'Someone'} is now the host.`);
}

// Server-corrected time (see the transport's now()), so every device agrees on the clock.
const nowMs = () => state.net?.now?.() ?? Date.now();

async function submit(faction, move) {
  const room = state.room;
  const text = logLine(state.g, move);
  const res = await state.net.update(state.code, (cur) => submitMove(cur, state.myId, faction, move, room.rev, text, nowMs()));
  if (res.ok) onRoom(res.room);
  else if (!/stale/.test(res.error)) console.warn('move refused:', res.error);
  return res;
}

// The host's device plays every bot seat. If the host closes the tab the bots stop
// and the game waits; there is no server to take over.
async function driveBots() {
  if (state.driving) return;
  state.driving = true;
  const token = state.token;
  try {
    while (token === state.token && state.room?.status === 'playing') {
      const g = state.g;
      const f = currentFaction(g);
      const seat = state.room.seats[f];
      if (seat.kind !== 'bot') break;
      const rev = state.room.rev;
      // slower when animating, so you can follow what each faction does
      await sleep(animationsOn() ? 700 : state.solo ? 380 : 450);
      if (token !== state.token) break;
      if (state.room.rev !== rev) continue; // something changed while we waited; look again
      if (tutorial.holdBots()) continue; // the tutorial is explaining; the bots wait
      const res = await submit(f, chooseMove(g, { level: seat.level }));
      if (!res.ok && !/stale/.test(res.error)) break;
      // give a fight time to land: the dice tumble, the result shows, then the next move
      if (res.ok && animationsOn() && state.room?.last?.t === 'battle') await sleep(1300);
    }
  } finally {
    state.driving = false;
  }
}

async function onHumanMove(move) {
  if (!isMyTurn() || state.pending) return;
  if (tutorial.active && tutorial.filterMoves([move]).length === 0) return; // not the move this step teaches
  state.pending = true;
  const before = state.g; // the position the move was chosen on (the tutorial judges it against this)
  let ok = false;
  try {
    ok = (await submit(currentFaction(state.g), move)).ok;
  } finally {
    state.pending = false;
  }
  if (ok) tutorial.afterMove(move, before);
  if (state.room?.hostId === state.myId) driveBots();
}

// -------------------------------------------------------------------- views
function mySeat() {
  return state.room ? seatOf(state.room, state.myId) : null;
}

function isMyTurn() {
  const g = state.g;
  return !!g && !g.winner && mySeat() === currentFaction(g);
}

function drawMenu() {
  $('anim-toggle').checked = animationsOn();
  $('anim-toggle').disabled = !!reducedMotion?.matches;
  $('anim-note').textContent = reducedMotion?.matches ? 'Off: your device is set to reduce motion.' : '';
  $('name').value = state.myName;
  $('net-note').textContent = state.online?.note || '';
  const saved = store.get('room');
  $('resume').hidden = !saved;
  if (saved) $('resume').textContent = `Rejoin room ${saved}`;
  const solo = savedSolo();
  $('resume-solo').hidden = !solo;
  if (solo) {
    const g = roomGame(solo);
    const me = DEFAULT_ORDER.find((f) => solo.seats[f].id === state.myId);
    $('resume-solo').textContent = `Resume solo game (round ${g.round}${me ? `, ${NAMES[me]} ${g.vp[me]} VP` : ''})`;
  }
}

// The faction a bot is playing for ME because I went away, if any.
function awayFaction() {
  return state.room ? DEFAULT_ORDER.find((f) => state.room.seats[f].away?.id === state.myId) || null : null;
}

const fmtLimit = (s) => (s === 0 ? 'Off' : s % 60 === 0 && s >= 120 ? `${s / 60} minutes` : s === 60 ? '1 minute' : `${s} seconds`);

// The countdown in the status bar, for whoever's clock is running. It also fires the
// timeout: once the deadline passes, a device asks the room to pass the stalled turn.
// The host's device asks at once; everyone else waits a moment, so normally one
// request is made, but if the host has gone the rest still keep the game moving.
function tickClock() {
  const room = state.room;
  const el = $('clock');
  if (!room || room.status !== 'playing' || room.deadline === undefined) { el.textContent = ''; el.className = ''; return; }
  const left = room.deadline - nowMs();
  const secs = Math.max(0, Math.ceil(left / 1000));
  const f = currentFaction(state.g);
  const seat = room.seats[f];
  const mine = seat.kind === 'human' && seat.id === state.myId;
  el.textContent = `${mine ? 'Your clock' : seat.name || NAMES[f]} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  el.className = `${mine ? 'mine ' : ''}${secs <= 10 ? 'low' : ''}`;
  // a tick for the last seconds of my own clock, once per second
  if (mine && (secs === 10 || (secs <= 3 && secs > 0))) {
    const key = `${room.deadline}:${secs}`;
    if (state.lastTick !== key) { state.lastTick = key; play('tick'); }
  }
  const grace = room.hostId === state.myId ? 0 : 2000;
  if (left <= -grace && !state.expiring) {
    state.expiring = true;
    state.net.update(state.code, (r) => expireTurn(r, nowMs()))
      .then((res) => { if (res.ok) onRoom(res.room); })
      .finally(() => { state.expiring = false; });
  }
}
setInterval(tickClock, 250);

function drawLobby() {
  const room = state.room;
  const host = room.hostId === state.myId;
  const mine = mySeat();
  $('lobby-timer').value = String(room.turnLimit || 0);
  $('lobby-timer').disabled = !host;
  $('lobby-code').textContent = room.code;
  $('lobby-note').textContent = state.online?.note || '';
  $('lobby-seats').innerHTML = DEFAULT_ORDER.map((f) => {
    const seat = room.seats[f];
    let who = '<em>open</em>';
    let controls = '';
    if (seat.kind === 'human') {
      who = `${seat.name}${seat.id === state.myId ? ' (you)' : ''}${seat.id === room.hostId ? ' · host' : ''}`;
      if (seat.id === state.myId) controls = `<button class="mini" data-act="leave">Leave seat</button>`;
      else if (host) controls = `<button class="mini" data-act="host" data-id="${seat.id}">Make host</button><button class="mini" data-act="kick" data-f="${f}">Kick</button>`;
    } else if (seat.kind === 'bot') {
      who = `Bot · ${seat.level}`;
    }
    if (seat.kind === 'open' && !mine && room.status === 'lobby') controls = `<button class="mini" data-act="take" data-f="${f}">Take seat</button>`;
    if (seat.kind === 'open' && mine) controls = `<button class="mini" data-act="take" data-f="${f}">Move here</button>`;
    if (host && seat.kind !== 'human') {
      const v = seat.kind === 'bot' ? seat.level : 'open';
      controls += `<select data-act="set" data-f="${f}" aria-label="Fill ${NAMES[f]} seat">
        ${['open', 'easy', 'medium', 'hard'].map((o) => `<option value="${o}"${o === v ? ' selected' : ''}>${o === 'open' ? 'Open' : 'Bot · ' + o}</option>`).join('')}
      </select>`;
    }
    return `<li style="--c:${COLORS[f]}"><img class="crest" src="${crestSrc(f)}" alt="">
      <span class="who"><b>${NAMES[f]}</b><small>${who}</small></span><span class="ctl">${controls}</span></li>`;
  }).join('');
  const filled = DEFAULT_ORDER.filter((f) => room.seats[f].kind !== 'open').length;
  $('lobby-start').hidden = !host;
  $('lobby-start').disabled = filled < 2;
  $('lobby-start').textContent = filled < 2 ? 'Fill at least two seats' : 'Start game';
  $('lobby-wait').hidden = host;
  $('lobby-wait').textContent = mine ? 'Waiting for the host to start…' : 'Take a seat to play.';
}

function draw() {
  const g = state.g;
  if (!g) {
    $('board').innerHTML = '';
    $('status-text').textContent = '';
    $('clock').textContent = '';
    $('away').hidden = true;
    $('round').textContent = '';
    $('roomtag').textContent = '';
    $('scores').innerHTML = '';
    $('faction-info').innerHTML = '';
    $('actions').innerHTML = '';
    $('log').innerHTML = '';
    return;
  }
  const myTurn = isMyTurn();
  const moves = tutorial.filterMoves(myTurn ? legalMoves(g) : []); // in the tutorial: only the move being taught
  const targets = new Set();
  for (const m of moves) {
    const c = clearingOf(m);
    if (c !== null) targets.add(c);
  }

  paintBoard(g, {
    sel: state.sel, dest: state.dest, targets, hoverPath: state.hoverPath, focus: tutorial.focusClearings(),
  });
  $('roomtag').textContent = state.solo ? '' : `Room ${state.code}`;
  $('status-text').textContent = statusLine(g);
  $('away').hidden = !awayFaction();
  tickClock();
  $('round').textContent = `Round ${Math.min(g.round, 40)}`;
  $('status').style.setProperty('--c', g.winner ? COLORS[g.winner] : COLORS[currentFaction(g)]);

  const seats = state.room.seats;
  // Rebuilt only when it actually changes, so score animations in progress aren't wiped by
  // the redraws that happen every move. Whose turn it is changes far more often than the
  // scores do, so that is set separately below rather than baked into the markup.
  const scoresHtml = [...g.order].sort((a, b) => g.vp[b] - g.vp[a]).map((f) => {
    const s = seats[f];
    const tag = (s.kind === 'human' ? (s.id === state.myId ? ' (you)' : ` · ${s.name}`) : ' · bot') +
      (s.kind === 'human' && s.id === state.room.hostId ? ' · host' : '');
    return `<li data-f="${f}" style="--c:${COLORS[f]}">
      <img class="crest" src="${crestSrc(f)}" alt=""><span class="name">${NAMES[f]}<small>${tag}</small></span>
      <span class="bar"><i style="width:${Math.min(100, (g.vp[f] / WIN_VP) * 100)}%"></i></span>
      <b>${g.vp[f]}</b></li>`;
  }).join('');
  if (scoresHtml !== state.scoresHtml) {
    $('scores').innerHTML = scoresHtml;
    state.scoresHtml = scoresHtml;
    animateScores(g);
  }
  for (const li of $('scores').children) li.classList.toggle('on', !g.winner && currentFaction(g) === li.dataset.f);

  drawFactionInfo(g);
  drawActions(g, moves, myTurn);
  tutorial.refresh();

  $('log').innerHTML = state.history.slice(-40).reverse()
    .map((h) => `<li style="--c:${COLORS[h.who]}">${h.text}</li>`).join('');

  if (g.winner) {
    show('over');
    $('over-crest').src = crestSrc(g.winner);
    const mine = mySeat();
    $('over-title').textContent = mine ? (g.winner === mine ? 'You win!' : `${NAMES[g.winner]} win`) : `${NAMES[g.winner]} win`;
    $('over-sub').textContent = `${g.vp[g.winner]} victory points${g.reason === 'rounds' ? ' (round limit)' : ''}`;
    const host = state.room.hostId === state.myId;
    $('again').hidden = !host;
    $('again').textContent = state.solo ? 'Play again' : 'Back to lobby';
    $('over-wait').hidden = host;
  }
}

function drawFactionInfo(g) {
  const parts = [];
  const orc = g.fs.orcs;
  if (orc) {
    const base = ['recruit', 'move', 'battle', 'build'];
    const chant = orc.pending.length ? orc.pending : [...base, ...orc.extras];
    parts.push(`<div class="info" style="--c:${COLORS.orcs}"><b>Orc war chant</b> ` +
      chant.map((o, i) => `<span class="chip${i === 0 && orc.pending.length ? ' now' : ''}">${o}</span>`).join('') + '</div>');
  }
  const elf = g.fs.elves;
  if (elf) parts.push(`<div class="info" style="--c:${COLORS.elves}"><b>Elf supporters</b> ${elf.supporters}</div>`);
  $('faction-info').innerHTML = parts.join('');
}

function drawActions(g, moves, myTurn) {
  const box = $('actions');
  if (g.winner) { box.innerHTML = ''; return; }
  if (!myTurn) {
    const f = currentFaction(g);
    const s = state.room.seats[f];
    const who = s.kind === 'human' ? s.name : NAMES[f];
    box.innerHTML = `<p class="hint">${mySeat() ? `Waiting for ${who}…` : `Watching ${who}…`}</p>`;
    return;
  }
  const here = state.sel === null ? [] : moves.filter((m) => clearingOf(m) === state.sel);
  const global = moves.filter((m) => clearingOf(m) === null);
  let html = '';
  if (tutorial.active && moves.length === 0) {
    html += `<p class="hint">Read the tutorial card, then press <b>Next</b>.</p>`;
  } else if (state.sel === null) {
    html += `<p class="hint">${moves.some((m) => clearingOf(m) !== null)
      ? 'Tap a glowing clearing to see what you can do there.' : 'Nothing to do on the board.'}</p>`;
  } else if (here.length === 0) {
    html += `<p class="hint">Clearing ${state.sel}: no actions here.</p>`;
  } else {
    html += `<h3>Clearing ${state.sel}</h3>`;
    here.forEach((m, i) => { html += `<button class="act" data-i="${i}" data-scope="here">${label(g, m)}</button>`; });
  }
  if (global.length) {
    html += '<div class="global">';
    global.forEach((m, i) => {
      const loud = m.type === 'endPhase' ? ' end' : m.type === 'frenzy' ? ' warn' : '';
      html += `<button class="act${loud}" data-i="${i}" data-scope="global">${label(g, m)}</button>`;
    });
    html += '</div>';
  }
  box.innerHTML = html;
  box._here = here;
  box._global = global;
}

// ------------------------------------------------------------------- events
function drawMute() {
  const m = isMuted();
  $('mute').textContent = m ? '🔇' : '🔊';
  $('mute').setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
  $('mute').setAttribute('aria-pressed', String(m));
}
$('mute').addEventListener('click', () => {
  setMuted(!isMuted());
  drawMute();
  play('click'); // the confirmation, audible only when turning sound ON
});
drawMute();

// a soft click for menu and lobby buttons
document.addEventListener('click', (e) => {
  if (e.target.closest('.overlay button')) play('click');
});

$('board').addEventListener('click', (e) => {
  const node = e.target.closest('[data-c]');
  const c = node ? Number(node.dataset.c) : null;
  if (c !== null && c !== state.sel) play('click');
  state.sel = c === null || state.sel === c ? null : c;
  state.dest = null;
  state.hoverPath = null;
  draw();
});

$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('button.act');
  if (!b) return;
  const list = b.dataset.scope === 'here' ? $('actions')._here : $('actions')._global;
  onHumanMove(list[Number(b.dataset.i)]);
});

$('actions').addEventListener('mouseover', (e) => {
  const b = e.target.closest('button.act');
  if (!b || b.dataset.scope !== 'here') return;
  const m = $('actions')._here[Number(b.dataset.i)];
  const dest = m.type === 'move' ? m.to : null;
  if (dest === state.dest) return;
  state.dest = dest;
  state.hoverPath = m.type === 'move' ? [m.from, m.to] : null;
  paintBoard(state.g, {
    sel: state.sel, dest: state.dest, hoverPath: state.hoverPath, focus: tutorial.focusClearings(),
    targets: new Set(tutorial.filterMoves(legalMoves(state.g)).map(clearingOf).filter((c) => c !== null)),
  });
});

$('anim-toggle').addEventListener('change', (e) => { store.set('anim', e.target.checked ? '1' : '0'); if (!e.target.checked) fx.cancel(); });

// tutorial coach and guide
$('coach').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tut]');
  if (b) tutorial.handle(b.dataset.tut);
});
$('help').addEventListener('click', () => openGuide());
$('menu-howto').addEventListener('click', () => openGuide());
$('howto-close').addEventListener('click', closeGuide);
$('howto-nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) document.getElementById(`g-${b.dataset.go}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('howto').hidden) closeGuide(); });

// menu
$('menu-learn').addEventListener('click', () => { myName(); openLessons(); });
$('lessons-back').addEventListener('click', () => { show('menu'); drawMenu(); });
$('lesson-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lesson]');
  if (b) startLesson(b.dataset.lesson);
});
$('menu-solo').addEventListener('click', () => { myName(); show('setup'); });
$('menu-create').addEventListener('click', createRoom);
$('menu-join').addEventListener('click', () => joinRoom($('code').value));
$('code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('code').value); });
$('resume-solo').addEventListener('click', resumeSolo);
$('resume').addEventListener('click', async () => {
  const code = store.get('room');
  if (code) await joinRoom(code);
});

// solo setup
$('start').addEventListener('click', startSolo);
$('setup-back').addEventListener('click', () => { show('menu'); drawMenu(); });

// lobby
$('lobby-seats').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const f = b.dataset.f;
  const name = myName();
  let res;
  if (b.dataset.act === 'take') res = await state.net.update(state.code, (r) => claimSeat(r, state.myId, name, f));
  else if (b.dataset.act === 'leave') res = await state.net.update(state.code, (r) => leaveSeat(r, state.myId));
  else if (b.dataset.act === 'kick') res = await state.net.update(state.code, (r) => setSeat(r, state.myId, f, { kind: 'open' }));
  else if (b.dataset.act === 'host') res = await state.net.update(state.code, (r) => setHost(r, state.myId, b.dataset.id));
  if (res && !res.ok) toast(res.error);
  else if (res) onRoom(res.room);
});
$('lobby-seats').addEventListener('change', async (e) => {
  const s = e.target.closest('select[data-act="set"]');
  if (!s) return;
  const spec = s.value === 'open' ? { kind: 'open' } : { kind: 'bot', level: s.value };
  const res = await state.net.update(state.code, (r) => setSeat(r, state.myId, s.dataset.f, spec));
  if (!res.ok) toast(res.error);
  else onRoom(res.room);
});
$('lobby-timer').addEventListener('change', async (e) => {
  const res = await state.net.update(state.code, (r) => setTimer(r, state.myId, Number(e.target.value)));
  if (!res.ok) toast(res.error);
  else onRoom(res.room);
});
$('away-back').addEventListener('click', async () => {
  const res = await state.net.update(state.code, (r) => reclaimSeat(r, state.myId, nowMs()));
  if (!res.ok) toast(res.error);
  else onRoom(res.room);
});
$('lobby-start').addEventListener('click', async () => {
  const res = await state.net.update(state.code, (r) => startGame(r, state.myId, (Math.random() * 2 ** 31) | 0, nowMs()));
  if (!res.ok) toast(res.error);
  else onRoom(res.room);
});
$('lobby-leave').addEventListener('click', async () => {
  await handOffHost();
  if (state.room?.status === 'lobby' && mySeat()) await state.net.update(state.code, (r) => leaveSeat(r, state.myId));
  leaveRoom();
});
$('lobby-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.code); toast('Code copied.'); } catch { toast(`The code is ${state.code}.`); }
});

// game over / header
$('again').addEventListener('click', async () => {
  if (state.solo) { leaveRoom(); show('setup'); return; }
  const res = await state.net.update(state.code, (r) => backToLobby(r, state.myId));
  if (!res.ok) toast(res.error);
  else onRoom(res.room);
});
$('over-leave').addEventListener('click', async () => { await handOffHost(); leaveRoom(); });
$('newgame').addEventListener('click', async () => {
  if (state.room?.status === 'playing' && !state.solo && !confirm('Leave this game? Your seat stays yours if you come back.')) return;
  await handOffHost();
  leaveRoom();
});

// ---------------------------------------------------------------------- go
$('seats').innerHTML = DEFAULT_ORDER.map((f) => `
  <label class="seat" style="--c:${COLORS[f]}">
    <input type="radio" name="seat" value="${f}"${f === 'humans' ? ' checked' : ''}>
    <img class="crest" src="${crestSrc(f)}" alt="">
    <span class="seat-name">${NAMES[f]}</span>
    <span class="seat-blurb">${BLURB[f]}</span>
  </label>`).join('') + `
  <label class="seat" style="--c:#8a9a8a">
    <input type="radio" name="seat" value="">
    <span class="crest watch" aria-hidden="true">👁</span>
    <span class="seat-name">Watch</span>
    <span class="seat-blurb">Four bots play each other. Good for seeing how the factions work.</span>
  </label>`;

$('lobby-timer').innerHTML = TURN_LIMITS.map((s) => `<option value="${s}">${fmtLimit(s)}</option>`).join('');

show('menu');
drawMenu();
ensureOnline().then(drawMenu);
window.__hollow = state; // handy in the console while developing
