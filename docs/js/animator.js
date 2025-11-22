// animator.js — restore basic idle/walk posing; robust speed detection; override TTL required
import { degToRad, radToDegNum, angleFromDelta, segPos, withAX, basis } from './math-utils.js?v=1';
import { setMirrorForPart, resetMirror } from './sprites.js?v=1';
import { pickFighterConfig, pickFighterName, lengths, pickOffsets, resolveBoneLengthScale, normalizeBoneLengthKey } from './fighter-utils.js?v=1';
import { getFaceLock } from './face-lock.js?v=1';
import { composeStyleOverrides } from './transform-composer.js?v=1';
import { updatePhysicsPoseTarget, getPhysicsRagdollBlend, getPhysicsRagdollAngles } from './physics.js?v=1';

const ANG_KEYS = ['torso','head','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee','weapon'];
const ARM_JOINT_KEYS = ['torso', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow'];
const JOINT_DAMP_LAMBDA = 10;
// Convert pose object from degrees to radians using centralized utility
function degToRadPose(p){ const o={}; for(const k of ANG_KEYS){ if (p&&p[k]!=null) o[k]=degToRad(p[k]); } return o; }
// Add basePose to pose (matching reference HTML addAngles function)
function addAngles(base, delta){
  const out = {};
  for (const k of ANG_KEYS){
    out[k] = (base?.[k] ?? 0) + (delta?.[k] ?? 0);
  }
  if (base?.weaponGripPercents || delta?.weaponGripPercents) {
    out.weaponGripPercents = {
      ...(base?.weaponGripPercents || {}),
      ...(delta?.weaponGripPercents || {})
    };
  }
  if (base?.weaponJointPercents || delta?.weaponJointPercents) {
    out.weaponJointPercents = {
      ...(base?.weaponJointPercents || {}),
      ...(delta?.weaponJointPercents || {})
    };
  }
  if (base?.weaponJointPercent != null || delta?.weaponJointPercent != null) {
    const next = delta?.weaponJointPercent;
    out.weaponJointPercent = Number.isFinite(next)
      ? next
      : (Number.isFinite(base?.weaponJointPercent) ? base.weaponJointPercent : next);
  }
  return out;
}
// Common easing helpers (restored from reference)
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Custom Windup easing: quick bias into the windup (ease-in-ish) then slow hold
function easeWindup(t){
  // Make the first 60% ease-in steep, final 40% ease-out gently to hold the pose
  if (t < 0.6) return Math.pow(t / 0.6, 2.2) * 0.8; // scaled to avoid overshoot
  const u = (t - 0.6) / 0.4; // 0..1
  return 0.8 + (1 - Math.pow(1 - u, 2)) * 0.2;
}
function lerp(a,b,t){ return a + (b-a)*t; }
function damp(current, target, lambda, dt){ const t = 1 - Math.exp(-lambda*dt); return current + (target - current)*t; }

function ensureAnimState(F){
  F.walk ||= { phase:0, amp:1, t:0 };
  F.jointAngles ||= {};
  F.aim ||= { targetAngle: 0, currentAngle: 0, torsoOffset: 0, shoulderOffset: 0, hipOffset: 0, active: false, headWorldTarget: null };
  if (!F.anim){ F.anim = { last: performance.now()/1000, override:null, layers: [], pendingLayerTimers: {} }; }
  else {
    if (!Array.isArray(F.anim.layers)){ F.anim.layers = []; }
    if (!F.anim.pendingLayerTimers || typeof F.anim.pendingLayerTimers !== 'object'){
      F.anim.pendingLayerTimers = {};
    }
  }
  if (!F.anim.breath || typeof F.anim.breath !== 'object'){
    F.anim.breath = { phase: 0, direction: 1, styleOverride: null, shoulderOffsets: null, active: false };
  } else {
    if (!Number.isFinite(F.anim.breath.phase)) F.anim.breath.phase = 0;
    if (F.anim.breath.direction !== 1 && F.anim.breath.direction !== -1) F.anim.breath.direction = 1;
  }
  if (!F.anim.weapon || typeof F.anim.weapon !== 'object') {
    F.anim.weapon = { attachments: {}, gripPercents: {}, jointPercents: {}, state: null };
  } else {
    if (typeof F.anim.weapon.attachments !== 'object' || !F.anim.weapon.attachments) {
      F.anim.weapon.attachments = {};
    }
    if (typeof F.anim.weapon.gripPercents !== 'object' || !F.anim.weapon.gripPercents) {
      F.anim.weapon.gripPercents = {};
    }
    if (typeof F.anim.weapon.jointPercents !== 'object' || !F.anim.weapon.jointPercents) {
      F.anim.weapon.jointPercents = {};
    }
  }
  if (!F.anim.length || typeof F.anim.length !== 'object') {
    F.anim.length = { overrides: {}, active: false };
  } else {
    if (typeof F.anim.length.overrides !== 'object' || !F.anim.length.overrides) {
      F.anim.length.overrides = {};
    }
    if (typeof F.anim.length.active !== 'boolean') {
      F.anim.length.active = Object.keys(F.anim.length.overrides).length > 0;
    }
  }
}

function parseLengthOverrideValue(value, defaultMode = 'scale') {
  const mode = (defaultMode === 'absolute') ? 'absolute' : 'scale';
  if (Number.isFinite(value)) {
    return { mode, value: Number(value) };
  }
  if (!value || typeof value !== 'object') return null;
  if (Number.isFinite(value.scale)) {
    return { mode: 'scale', value: Number(value.scale) };
  }
  if (Number.isFinite(value.multiplier)) {
    return { mode: 'scale', value: Number(value.multiplier) };
  }
  if (Number.isFinite(value.value)) {
    return { mode: 'scale', value: Number(value.value) };
  }
  if (Number.isFinite(value.amount)) {
    return { mode: defaultMode === 'absolute' ? 'absolute' : 'scale', value: Number(value.amount) };
  }
  if (Number.isFinite(value.length)) {
    return { mode: 'absolute', value: Number(value.length) };
  }
  if (Number.isFinite(value.len)) {
    return { mode: 'absolute', value: Number(value.len) };
  }
  return null;
}

function extractPoseLengthOverrides(pose){
  if (!pose || typeof pose !== 'object') return null;
  const sources = [];
  const pushSource = (map, defaultMode = 'scale') => {
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      sources.push({ map, defaultMode });
    }
  };
  pushSource(pose.boneLengthScales, 'scale');
  pushSource(pose.lengthScales, 'scale');
  pushSource(pose.lengthScale, 'scale');
  pushSource(pose.lengthOverrides, 'scale');
  pushSource(pose.lengthOverride, 'scale');
  pushSource(pose.boneLengthOverrides, 'scale');
  pushSource(pose.boneLengths, 'absolute');
  pushSource(pose.lengths, 'absolute');
  if (!sources.length) return null;

  const result = {};
  for (const { map, defaultMode } of sources){
    for (const [rawKey, rawValue] of Object.entries(map)){
      const normKey = normalizeBoneLengthKey(rawKey);
      if (!normKey) continue;
      const parsed = parseLengthOverrideValue(rawValue, defaultMode);
      if (!parsed) continue;
      result[normKey] = { mode: parsed.mode, value: parsed.value };
    }
  }
  return Object.keys(result).length ? result : null;
}

function collectLengthOverridesFromLayers(layers){
  if (!Array.isArray(layers) || !layers.length) return {};
  const merged = {};
  for (const layer of layers){
    if (!layer || !layer.__lengthOverrides) continue;
    const overrides = layer.__lengthOverrides;
    for (const [key, entry] of Object.entries(overrides)){
      merged[key] = { mode: entry.mode, value: entry.value };
    }
  }
  return merged;
}

function applyLengthOverridesToFighter(F, overrides){
  if (!F) return;
  ensureAnimState(F);
  const target = {};
  for (const [key, entry] of Object.entries(overrides || {})){
    target[key] = { mode: entry.mode, value: entry.value };
  }
  F.anim.length.overrides = target;
  F.anim.length.active = Object.keys(target).length > 0;
}

const DEFAULT_BREATHING_FRAMES = [
  {
    torso: { scaleX: 1.0, scaleY: 1.0 },
    arms: {
      left: { ax: 0, ay: 0 },
      right: { ax: 0, ay: 0 }
    }
  },
  {
    torso: { scaleX: 1.1, scaleY: 1.1 },
    arms: {
      left: { ax: -2 },
      right: { ax: -2 }
    }
  }
];

const DEFAULT_BREATHING_CYCLE = 3.5;
const DEFAULT_BREATHING_SPEED_RANGE = { min: 0.75, max: 1.6 };

function toNumber(value, fallback){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeArmOffset(spec){
  if (spec == null) return { ax: 0, ay: 0, __mirror__: false };
  if (typeof spec === 'number') return { ax: 0, ay: toNumber(spec, 0), __mirror__: false };
  if (typeof spec === 'string'){
    const trimmed = spec.trim().toLowerCase();
    if (trimmed === 'mirror' || trimmed === 'mirrored'){
      return { ax: 0, ay: 0, __mirror__: true };
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)){
      return { ax: 0, ay: parsed, __mirror__: false };
    }
  }
  if (Array.isArray(spec)){
    return {
      ax: toNumber(spec[0], 0),
      ay: toNumber(spec[1], 0),
      __mirror__: false
    };
  }
  if (typeof spec === 'object'){
    if (spec.__mirror__ === true || spec.mirror === true) return { ax: 0, ay: 0, __mirror__: true };
    const source = spec.offset || spec.translate || spec.position || {};
    const ax = toNumber(
      spec.ax ?? spec.x ?? spec.offsetX ?? spec.dx ?? source.ax ?? source.x ?? source.dx,
      0
    );
    const ay = toNumber(
      spec.ay ?? spec.y ?? spec.offsetY ?? spec.dy ?? source.ay ?? source.y ?? source.dy,
      0
    );
    return { ax, ay, __mirror__: false };
  }
  return { ax: 0, ay: 0, __mirror__: false };
}

