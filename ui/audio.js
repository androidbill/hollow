// Sound effects. Everything is opt-out: a mute button in the header, remembered.
//
// Browsers refuse to play audio until the person has interacted with the page, so
// nothing is created or loaded until the first click, tap or key press. Sounds are
// small files decoded once into memory and played through the Web Audio API, which
// is far snappier than <audio> elements and lets sounds overlap.
//
// The game itself never knows about sound: app.js looks at what just happened
// (the room's `last` event, and a before/after comparison of the board) and calls
// play(name). If a file is missing or cannot be decoded, that sound is silently
// skipped and the game carries on.

const NAMES = [
  'click', 'march', 'battle', 'build', 'recruit', 'crumble', 'magic', 'dig',
  'frenzy', 'turn', 'tick', 'win', 'lose',
];
// Per-sound loudness trim, since the source clips are not mastered to match.
const TRIM = {
  click: 0.5, march: 0.8, battle: 0.9, build: 0.9, recruit: 0.9, crumble: 0.9,
  magic: 0.7, dig: 0.9, frenzy: 0.9, turn: 0.8, tick: 0.6, win: 0.9, lose: 0.9,
};
const MASTER = 0.7;
const MIN_GAP_MS = 70; // the same sound twice inside this is one sound (a bot burst)

const KEY = 'hollow-muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let ctx = null;
let master = null;
const buffers = new Map();
const lastPlayed = new Map();
let loading = null;

async function load() {
  if (loading) return loading;
  loading = Promise.all(NAMES.map(async (name) => {
    try {
      const res = await fetch(`assets/sfx/${name}.mp3`);
      if (!res.ok) return;
      buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* a missing or undecodable file just means that sound is silent */ }
  }));
  return loading;
}

// Called on the first user gesture; safe to call again.
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  load();
}

export function play(name, { rate = 1, gain = 1 } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const buf = buffers.get(name);
  if (!buf) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) || -1e9) < MIN_GAP_MS) return;
  lastPlayed.set(name, now);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = (TRIM[name] ?? 1) * gain;
  src.connect(g).connect(master);
  src.start();
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode */ }
}

// Which sound goes with a move type. Moves with no entry are silent (ending a phase
// is too frequent to want a noise every time).
export const SOUND_FOR_MOVE = {
  move: 'march',
  battle: 'battle',
  build: 'build',
  forge: 'build',
  recruit: 'recruit',
  spread: 'magic',
  organize: 'magic',
  revolt: 'battle',
  dig: 'dig',
  frenzy: 'frenzy',
  addOrder: 'click',
  timeout: 'tick',
};
