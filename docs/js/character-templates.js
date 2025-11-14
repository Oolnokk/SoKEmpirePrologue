// character-templates.js — Data-driven fighter character template instantiation
// Provides weighted pools, numeric range selection, and context-aware resolution helpers

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

function deepMerge(base = {}, extra = {}) {
  if (base == null && extra == null) return null;
  if (base == null) return clone(extra);
  if (extra == null) return clone(base);
  const result = Array.isArray(base) ? base.map((item) => clone(item)) : { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map((item) => clone(item));
      continue;
    }
    if (typeof value === 'object') {
      const current = result[key];
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        result[key] = deepMerge(current, value);
      } else {
        result[key] = clone(value);
      }
      continue;
    }
    result[key] = value;
  }
  return result;
}

function normalizeWeightedEntries(entries = [], { defaultWeight = 1, valueKey } = {}) {
  const normalized = [];
  for (const entry of entries) {
    if (entry == null) continue;
    if (valueKey && entry && typeof entry === 'object' && !Array.isArray(entry) && valueKey in entry) {
      const weight = Number.isFinite(entry.weight) ? Number(entry.weight) : defaultWeight;
      normalized.push({ value: entry[valueKey], weight: Math.max(weight, 0) });
      continue;
    }
    if (!valueKey && entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')) {
      const weight = Number.isFinite(entry.weight) ? Number(entry.weight) : defaultWeight;
      normalized.push({ value: entry.value, weight: Math.max(weight, 0) });
      continue;
    }
    normalized.push({ value: entry, weight: defaultWeight });
  }
  return normalized;
}

function pickWeightedValue(entries = [], randomFn = Math.random) {
  const normalized = normalizeWeightedEntries(entries);
  if (!normalized.length) return null;
  const total = normalized.reduce((sum, entry) => sum + (entry.weight > 0 ? entry.weight : 0), 0);
  if (total <= 0) {
    const index = Math.floor(randomFn() * normalized.length) % normalized.length;
    return normalized[index].value;
  }
  let threshold = randomFn() * total;
  for (const entry of normalized) {
    if (entry.weight <= 0) continue;
    if (threshold < entry.weight) return entry.value;
    threshold -= entry.weight;
  }
  return normalized[normalized.length - 1].value;
}

function resolveRangeNode(node = {}, randomFn = Math.random) {
  if (Array.isArray(node)) {
    const [min = 0, max = min] = node;
    return resolveRangeNode({ min, max }, randomFn);
  }
  const min = Number.isFinite(node.min) ? Number(node.min) : Number.isFinite(node.start) ? Number(node.start) : 0;
  const max = Number.isFinite(node.max) ? Number(node.max) : Number.isFinite(node.end) ? Number(node.end) : min;
  const t = randomFn();
  let value = min + (max - min) * t;
  if (node.integer || node.round) {
    value = Math.round(value);
  }
  if (node.floor) value = Math.floor(value);
  if (node.ceil) value = Math.ceil(value);
  return value;
}

function pickRangeValue(entries = [], randomFn = Math.random) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  const normalized = entries.map((entry) => {
    if (Array.isArray(entry)) {
      const [min = 0, max = min, weight = 1] = entry;
      return { min, max, weight: Math.max(Number(weight) || 0, 0) };
    }
    if (entry && typeof entry === 'object') {
      const min = Number.isFinite(entry.min) ? Number(entry.min) : Number.isFinite(entry.start) ? Number(entry.start) : 0;
      const max = Number.isFinite(entry.max) ? Number(entry.max) : Number.isFinite(entry.end) ? Number(entry.end) : min;
      const weight = Math.max(Number(entry.weight) || 0, 0);
      return { ...entry, min, max, weight };
    }
    const value = Number(entry) || 0;
    return { min: value, max: value, weight: 1 };
  });
  const total = normalized.reduce((sum, entry) => sum + (entry.weight > 0 ? entry.weight : 0), 0);
  let pick;
  if (total <= 0) {
    const index = Math.floor(randomFn() * normalized.length) % normalized.length;
    pick = normalized[index];
  } else {
    let threshold = randomFn() * total;
    for (const entry of normalized) {
      if (entry.weight <= 0) continue;
      if (threshold < entry.weight) {
        pick = entry;
        break;
      }
      threshold -= entry.weight;
    }
    if (!pick) pick = normalized[normalized.length - 1];
  }
  return resolveRangeNode(pick, randomFn);
}

