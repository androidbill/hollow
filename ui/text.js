// Words for moves and for the state of play. No DOM here.

import { FACTIONS, currentFaction, currentPhase } from '../src/engine.js';
import { wc } from '../src/helpers.js';
import { ADJ } from '../src/map.js';
import { NAMES } from './render.js';

export const clearingOf = (m) => (m.at !== undefined ? m.at : m.from !== undefined ? m.from : null);

// A short button label for a move, read in the context of its clearing.
export function label(g, m) {
  const f = currentFaction(g);
  switch (m.type) {
    case 'move': {
      const all = m.n === wc(g, m.from, f);
      const byTunnel = !ADJ[m.from].includes(m.to); // not a neighbour, so it can only be a tunnel hop
      return `Move ${all ? `all ${m.n}` : m.n} to clearing ${m.to}${byTunnel ? ' by tunnel' : ''}`;
    }
    case 'battle': return `Attack the ${NAMES[m.target]} here`;
    case 'build': return `Build ${m.building ? `a ${m.building}` : 'a warcamp'}`;
    case 'recruit': return 'Recruit a warrior here';
    case 'spread': return 'Spread sympathy here';
    case 'revolt': return 'Revolt: wipe out everyone else, plant a stronghold';
    case 'organize': return 'Organize: trade a warrior for sympathy';
    case 'dig': return 'Dig a tunnel';
    case 'forge': return 'Forge a stronghold (costs 2 warriors)';
    case 'addOrder': return `Add "${m.order}" to the war chant`;
    case 'frenzy': return 'Frenzy! The chant breaks';
    case 'endPhase': return `End ${currentPhase(g)}`;
    default: return m.type;
  }
}

// The same move as a log line, with its clearing and actor.
export function logLine(g, m) {
  const who = NAMES[currentFaction(g)];
  switch (m.type) {
    case 'move': return `${who} move ${m.n} from ${m.from} to ${m.to}`;
    case 'battle': return `${who} attack the ${NAMES[m.target]} at ${m.at}`;
    case 'endPhase': return null; // too noisy to log
    case 'addOrder': return `${who} add "${m.order}" to the chant`;
    case 'frenzy': return `${who} fall into frenzy`;
    case 'build': return `${who} build a ${m.building || 'warcamp'} at ${m.at}`;
    case 'recruit': return `${who} recruit at ${m.at}`;
    case 'spread': return `${who} spread sympathy to ${m.at}`;
    case 'revolt': return `${who} revolt at ${m.at}`;
    case 'organize': return `${who} organize at ${m.at}`;
    case 'dig': return `${who} dig a tunnel at ${m.at}`;
    case 'forge': return `${who} forge a stronghold at ${m.at}`;
    default: return `${who}: ${m.type}`;
  }
}

// One line about what the current faction is doing and has left.
export function statusLine(g) {
  if (g.winner) return `${NAMES[g.winner]} win`;
  const f = currentFaction(g);
  const fs = g.fs[f];
  const phase = currentPhase(g);
  let extra = '';
  if (fs.actions !== undefined && phase === 'day') extra = ` · ${fs.actions} action${fs.actions === 1 ? '' : 's'} left`;
  if (f === 'orcs' && phase === 'dawn') extra = ` · ${2 - fs.added} orders may be added`;
  if (f === 'elves' && phase === 'dusk') extra = fs.organized ? ' · organized' : ' · may organize';
  return `${NAMES[f]} · ${phase}${extra}`;
}

export const BLURB = {
  humans: 'Engine builder. Barracks recruit each dawn; mills score each dawn and every second mill grants an action. Build only where you rule.',
  orcs: 'Warband. Each day you must carry out your war chant in order: recruit, move, battle, build. Add up to two orders a dawn. If one cannot be done, frenzy breaks the chant and costs points. +1 hit when attacking.',
  elves: 'Insurgents. Gather supporters, spread sympathy (it scores), revolt to wipe out a sympathetic clearing. Attackers lose a hit where sympathy runs. Organize at dusk.',
  dwarves: 'Tunnel fortress. Dig tunnels, then march between any two of them. Forge strongholds by spending warriors; they shrug off one hit and score each dusk.',
};

export const ROSTER = Object.keys(FACTIONS);
