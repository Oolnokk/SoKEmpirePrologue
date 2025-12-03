import { mapBuilderConfig } from './mapBuilderConfig.js';

const { sourceId: SOURCE_ID } = mapBuilderConfig;

const clone = (value) => {
  if (!value || typeof value !== 'object') return value ?? null;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const pickNonEmptyString = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return null;
};

function normalizeGroupMember(member) {
  if (member == null) return null;
  if (typeof member === 'string') {
    const templateId = pickNonEmptyString(member);
    return templateId ? { templateId } : null;
  }
  if (typeof member !== 'object') return null;
  const templateId = pickNonEmptyString(
    member.templateId,
    member.characterTemplateId,
    member.character,
    member.characterId,
    member.id,
  );
  const characterId = pickNonEmptyString(member.characterId, member.character);
  const count = Number.isFinite(Number(member.count)) && Number(member.count) > 0
    ? Math.round(Number(member.count))
    : 1;
  const normalized = {
    ...clone(member),
    templateId: templateId ?? null,
    characterId: characterId ?? null,
    count,
  };
  return normalized;
}

export function normalizeGroupRecord(raw, warnings = [], context = {}) {
  const source = typeof context.source === 'string' ? context.source : 'group';
  const safe = raw && typeof raw === 'object' ? clone(raw) : {};
  const groupId = pickNonEmptyString(safe.id, context.groupId);
  if (!groupId) {
    warnings.push(`Ignored ${source} without id`);
    return null;
  }

  const name = pickNonEmptyString(safe.name, safe.label, groupId);
  const faction = pickNonEmptyString(safe.faction);
  const interests = Array.isArray(safe.interests)
    ? safe.interests.map((tag) => pickNonEmptyString(tag)).filter(Boolean)
    : [];
  const exitTags = Array.isArray(safe.exitTags)
    ? safe.exitTags.map((tag) => pickNonEmptyString(tag)).filter(Boolean)
    : [];
  const exitWeights = safe.exitWeights && typeof safe.exitWeights === 'object'
    ? clone(safe.exitWeights)
    : {};
  const members = Array.isArray(safe.members)
    ? safe.members.map((member) => normalizeGroupMember(member)).filter(Boolean)
    : [];
  const meta = safe.meta && typeof safe.meta === 'object' ? clone(safe.meta) : {};

  return {
    ...safe,
    id: groupId,
    name,
    faction,
    interests,
    exitTags,
    exitWeights,
    members,
    meta,
    source: pickNonEmptyString(safe.source, source, SOURCE_ID),
  };
}

export function normalizeGroupLibrary(rawLibrary = {}, warnings = [], context = {}) {
  const normalized = {};
  const source = typeof context.source === 'string' ? context.source : 'groupLibrary';

  const addRecord = (record, keyHint) => {
    const group = normalizeGroupRecord(record, warnings, { source, groupId: keyHint });
    if (!group) return;
    if (!normalized[group.id]) {
      normalized[group.id] = group;
    }
  };

  if (Array.isArray(rawLibrary)) {
    rawLibrary.forEach((record, index) => addRecord(record, `group_${index}`));
  } else if (rawLibrary && typeof rawLibrary === 'object') {
    Object.entries(rawLibrary).forEach(([key, record]) => addRecord(record, key));
  }

  return normalized;
}

export function mergeGroupLibraries(...libraries) {
  const merged = {};
  libraries.forEach((lib) => {
    if (!lib || typeof lib !== 'object') return;
    Object.entries(lib).forEach(([id, group]) => {
      merged[id] = clone(group);
    });
  });
  return merged;
}

export function attachGroupsToSpawners(spawners = [], groupLibrary = {}, warnings = []) {
  if (!Array.isArray(spawners)) return [];
  return spawners.map((spawner) => {
    if (!spawner || typeof spawner !== 'object') return spawner;
    const inlineGroup = spawner.group && typeof spawner.group === 'object' ? clone(spawner.group) : null;
    const groupId = pickNonEmptyString(
      spawner.groupId,
      spawner.meta?.groupId,
      inlineGroup?.id,
      inlineGroup?.groupId,
    );
    const resolved = groupId && groupLibrary[groupId] ? clone(groupLibrary[groupId]) : null;
    const group = inlineGroup || resolved || null;
    if (!group && groupId) {
      warnings.push(`Spawner "${spawner.spawnerId}" references missing group "${groupId}"`);
    }
    return {
      ...spawner,
      groupId: groupId || null,
      group: group || undefined,
    };
  });
}

export default normalizeGroupLibrary;