function getRefValue(path, context, fallback = null) {
  if (!path) return fallback;
  const parts = String(path).split('.');
  let current = context;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return fallback;
    current = current[part];
  }
  if (current == null) return fallback;
  return clone(current);
}

function resolvePlayerBodyColor(node = {}, context, resolve) {
  const channel = node.channel || node.key || node.slot || 'A';
  const playerColors = context?.player?.renderProfile?.bodyColors || {};
  const baseCharacter = context?.baseCharacter || {};
  const baseColors = baseCharacter.bodyColors || {};
  const templateBase = context?.base || {};
  const templateBaseColors = templateBase.bodyColors || {};
  const source = playerColors[channel]
    || templateBaseColors[channel]
    || baseColors[channel]
    || { h: 0, s: 0, v: 0 };
  const color = clone(source) || { h: 0, s: 0, v: 0 };
  const adjustments = node.adjustments || node.adjust || {};
  for (const [component, adjustment] of Object.entries(adjustments)) {
    const resolved = resolve(adjustment, context);
    if (resolved == null) continue;
    if (node.mode === 'add') {
      const baseValue = Number(color[component]) || 0;
      color[component] = baseValue + Number(resolved);
    } else {
      color[component] = resolved;
    }
  }
  return color;
}

function resolveTemplateNode(node, context) {
  const randomFn = typeof context?.random === 'function' ? context.random : Math.random;

  if (node == null) return node;

  if (Array.isArray(node)) {
    return node.map((value) => resolveTemplateNode(value, context));
  }

  if (typeof node !== 'object') {
    return node;
  }

  if (node.$kind === 'range') {
    return resolveRangeNode(node, randomFn);
  }

  if (node.$kind === 'rangePool') {
    return pickRangeValue(node.ranges || [], randomFn);
  }

  if (node.$kind === 'pool') {
    return resolveTemplateNode(pickWeightedValue(node.items || [], randomFn), context);
  }

  if (node.$kind === 'pick') {
    const pool = Array.isArray(node.pool) ? node.pool.slice() : [];
    const count = Math.max(0, Number(node.count) || 0);
    const unique = node.unique !== false;
    const picks = [];
    const indexPool = pool.map((entry, index) => ({
      index,
      value: entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'value')
        ? entry.value
        : entry,
      weight: entry && typeof entry === 'object' && !Array.isArray(entry) && Number.isFinite(entry.weight)
        ? Number(entry.weight)
        : 1,
    }));
    for (let i = 0; i < count; i += 1) {
      if (!indexPool.length) break;
      const choice = pickWeightedValue(indexPool.map((entry) => ({ value: entry, weight: entry.weight })), randomFn);
      if (!choice) break;
      picks.push(resolveTemplateNode(choice.value, context));
      if (unique) {
        const removeIndex = indexPool.findIndex((entry) => entry.index === choice.index);
        if (removeIndex >= 0) {
          indexPool.splice(removeIndex, 1);
        }
      }
    }
    return picks;
  }

  if (node.$kind === 'ref') {
    return getRefValue(node.path, context, node.fallback);
  }

  if (node.$kind === 'playerBodyColor') {
    return resolvePlayerBodyColor(node, context, resolveTemplateNode);
  }

  const result = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = resolveTemplateNode(value, context);
  }
  return result;
}

export function instantiateCharacterTemplate(id, context = {}) {
  if (!id) return null;
  const C = context.config || ROOT.CONFIG || {};
  const templates = C.characterTemplates || {};
  const template = templates[id];
  if (!template) return null;
  const baseCharacterKey = template.baseCharacter || null;
  const baseCharacter = baseCharacterKey && C.characters?.[baseCharacterKey]
    ? clone(C.characters[baseCharacterKey])
    : {};
  const defaults = template.defaults ? clone(template.defaults) : {};
  const base = deepMerge(baseCharacter, defaults);
  const resolved = resolveTemplateNode(template.overrides || {}, {
    ...context,
    config: C,
    template,
    baseCharacter,
    base,
  }) || {};
  const character = deepMerge(base, resolved) || {};
  const characterKey = template.characterKey || `template:${id}`;
  return {
    id,
    templateId: id,
    characterKey,
    baseCharacter: baseCharacterKey,
    character,
    meta: {
      label: template.label || null,
      description: template.description || null,
    },
  };
}

export function getRegisteredCharacterTemplates() {
  const C = ROOT.CONFIG || {};
  return clone(C.characterTemplates || {});
}