function normalizeBreathingFrame(frame){
  if (!frame || typeof frame !== 'object') return null;

  const torsoSrc = frame.torso || frame.chest || frame.body || {};
  const scaleBase = frame.torsoScale ?? frame.scale ?? frame.scaleAll ?? frame.scaleXY ?? frame.amount;
  let scaleX = toNumber(frame.torsoScaleX ?? torsoSrc.scaleX ?? torsoSrc.x ?? scaleBase, NaN);
  let scaleY = toNumber(frame.torsoScaleY ?? torsoSrc.scaleY ?? torsoSrc.y ?? scaleBase, NaN);
  if (!Number.isFinite(scaleX)) scaleX = Number.isFinite(scaleBase) ? scaleBase : 1;
  if (!Number.isFinite(scaleY)) scaleY = Number.isFinite(scaleBase) ? scaleBase : scaleX;
  scaleX = clamp(scaleX, 0.5, 2.5);
  scaleY = clamp(scaleY, 0.5, 2.5);

  const armsSrc = frame.arms || frame.shoulders || {};
  const leftSpec = frame.leftArm ?? frame.armLeft ?? frame.left ?? armsSrc.left ?? armsSrc.L ?? armsSrc.l;
  const rightSpec = frame.rightArm ?? frame.armRight ?? frame.right ?? armsSrc.right ?? armsSrc.R ?? armsSrc.r;

  const leftRaw = normalizeArmOffset(leftSpec);
  const left = {
    ax: toNumber(leftRaw.ax, 0),
    ay: toNumber(leftRaw.ay, 0)
  };

  let right;
  if (rightSpec == null){
    if (frame.mirrorArms === false || frame.mirror === false){
      right = { ax: left.ax, ay: left.ay };
    } else {
      right = { ax: left.ax, ay: -left.ay };
    }
  } else {
    const rightRaw = normalizeArmOffset(rightSpec);
    if (rightRaw.__mirror__){
      right = { ax: left.ax, ay: -left.ay };
    } else {
      right = {
        ax: toNumber(rightRaw.ax, 0),
        ay: toNumber(rightRaw.ay, 0)
      };
    }
  }

  return {
    torsoScaleX: scaleX,
    torsoScaleY: scaleY,
    left,
    right
  };
}

function resolveBreathingFrames(config){
  const raw = config?.keyframes ?? config?.frames ?? config?.poses ?? config?.frame;
  let list = null;
  if (Array.isArray(raw)){
    list = raw;
  } else if (raw && typeof raw === 'object'){
    const inhale = raw.inhale ?? raw.start ?? raw.a ?? null;
    const exhale = raw.exhale ?? raw.end ?? raw.b ?? null;
    if (inhale || exhale){
      list = [inhale, exhale].filter(Boolean);
    } else {
      list = Object.values(raw);
    }
  }

  const normalized = [];
  if (Array.isArray(list)){
    for (const frame of list){
      const norm = normalizeBreathingFrame(frame);
      if (norm) normalized.push(norm);
      if (normalized.length >= 2) break;
    }
  }

  if (normalized.length < 2){
    const defaults = DEFAULT_BREATHING_FRAMES.map(f => normalizeBreathingFrame(f)).filter(Boolean);
    return defaults.slice(0, 2);
  }

  return normalized.slice(0, 2);
}

function resolveSpeedRange(config){
  const def = DEFAULT_BREATHING_SPEED_RANGE;
  const direct = config?.speedMultiplier ?? config?.speedRange ?? config?.staminaSpeed ?? config?.speed ?? config?.rate;
  let min = def.min;
  let max = def.max;

  if (Array.isArray(direct) && direct.length >= 2){
    min = toNumber(direct[0], def.min);
    max = toNumber(direct[1], def.max);
  } else if (typeof direct === 'number'){
    const val = Math.max(0.01, direct);
    min = val;
    max = val;
  } else if (direct && typeof direct === 'object'){
    min = toNumber(direct.min ?? direct.slow ?? direct.low ?? direct.start ?? direct.base, def.min);
    max = toNumber(direct.max ?? direct.fast ?? direct.high ?? direct.end ?? direct.peak, def.max);
  } else {
    min = toNumber(config?.minSpeedMultiplier ?? config?.speedMultiplierMin, def.min);
    max = toNumber(config?.maxSpeedMultiplier ?? config?.speedMultiplierMax, def.max);
  }

  if (!Number.isFinite(min)) min = def.min;
  if (!Number.isFinite(max)) max = def.max;
  min = Math.max(0.01, min);
  max = Math.max(0.01, max);
  if (max < min){
    const tmp = min;
    min = max;
    max = tmp;
  }
  return { min, max };
}

function resolveBreathingSpec(config){
  const source = config || {};
  if (source.enabled === false) return null;
  const frames = resolveBreathingFrames(source);
  if (!frames || frames.length < 2) return null;
  const cycleSrc = source.cycleDuration ?? source.duration ?? source.cycle ?? source.period ?? source.cycleSeconds ?? source.seconds;
  const cycle = Math.max(0.1, toNumber(cycleSrc, DEFAULT_BREATHING_CYCLE));
  const speedMultiplier = resolveSpeedRange(source);
  return { frames, cycle, speedMultiplier };
}

function pickBreathingConfig(C, fighterName){
  const globalCfg = C.breathing;
  const fighterCfg = C.fighters?.[fighterName]?.breathing;
  if (!globalCfg && !fighterCfg) return null;
  if (!globalCfg) return fighterCfg;
  if (!fighterCfg) return globalCfg;
  const merged = { ...globalCfg, ...fighterCfg };
  if (fighterCfg && typeof fighterCfg === 'object'){
    if (fighterCfg.keyframes != null || fighterCfg.frames != null || fighterCfg.poses != null){
      merged.keyframes = fighterCfg.keyframes ?? fighterCfg.frames ?? fighterCfg.poses;
    }
    if (fighterCfg.speedMultiplier != null) merged.speedMultiplier = fighterCfg.speedMultiplier;
    if (fighterCfg.speedRange != null) merged.speedRange = fighterCfg.speedRange;
    if (fighterCfg.speed != null) merged.speed = fighterCfg.speed;
    if (fighterCfg.rate != null) merged.rate = fighterCfg.rate;
    if (fighterCfg.staminaSpeed != null) merged.staminaSpeed = fighterCfg.staminaSpeed;
    if (fighterCfg.cycleDuration != null) merged.cycleDuration = fighterCfg.cycleDuration;
    if (fighterCfg.duration != null) merged.duration = fighterCfg.duration;
    if (fighterCfg.cycleSeconds != null) merged.cycleSeconds = fighterCfg.cycleSeconds;
  }
  return merged;
}

function resolveRuntimeFighterName(F, fallbackName){
  if (F?.renderProfile?.fighterName && typeof F.renderProfile.fighterName === 'string') {
    return F.renderProfile.fighterName;
  }
  if (typeof F?.fighterName === 'string' && F.fighterName) {
    return F.fighterName;
  }
  return fallbackName;
}

function isFighterMarkedDead(F){
  if (!F) return false;
  if (F.dead || F.isDead || F.deceased) return true;
  if (F.status?.dead || F.status?.isDead) return true;
  const state = F.status?.state ?? F.state;
  if (typeof state === 'string' && state.toLowerCase() === 'dead') return true;
  const tags = [];
  if (Array.isArray(F.tags)) tags.push(...F.tags);
  if (Array.isArray(F.status?.tags)) tags.push(...F.status.tags);
  return tags.some(tag => typeof tag === 'string' && tag.toLowerCase() === 'dead');
}

export function updateBreathing(F, fighterId, spec){
  const breathState = F?.anim?.breath;
  const G = window.GAME || {};
  const store = (G.ANIM_STYLE_OVERRIDES ||= {});
  if (!breathState){
    if (store[fighterId]) delete store[fighterId];
    return;
  }

  if (!spec || isFighterMarkedDead(F)){
    breathState.active = false;
    breathState.styleOverride = null;
    breathState.shoulderOffsets = null;
    if (store[fighterId]) delete store[fighterId];
    return;
  }

  const frames = spec.frames;
  if (!frames || frames.length < 2){
    breathState.active = false;
    breathState.styleOverride = null;
    breathState.shoulderOffsets = null;
    if (store[fighterId]) delete store[fighterId];
    return;
  }

  const halfCycle = spec.cycle * 0.5;
  const baseSpeed = halfCycle > 0 ? (1 / halfCycle) : 0;
  const dt = F.anim?.dt || 0;

  let ratio = 1;
  const stamina = F.stamina;
  if (stamina){
    const current = Number.isFinite(stamina.current) ? stamina.current : (Number.isFinite(stamina.max) ? stamina.max : 0);
    const max = Number.isFinite(stamina.max) && stamina.max > 0 ? stamina.max : Math.max(current, 1);
    ratio = max > 0 ? clamp(current / max, 0, 1) : 0;
  }

  const speedRange = spec.speedMultiplier || DEFAULT_BREATHING_SPEED_RANGE;
  const speedMult = lerp(speedRange.min, speedRange.max, 1 - ratio);
  const delta = dt * baseSpeed * speedMult;

  let phase = Number.isFinite(breathState.phase) ? breathState.phase : 0;
  let direction = breathState.direction === -1 ? -1 : 1;
  phase += delta * direction;
  if (phase >= 1){
    phase = 1;
    direction = -1;
  } else if (phase <= 0){
    phase = 0;
    direction = 1;
  }
  breathState.phase = phase;
  breathState.direction = direction;

  const eased = easeInOutCubic(clamp(phase, 0, 1));
  const startFrame = frames[0];
  const endFrame = frames[1];

  const torsoScaleX = lerp(startFrame.torsoScaleX, endFrame.torsoScaleX, eased);
  const torsoScaleY = lerp(startFrame.torsoScaleY, endFrame.torsoScaleY, eased);
  const leftAx = lerp(startFrame.left.ax, endFrame.left.ax, eased);
  const leftAy = lerp(startFrame.left.ay, endFrame.left.ay, eased);
  const rightAx = lerp(startFrame.right.ax, endFrame.right.ax, eased);
  const rightAy = lerp(startFrame.right.ay, endFrame.right.ay, eased);

  const torsoXform = {};
  let hasTorsoXform = false;
  if (Number.isFinite(torsoScaleX)){
    torsoXform.scaleMulX = torsoScaleX;
    hasTorsoXform = true;
  }
  if (Number.isFinite(torsoScaleY)){
    torsoXform.scaleMulY = torsoScaleY;
    hasTorsoXform = true;
  }

  const breathingDelta = hasTorsoXform ? { xform: { torso: torsoXform } } : null;
  const styleOverride = composeStyleOverrides(null, breathingDelta);

  const offsetActive = Math.abs(leftAx) > 1e-3 || Math.abs(leftAy) > 1e-3 || Math.abs(rightAx) > 1e-3 || Math.abs(rightAy) > 1e-3;

  breathState.active = true;
  breathState.styleOverride = styleOverride;
  breathState.shoulderOffsets = offsetActive
    ? { left: { ax: leftAx, ay: leftAy }, right: { ax: rightAx, ay: rightAy } }
    : null;

  if (styleOverride){
    store[fighterId] = styleOverride;
  } else if (store[fighterId]) {
    delete store[fighterId];
  }
}

