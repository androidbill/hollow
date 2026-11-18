// Rooms between browser tabs on one device. No server, no setup: the room lives in
// localStorage and tabs hear about changes over a BroadcastChannel. It is what you
// get until a Firebase config is added, and it is handy for testing with two tabs.
//
// Same four methods as every transport (see src/transport-memory.js). Read-modify-
// write is made atomic across tabs with the Web Locks API.

const KEY = (code) => `hollow-room-${code}`;

export function createLocalTransport() {
  const channel = new BroadcastChannel('hollow-rooms');
  const subs = new Map();

  const read = (code) => {
    try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; }
  };
  const write = (code, room) => localStorage.setItem(KEY(code), JSON.stringify(room));
  const emit = (code) => {
    const room = read(code);
    for (const cb of subs.get(code) || []) cb(room);
  };
  // a BroadcastChannel does not echo to the tab that posted, so emit locally too
  const changed = (code) => { emit(code); channel.postMessage({ t: 'room', code }); };

  // Presence: each tab that is "here" beats every 2 s; someone not heard from for 6 s
  // (or who said goodbye as the page closed) is gone.
  const BEAT = 2000;
  const TTL = 6000;
  const seen = new Map(); // code -> Map(id -> last heard, ms)
  const watchers = new Map();
  const idsHere = (code) => {
    const out = new Set();
    const now = Date.now();
    for (const [id, t] of seen.get(code) || []) if (now - t < TTL) out.add(id);
    return out;
  };
  const emitPresence = (code) => { for (const cb of watchers.get(code) || []) cb(idsHere(code)); };
  const mark = (code, id) => {
    if (!seen.has(code)) seen.set(code, new Map());
    seen.get(code).set(id, Date.now());
    emitPresence(code);
  };
  const unmark = (code, id) => { seen.get(code)?.delete(id); emitPresence(code); };
  setInterval(() => { for (const code of watchers.keys()) emitPresence(code); }, BEAT); // notice expiries

  channel.onmessage = (e) => {
    const d = e.data;
    if (d.t === 'room') emit(d.code);
    else if (d.t === 'here') mark(d.code, d.id);
    else if (d.t === 'bye') unmark(d.code, d.id);
  };

  const locked = (code, fn) =>
    navigator.locks ? navigator.locks.request(`hollow-${code}`, fn) : Promise.resolve(fn());

  return {
    name: 'local',

    // every tab shares one machine and so one clock
    now: () => Date.now(),

    create: (code, room) => locked(code, () => {
      if (read(code)) return false;
      write(code, room);
      changed(code);
      return true;
    }),

    get: async (code) => read(code),

    update: (code, fn) => locked(code, () => {
      const room = read(code);
      if (!room) return { ok: false, error: 'no such room' };
      const result = fn(room);
      if (result.ok) {
        write(code, result.room);
        changed(code);
      }
      return result;
    }),

    subscribe(code, cb) {
      if (!subs.has(code)) subs.set(code, new Set());
      subs.get(code).add(cb);
      Promise.resolve().then(() => { if (subs.get(code)?.has(cb)) cb(read(code)); });
      return () => subs.get(code)?.delete(cb);
    },

    announce(code, id) {
      const beat = () => { mark(code, id); channel.postMessage({ t: 'here', code, id }); };
      const bye = () => { unmark(code, id); channel.postMessage({ t: 'bye', code, id }); };
      beat();
      const timer = setInterval(beat, BEAT);
      addEventListener('pagehide', bye);
      return () => { clearInterval(timer); removeEventListener('pagehide', bye); bye(); };
    },

    watchPresence(code, cb) {
      if (!watchers.has(code)) watchers.set(code, new Set());
      watchers.get(code).add(cb);
      Promise.resolve().then(() => { if (watchers.get(code)?.has(cb)) cb(idsHere(code)); });
      return () => watchers.get(code)?.delete(cb);
    },
  };
}
