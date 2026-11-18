// DWARVES - the tunnel fortress.
//
// Dwarves dig tunnels; warriors can step between any two tunnel clearings in
// one march, ignoring paths and ignoring who rules either end. Strongholds are
// forged by spending warriors, shrug off the first hit of every attack, and
// score every dusk while the Dwarves still hold their ground.

import {
  battle, battleMoves, bldgs, doMove, freeSlots, moveMoves, placeBuilding,
  placeToken, placeWarriors, ruler, score, toks, wc,
} from '../helpers.js';

const ID = 'dwarves';
const STRONGHOLD_SCORE = 1; // per stronghold ruled, at dusk
const DIG_SCORE = 0; // digging scored a point at first, which let bots farm it
const FORGE_SCORE = 1;
const FORGE_COST = 2; // warriors spent to forge a stronghold
const ACTIONS = 3;
const RECRUITS_PER_DAWN = 2;
const FORGE_MIN_WARRIORS = FORGE_COST + 1; // a forge must leave someone behind

function recruitSites(g) {
  const out = [];
  for (let c = 0; c < g.board.length; c++) {
    if (bldgs(g, c, ID, 'stronghold') > 0) out.push(c);
  }
  for (let c = 0; c < g.board.length; c++) {
    if (toks(g, c, ID, 'tunnel') > 0 && !out.includes(c)) out.push(c);
  }
  return out.length ? out : [dwarves.home];
}

export const dwarves = {
  id: ID,
  name: 'Dwarves',
  home: 11,
  facts: { strongholdScore: STRONGHOLD_SCORE, digScore: DIG_SCORE, forgeScore: FORGE_SCORE, forgeCost: FORGE_COST, forgeMinWarriors: FORGE_MIN_WARRIORS, actions: ACTIONS, recruitsPerDawn: RECRUITS_PER_DAWN },
  pieces: { warriors: 18, tunnel: 3, stronghold: 3 },
  phases: [{ name: 'dawn', auto: true }, { name: 'day' }, { name: 'dusk', auto: true }],

  setup(g) {
    placeWarriors(g, this.home, ID, 4);
    placeBuilding(g, this.home, ID, 'stronghold');
    placeToken(g, this.home, ID, 'tunnel');
  },

  enter(g, phase) {
    if (phase === 'dawn') {
      const sites = recruitSites(g);
      for (let i = 0; i < RECRUITS_PER_DAWN; i++) placeWarriors(g, sites[i % sites.length], ID, 1);
    } else if (phase === 'day') {
      g.fs[ID].actions = ACTIONS;
    } else if (phase === 'dusk') {
      let held = 0;
      for (let c = 0; c < g.board.length; c++) {
        if (bldgs(g, c, ID, 'stronghold') > 0 && ruler(g, c) === ID) held++;
      }
      score(g, ID, held * STRONGHOLD_SCORE);
    }
  },

  moves(g) {
    const out = [{ type: 'endPhase' }];
    if (g.fs[ID].actions < 1) return out;
    out.push(...moveMoves(g, ID, { tunnel: true }), ...battleMoves(g, ID));
    for (let at = 0; at < g.board.length; at++) {
      const w = wc(g, at, ID);
      if (w > 0 && toks(g, at, ID, 'tunnel') === 0 && g.supply[ID].tunnel > 0) {
        out.push({ type: 'dig', at });
      }
      if (
        toks(g, at, ID, 'tunnel') > 0 && w > FORGE_COST && freeSlots(g, at) > 0 &&
        bldgs(g, at, ID, 'stronghold') === 0 && g.supply[ID].stronghold > 0
      ) {
        out.push({ type: 'forge', at });
      }
    }
    return out;
  },

  apply(g, m) {
    g.fs[ID].actions--;
    if (m.type === 'move') doMove(g, ID, m);
    else if (m.type === 'battle') battle(g, m.at, ID, m.target);
    else if (m.type === 'dig') {
      placeToken(g, m.at, ID, 'tunnel');
      score(g, ID, DIG_SCORE);
    } else if (m.type === 'forge') {
      g.board[m.at].w[ID] -= FORGE_COST;
      g.supply[ID].warriors += FORGE_COST;
      placeBuilding(g, m.at, ID, 'stronghold');
      score(g, ID, FORGE_SCORE);
    }
  },

  battleMods(ctx, role) {
    // armour: the first hit against a stronghold is shrugged off
    if (role === 'defender' && bldgs(ctx.g, ctx.c, ID, 'stronghold') > 0) ctx.ah = Math.max(0, ctx.ah - 1);
  },
};
