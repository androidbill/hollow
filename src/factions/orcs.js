// ORCS - the warband.
//
// Every day the Orcs must carry out their WAR CHANT: a list of orders resolved
// strictly in order. Each dawn they may add up to two more orders, and orders
// stay in the chant until it breaks. If an order cannot be carried out the band
// goes into FRENZY: the chant breaks, the remaining orders cost points, and the
// extra orders are lost. A long chant is powerful and dangerous.
// Orcs hit hard (+1 hit when attacking) and score from their warcamps at dusk.

import {
  battle, battleMoves, bldgs, doMove, freeSlots, log, moveMoves, onBoard,
  placeBuilding, placeWarriors, ruler, score, wc,
} from '../helpers.js';

const ID = 'orcs';
const BASE_CHANT = ['recruit', 'move', 'battle', 'build'];
const CAMP_SCORE = [0, 1, 1, 2, 2, 3, 3]; // dusk points, by warcamps on the board
const MAX_EXTRA_ORDERS = 2; // orders that may be added to the chant each dawn
const MAX_FRENZY_LOSS = 3; // most points a broken chant can cost
const ATTACK_BONUS = 1; // extra hit when the Orcs attack

function recruitSites(g, home) {
  const camps = [];
  const bands = [];
  for (let c = 0; c < g.board.length; c++) {
    if (bldgs(g, c, ID, 'warcamp') > 0) camps.push(c);
    else if (wc(g, c, ID) > 0) bands.push(c);
  }
  if (camps.length) return camps;
  return bands.length ? bands : [home]; // no camp left: rally anywhere, or at home
}

function optionsFor(g, order) {
  if (order === 'recruit') {
    if (g.supply[ID].warriors < 1) return [];
    return recruitSites(g, orcs.home).map((at) => ({ type: 'recruit', at }));
  }
  if (order === 'move') return moveMoves(g, ID, { rule: false });
  if (order === 'battle') return battleMoves(g, ID);
  const out = [];
  if (g.supply[ID].warcamp < 1) return out;
  for (let at = 0; at < g.board.length; at++) {
    if (wc(g, at, ID) > 0 && ruler(g, at) === ID && freeSlots(g, at) > 0 && bldgs(g, at, ID, 'warcamp') === 0) {
      out.push({ type: 'build', at });
    }
  }
  return out;
}

export const orcs = {
  id: ID,
  name: 'Orcs',
  home: 3,
  facts: { baseChant: BASE_CHANT, campScore: CAMP_SCORE, maxExtraOrders: MAX_EXTRA_ORDERS, maxFrenzyLoss: MAX_FRENZY_LOSS, attackBonus: ATTACK_BONUS },
  pieces: { warriors: 18, warcamp: 6 },
  phases: [{ name: 'dawn' }, { name: 'day' }, { name: 'dusk', auto: true }],

  setup(g) {
    g.fs[ID] = { extras: [], pending: [], added: 0 };
    placeWarriors(g, this.home, ID, 5);
    placeBuilding(g, this.home, ID, 'warcamp');
  },

  enter(g, phase) {
    const fs = g.fs[ID];
    if (phase === 'dawn') fs.added = 0;
    else if (phase === 'day') fs.pending = [...BASE_CHANT, ...fs.extras];
    else if (phase === 'dusk') score(g, ID, CAMP_SCORE[onBoard(g, ID, 'warcamp')]);
  },

  moves(g, phase) {
    const fs = g.fs[ID];
    if (phase === 'dawn') {
      const out = [{ type: 'endPhase' }];
      if (fs.added < MAX_EXTRA_ORDERS) for (const order of BASE_CHANT) out.push({ type: 'addOrder', order });
      return out;
    }
    if (fs.pending.length === 0) return [{ type: 'endPhase' }];
    const options = optionsFor(g, fs.pending[0]);
    return options.length ? options : [{ type: 'frenzy' }];
  },

  apply(g, m) {
    const fs = g.fs[ID];
    if (m.type === 'addOrder') {
      fs.extras.push(m.order);
      fs.added++;
      return;
    }
    if (m.type === 'frenzy') {
      const lost = Math.min(MAX_FRENZY_LOSS, fs.pending.length);
      score(g, ID, -lost);
      log(g, `orcs fall into frenzy at "${fs.pending[0]}": -${lost} VP, the chant breaks`);
      fs.extras = [];
      fs.pending = [];
      return;
    }
    if (m.type === 'recruit') placeWarriors(g, m.at, ID, 1);
    else if (m.type === 'move') doMove(g, ID, m);
    else if (m.type === 'battle') battle(g, m.at, ID, m.target);
    else if (m.type === 'build') placeBuilding(g, m.at, ID, 'warcamp');
    fs.pending.shift();
  },

  battleMods(ctx, role) {
    if (role === 'attacker') ctx.ah += ATTACK_BONUS; // brutal
  },
};