function trackPendingLayerTimer(F, layerId, handle){
  if (!F?.anim) return;
  const timers = (F.anim.pendingLayerTimers ||= {});
  if (layerId){
    const prev = timers[layerId];
    if (prev && typeof prev.cancel === 'function'){
      try { prev.cancel(); } catch(err){ console.warn('[animator] failed to cancel pending layer timer', err); }
    }
    if (handle && typeof handle.cancel === 'function'){
      timers[layerId] = handle;
      if (typeof handle.onSettle === 'function'){
        handle.onSettle(()=>{
          if (F.anim?.pendingLayerTimers?.[layerId] === handle){
            delete F.anim.pendingLayerTimers[layerId];
          }
        });
      }
    } else {
      delete timers[layerId];
    }
  }
}

function cleanupLayer(F, layer){
  if (!layer) return;
  try{
    if (layer.__flipApplied && layer.pose && Array.isArray(layer.pose.flipParts)){
      for (const p of layer.pose.flipParts){ setMirrorForPart(p, false); }
    }
  }catch(_e){ /* best-effort cleanup */ }
}

function refreshLegacyOverride(F){
  if (!F?.anim) return;
  const layers = Array.isArray(F.anim.layers) ? F.anim.layers : [];
  if (layers.length === 0){
    F.anim.override = null;
    return;
  }
  const sorted = [...layers].sort((a,b)=> (a.priority||0) - (b.priority||0));
  F.anim.override = sorted[sorted.length - 1] || null;
}

function removeOverrideLayer(F, layerId){
  if (!F?.anim || !Array.isArray(F.anim.layers)) return;
  const idx = F.anim.layers.findIndex(l=> l && l.id === layerId);
  if (idx === -1) return;
  const [layer] = F.anim.layers.splice(idx, 1);
  cleanupLayer(F, layer);
  refreshLegacyOverride(F);
}

function normalizeLayerMask(mask, pose){
  if (Array.isArray(mask) && mask.length) return [...mask];
  if (pose){
    if (Array.isArray(pose.mask) && pose.mask.length) return [...pose.mask];
    if (Array.isArray(pose.joints) && pose.joints.length) return [...pose.joints];
  }
  return null;
}

function canonicalLimbName(name) {
  const value = (name ?? '').toString().toLowerCase();
  if (!value) return null;
  if (value.startsWith('l')) return 'left';
  if (value.startsWith('r')) return 'right';
  return null;
}

function handleGripEvent(F, spec) {
  if (!F?.anim?.weapon || !spec) return;
  const attachments = F.anim.weapon.attachments || (F.anim.weapon.attachments = {});
  const actionRaw = (spec.action || spec.mode || '').toString().toLowerCase();
  const derivedAction = spec.detachAll ? 'detachall' : (spec.detach ? 'detach' : 'attach');
  const action = actionRaw || derivedAction;
  if (action === 'detachall') {
    for (const key of Object.keys(attachments)) {
      delete attachments[key];
    }
    return;
  }
  const limb = canonicalLimbName(spec.limb || spec.hand || spec.arm);
  if (!limb) return;
  if (action === 'detach') {
    delete attachments[limb];
    return;
  }
  if (action !== 'attach') return;
  const fallbackGrip = limb === 'left' ? 'secondary' : 'primary';
  const gripId = spec.gripId || spec.grip || fallbackGrip;
  if (!gripId) return;
  attachments[limb] = {
    gripId: String(gripId),
    boneId: spec.boneId || spec.bone || null
  };
}

function getActiveWeaponKey(F, C) {
  const profile = F?.renderProfile || {};
  return profile.weapon
    || profile.character?.weapon
    || (typeof F.weapon === 'string' ? F.weapon : null)
    || (C?.characters?.player?.weapon ?? null);
}

function collectDefaultGripPercents(rig) {
  const map = {};
  if (!rig?.bones) return map;
  for (const bone of rig.bones) {
    for (const grip of bone?.grips || []) {
      if (!grip || !grip.id) continue;
      const pct = Number(grip.percent);
      map[grip.id] = Number.isFinite(pct) ? pct : 0.5;
    }
  }
  return map;
}

function collectDefaultJointPercents(rig) {
  const map = {};
  if (!rig?.bones) return map;
  rig.bones.forEach((bone, index) => {
    if (!bone) return;
    const boneId = bone.id || `weapon_${index}`;
    const joint = bone.joint || {};
    const pct = joint.percent ?? joint.pct ?? joint.value ?? bone.jointPercent;
    if (pct == null) return;
    const num = Number(pct);
    if (Number.isFinite(num)) map[boneId] = clamp(num, 0, 1);
  });
  return map;
}

function computePoseBasis(F, target, C, fcfg) {
  const L = lengths(C, fcfg);
  const lengthOverrides = (F?.anim?.length?.overrides && typeof F.anim.length.overrides === 'object')
    ? F.anim.length.overrides
    : {};
  const torsoLen = L.torso * resolveBoneLengthScale(lengthOverrides, 'torso', L.torso, ['body']);
  const armUpperLeftLen = L.armU * resolveBoneLengthScale(lengthOverrides, 'arm_L_upper', L.armU, ['arm_upper', 'upper_arm', 'arm']);
  const armUpperRightLen = L.armU * resolveBoneLengthScale(lengthOverrides, 'arm_R_upper', L.armU, ['arm_upper', 'upper_arm', 'arm']);
  const armLowerLeftLen = L.armL * resolveBoneLengthScale(lengthOverrides, 'arm_L_lower', L.armL, ['arm_lower', 'lower_arm', 'arm']);
  const armLowerRightLen = L.armL * resolveBoneLengthScale(lengthOverrides, 'arm_R_lower', L.armL, ['arm_lower', 'lower_arm', 'arm']);
  const legUpperLeftLen = L.legU * resolveBoneLengthScale(lengthOverrides, 'leg_L_upper', L.legU, ['leg_upper', 'upper_leg', 'leg']);
  const legUpperRightLen = L.legU * resolveBoneLengthScale(lengthOverrides, 'leg_R_upper', L.legU, ['leg_upper', 'upper_leg', 'leg']);
  const legLowerLeftLen = L.legL * resolveBoneLengthScale(lengthOverrides, 'leg_L_lower', L.legL, ['leg_lower', 'lower_leg', 'leg']);
  const legLowerRightLen = L.legL * resolveBoneLengthScale(lengthOverrides, 'leg_R_lower', L.legL, ['leg_lower', 'lower_leg', 'leg']);
  const scaledLengths = {
    ...L,
    torso: torsoLen,
    armU: (armUpperLeftLen + armUpperRightLen) * 0.5,
    armULeft: armUpperLeftLen,
    armURight: armUpperRightLen,
    armL: (armLowerLeftLen + armLowerRightLen) * 0.5,
    armLowerLeft: armLowerLeftLen,
    armLowerRight: armLowerRightLen,
    legU: (legUpperLeftLen + legUpperRightLen) * 0.5,
    legUpperLeft: legUpperLeftLen,
    legUpperRight: legUpperRightLen,
    legL: (legLowerLeftLen + legLowerRightLen) * 0.5,
    legLowerLeft: legLowerLeftLen,
    legLowerRight: legLowerRightLen
  };
  const OFF = pickOffsets(C, fcfg);
  const hbAttach = (fcfg.parts?.hitbox?.torsoAttach || C.parts?.hitbox?.torsoAttach || { nx: 0.5, ny: 0.7 });
  const centerX = F.pos?.x ?? 0;
  const centerY = F.pos?.y ?? ((C.groundRatio || 0.7) * (C.canvas?.h || 460));
  const torsoAng = target?.torso ?? 0;
  const torsoAttach = {
    x: centerX + (hbAttach.nx - 0.5) * L.hbW,
    y: centerY + (hbAttach.ny - 0.5) * L.hbH
  };
  const originBaseArr = withAX(torsoAttach.x, torsoAttach.y, torsoAng, OFF.torso?.origin);
  const hipBaseArr = withAX(originBaseArr[0], originBaseArr[1], torsoAng, OFF.torso?.hip);
  const torsoTopArr = segPos(hipBaseArr[0], hipBaseArr[1], torsoLen, torsoAng);
  const neckBaseArr = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.neck);
  const shoulderBaseArr = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.shoulder);
  let lShoulderBaseArr = [...shoulderBaseArr];
  let rShoulderBaseArr = [...shoulderBaseArr];
  const breathOffsets = F.anim?.breath?.shoulderOffsets;
  if (breathOffsets) {
    const torsoBasis = basis(torsoAng);
    const applyOffset = (baseArr, spec) => {
      if (!spec) return baseArr;
      const ax = Number(spec.ax) || Number(spec.x) || 0;
      const ay = Number(spec.ay) || Number(spec.y) || 0;
      if (!ax && !ay) return baseArr;
      return [
        baseArr[0] + ax * torsoBasis.fx + ay * torsoBasis.rx,
        baseArr[1] + ax * torsoBasis.fy + ay * torsoBasis.ry
      ];
    };
    lShoulderBaseArr = applyOffset(lShoulderBaseArr, breathOffsets.left);
    rShoulderBaseArr = applyOffset(rShoulderBaseArr, breathOffsets.right);
  }

  const lUpperAng = target?.lShoulder ?? torsoAng;
  const rUpperAng = target?.rShoulder ?? torsoAng;
  const lLowerAng = lUpperAng + (target?.lElbow ?? 0);
  const rLowerAng = rUpperAng + (target?.rElbow ?? 0);
  const lElbowPosArr = withAX(...segPos(lShoulderBaseArr[0], lShoulderBaseArr[1], armUpperLeftLen, lUpperAng), lUpperAng, OFF.arm?.upper?.elbow);
  const rElbowPosArr = withAX(...segPos(rShoulderBaseArr[0], rShoulderBaseArr[1], armUpperRightLen, rUpperAng), rUpperAng, OFF.arm?.upper?.elbow);
  const lWristPosArr = withAX(...segPos(lElbowPosArr[0], lElbowPosArr[1], armLowerLeftLen, lLowerAng), lLowerAng, OFF.arm?.lower?.origin);
  const rWristPosArr = withAX(...segPos(rElbowPosArr[0], rElbowPosArr[1], armLowerRightLen, rLowerAng), rLowerAng, OFF.arm?.lower?.origin);

  return {
    centerX,
    centerY,
    torsoAttach,
    torsoAng,
    hipBase: hipBaseArr,
    torsoTop: torsoTopArr,
    neckBase: neckBaseArr,
    lShoulderBase: lShoulderBaseArr,
    rShoulderBase: rShoulderBaseArr,
    lUpperAng,
    rUpperAng,
    lLowerAng,
    rLowerAng,
    lElbowPos: lElbowPosArr,
    rElbowPos: rElbowPosArr,
    lWristPos: lWristPosArr,
    rWristPos: rWristPosArr,
    L: scaledLengths,
    OFF
  };
}

