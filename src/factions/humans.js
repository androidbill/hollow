// HUMANS - the industrial engine.
//
// Slow to start, strong late. Barracks raise warriors every dawn, mills score
// every dawn and every second mill grants an extra action. Humans only build
// where they rule, so they have to hold ground to grow.

import {
  battle, battleMoves, bldgs, doMove, freeSlots, moveMoves, onBoard,
  placeBuilding, placeWarriors, ruler, score, wc,
} from '../helpers.js';

const ID = 'humans';
const MILL_SCORE = [0, 1, 2, 3, 4, 5, 6]; // dawn points, by mills on the board
const BASE_ACTIONS = 4;
const MILL_BUILD_SCORE = 0; // tuning knob: points per mill raised. At 1 the Humans won 42% of hard games; per building, 59%

function buildMoves(g) {
  const out = [];
  for (let at = 0; at < g.board.length; at++) {
    if (wc(g, at, ID) < 1 || ruler(g, at) !== ID || freeSlots(g, at) < 1) continue;
    for (const building of ['mill', 'barracks']) {
      if (g.supply[ID][building] > 0 && bldgs(g, at, ID, building) === 0) {
        out.push({ type: 'build', at, building });
      }
    }
  }
  return out;
}

export const humans = {
  id: ID,
  name: 'Humans',
  home: 0,
  facts: { millScore: MILL_SCORE, baseActions: BASE_ACTIONS, millBuildScore: MILL_BUILD_SCORE },
  pieces: { warriors: 20, mill: 6, barracks: 6 },
  phases: [{ name: 'dawn', auto: true }, { name: 'day' }],

  setup(g) {
    placeWarriors(g, this.home, ID, 4);
    placeBuilding(g, this.home, ID, 'mill');
    placeBuilding(g, this.home, ID, 'barracks');
  },

  enter(g, phase) {
    if (phase === 'dawn') {
      for (let c = 0; c < g.board.length; c++) placeWarriors(g, c, ID, bldgs(g, c, ID, 'barracks'));
      score(g, ID, MILL_SCORE[onBoard(g, ID, 'mill')]);
    } else if (phase === 'day') {
      g.fs[ID].actions = BASE_ACTIONS + Math.floor(onBoard(g, ID, 'mill') / 2);
    }
  },

  moves(g) {
    const out = [{ type: 'endPhase' }];
    if (g.fs[ID].actions > 0) out.push(...moveMoves(g, ID), ...battleMoves(g, ID), ...buildMoves(g));
    return out;
  },

  apply(g, m) {
    g.fs[ID].actions--;
    if (m.type === 'move') doMove(g, ID, m);
    else if (m.type === 'battle') battle(g, m.at, ID, m.target);
    else if (m.type === 'build') {
      placeBuilding(g, m.at, ID, m.building);
      if (m.building === 'mill') score(g, ID, MILL_BUILD_SCORE);
    }
  },
};
