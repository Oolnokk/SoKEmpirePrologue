// Utilities for interpreting pose flip target lists and mirroring specs.
// Pure helpers so they can be shared by runtime modules and unit tests.

export const MIRROR_TAGS = [
  'TORSO',
  'HEAD',
  'ARM_L_UPPER',
  'ARM_L_LOWER',
  'ARM_R_UPPER',
  'ARM_R_LOWER',
  'LEG_L_UPPER',
  'LEG_L_LOWER',
  'LEG_R_UPPER',
  'LEG_R_LOWER',
  'HITBOX',
  'WEAPON'
];

const MIRROR_ALIAS = new Map();

function registerAlias(keys, tags){
  const list = Array.isArray(tags) ? tags.map(String) : [];
  const normalized = list.map((tag)=>String(tag || '').trim().toUpperCase()).filter(Boolean);
  keys.forEach((key)=>{
    const normKey = canonicalizeKey(key);
    if (!normKey) return;
    MIRROR_ALIAS.set(normKey, normalized);
  });
}

function canonicalizeKey(value){
  if (value == null) return '';
  const str = String(value).trim();
  if (!str) return '';
  return str.replace(/[\s-]+/g, '_').toUpperCase();
}

registerAlias(['ALL', '*', 'BODY'], MIRROR_TAGS);
registerAlias(['ARMS', 'ARM'], ['ARM_L_UPPER','ARM_L_LOWER','ARM_R_UPPER','ARM_R_LOWER']);
registerAlias(['ARMUPPER','UPPERARM','UPPERARMS','UPPER_ARMS'], ['ARM_L_UPPER','ARM_R_UPPER']);
registerAlias(['ARMLOWER','LOWERARM','LOWERARMS','LOWER_ARMS'], ['ARM_L_LOWER','ARM_R_LOWER']);
registerAlias(['LEFT_ARM','L_ARM','ARM_L','ARMLEFT','LEFTARM'], ['ARM_L_UPPER','ARM_L_LOWER']);
registerAlias(['RIGHT_ARM','R_ARM','ARM_R','ARMRIGHT','RIGHTARM'], ['ARM_R_UPPER','ARM_R_LOWER']);
registerAlias(['LEGS','LEG'], ['LEG_L_UPPER','LEG_L_LOWER','LEG_R_UPPER','LEG_R_LOWER']);
registerAlias(['LEGUPPER','UPPERLEG','UPPERLEGS','UPPER_LEGS'], ['LEG_L_UPPER','LEG_R_UPPER']);
registerAlias(['LEGLOWER','LOWERLEG','LOWERLEGS','LOWER_LEGS'], ['LEG_L_LOWER','LEG_R_LOWER']);
registerAlias(['LEFT_LEG','L_LEG','LEG_L','LEGLEFT','LEFTLEG'], ['LEG_L_UPPER','LEG_L_LOWER']);
registerAlias(['RIGHT_LEG','R_LEG','LEG_R','LEGRIGHT','RIGHTLEG'], ['LEG_R_UPPER','LEG_R_LOWER']);

function dedupeTags(list){
  const seen = new Set();
  const out = [];
  for (const raw of list){
    const key = canonicalizeKey(raw);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function resolveMirrorTags(spec){
  if (Array.isArray(spec)){
    return dedupeTags(spec.flatMap(resolveMirrorTags));
  }
  const key = canonicalizeKey(spec);
  if (!key) return [];
  if (MIRROR_ALIAS.has(key)){
    return MIRROR_ALIAS.get(key).slice();
  }
  if (MIRROR_TAGS.includes(key)){
    return [key];
  }
  return [key];
}