const LEFT_WRIST_KEY_ALIASES = [
  'lwrist', 'leftwrist', 'lefthand', 'leftHand', 'handl', 'hand_left', 'handleft', 'left-hand',
  'wristl', 'wrist_left', 'wristleft', 'lhand', 'arm_l_lower', 'armllower', 'leftlower',
  'leftforearm', 'forearmleft', 'armleftlower', 'leftgrip', 'gripleft'
];
const RIGHT_WRIST_KEY_ALIASES = [
  'rwrist', 'rightwrist', 'righthand', 'rightHand', 'handr', 'hand_right', 'handright', 'right-hand',
  'wristr', 'wrist_right', 'wristright', 'rhand', 'arm_r_lower', 'armrlower', 'rightlower',
  'rightforearm', 'forearmright', 'armrightlower', 'rightgrip', 'gripright'
];
const WRIST_GROUP_KEY_ALIASES = ['wrists', 'hands', 'forearms', 'arms', 'limbs'];

function normalizeKeyName(name) {
  if (!name && name !== 0) return '';
  return String(name).replace(/[\s_-]+/g, '').toLowerCase();
}

function pickNormalized(source, key) {
  if (!source || typeof source !== 'object') return undefined;
  const normalized = normalizeKeyName(key);
  for (const candidate of Object.keys(source)) {
    if (normalizeKeyName(candidate) === normalized) {
      return source[candidate];
    }
  }
  return undefined;
}

function toRadiansMaybeDeg(value) {
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs <= (Math.PI * 2 + 1e-3)) return value;
  return degToRad(value);
}

function parseRotationSpec(spec) {
  if (spec == null) return null;
  if (typeof spec === 'number') {
    return toRadiansMaybeDeg(spec);
  }
  if (typeof spec !== 'object') return null;

  const radKeys = ['rotRad', 'rotateRad', 'angleRad', 'rotationRad', 'rad', 'theta', 'radians'];
  for (const key of radKeys) {
    const value = Number(spec[key]);
    if (Number.isFinite(value)) return value;
  }

  const degKeys = ['rotDeg', 'rotateDeg', 'angleDeg', 'rotationDeg', 'deg', 'degrees'];
  for (const key of degKeys) {
    const value = Number(spec[key]);
    const converted = toRadiansMaybeDeg(value);
    if (converted != null) return converted;
  }

  const directAngle = toRadiansMaybeDeg(Number(spec.angle));
  if (directAngle != null) return directAngle;
  const directRotation = toRadiansMaybeDeg(Number(spec.rotation));
  if (directRotation != null) return directRotation;

  if (typeof spec.rotate === 'object') {
    const nested = parseRotationSpec(spec.rotate);
    if (nested != null) return nested;
  }
  if (typeof spec.rotation === 'object') {
    const nested = parseRotationSpec(spec.rotation);
    if (nested != null) return nested;
  }
  if (typeof spec.angle === 'object') {
    const nested = parseRotationSpec(spec.angle);
    if (nested != null) return nested;
  }

  return null;
}

function extractRotationForDirection(source, direction, keyAliases, visited = new WeakSet()) {
  if (source == null) return null;

  if (typeof source !== 'object') {
    return parseRotationSpec(source);
  }

  if (visited.has(source)) return null;
  visited.add(source);

  const direct = parseRotationSpec(source);
  if (direct != null) return direct;

  const aliases = direction === 'left' ? LEFT_WRIST_KEY_ALIASES : RIGHT_WRIST_KEY_ALIASES;
  for (const key of [...aliases, ...(keyAliases || [])]) {
    const value = pickNormalized(source, key);
    if (value != null) {
      const nested = extractRotationForDirection(value, direction, keyAliases, visited);
      if (nested != null) return nested;
    }
  }

  const containerKeys = direction === 'left'
    ? ['left', 'l', 'leftHand', 'handLeft', 'handL', 'leftSide', 'leftArm', 'leftForearm', 'leftWrist']
    : ['right', 'r', 'rightHand', 'handRight', 'handR', 'rightSide', 'rightArm', 'rightForearm', 'rightWrist'];
  for (const key of containerKeys) {
    const value = pickNormalized(source, key);
    if (value != null) {
      const nested = extractRotationForDirection(value, direction, keyAliases, visited);
      if (nested != null) return nested;
    }
  }

  for (const groupKey of WRIST_GROUP_KEY_ALIASES) {
    const value = pickNormalized(source, groupKey);
    if (value != null) {
      const nested = extractRotationForDirection(value, direction, keyAliases, visited);
      if (nested != null) return nested;
    }
  }

  return null;
}

function collectWristRotationOverrides(F, finalDeg) {
  const sources = [];
  const addSource = (spec) => {
    if (spec && typeof spec === 'object') sources.push(spec);
  };

  addSource(F?.transforms);
  addSource(F?.poseTransforms);
  addSource(F?.anim?.poseTransforms);
  addSource(F?.anim?.transforms);
  addSource(F?.anim?.weapon?.transforms);
  addSource(F?.anim?.weapon?.wristTransforms);
  addSource(F?.anim?.styleOverride?.xform);
  addSource(F?.anim?.breath?.styleOverride?.xform);
  addSource(finalDeg?.transforms);
  addSource(finalDeg?.wristTransforms);
  addSource(finalDeg?.styleOverride?.xform);
  addSource(finalDeg?.spriteTransforms);

  let leftRotation = null;
  let rightRotation = null;
  for (const source of sources) {
    const left = extractRotationForDirection(source, 'left');
    if (left != null) leftRotation = left;
    const right = extractRotationForDirection(source, 'right');
    if (right != null) rightRotation = right;
  }

  const result = {};
  if (leftRotation != null) result.left = { rotation: leftRotation };
  if (rightRotation != null) result.right = { rotation: rightRotation };
  return result;
}

function applyWristRotation(anchor, rotation) {
  if (!anchor) return anchor;
  if (Number.isFinite(rotation) && rotation !== 0) {
    anchor.ang += rotation;
  }
  return anchor;
}

function resolveWeaponAnchor(anchorKey, basisInfo, limbHint, wristTransforms) {
  const key = (anchorKey || '').toString().toLowerCase();
  const limb = (limbHint || '').toString().toLowerCase();
  const leftRotation = wristTransforms?.left?.rotation;
  const rightRotation = wristTransforms?.right?.rotation;

  if (!key || key === 'auto') {
    if (limb === 'left') {
      return applyWristRotation({ pos: basisInfo.lWristPos || basisInfo.lElbowPos, ang: basisInfo.lLowerAng }, leftRotation);
    }
    return applyWristRotation({ pos: basisInfo.rWristPos || basisInfo.rElbowPos, ang: basisInfo.rLowerAng }, rightRotation);
  }
  switch (key) {
    case 'torso':
    case 'hip':
      return { pos: basisInfo.hipBase, ang: basisInfo.torsoAng };
    case 'neck':
      return { pos: basisInfo.neckBase, ang: basisInfo.torsoAng };
    case 'lforearm':
    case 'llower':
    case 'leftlower':
    case 'leftforearm':
    case 'arm_l_lower':
      return { pos: basisInfo.lElbowPos, ang: basisInfo.lLowerAng };
    case 'lshoulder':
    case 'leftshoulder':
      return { pos: basisInfo.lShoulderBase, ang: basisInfo.lUpperAng };
    case 'lwrist':
    case 'leftwrist':
    case 'lefthand':
      return applyWristRotation({ pos: basisInfo.lWristPos || basisInfo.lElbowPos, ang: basisInfo.lLowerAng }, leftRotation);
    case 'rforearm':
    case 'rlower':
    case 'rightlower':
    case 'rightforearm':
    case 'arm_r_lower':
      return { pos: basisInfo.rElbowPos, ang: basisInfo.rLowerAng };
    case 'rshoulder':
    case 'rightshoulder':
      return { pos: basisInfo.rShoulderBase, ang: basisInfo.rUpperAng };
    case 'rwrist':
    case 'rightwrist':
    case 'rhand':
    case 'righthand':
      return applyWristRotation({ pos: basisInfo.rWristPos || basisInfo.rElbowPos, ang: basisInfo.rLowerAng }, rightRotation);
    case 'torsotop':
    case 'shoulderbase':
    default:
      return { pos: basisInfo.torsoTop, ang: basisInfo.torsoAng };
  }
}

function limitRelativeAngle(value, reference, limits) {
  if (!limits) return value;
  const relMin = Number.isFinite(limits.relMin) ? degToRad(limits.relMin) : null;
  const relMax = Number.isFinite(limits.relMax) ? degToRad(limits.relMax) : null;
  if (!Number.isFinite(relMin) && !Number.isFinite(relMax)) return value;
  const rel = normalizeRad(value - reference);
  let clamped = rel;
  if (Number.isFinite(relMin)) clamped = Math.max(clamped, relMin);
  if (Number.isFinite(relMax)) clamped = Math.min(clamped, relMax);
  return reference + clamped;
}

function limitElbowAngle(value, limits) {
  if (!limits) return value;
  const relMin = Number.isFinite(limits.relMin) ? degToRad(limits.relMin) : null;
  const relMax = Number.isFinite(limits.relMax) ? degToRad(limits.relMax) : null;
  if (!Number.isFinite(relMin) && !Number.isFinite(relMax)) return value;
  let rel = normalizeRad(value);
  if (Number.isFinite(relMin)) rel = Math.max(rel, relMin);
  if (Number.isFinite(relMax)) rel = Math.min(rel, relMax);
  return rel;
}

