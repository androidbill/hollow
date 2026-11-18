// Online rooms over Firebase Realtime Database. Same four methods as every
// transport (see src/transport-memory.js). Every change runs inside a database
// transaction, so the engine re-validates against the room as it actually is on
// the server and two devices acting at once cannot both win.
//
// The SDK is loaded from Google's CDN only when a config is present, so the game
// has no dependency on it otherwise.
//
// Verified against the live database for rooms, joining, seats and play. The
// server-clock offset (`now`) is checked in the browser, not by the unit tests.

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createFirebaseTransport(config) {
  const [{ initializeApp }, db] = await Promise.all([
    import(`${SDK}firebase-app.js`),
    import(`${SDK}firebase-database.js`),
  ]);
  const database = db.getDatabase(initializeApp(config));
  const ref = (code) => db.ref(database, `rooms/${code}`);

  // Turn timers need every device to agree on the time, and a phone's own clock can be
  // minutes out. Firebase reports how far this device is from the server's clock; we
  // keep that and add it to Date.now(). (Until the first reading arrives the offset
  // is 0, i.e. the device's own clock.)
  let offset = 0;
  db.onValue(db.ref(database, '.info/serverTimeOffset'), (snap) => { offset = snap.val() || 0; });
  // Realtime Database rejects `undefined`; this makes sure none sneaks in.
  const clean = (room) => JSON.parse(JSON.stringify(room));

  return {
    name: 'firebase',

    now: () => Date.now() + offset,

    async create(code, room) {
      const result = await db.runTransaction(ref(code), (current) => (current === null ? clean(room) : undefined));
      return result.committed;
    },

    async get(code) {
      const snap = await db.get(ref(code));
      return snap.val();
    },

    async update(code, fn) {
      let outcome = { ok: false, error: 'no such room' };
      await db.runTransaction(ref(code), (current) => {
        // The first attempt may run against an empty local cache. Returning null
        // makes the SDK compare with the server and retry with the real value.
        if (current === null) return null;
        outcome = fn(current);
        return outcome.ok ? clean(outcome.room) : undefined; // undefined aborts
      });
      return outcome;
    },

    subscribe(code, cb) {
      return db.onValue(ref(code), (snap) => cb(snap.val()));
    },

    // "I am here." The record lives at presence/<code>/<id>, outside the room so that
    // heartbeats never rewrite (or rebroadcast) the game. The SERVER deletes it the
    // moment this connection drops - tab closed, phone locked, network lost - which is
    // the whole point: nobody has to notice a missing heartbeat. On every (re)connect
    // we register that deletion first and only then write the record, so a drop in
    // between cannot leave a stale "here" behind.
    announce(code, id) {
      const mine = db.ref(database, `presence/${code}/${id}`);
      const stop = db.onValue(db.ref(database, '.info/connected'), (snap) => {
        if (snap.val() === true) db.onDisconnect(mine).remove().then(() => db.set(mine, true));
      });
      return () => { stop(); db.remove(mine); };
    },

    watchPresence(code, cb) {
      return db.onValue(db.ref(database, `presence/${code}`), (snap) => cb(new Set(Object.keys(snap.val() || {}))));
    },
  };
}
