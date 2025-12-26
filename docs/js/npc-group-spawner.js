// npc-group-spawner.js — Spawns NPC groups with generated names and manages group spawning
// Integrates with spawn-service.js, character-templates.js, and namegen.js

import { instantiateCharacterTemplate } from './character-templates.js?v=1';
import { CULTURES, generateName } from './namegen.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;

function clone(value) {
  if (value == null) return value;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch (_err) {
    // Ignore and fallback to JSON clone
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return value;
  }
}

/**
 * Debug logging utility controlled by CONFIG.debug.npcGroupSpawner
 */
function debugLog(...args) {
  const config = ROOT.CONFIG?.debug?.npcGroupSpawner;
  if (config && config.enabled) {
    console.log('[NPC-Group-Spawner]', ...args);
  }
}

/**
 * Mulberry32 PRNG for deterministic name generation
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a deterministic seed from a string
 */
function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) >>> 0;
}

/**
 * Parse culture and gender from fighter name
 * Examples:
 *   "Mao-ao_m" → { culture: "mao-ao", gender: "male" }
 *   "Mao-ao_f" → { culture: "mao-ao", gender: "female" }
 *   "fighter_default" → { culture: null, gender: null }
 */
function parseFighterName(fighterName) {
  if (!fighterName || typeof fighterName !== 'string') {
    return { culture: null, gender: null };
  }

  // Check for _m (male) or _f (female) suffix
  const genderMatch = fighterName.match(/^(.+?)_([mf])$/i);
  if (!genderMatch) {
    return { culture: null, gender: null };
  }

  const culturePart = genderMatch[1];
  const genderPart = genderMatch[2].toLowerCase();

  // Normalize culture name (e.g., "Mao-ao" → "mao_ao")
  const cultureName = culturePart.toLowerCase().replace(/-/g, '_');
  const gender = genderPart === 'm' ? 'male' : 'female';

  return { culture: cultureName, gender };
}

/**
 * Resolve the culture for name generation
 * Defaults to mao_ao if not specified
 */
function resolveCulture(fighterName, groupMeta, member) {
  // Try to parse from fighter name first (e.g., "Mao-ao_m" → "mao_ao")
  const parsed = parseFighterName(fighterName);
  const cultureName = parsed.culture
    || member?.culture
    || groupMeta?.culture
    || groupMeta?.meta?.culture
    || 'mao_ao';

  const culture = CULTURES[cultureName];
  if (!culture) {
    debugLog(`Culture "${cultureName}" not found, falling back to mao_ao`);
    return CULTURES.mao_ao;
  }
  return culture;
}

/**
 * Determine gender from fighter name, template, or randomize
 */
function resolveGender(fighterName, member, templateResult, rng) {
  // Try to parse from fighter name first (e.g., "Mao-ao_m" → "male")
  const parsed = parseFighterName(fighterName);
  if (parsed.gender) {
    return parsed.gender;
  }

  // Check explicit gender in member definition
  if (member?.gender === 'male' || member?.gender === 'female') {
    return member.gender;
  }

  // Check template result
  if (templateResult?.character?.gender === 'male' || templateResult?.character?.gender === 'female') {
    return templateResult.character.gender;
  }

  // Check template meta
  if (templateResult?.meta?.gender === 'male' || templateResult?.meta?.gender === 'female') {
    return templateResult.meta.gender;
  }

  // Randomize
  return rng() < 0.5 ? 'male' : 'female';
}

/**
 * Generate a name for an NPC with optional family relationships
 * @param {object} options - Name generation options
 * @param {string} options.culture - Culture name
 * @param {string} options.gender - 'male' or 'female'
 * @param {number} options.seed - Seed for deterministic generation
 * @param {string} [options.parentSurname] - Parent's surname for inheritance
 * @param {string} [options.spouseName] - Spouse's name for marriage rules
 * @param {string} [options.spouseGender] - Spouse's gender
 * @param {boolean} [options.debug] - Enable debug output
 * @returns {object} Generated name result with {name, parts, seed, debug?}
 */
export function generateNpcName(options = {}) {
  const culture = CULTURES[options.culture] || CULTURES.mao_ao;

  const nameResult = generateName(culture, {
    gender: options.gender || 'male',
    seed: options.seed || Math.floor(Math.random() * 2 ** 31),
    parentSurname: options.parentSurname,
    spouseName: options.spouseName,
    spouseGender: options.spouseGender,
    debug: options.debug || false,
  });

  return nameResult;
}

/**
 * Instantiate a single group member with generated name
 * @param {object} member - Member definition from group
 * @param {object} groupMeta - Group metadata
 * @param {number} memberIndex - Index within the group
 * @param {object} spawner - Spawner configuration
 * @param {function} rng - Random number generator
 * @returns {object} Instantiated fighter with generated name
 */