function solveArmIKChain(base, target, upperLen, lowerLen, elbowSign, torsoAng, shoulderLimits, elbowLimits) {
  const dx = target[0] - base[0];
  const dy = target[1] - base[1];
  const dxStd = dx;
  const dyStd = -dy;
  const dist = Math.hypot(dxStd, dyStd);
  const maxReach = Math.max(1e-4, upperLen + lowerLen - 1e-4);
  const minReach = Math.max(1e-4, Math.abs(upperLen - lowerLen));
  const distForCalc = Math.min(Math.max(dist, minReach), maxReach);
  const baseStd = Math.atan2(dyStd, dxStd);
  const cosElbow = ((distForCalc * distForCalc) - (upperLen * upperLen) - (lowerLen * lowerLen)) / (2 * upperLen * lowerLen);
  const elbowStd = Math.acos(Math.max(-1, Math.min(1, cosElbow)));
  const cosShoulder = ((distForCalc * distForCalc) + (upperLen * upperLen) - (lowerLen * lowerLen)) / (2 * distForCalc * upperLen);
  const shoulderOffset = Math.acos(Math.max(-1, Math.min(1, cosShoulder)));
  const shoulderStd = baseStd - elbowSign * shoulderOffset;
  const elbowStdSigned = elbowSign * elbowStd;
  let shoulderAng = normalizeRad((Math.PI / 2) - shoulderStd);
  let elbowAng = -elbowStdSigned;
  shoulderAng = limitRelativeAngle(shoulderAng, torsoAng, shoulderLimits);
  elbowAng = limitElbowAngle(elbowAng, elbowLimits);
  return { shoulderAng, elbowAng };
}

function samplePoseForWeaponDisplay(F, target, dt, lambda = JOINT_DAMP_LAMBDA) {
  const result = {};
  const current = (F?.jointAngles) || {};
  for (const key of ARM_JOINT_KEYS) {
    const curVal = current[key];
    const targetVal = target?.[key];
    if (Number.isFinite(curVal) && Number.isFinite(targetVal)) {
      result[key] = damp(curVal, targetVal, lambda, dt);
    } else if (Number.isFinite(targetVal)) {
      result[key] = targetVal;
    } else if (Number.isFinite(curVal)) {
      result[key] = curVal;
    }
  }
  return result;
}

function buildWeaponBones({
  rig,
  basisInfo,
  target,
  baseAngleOffset,
  gripPercents,
  gripDefaults,
  jointPercents,
  jointDefaults,
  wristTransforms,
  lengthOverrides
} = {}) {
  const bones = [];
  const gripLookup = {};
  if (!rig || !basisInfo) return { bones, gripLookup };

  (rig.bones || []).forEach((boneSpec, index) => {
    if (!boneSpec) return;
    const boneId = boneSpec.id || `weapon_${index}`;
    const limb = (boneSpec.limb || rig.base?.limb || '').toString().toLowerCase();
    const anchorKey = boneSpec.anchor || rig.base?.anchor || 'auto';
    const anchor = resolveWeaponAnchor(anchorKey, basisInfo, limb, wristTransforms);
    const baseLength = Number.isFinite(boneSpec.length) ? boneSpec.length : 0;
    const lengthScale = resolveBoneLengthScale(lengthOverrides, `weapon:${boneId}`, baseLength, [`weapon_${boneId}`, 'weapon']);
    const length = baseLength * lengthScale;
    const baseOffset = boneSpec.baseOffset || rig.base?.offset || null;
    let anchorPos = anchor.pos;
    if (baseOffset) {
      anchorPos = withAX(anchorPos[0], anchorPos[1], anchor.ang, baseOffset, null, length);
    }
    if (boneSpec.anchorOffset) {
      anchorPos = withAX(anchorPos[0], anchorPos[1], anchor.ang, boneSpec.anchorOffset, null, length);
    }

    const anchorAngle = Number.isFinite(anchor?.ang) ? anchor.ang : 0;
    const weaponAngleOffset = Number.isFinite(target?.weapon) ? target.weapon : 0;
    const boneAngleOffset = Number.isFinite(boneSpec.angleOffsetRad)
      ? boneSpec.angleOffsetRad
      : (Number.isFinite(boneSpec.angleOffsetDeg) ? degToRad(boneSpec.angleOffsetDeg) : 0);
    const boneAng = anchorAngle + weaponAngleOffset + baseAngleOffset + boneAngleOffset;

    const jointDefault = jointDefaults?.[boneId]
      ?? clamp(Number(boneSpec.joint?.percent ?? boneSpec.jointPercent ?? 0.5), 0, 1);
    const storedJoint = jointPercents?.[boneId];
    const jointPercent = clamp(Number.isFinite(storedJoint) ? storedJoint : jointDefault, 0, 1);

    const haftSpec = boneSpec.haft || {};
    const haftStart = clamp(Number(haftSpec.start ?? haftSpec.from ?? 0), 0, 1);
    const haftEndRaw = Number(haftSpec.end ?? haftSpec.to ?? 1);
    const haftEnd = clamp(haftEndRaw, haftStart, 1);
    const haftRange = Math.max(1e-5, haftEnd - haftStart);
    const jointAbsolute = clamp(haftStart + jointPercent * haftRange, 0, 1);

    let startArr = segPos(anchorPos[0], anchorPos[1], -jointAbsolute * length, boneAng);
    if (boneSpec.offset) {
      startArr = withAX(startArr[0], startArr[1], boneAng, boneSpec.offset, null, length);
    }
    const endArr = segPos(startArr[0], startArr[1], length, boneAng);

    const boneEntry = {
      id: boneId,
      start: { x: startArr[0], y: startArr[1] },
      end: { x: endArr[0], y: endArr[1] },
      length,
      angle: boneAng,
      limb: limb || 'right',
      anchor: anchorKey,
      joint: {
        percent: jointPercent,
        absolute: jointAbsolute,
        haftStart,
        haftEnd
      },
      haft: { start: haftStart, end: haftEnd },
      grips: {},
      colliders: []
    };

    (boneSpec.grips || []).forEach((grip) => {
      if (!grip || !grip.id) return;
      const pctRaw = Number.isFinite(gripPercents?.[grip.id])
        ? gripPercents[grip.id]
        : gripDefaults?.[grip.id];
      const pct = Number.isFinite(pctRaw) ? pctRaw : 0.5;
      const along = Math.max(0, Math.min(1, pct)) * length;
      let gripPos = segPos(startArr[0], startArr[1], along, boneAng);
      if (grip.offset) {
        gripPos = withAX(gripPos[0], gripPos[1], boneAng, grip.offset, null, length);
      }
      const gripEntry = { x: gripPos[0], y: gripPos[1], percent: pct, limb: grip.limb || null, boneId };
      boneEntry.grips[grip.id] = gripEntry;
      gripLookup[`${boneId}:${grip.id}`] = gripEntry;
    });

    (boneSpec.colliders || []).forEach((colSpec, idx) => {
      if (!colSpec) return;
      const from = Number.isFinite(colSpec.from) ? colSpec.from : 0;
      const to = Number.isFinite(colSpec.to) ? colSpec.to : from;
      const startPos = segPos(startArr[0], startArr[1], length * from, boneAng);
      const endPos = segPos(startArr[0], startArr[1], length * to, boneAng);
      let centerX = (startPos[0] + endPos[0]) / 2;
      let centerY = (startPos[1] + endPos[1]) / 2;
      if (colSpec.offset) {
        const adjusted = withAX(centerX, centerY, boneAng, colSpec.offset, null, length);
        centerX = adjusted[0];
        centerY = adjusted[1];
      }
      const collider = {
        id: colSpec.id || `${boneId}_collider_${idx}`,
        kind: colSpec.kind || 'box',
        width: Number(colSpec.width) || 0,
        height: Number(colSpec.height) || Math.abs((to - from) * length),
        angle: boneAng,
        center: { x: centerX, y: centerY },
        lengthPercent: { from, to },
        activatesOn: Array.isArray(colSpec.activatesOn) ? colSpec.activatesOn.slice() : []
      };
      boneEntry.colliders.push(collider);
    });

    if (
      typeof window !== 'undefined'
        ? window.__SOK_BREAK_ON_WEAPON_COLLIDER_ORIGIN !== false
        : true
    ) {
      const originThreshold = 1e-3;
      const hasOriginCollider = boneEntry.colliders.some((col) => {
        const { x, y } = col?.center || {};
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        return Math.hypot(x, y) <= originThreshold;
      });
      if (hasOriginCollider) {
        // eslint-disable-next-line no-debugger
        debugger;
      }
    }

    bones.push(boneEntry);
  });

  return { bones, gripLookup };
}

function updateWeaponRig(F, target, finalDeg, C, fcfg) {
  if (!F?.anim?.weapon) return;
  const weaponKey = getActiveWeaponKey(F, C);
  const weaponDef = weaponKey && C.weapons ? C.weapons[weaponKey] : null;
  const rig = weaponDef?.rig;
  if (!rig || !Array.isArray(rig.bones) || !rig.bones.length) {
    F.anim.weapon.state = null;
    return;
  }

  const dt = Math.max(1e-5, F.anim.dt || 0.016);
  const gripPercents = F.anim.weapon.gripPercents || (F.anim.weapon.gripPercents = {});
  const gripDefaults = collectDefaultGripPercents(rig);
  const posePercents = finalDeg?.weaponGripPercents || {};
  const targetPercents = { ...gripDefaults };
  for (const [id, value] of Object.entries(posePercents)) {
    if (!id) continue;
    const pct = Number(value);
    targetPercents[id] = Number.isFinite(pct) ? pct : (targetPercents[id] ?? gripDefaults[id] ?? 0.5);
  }
  for (const [id, pct] of Object.entries(targetPercents)) {
    const current = Number.isFinite(gripPercents[id]) ? gripPercents[id] : pct;
    gripPercents[id] = damp(current, pct, 16, dt);
  }

  const jointPercents = F.anim.weapon.jointPercents || (F.anim.weapon.jointPercents = {});
  const jointDefaults = collectDefaultJointPercents(rig);
  const poseJointMap = (finalDeg?.weaponJointPercents && typeof finalDeg.weaponJointPercents === 'object')
    ? finalDeg.weaponJointPercents
    : {};
  const poseJointValueRaw = finalDeg?.weaponJointPercent;
  const poseJointValueGlobal = Number(poseJointValueRaw);
  const hasPoseJointValue = Number.isFinite(poseJointValueGlobal);
  const baseAngleOffset = Number.isFinite(rig.base?.angleOffsetRad)
    ? rig.base.angleOffsetRad
    : (Number.isFinite(rig.base?.angleOffsetDeg) ? degToRad(rig.base.angleOffsetDeg) : 0);

  const wristTransforms = collectWristRotationOverrides(F, finalDeg);

  const jointPercentValues = {};
  (rig.bones || []).forEach((boneSpec, index) => {
    if (!boneSpec) return;
    const boneId = boneSpec.id || `weapon_${index}`;
    const jointDefault = jointDefaults[boneId]
      ?? clamp(Number(boneSpec.joint?.percent ?? boneSpec.jointPercent ?? 0.5), 0, 1);
    const poseJointValue = Number(poseJointMap ? poseJointMap[boneId] : null);
    const targetJoint = clamp(
      Number.isFinite(poseJointValue)
        ? poseJointValue
        : (hasPoseJointValue ? poseJointValueGlobal : jointDefault),
      0,
      1
    );
    const currentJoint = Number.isFinite(jointPercents[boneId]) ? jointPercents[boneId] : targetJoint;
    const nextJoint = clamp(damp(currentJoint, targetJoint, 16, dt), 0, 1);
    jointPercents[boneId] = nextJoint;
    jointPercentValues[boneId] = nextJoint;
  });

  // Remove all IK calculations for weapons. Use pose-based animation only.
  const displayPose = samplePoseForWeaponDisplay(F, target, dt);
  const poseBasis = computePoseBasis(F, displayPose, C, fcfg);
  const build = buildWeaponBones({
    rig,
    basisInfo: poseBasis,
    target,
    baseAngleOffset,
    gripPercents,
    gripDefaults,
    jointPercents: jointPercentValues,
    jointDefaults,
    wristTransforms,
    lengthOverrides: F.anim?.length?.overrides
  });
  F.anim.weapon.attachments = {};
  F.anim.weapon.state = {
    weaponKey,
    bones: build.bones,
    gripPercents: { ...gripPercents },
    jointPercents: { ...jointPercents },
    attachments: {}
  };
}

