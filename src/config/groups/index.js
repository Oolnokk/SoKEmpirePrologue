import { createRequire } from 'node:module';

import { mergeGroupLibraries, normalizeGroupLibrary } from '../../map/groupLibrary.js';

const require = createRequire(import.meta.url);
const rawNpcGroups = require('./npc-groups.json');

const npcGroupLibrary = normalizeGroupLibrary(rawNpcGroups, [], { source: 'config/groups/npc-groups.json' });

export const groupLibrary = mergeGroupLibraries(npcGroupLibrary);
export const npcGroups = npcGroupLibrary;

export default groupLibrary;
