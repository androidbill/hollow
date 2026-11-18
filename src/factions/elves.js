// ELVES - the hidden insurgency.
//
// Elves win the forest's hearts before they win its battles. Each dawn they
// gather supporters (a pool they spend to SPREAD sympathy and to REVOLT).
// Sympathy scores as it spreads, and where sympathy runs deep the attacker
// fights at a disadvantage (-1 hit). A revolt wipes out everyone else in a
// sympathetic clearing and plants a stronghold there. At dusk they may ORGANIZE:
// trade a warrior for a free sympathy token.
//
// NOTE: supporters are public in this first version. They are meant to be hidden
// information; see README "Hidden information".

import {
  battle, battleMoves, bldgs, doMove, freeSlots, moveMoves, onBoard, placeBuilding,
  placeToken, placeWarriors, purge, score, toks, wc,
} from '../helpers.js';
import { ADJ } from '../map.js';

const ID = 'elves';
const SPREAD_COST = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]; // by tokens already on the board
const SPREAD_SCORE = [0, 0, 1, 1, 1, 1, 2, 2, 3, 3];
const REVOLT_COST = 2;
const START_SUPPORTERS = 3;
const SUPPORTERS_PER_DAWN = 2;
const BASE_ACTIONS = 2; // plus one per stronghold on the board

function sympathyCount(g) {
  return onBoard(g, ID, 'sympathy');
}

function spreadSites(g) {
  const placed = sympathyCount(g);
  if (g.supply[ID].sympathy < 1 || g.fs[ID].supporters < SPREAD_COST[placed]) return [];
  const out = [];
  for (let at = 0; at < g.board.length; at++) {
    if (toks(g, at, ID, 'sympathy') > 0) continue;
    if (placed === 0 || ADJ[at].some((n) => toks(g, n, ID, 'sympathy') > 0)) out.push(at);
  }
  return out;
}

function enemyBuildings(g, at) {
  return g.board[at].b.filter((p) => p.f !== ID).length;
}

function revoltSites(g) {
  if (g.supply[ID].stronghold < 1 || g.fs[ID].supporters < REVOLT_COST) return [];
  const out = [];
  for (let at = 0; at < g.board.length; at++) {
    if (toks(g, at, ID, 'sympathy') < 1 || bldgs(g, at, ID, 'stronghold') > 0) continue;
    if (freeSlots(g, at) + enemyBuildings(g, at) > 0) out.push(at);
  }
  return out;
}

function addSympathy(g, at) {
  const placed = sympathyCount(g);
  placeToken(g, at, ID, 'sympathy');
  score(g, ID, SPREAD_SCORE[placed]);
}

export const elves = {
  id: ID,
  name: 'Elves',
  home: 8,
  facts: { spreadCost: SPREAD_COST, spreadScore: SPREAD_SCORE, revoltCost: REVOLT_COST, startSupporters: START_SUPPORTERS, supportersPerDawn: SUPPORTERS_PER_DAWN, baseActions: BASE_ACTIONS },
  pieces: { warriors: 18, sympathy: 10, stronghold: 3 },
  phases: [{ name: 'dawn', auto: true }, { name: 'day' }, { name: 'dusk' }],

  setup(g) {
    g.fs[ID] = { supporters: START_SUPPORTERS, actions: 0, organized: false };
    placeWarriors(g, this.home, ID, 3);
    placeToken(g, this.home, ID, 'sympathy'); // the first token is free and unscored
  },

  enter(g, phase) {
    const fs = g.fs[ID];
    if (phase === 'dawn') {
      fs.supporters += SUPPORTERS_PER_DAWN;
      fs.organized = false;
    } else if (phase === 'day') {
      fs.actions = BASE_ACTIONS + onBoard(g, ID, 'stronghold');
    }
  },

  moves(g, phase) {
    const fs = g.fs[ID];
    const out = [{ type: 'endPhase' }];
    if (phase === 'day' && fs.actions > 0) {
      for (const at of spreadSites(g)) out.push({ type: 'spread', at });
      for (const at of revoltSites(g)) out.push({ type: 'revolt', at });
      out.push(...moveMoves(g, ID), ...battleMoves(g, ID));
    } else if (phase === 'dusk' && !fs.organized && g.supply[ID].sympathy > 0) {
      for (let at = 0; at < g.board.length; at++) {
        if (wc(g, at, ID) > 0 && toks(g, at, ID, 'sympathy') === 0) out.push({ type: 'organize', at });
      }
    }
    return out;
  },

  apply(g, m) {
    const fs = g.fs[ID];
    if (m.type === 'organize') {
      fs.organized = true;
      g.board[m.at].w[ID]--;
      if (g.board[m.at].w[ID] === 0) delete g.board[m.at].w[ID];
      g.supply[ID].warriors++;
      addSympathy(g, m.at);
      return;
    }
    fs.actions--;
    if (m.type === 'spread') {
      fs.supporters -= SPREAD_COST[sympathyCount(g)];
      addSympathy(g, m.at);
    } else if (m.type === 'revolt') {
      fs.supporters -= REVOLT_COST;
      purge(g, m.at, ID);
      const adjacent = ADJ[m.at].filter((n) => toks(g, n, ID, 'sympathy') > 0).length;
      placeBuilding(g, m.at, ID, 'stronghold');
      placeWarriors(g, m.at, ID, 1 + adjacent);
    } else if (m.type === 'move') doMove(g, ID, m);
    else if (m.type === 'battle') battle(g, m.at, ID, m.target);
  },

  battleMods(ctx, role) {
    // ambush: attackers fight at a disadvantage where sympathy runs
    if (role === 'defender' && toks(ctx.g, ctx.c, ID, 'sympathy') > 0) ctx.ah = Math.max(0, ctx.ah - 1);
  },
};