function setOverrideLayer(F, layerId, poseDeg, { durMs=300, mask, priority, suppressWalk, useAsBase } = {}){
  if (!F) return null;
  ensureAnimState(F);
  const now = performance.now()/1000;
  const dur = (durMs == null) ? 0 : (durMs/1000);
  const layerMask = normalizeLayerMask(mask, poseDeg);
  const defaultPriority = (layerId === 'primary') ? 100 : 200;
  const hasMask = Array.isArray(layerMask) && layerMask.length > 0;
  const layer = {
    id: layerId,
    pose: poseDeg,
    mask: layerMask,
    priority: priority ?? defaultPriority,
    suppressWalk: suppressWalk ?? (layerId === 'primary' && !hasMask),
    useAsBase: useAsBase ?? (!hasMask && layerId === 'primary'),
    until: dur > 0 ? now + dur : (dur === 0 ? now : null),
    __start: now,
    __dur: dur,
    __events: primeAnimEventsFromPose(poseDeg),
    __flipApplied: false,
    __fullFlipApplied: false,
    __k: 0
  };
  const poseLengthOverrides = extractPoseLengthOverrides(poseDeg);
  if (poseLengthOverrides) {
    layer.__lengthOverrides = poseLengthOverrides;
  }
  removeOverrideLayer(F, layerId);
  F.anim.layers.push(layer);
  F.anim.layers.sort((a,b)=> (a.priority||0) - (b.priority||0));
  refreshLegacyOverride(F);
  return layer;
}

function getFacingRad(F){
  if (!F) return 0;
  if (typeof F.facingRad === 'number') return F.facingRad;
  return ((F.facingSign || 1) < 0) ? Math.PI : 0;
}

function getAimWorldRad(F){
  if (!F) return 0;
  const facingRad = getFacingRad(F);
  const aim = F.aim;
  if (aim && aim.active && Number.isFinite(aim.currentAngle)){
    return facingRad + aim.currentAngle;
  }
  return facingRad;
}

function applyGravityScaleEvent(F, scale, { durationMs, reset } = {}){
  if (!F) return;
  if (reset){
    delete F.gravityOverride;
    return;
  }
  if (!Number.isFinite(scale)) return;
  const now = performance.now() / 1000;
  const expiresAt = Number.isFinite(durationMs) && durationMs > 0 ? now + (durationMs / 1000) : null;
  F.gravityOverride = { value: scale, expiresAt };
}
function pickBase(C){ return (C.poses && C.poses.Stance) ? C.poses.Stance : { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:190, lKnee:70, rHip:120, rKnee:40 }; }

function computeSpeed(F){ const dt=Math.max(1e-5,(F.anim?.dt||0)); const prevX = (F._prevX==null? F.pos?.x||0 : F._prevX); const curX = F.pos?.x||0; const v = (curX - prevX)/dt; F._prevX = curX; return Math.abs(Number.isFinite(F.vel?.x)? F.vel.x : v); }

function computeWalkPose(F, C){
  const W = C.walk || { enabled:true, baseHz:1.2, speedScale:1.0, minSpeed:60, amp:1.0, poses:{ A:{torso:30,lHip:0,lKnee:45,rHip:180,rKnee:90}, B:{torso:40,lHip:180,lKnee:90,rHip:0,rKnee:45} } };
  const speed = computeSpeed(F);
  const on = !!W.enabled && speed >= (W.minSpeed||60) && (F.onGround!==false);
  // compute frequency scaled by speed (clamped)
  const baseHzFactor = (W.baseHz||1.2) * (W.speedScale||1.0);
  const movementScale = (speed > 1) ? Math.min(3, 0.5 + speed / (C.movement?.maxSpeedX||300)) : 1;
  const baseHz = baseHzFactor * movementScale;

  // initialize walk state
  F.walk.phase = (F.walk.phase || 0);
  F.walk.amp = (F.walk.amp == null) ? (W.amp || 1.0) : F.walk.amp;

  // Smoothly approach target amplitude to avoid pops (use damp)
  const targetAmp = on ? (W.amp || 1.0) : 0;
  F.walk.amp = damp(F.walk.amp, targetAmp, 8, F.anim?.dt || 0);

  // Advance phase when there is amplitude (so we keep continuity even when stopping briefly)
  const dt = Math.max(1e-6, F.anim?.dt || 0);
  F.walk.phase += dt * baseHz * Math.PI * 2;
  // wrap phase to keep numeric stability
  if (F.walk.phase > Math.PI * 2) F.walk.phase %= (Math.PI * 2);

  // phase->s value (apply small smoothing via easeInOut to shape foot travel)
  const rawS = (Math.sin(F.walk.phase) + 1) / 2;
  const s = easeInOutCubic(rawS);

  const A = W.poses?.A || {}; const B = W.poses?.B || {};
  const pose = Object.assign({}, pickBase(C));
  // interpolate leg/torso angles and scale by smoothed amplitude
  pose.lHip = lerp(A.lHip||0, B.lHip||0, s) * F.walk.amp;
  pose.lKnee= lerp(A.lKnee||0,B.lKnee||0,s) * F.walk.amp;
  pose.rHip = lerp(A.rHip||0, B.rHip||0, s) * F.walk.amp;
  pose.rKnee= lerp(A.rKnee||0,B.rKnee||0,s) * F.walk.amp;
  pose.torso= lerp(A.torso||0,B.torso||0,s) * F.walk.amp;
  const base = pickBase(C); pose.lShoulder=base.lShoulder; pose.lElbow=base.lElbow; pose.rShoulder=base.rShoulder; pose.rElbow=base.rElbow;
  pose._active = on && F.walk.amp > 0.001;
  return pose;
}

function getOverride(F){
  if (!F?.anim) return null;
  refreshLegacyOverride(F);
  return F.anim.override || null;
}
function clearOverride(F){
  if (!F?.anim) return;
  removeOverrideLayer(F, 'primary');
}

function primeAnimEventsFromPose(pose){
  // normalize event list
  const list = (pose && (pose.anim_events || pose.events)) ? (pose.anim_events || pose.events) : [];
  // clone and sort by time
  const clone = (list||[]).map(e=>Object.assign({}, e));
  clone.sort((a,b)=> (a.time||0) - (b.time||0));
  return clone;
}

function processAnimEventsForOverride(F, over){
  if (!over) return;
  const now = performance.now()/1000;
  const dur = over.__dur || (over.until ? Math.max(1e-6, over.until - (over.__start||now)) : 0);
  const k = dur > 0 ? Math.min(1, Math.max(0, (now - (over.__start||now)) / dur)) : 1;
  over.__k = k;
  // process scheduled events
  const events = over.__events || [];
  for (const ev of events){
    if (ev.__applied) continue;
    const t = Number.isFinite(ev.time) ? ev.time : 0;
    if (k >= t){
      ev.__applied = true;
      // velocity events
      if (Number.isFinite(ev.velocityX)){
        const vx = ev.localVel ? (ev.velocityX * (F.facingSign || 1)) : ev.velocityX;
        F.vel = F.vel || {x:0,y:0}; F.vel.x = vx;
      }
      if (Number.isFinite(ev.velocityY)){
        F.vel = F.vel || {x:0,y:0}; F.vel.y = ev.velocityY;
      }
      // impulse -> bump velocity
      if (Number.isFinite(ev.impulse)){
        let dir;
        if (ev.aimRelative){
          const baseAim = getAimWorldRad(F);
          const offset = Number.isFinite(ev.impulse_angle) ? degToRad(ev.impulse_angle) : 0;
          dir = baseAim + offset;
        } else if (Number.isFinite(ev.impulse_angle)){
          dir = degToRad(ev.impulse_angle);
        } else {
          dir = getFacingRad(F);
        }
        const mag = ev.impulse || 0;
        F.vel = F.vel || {x:0,y:0};
        const xMult = (ev.localVel && !ev.aimRelative) ? (F.facingSign || 1) : 1;
        F.vel.x = (F.vel.x||0) + Math.cos(dir) * mag * xMult;
        F.vel.y = (F.vel.y||0) + Math.sin(dir) * mag;
      }

      if (ev.resetGravityScale){
        applyGravityScaleEvent(F, null, { reset: true });
      } else if (ev.gravityScale !== undefined){
        const duration = Number.isFinite(ev.gravityScaleDurationMs)
          ? ev.gravityScaleDurationMs
          : (Number.isFinite(ev.gravityDurationMs) ? ev.gravityDurationMs : null);
        applyGravityScaleEvent(F, ev.gravityScale, { durationMs: duration });
      }
      if (ev.grip) {
        handleGripEvent(F, ev.grip);
      }
    }
  }

  // flip timing
  const P = over.pose || {};
  const flipAt = (typeof P.flipAt === 'number') ? Math.max(0, Math.min(1, P.flipAt)) : 0;
  if (P.flip && !over.__flipApplied && k >= flipAt){
    over.__flipApplied = true;
    const parts = P.flipParts || ['ALL'];
    for (const p of parts){ try{ setMirrorForPart(p, true); }catch(_e){} }
  }
  const fullFlipAt = (typeof P.fullFlipAt === 'number') ? Math.max(0, Math.min(1, P.fullFlipAt)) : flipAt;
  if (P.fullFlipFacing && !over.__fullFlipApplied && k >= fullFlipAt){
    over.__fullFlipApplied = true;

    const normAngle = (ang)=>{
      const TAU = Math.PI * 2;
      ang %= TAU;
      return (ang < 0) ? ang + TAU : ang;
    };

    const prevRad = (typeof F.facingRad === 'number')
      ? F.facingRad
      : ((F.facingSign || 1) < 0 ? Math.PI : 0);
    const newRad = normAngle(prevRad + Math.PI);

    F.facingRad = newRad;

    // Keep sign aligned with the new facing angle (fallback to simple toggle)
    const cos = Math.cos(newRad);
    if (Number.isFinite(cos) && Math.abs(cos) > 1e-6){
      F.facingSign = cos >= 0 ? 1 : -1;
    } else {
      F.facingSign = (F.facingSign || 1) * -1;
    }

    const G = window.GAME || {};
    if (G.FACE?.active && typeof G.FACE.rad === 'number'){
      G.FACE.rad = normAngle(G.FACE.rad + Math.PI);
    }

    if (F.attack && typeof F.attack.dirSign === 'number'){
      F.attack.dirSign *= -1;
    }
  }
}

