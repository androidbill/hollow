// What changed on the board between two game states? Pure: no DOM, no animation, just
// a description, so the animation layer has one thing to read and the description can be
// tested hard against the real engine (scripts/fx-tests.mjs).
//
//   diffGames(prev, next, last) -> {
//     moves:     [{ f, from, to, n }]                 an army walked from one clearing to another
//     gains:     [{ c, f, n }]                        warriors appeared (recruited, revolt, ...)
//     losses:    [{ c, f, n }]                        warriors died
//     built:     [{ c, f, t, kind, index }]           a building ('building') or token ('token') appeared
//     destroyed: [{ c, f, t, kind, index }]           one disappeared; `index` is where it WAS in `prev`
//     battle:    { c, att, def, a, b, hi, lo, dealt, back } | null    the dice, if the last event was an attack
//     vp:        { faction: change }                  only factions whose score moved
//   }
//
// `last` is the room's latest event ({ f, t }). It is only used to recognise a march (one
// army leaving one clearing and arriving in another) and an attack (to read its dice).
// Everything else is derived from the boards alone.

// Buildings and tokens are arrays that only ever grow at the end (a build) or lose
// elements (a hit removes the first one of a faction), so the new list is the old list with
// some removed and some appended. Matching them up in order recovers which is which.
function diffList(prevList, nextList) {
  let j = 0;
  const destroyed = [];
  prevList.forEach((p, i) => {
    if (j < nextList.length && nextList[j].f === p.f && nextList[j].t === p.t) j++;
    else destroyed.push({ f: p.f, t: p.t, index: i });
  });
  const built = nextList.slice(j).map((p, k) => ({ f: p.f, t: p.t, index: j + k }));
  return { built, destroyed };
}

const BATTLE_LINE = /(\w+) attacks (\w+) at (\d+): dice (\d),(\d) -> (\d+) hits \/ (\d+) hits back/;

export function diffGames(prev, next, last = null) {
  const out = { moves: [], gains: [], losses: [], built: [], destroyed: [], battle: null, vp: {} };
  if (!prev || !next || prev.board.length !== next.board.length) return out;

  // ---- warriors
  const deltas = [];
  for (let c = 0; c < next.board.length; c++) {
    const a = prev.board[c].w;
    const b = next.board[c].w;
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = (b[f] || 0) - (a[f] || 0);
      if (d !== 0) deltas.push({ c, f, d });
    }
  }
  const taken = new Set();
  if (last?.t === 'move' && last.f) {
    const src = deltas.filter((x) => x.f === last.f && x.d < 0);
    const dst = deltas.filter((x) => x.f === last.f && x.d > 0);
    if (src.length === 1 && dst.length === 1 && -src[0].d === dst[0].d) {
      out.moves.push({ f: last.f, from: src[0].c, to: dst[0].c, n: dst[0].d });
      taken.add(src[0]);
      taken.add(dst[0]);
    }
  }
  for (const x of deltas) {
    if (taken.has(x)) continue;
    if (x.d > 0) out.gains.push({ c: x.c, f: x.f, n: x.d });
    else out.losses.push({ c: x.c, f: x.f, n: -x.d });
  }

  // ---- buildings and tokens
  for (let c = 0; c < next.board.length; c++) {
    for (const [kind, key] of [['building', 'b'], ['token', 'k']]) {
      const { built, destroyed } = diffList(prev.board[c][key], next.board[c][key]);
      for (const p of built) out.built.push({ c, kind, ...p });
      for (const p of destroyed) out.destroyed.push({ c, kind, ...p });
    }
  }

  // ---- the dice
  if (last?.t === 'battle') {
    const line = [...next.log].reverse().find((l) => BATTLE_LINE.test(l));
    const m = line && BATTLE_LINE.exec(line);
    if (m) {
      const a = +m[4];
      const b = +m[5];
      out.battle = { c: +m[3], att: m[1], def: m[2], a, b, hi: Math.max(a, b), lo: Math.min(a, b), dealt: +m[6], back: +m[7] };
    }
  }

  // ---- score
  for (const f of next.order) {
    const d = next.vp[f] - (prev.vp[f] ?? next.vp[f]);
    if (d !== 0) out.vp[f] = d;
  }
  return out;
}

// Is this pair of states two consecutive positions of the SAME game? (A new game, or a
// lesson restarting, must not be animated as if the old board had turned into the new one.)
export function sameGame(prev, next) {
  return !!prev && !!next && prev.seed === next.seed && next.round >= prev.round && prev.order.join() === next.order.join();
}