function instantiateGroupMember(member, groupMeta, memberIndex, spawner, rng) {
  const templateId = member.templateId || member.characterTemplateId;
  if (!templateId) {
    debugLog('Warning: Member without templateId', member);
    return null;
  }

  // Instantiate character from template
  const templateResult = instantiateCharacterTemplate(templateId, {
    random: rng,
    player: ROOT.GAME?.player,
    config: ROOT.CONFIG,
  });

  if (!templateResult) {
    debugLog(`Warning: Failed to instantiate template "${templateId}"`);
    return null;
  }

  // Extract fighter name for culture/gender parsing
  const fighterName = templateResult.character?.fighter
    || templateResult.character?.fighterName
    || null;

  // Resolve culture and gender (from fighter name like "Mao-ao_m" or fallbacks)
  const culture = resolveCulture(fighterName, groupMeta, member);
  const gender = resolveGender(fighterName, member, templateResult, rng);

  // Generate deterministic seed based on spawner, group, and member
  const spawnerId = spawner?.spawnerId || spawner?.id || 'unknown';
  const groupId = groupMeta?.id || 'unknown';
  const seedString = `${spawnerId}:${groupId}:${memberIndex}:${templateId}`;
  const nameSeed = seedFromString(seedString);

  // Check if we should inherit surname from group (family groups)
  const familySurname = groupMeta?.meta?.familySurname || groupMeta?.familySurname;

  // Generate name
  const enableNameDebug = ROOT.CONFIG?.debug?.npcGroupSpawner?.debugNames || false;
  const nameResult = generateNpcName({
    culture: culture.id,
    gender,
    seed: nameSeed,
    parentSurname: familySurname,
    debug: enableNameDebug,
  });

  debugLog(`Generated name for ${templateId} (${gender}): ${nameResult.name}`);
  if (enableNameDebug && nameResult.debug) {
    debugLog('Name generation steps:', nameResult.debug);
  }

  // Create fighter object with name
  const fighter = {
    ...clone(templateResult.character),
    id: `${spawnerId}_${groupId}_${memberIndex}`,
    templateId,
    npcName: nameResult.name,
    nameParts: nameResult.parts,
    gender,
    culture: culture.id,
    groupId: groupMeta.id,
    groupName: groupMeta.name,
    spawnerId,
    memberIndex,

    // Store metadata
    meta: {
      ...(templateResult.character?.meta || {}),
      generatedName: nameResult.name,
      nameSeed,
      culture: culture.id,
    },

    // Merge any member-specific overrides
    ...(member.overrides || {}),
  };

  return fighter;
}

/**
 * Spawn an NPC group from a spawner
 * @param {object} spawner - Spawner configuration with groupMeta
 * @param {object} [options] - Spawn options
 * @param {number} [options.seed] - Optional seed for deterministic spawning
 * @returns {Array} Array of instantiated fighters
 */
export function spawnNpcGroup(spawner, options = {}) {
  if (!spawner) {
    debugLog('Error: No spawner provided');
    return [];
  }

  const groupMeta = spawner.groupMeta || spawner.group;
  if (!groupMeta) {
    debugLog('Error: Spawner has no group metadata', spawner);
    return [];
  }

  const members = Array.isArray(groupMeta.members) ? groupMeta.members : [];
  if (members.length === 0) {
    debugLog('Warning: Group has no members', groupMeta);
    return [];
  }

  debugLog(`Spawning group "${groupMeta.name || groupMeta.id}" with ${members.length} member types`);

  // Create deterministic RNG
  const baseSeed = options.seed || seedFromString(spawner.spawnerId || spawner.id || String(Math.random()));
  const rng = mulberry32(baseSeed);

  const fighters = [];
  let memberIndex = 0;

  for (const member of members) {
    const count = Math.max(1, Math.round(member.count || 1));

    for (let i = 0; i < count; i++) {
      const fighter = instantiateGroupMember(member, groupMeta, memberIndex, spawner, rng);
      if (fighter) {
        fighters.push(fighter);
      }
      memberIndex++;
    }
  }

  debugLog(`Successfully spawned ${fighters.length} fighters from group "${groupMeta.name || groupMeta.id}"`);

  if (ROOT.CONFIG?.debug?.npcGroupSpawner?.logNames) {
    debugLog('Group member names:');
    fighters.forEach((f, i) => {
      debugLog(`  ${i + 1}. ${f.npcName} (${f.gender}, ${f.templateId})`);
    });
  }

  return fighters;
}

/**
 * Spawn all groups from a spawn service
 * @param {object} spawnService - SpawnService instance
 * @param {string} [areaId] - Area ID to spawn from (uses active area if not specified)
 * @returns {Array} Array of all spawned fighters
 */
export function spawnAllGroups(spawnService, areaId = null) {
  if (!spawnService || typeof spawnService.getSpawners !== 'function') {
    debugLog('Error: Invalid spawn service');
    return [];
  }

  const spawners = spawnService.getSpawners(areaId, { type: 'npc' });
  if (!spawners || spawners.length === 0) {
    debugLog('No NPC spawners found');
    return [];
  }

  debugLog(`Found ${spawners.length} NPC spawners`);

  const allFighters = [];

  for (const spawner of spawners) {
    if (!spawner.groupMeta && !spawner.group) {
      debugLog(`Skipping spawner "${spawner.spawnerId}" - no group metadata`);
      continue;
    }

    const fighters = spawnNpcGroup(spawner);
    allFighters.push(...fighters);
  }

  debugLog(`Total fighters spawned: ${allFighters.length}`);

  return allFighters;
}

/**
 * Initialize debug configuration for NPC group spawning
 */
export function initNpcGroupSpawnerDebug() {
  ROOT.CONFIG = ROOT.CONFIG || {};
  ROOT.CONFIG.debug = ROOT.CONFIG.debug || {};
  ROOT.CONFIG.debug.npcGroupSpawner = ROOT.CONFIG.debug.npcGroupSpawner || {
    enabled: false,      // Enable general debug logging
    logNames: false,     // Log all generated names
    debugNames: false,   // Enable detailed name generation debug info
  };

  debugLog('NPC Group Spawner initialized');
}

// Auto-initialize on load
if (typeof window !== 'undefined') {
  initNpcGroupSpawnerDebug();
}

// Export for use in other modules
export default {
  spawnNpcGroup,
  spawnAllGroups,
  generateNpcName,
  initNpcGroupSpawnerDebug,
  parseFighterName,
};

// Also export parseFighterName individually
export { parseFighterName };