function getActiveLayers(F, now){
  if (!F?.anim || !Array.isArray(F.anim.layers) || F.anim.layers.length === 0) return [];
  const layers = F.anim.layers;
  const active = [];
  for (let i = layers.length - 1; i >= 0; i--){
    const layer = layers[i];
    if (!layer) continue;
    if (layer.until != null && now >= layer.until){
      cleanupLayer(F, layer);
      layers.splice(i, 1);
      continue;
    }
    processAnimEventsForOverride(F, layer);
    active.push(layer);
  }
  active.sort((a,b)=> (a.priority||0) - (b.priority||0));
  refreshLegacyOverride(F);
  return active;
}

function applyLayerPose(targetPose, layer){
  if (!layer?.pose || !targetPose) return;
  const pose = layer.pose;
  const mask = Array.isArray(layer.mask) && layer.mask.length ? layer.mask : ANG_KEYS;
  for (const key of mask){
    if (key === 'ALL'){
      for (const k of ANG_KEYS){
        if (pose[k] != null) targetPose[k] = pose[k];
      }
      if (pose.weaponGripPercents) {
        targetPose.weaponGripPercents = { ...pose.weaponGripPercents };
      }
      if (pose.weaponJointPercents) {
        targetPose.weaponJointPercents = { ...pose.weaponJointPercents };
      }
      if (pose.weaponJointPercent != null) {
        targetPose.weaponJointPercent = pose.weaponJointPercent;
      }
      continue;
    }
    if (pose[key] != null) targetPose[key] = pose[key];
  }
  if (mask.includes('weapon') && pose.weaponGripPercents) {
    targetPose.weaponGripPercents = { ...pose.weaponGripPercents };
  }
  if (mask.includes('weapon') && pose.weaponJointPercents) {
    targetPose.weaponJointPercents = { ...pose.weaponJointPercents };
  }
  if (mask.includes('weapon') && pose.weaponJointPercent != null) {
    targetPose.weaponJointPercent = pose.weaponJointPercent;
  }
}

// Helper to clamp values
function clamp(val, min, max){ return Math.min(max, Math.max(min, val)); }

function normalizeRad(angle){
  const TAU = Math.PI * 2;
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function getHeadLimitsRad(C, fcfg){
  const limits = fcfg?.limits?.head || C.limits?.head || {};
  const relMin = normalizeRad(degToRad(limits.relMin ?? -75));
  const relMax = normalizeRad(degToRad(limits.relMax ?? 75));
  const min = Math.min(relMin, relMax);
  const max = Math.max(relMin, relMax);
  return { min, max };
}

function convertAimToHeadRad(worldAimStandard, orientationSign){
  const mirroredWorld = (orientationSign ?? 1) >= 0
    ? worldAimStandard
    : normalizeRad(Math.PI - worldAimStandard);
  return normalizeRad((Math.PI / 2) - mirroredWorld);
}

function computeHeadTargetDeg(F, finalPoseDeg, fcfg){
  const C = window.CONFIG || {};
  const torsoDeg = finalPoseDeg?.torso ?? 0;
  const torsoRad = degToRad(torsoDeg);

  const faceLockRad = getFaceLock();
  let desiredWorld = null;

  if (typeof faceLockRad === 'number') {
    desiredWorld = faceLockRad;
  } else if (F.aim?.active && typeof F.aim.headWorldTarget === 'number') {
    desiredWorld = F.aim.headWorldTarget;
  }

  if (typeof desiredWorld !== 'number') {
    return torsoDeg;
  }

  const { min, max } = getHeadLimitsRad(C, fcfg);
  const relative = normalizeRad(desiredWorld - torsoRad);
  const clamped = clamp(relative, min, max);
  const fighterOffsetDeg = fcfg?.headTracking?.offsetDeg;
  const globalOffsetDeg = C.headTracking?.offsetDeg;
  const offsetDeg = Number.isFinite(fighterOffsetDeg)
    ? fighterOffsetDeg
    : (Number.isFinite(globalOffsetDeg) ? globalOffsetDeg : 0);
  const headRad = torsoRad + clamped + degToRad(offsetDeg);
  return radToDegNum(headRad);
}

// Update aiming offsets based on current pose
function updateAiming(F, currentPose, fighterId){
  const C = window.CONFIG || {};
  const G = window.GAME || {};
  const poseFlags = currentPose || {};
  const isPlayer = fighterId === 'player' || F.isPlayer === true;

  if (!C.aiming?.enabled) {
    F.aim.active = false;
    F.aim.torsoOffset = 0;
    F.aim.shoulderOffset = 0;
    F.aim.hipOffset = 0;
    F.aim.headWorldTarget = null;
    return;
  }

  // Only aim if the pose explicitly disables it
  if (poseFlags.allowAiming === false) {
    F.aim.active = false;
    F.aim.torsoOffset = 0;
    F.aim.shoulderOffset = 0;
    F.aim.hipOffset = 0;
    F.aim.headWorldTarget = null;
    return;
  }

  if (!isPlayer) {
    if (!F.aim.active) {
      F.aim.torsoOffset = 0;
      F.aim.shoulderOffset = 0;
      F.aim.hipOffset = 0;
      F.aim.headWorldTarget = null;
      return;
    }

    const facingRad = (typeof F.facingRad === 'number')
      ? F.facingRad
      : ((F.facingSign || 1) < 0 ? Math.PI : 0);
    const currentAngle = Number.isFinite(F.aim.currentAngle)
      ? F.aim.currentAngle
      : 0;
    F.aim.currentAngle = currentAngle;

    const facingCos = Math.cos(facingRad);
    let orientationSign = 1;
    let aimDeg = radToDegNum(currentAngle);
    if (Number.isFinite(facingCos)) {
      orientationSign = Math.abs(facingCos) > 1e-4
        ? (facingCos >= 0 ? 1 : -1)
        : ((F.facingSign || 1) >= 0 ? 1 : -1);
      aimDeg *= orientationSign;
    }
    F.aim.orientationSign = orientationSign;
    F.aim.torsoOffset = clamp(aimDeg * 0.5, -(C.aiming.maxTorsoAngle || 45), (C.aiming.maxTorsoAngle || 45));
    F.aim.shoulderOffset = clamp(aimDeg * 0.7, -(C.aiming.maxShoulderAngle || 60), (C.aiming.maxShoulderAngle || 60));
    F.aim.hipOffset = poseFlags.aimLegs
      ? clamp(aimDeg * (poseFlags.aimRightLegOnly ? 0.6 : 0.4), poseFlags.aimRightLegOnly ? -50 : -40, poseFlags.aimRightLegOnly ? 50 : 40)
      : 0;

    const worldAimStandard = currentAngle + facingRad;
    if (Number.isFinite(worldAimStandard)) {
      F.aim.headWorldTarget = convertAimToHeadRad(worldAimStandard, orientationSign);
    } else {
      F.aim.headWorldTarget = null;
    }
    return;
  }

  F.aim.active = true;

  let targetAngle;
  let aimSource = 'fallback';
  let mouseDX = 0;
  
  // Use joystick for aiming if active (mobile), otherwise use mouse (desktop)
  if (G.AIMING?.manualAim && G.JOYSTICK?.active) {
    // Joystick aiming - use joystick angle directly
    targetAngle = G.AIMING.targetAngle;
    aimSource = 'joystick';
  } else if (G.MOUSE?.hasPosition) {
    // Mouse aiming - calculate angle from fighter to mouse position
    const mouse = G.MOUSE;
    const dx = mouse.worldX - (F.pos?.x || 0);
    const dy = mouse.worldY - (F.pos?.y || 0);
    targetAngle = Math.atan2(dy, dx);
    aimSource = 'mouse';
    mouseDX = dx;

  } else {
    // Fallback to facingRad
    targetAngle = F.facingRad || 0;
  }
  
  const normAngle = (ang) => {
    const TAU = Math.PI * 2;
    let out = ang % TAU;
    if (out < 0) out += TAU;
    return out;
  };

  const applyFacing = (rad) => {
    const normalized = normAngle(rad);
    F.facingRad = normalized;
    const cos = Math.cos(normalized);
    if (Number.isFinite(cos) && Math.abs(cos) > 1e-6) {
      F.facingSign = cos >= 0 ? 1 : -1;
    }
  };

  const isDashing = !!(F?.stamina?.isDashing || G.STAMINA?.isDashing || G.FIGHTERS?.[fighterId]?.stamina?.isDashing);
  const initialFacing = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);

  if (!isDashing) {
    if (aimSource === 'joystick') {
      const joystickSide = Math.cos(targetAngle) >= 0 ? 0 : Math.PI;
      const currentSide = Math.cos(initialFacing) >= 0 ? 0 : Math.PI;
      if (joystickSide !== currentSide) {
        applyFacing(joystickSide);
      }
    } else if (aimSource === 'mouse') {
      const mouseSide = mouseDX >= 0 ? 0 : Math.PI;
      const currentSide = Math.cos(initialFacing) >= 0 ? 0 : Math.PI;
      if (G.MOUSE?.isDown && mouseSide !== currentSide) {
        applyFacing(mouseSide);
      }
    }
  }

  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  let relativeAngle = targetAngle - facingRad;
  // Normalize to -PI to PI range
  while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
  while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

  // Smooth the aim angle (simple exponential smoothing)
  const dt = F.anim?.dt || 0.016;
  const smoothing = 1 - Math.exp(-(C.aiming.smoothing || 8) * dt);
  const currentAngle = F.aim.currentAngle || 0;
  F.aim.currentAngle = currentAngle + (relativeAngle - currentAngle) * smoothing;

  // Calculate offsets based on aim angle
  const facingCos = Math.cos(facingRad);
  let orientationSign = 1;
  let aimDeg = radToDegNum(F.aim.currentAngle);
  if (Number.isFinite(facingCos)) {
    orientationSign = Math.abs(facingCos) > 1e-4
      ? (facingCos >= 0 ? 1 : -1)
      : ((F.facingSign || 1) >= 0 ? 1 : -1);
    aimDeg *= orientationSign;
  }
  F.aim.orientationSign = orientationSign;
  F.aim.torsoOffset = clamp(aimDeg * 0.5, -(C.aiming.maxTorsoAngle || 45), (C.aiming.maxTorsoAngle || 45));
  F.aim.shoulderOffset = clamp(aimDeg * 0.7, -(C.aiming.maxShoulderAngle || 60), (C.aiming.maxShoulderAngle || 60));

  // Apply leg aiming if pose allows it
  if (poseFlags.aimLegs) {
    if (poseFlags.aimRightLegOnly) {
      F.aim.hipOffset = clamp(aimDeg * 0.6, -50, 50); // Only right leg aims
    } else {
      F.aim.hipOffset = clamp(aimDeg * 0.4, -40, 40); // Both legs aim
    }
  } else {
    F.aim.hipOffset = 0;
  }

  const worldAimStandard = (F.aim.currentAngle || 0) + facingRad;
  if (Number.isFinite(worldAimStandard)) {
    F.aim.headWorldTarget = convertAimToHeadRad(worldAimStandard, orientationSign);
  } else {
    F.aim.headWorldTarget = null;
  }
}

