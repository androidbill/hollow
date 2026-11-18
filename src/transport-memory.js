// An in-process transport. It backs solo play (a room nobody else can see) and
// the tests, where several simulated clients share one of these as their "server".
//
// A transport has four methods; the other transports implement the same four:
//   create(code, room)    -> Promise<boolean>   false if the code is taken
//   get(code)             -> Promise<room|null>
//   update(code, fn)      -> Promise<{ ok, room } | { ok: false, error }>
//                            fn(room) runs atomically against the stored room
//   subscribe(code, cb)   -> unsubscribe function; cb(room|null) on every change
//   now()                 -> ms epoch on the SHARED clock (the server's, if there is one),
//                            used for turn timers so every device agrees on the time
//   announce(code, id)    -> stop function. "This player is here": the transport keeps
//                            it true until stop() is called or the connection drops
//   watchPresence(code, cb) -> unsubscribe; cb(Set of ids currently present) on every change

export function createMemoryTransport() {
  const rooms = new Map();
  const subs = new Map();

  const emit = (code) => {
    const room = rooms.has(code) ? structuredClone(rooms.get(code)) : null;
    for (const cb of subs.get(code) || []) cb(room);
  };

  const here = new Map(); // code -> Map(id -> how many announcements)
  const watchers = new Map();
  const idsHere = (code) => new Set(here.get(code)?.keys());
  const emitPresence = (code) => { for (const cb of watchers.get(code) || []) cb(idsHere(code)); };

  return {
    name: 'memory',

    now: () => Date.now(),

    async create(code, room) {
      if (rooms.has(code)) return false;
      rooms.set(code, structuredClone(room));
      emit(code);
      return true;
    },

    async get(code) {
      return rooms.has(code) ? structuredClone(rooms.get(code)) : null;
    },

    // JS runs one function at a time, so read-run-write here is atomic.
    async update(code, fn) {
      if (!rooms.has(code)) return { ok: false, error: 'no such room' };
      const result = fn(structuredClone(rooms.get(code)));
      if (result.ok) {
        rooms.set(code, structuredClone(result.room));
        emit(code);
      }
      return result;
    },

    announce(code, id) {
      if (!here.has(code)) here.set(code, new Map());
      const m = here.get(code);
      m.set(id, (m.get(id) || 0) + 1);
      emitPresence(code);
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        const n = (m.get(id) || 1) - 1;
        if (n <= 0) m.delete(id); else m.set(id, n);
        emitPresence(code);
      };
    },

    watchPresence(code, cb) {
      if (!watchers.has(code)) watchers.set(code, new Set());
      watchers.get(code).add(cb);
      Promise.resolve().then(() => { if (watchers.get(code)?.has(cb)) cb(idsHere(code)); });
      return () => watchers.get(code)?.delete(cb);
    },

    subscribe(code, cb) {
      if (!subs.has(code)) subs.set(code, new Set());
      subs.get(code).add(cb);
      // deliver the current state asynchronously, as a real network would
      Promise.resolve().then(() => {
        if (subs.get(code)?.has(cb)) cb(rooms.has(code) ? structuredClone(rooms.get(code)) : null);
      });
      return () => subs.get(code)?.delete(cb);
    },
  };
}
