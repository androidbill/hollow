// The roster. Adding a faction means writing one module and listing it here;
// the engine never mentions a faction by name.

import { registry } from '../helpers.js';
import { humans } from './humans.js';
import { orcs } from './orcs.js';
import { elves } from './elves.js';
import { dwarves } from './dwarves.js';

for (const faction of [humans, orcs, elves, dwarves]) registry[faction.id] = faction;

export const FACTIONS = registry;
export const DEFAULT_ORDER = ['humans', 'orcs', 'elves', 'dwarves'];