// Apply aiming offsets to a pose
function applyAimingOffsets(poseDeg, F, currentPose){
  if (!F.aim.active) return poseDeg;

  const poseFlags = currentPose || {};
  const result = {...poseDeg};
  result.torso = (result.torso || 0) + F.aim.torsoOffset;
  result.lShoulder = (result.lShoulder || 0) + F.aim.shoulderOffset;
  result.rShoulder = (result.rShoulder || 0) + F.aim.shoulderOffset;

  // Apply leg aiming if present
  if (F.aim.hipOffset !== 0) {
    if (poseFlags.aimRightLegOnly) {
      // Only right leg
      result.rHip = (result.rHip || 0) + F.aim.hipOffset;
    } else if (poseFlags.aimLegs) {
      // Both legs
      result.lHip = (result.lHip || 0) + F.aim.hipOffset;
      result.rHip = (result.rHip || 0) + F.aim.hipOffset;
    }
  }

  return result;
}

export function updatePoses(){
  const G = window.GAME || {}; const C = window.CONFIG || {}; const now = performance.now()/1000; if (!G.FIGHTERS) return;
  // Check if joint angles are frozen (for debugging/manual pose editing)
  if (C.debug?.freezeAngles) return;
  const fallbackFighterName = pickFighterName(C);
  const fighterConfigCache = new Map();
  const getConfigBundle = (fighterName)=>{
    const key = fighterName || fallbackFighterName;
    if (fighterConfigCache.has(key)) return fighterConfigCache.get(key);
    const fighterConfig = pickFighterConfig(C, key);
    const breathingConfig = pickBreathingConfig(C, key);
    const spec = resolveBreathingSpec(breathingConfig);
    const bundle = { fighterConfig, breathingSpec: spec };
    fighterConfigCache.set(key, bundle);
    return bundle;
  };
  const fighterIds = Object.keys(G.FIGHTERS)
    .sort((a, b) => {
      if (a === 'player') return -1;
      if (b === 'player') return 1;
      return a.localeCompare(b);
    });
  for (const id of fighterIds){
    const F = G.FIGHTERS[id];
    if(!F) continue;
    const runtimeFighterName = resolveRuntimeFighterName(F, fallbackFighterName);
    const { fighterConfig: fcfg, breathingSpec } = getConfigBundle(runtimeFighterName);
    ensureAnimState(F);
    F.anim.dt = Math.max(0, now - F.anim.last);
    F.anim.last = now;

    const walkPose = computeWalkPose(F,C);
    const basePoseConfig = pickBase(C);
    let targetDeg = walkPose._active ? { ...walkPose } : { ...basePoseConfig };

    const activeLayers = getActiveLayers(F, now);
    const activeLengthOverrides = collectLengthOverridesFromLayers(activeLayers);
    applyLengthOverridesToFighter(F, activeLengthOverrides);
    const walkSuppressed = activeLayers.some(layer => layer.suppressWalk);
    if (activeLayers.length){
      if (walkSuppressed){
        targetDeg = { ...basePoseConfig };
      }
      for (const layer of activeLayers){
        applyLayerPose(targetDeg, layer);
      }
    }

    const topLayer = activeLayers.length ? activeLayers[activeLayers.length - 1] : null;
    const aimingPose = topLayer?.pose || (walkPose._active && !walkSuppressed ? walkPose : basePoseConfig);

    // Update aiming system based on current pose
    updateAiming(F, aimingPose || targetDeg, id);

    // Add basePose to targetDeg (matching reference HTML behavior)
    const basePose = C.basePose || {};
    let finalDeg = addAngles(basePose, targetDeg);

    // Apply aiming offsets to pose
    finalDeg = applyAimingOffsets(finalDeg, F, aimingPose || targetDeg);

    const headDeg = computeHeadTargetDeg(F, finalDeg, fcfg);
    if (typeof headDeg === 'number') {
      finalDeg.head = headDeg;
    }

    // Debug: log once on first frame for player
    if (id === 'player' && F.anim.dt === 0 && !F.__debugLogged) {
      console.log('[animator] basePose:', basePose);
      console.log('[animator] targetDeg (Stance):', targetDeg);
      console.log('[animator] finalDeg (basePose + Stance):', finalDeg);
      console.log('[animator] Specifically legs:');
      console.log('  basePose.lHip =', basePose.lHip, ', Stance.lHip =', targetDeg.lHip, ', final =', finalDeg.lHip);
      console.log('  basePose.rHip =', basePose.rHip, ', Stance.rHip =', targetDeg.rHip, ', final =', finalDeg.rHip);
      F.__debugLogged = true;
    }
    
    const target = degToRadPose(finalDeg);
    updateWeaponRig(F, target, finalDeg, C, fcfg);
    updatePhysicsPoseTarget(F, target);
    const ragBlend = getPhysicsRagdollBlend(F);
    const ragAngles = getPhysicsRagdollAngles(F);
    const lambda = 10;
    for (const k of ANG_KEYS) {
      const cur = Number.isFinite(F.jointAngles[k]) ? F.jointAngles[k] : 0;
      const animTarget = Number.isFinite(target[k]) ? target[k] : cur;
      let blended = animTarget;
      if (ragBlend > 0 && ragAngles && Number.isFinite(ragAngles[k])) {
        blended = animTarget + (ragAngles[k] - animTarget) * ragBlend;
      }
      F.jointAngles[k] = Number.isFinite(damp(cur, blended, lambda, F.anim.dt)) ? damp(cur, blended, lambda, F.anim.dt) : 0;
    }
    updateBreathing(F, id, breathingSpec);
  }
}

export function pushPoseOverride(fighterId, poseDeg, durMs=300, options={}){
  let opts = (options && typeof options === 'object') ? options : {};
  let durationArg = durMs;
  if (durMs && typeof durMs === 'object' && !Array.isArray(durMs)){
    opts = durMs;
    durationArg = opts.durMs ?? opts.durationMs ?? opts.dur ?? 300;
  }
  const duration = Number.isFinite(durationArg) ? durationArg : (Number.isFinite(opts.durMs) ? opts.durMs : 300);
  const G = window.GAME || {};
  const F = G.FIGHTERS?.[fighterId];
  if(!F) return;
  setOverrideLayer(F, 'primary', poseDeg, {
    durMs: duration,
    mask: opts.mask,
    priority: opts.priority,
    suppressWalk: opts.suppressWalk,
    useAsBase: opts.useAsBase
  });
}

export function pushPoseLayerOverride(fighterId, layerId, poseDeg, options={}){
  if (!layerId) layerId = 'layer';
  const opts = options && typeof options === 'object' ? options : {};
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : (Number.isFinite(opts.offsetMs) ? opts.offsetMs : 0);
  const guard = typeof opts.guard === 'function' ? opts.guard : null;
  const duration = opts.durMs ?? opts.durationMs ?? opts.dur ?? 300;
  const settleCallbacks = [];
  let settled = false;
  let settleReason = null;
  let timerId = null;

  const runSettle = (reason)=>{
    if (settled) return;
    settled = true;
    settleReason = reason;
    if (typeof opts.onSettle === 'function'){
      try { opts.onSettle(reason); } catch(err){ console.warn('[animator] layer override onSettle error', err); }
    }
    while (settleCallbacks.length){
      const cb = settleCallbacks.shift();
      try { cb(reason); } catch(err){ console.warn('[animator] layer override settle callback error', err); }
    }
  };

  const handle = {
    cancel(){
      if (settled) return;
      if (timerId != null){
        clearTimeout(timerId);
        timerId = null;
      }
      runSettle('canceled');
    },
    onSettle(cb){
      if (typeof cb !== 'function') return handle;
      if (settled){
        try { cb(settleReason); } catch(err){ console.warn('[animator] layer override settle callback error', err); }
      } else {
        settleCallbacks.push(cb);
      }
      return handle;
    }
  };

  const apply = ()=>{
    if (settled) return;
    if (guard){
      let allowed = true;
      try { allowed = guard() !== false; }
      catch(err){ console.warn('[animator] layer override guard error', err); allowed = false; }
      if (!allowed){
        runSettle('skipped');
        return;
      }
    }
    const G = window.GAME || {};
    const F = G.FIGHTERS?.[fighterId];
    if(!F){
      runSettle('missing');
      return;
    }
    setOverrideLayer(F, layerId, poseDeg, {
      durMs: duration,
      mask: opts.mask,
      priority: opts.priority,
      suppressWalk: opts.suppressWalk,
      useAsBase: opts.useAsBase
    });
    runSettle('applied');
  };

  if (delayMs > 0){
    timerId = setTimeout(()=>{
      timerId = null;
      apply();
    }, delayMs);
  } else {
    apply();
  }

  const G = window.GAME || {};
  const F = G.FIGHTERS?.[fighterId];
  if (F){
    ensureAnimState(F);
    trackPendingLayerTimer(F, layerId, handle);
  }

  return handle;
}
