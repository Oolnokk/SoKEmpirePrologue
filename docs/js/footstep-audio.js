// footstep-audio.js — synthesize fighter-specific footstep sounds per surface material

const MATERIAL_PROFILES = {
  default: { lowpass: 1800, pitch: 240, gain: 0.16, decay: 0.18 },
  stone: { lowpass: 1500, pitch: 190, gain: 0.2, decay: 0.22 },
  concrete: { lowpass: 1400, pitch: 180, gain: 0.22, decay: 0.24 },
  wood: { lowpass: 1600, pitch: 220, gain: 0.18, decay: 0.28 },
  metal: { lowpass: 2200, pitch: 320, gain: 0.24, decay: 0.18 },
  glass: { lowpass: 2500, pitch: 360, gain: 0.15, decay: 0.14 },
  ceramic: { lowpass: 2100, pitch: 280, gain: 0.18, decay: 0.18 },
  dirt: { lowpass: 900, pitch: 140, gain: 0.2, decay: 0.32 },
  grass: { lowpass: 1100, pitch: 150, gain: 0.18, decay: 0.3 },
  sand: { lowpass: 700, pitch: 120, gain: 0.18, decay: 0.36 },
  snow: { lowpass: 600, pitch: 110, gain: 0.15, decay: 0.34 },
  ice: { lowpass: 2600, pitch: 340, gain: 0.16, decay: 0.2 },
  water: { lowpass: 1200, pitch: 130, gain: 0.2, decay: 0.4 },
};

const FOOT_PROFILES = {
  'cat-foot': { gain: 0.17, pitch: 1.28, strideScale: 0.92 },
  'bird-foot': { gain: 0.22, pitch: 1.05, strideScale: 1 },
  'sloth-foot': { gain: 0.3, pitch: 0.78, strideScale: 1.18 },
};

const FOOT_PROFILE_ALIASES = {
  light: 'cat-foot',
  claw: 'cat-foot',
  boot: 'bird-foot',
  hoof: 'bird-foot',
  heavy: 'sloth-foot',
};

const DEFAULT_FOOT_TYPE = 'cat-foot';

const TILE_CAT_SAMPLE = Object.freeze({
  left: './assets/audio/sfx/steps/tile/cat_step_tile_L.wav',
  right: './assets/audio/sfx/steps/tile/cat_step_tile_R.wav',
});

const TILE_SLOTH_SAMPLE = Object.freeze({
  left: './assets/audio/sfx/steps/tile/sloth_step_tile_L.wav',
  right: './assets/audio/sfx/steps/tile/sloth_step_tile_R.wav',
});

const TILE_SAMPLE_SET = Object.freeze({
  default: TILE_CAT_SAMPLE,
  'cat-foot': TILE_CAT_SAMPLE,
  'bird-foot': TILE_CAT_SAMPLE,
  'sloth-foot': TILE_SLOTH_SAMPLE,
});

const SAMPLE_LIBRARY = {
  tile: TILE_SAMPLE_SET,
};

const FALLBACK_SAMPLE_MATERIAL = 'tile';

const SAMPLE_MATERIAL_ALIASES = {
  default: FALLBACK_SAMPLE_MATERIAL,
  stone: FALLBACK_SAMPLE_MATERIAL,
  concrete: FALLBACK_SAMPLE_MATERIAL,
  wood: FALLBACK_SAMPLE_MATERIAL,
  metal: FALLBACK_SAMPLE_MATERIAL,
  glass: FALLBACK_SAMPLE_MATERIAL,
  ceramic: FALLBACK_SAMPLE_MATERIAL,
  dirt: FALLBACK_SAMPLE_MATERIAL,
  grass: FALLBACK_SAMPLE_MATERIAL,
  sand: FALLBACK_SAMPLE_MATERIAL,
  snow: FALLBACK_SAMPLE_MATERIAL,
  ice: FALLBACK_SAMPLE_MATERIAL,
  water: FALLBACK_SAMPLE_MATERIAL,
};

const SAMPLE_CACHE = new Map();

const MIN_STEP_SPEED = 65;
const BASE_STRIDE_LENGTH = 52;
const LANDING_IMPULSE_REF = 900;

let audioCtx = null;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveAudioContext() {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioCtor !== 'function') return null;
  try {
    audioCtx = new AudioCtor();
    if (typeof audioCtx.resume === 'function') {
      audioCtx.resume().catch(() => {});
    }
  } catch (error) {
    console.warn('[footstep-audio] Unable to initialize AudioContext', error);
    audioCtx = null;
  }
  return audioCtx;
}

function createNoiseBuffer(duration) {
  const ctx = audioCtx;
  if (!ctx) return null;
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.6;
  }
  return buffer;
}

function resolveMaterialProfile(material, config) {
  const cfg = config?.audio?.footsteps?.materials || {};
  const key = (material || '').toLowerCase();
  const base = MATERIAL_PROFILES[key] || MATERIAL_PROFILES.default;
  const overrides = key && cfg[key]
    ? cfg[key]
    : cfg.default;
  return overrides ? { ...base, ...overrides } : base;
}

function resolveFootProfile(fighter, config) {
  const fighters = config?.fighters || {};
  const fighterName = fighter?.renderProfile?.fighterName;
  const fighterConfig = fighterName && fighters[fighterName] ? fighters[fighterName] : null;
  const configProfile = fighterConfig?.footsteps || {};
  const rawType = (configProfile.type || configProfile.footType || '').toLowerCase();
  const type = FOOT_PROFILE_ALIASES[rawType] || rawType || DEFAULT_FOOT_TYPE;
  const base = FOOT_PROFILES[type] || FOOT_PROFILES[DEFAULT_FOOT_TYPE];
  const overrides = config?.audio?.footsteps?.fighters?.[fighterName] || {};
  const profile = {
    ...base,
    ...overrides,
    ...configProfile,
  };
  profile.resolvedType = type;
  return profile;
}

function ensureFootstepState(fighter) {
  fighter._footstepState ||= {
    prevOnGround: !!fighter.onGround,
    strideProgress: 0,
    lastMaterial: null,
    nextFoot: 'left',
  };
  return fighter._footstepState;
}

function computeStrideLength(config, profile) {
  const scale = Number.isFinite(config?.actor?.scale) ? config.actor.scale : 1;
  const strideScale = Number.isFinite(profile?.strideScale) ? profile.strideScale : 1;
  return BASE_STRIDE_LENGTH * scale * strideScale;
}

function playSyntheticFootstep(materialProfile, footProfile, intensity) {
  const ctx = resolveAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const duration = Math.max(0.05, (materialProfile.decay || 0.2) * clamp(intensity, 0.2, 1.5));
  const gainNode = ctx.createGain();
  const baseGain = (materialProfile.gain ?? 0.2) * (footProfile?.gain ?? 0.2) * clamp(intensity, 0.2, 1.5);
  gainNode.gain.setValueAtTime(baseGain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(materialProfile.lowpass ?? 1800, now);
  filter.Q.setValueAtTime(1.1, now);

  const noise = ctx.createBufferSource();
  const buffer = createNoiseBuffer(duration);
  if (buffer) noise.buffer = buffer;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const footPitch = footProfile?.pitch ?? 1;
  const basePitch = materialProfile.pitch ?? 220;
  const jitter = basePitch * 0.08 * (Math.random() - 0.5);
  osc.frequency.setValueAtTime((basePitch + jitter) * footPitch, now);
  osc.frequency.exponentialRampToValueAtTime(basePitch * footPitch * 0.6, now + duration);

  noise.connect(filter);
  filter.connect(gainNode);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

function resolveSamplePath(material, footType, foot) {
  const normalizedMaterial = typeof material === 'string' && material
    ? material.toLowerCase()
    : 'default';
  const materialKey = SAMPLE_LIBRARY[normalizedMaterial]
    ? normalizedMaterial
    : SAMPLE_MATERIAL_ALIASES[normalizedMaterial] || FALLBACK_SAMPLE_MATERIAL;
  const library = SAMPLE_LIBRARY[materialKey];
  if (!library) return null;
  const variant = (footType && library[footType]) || library.default;
  if (!variant) return null;
  return variant[foot] || library.default?.[foot] || null;
}

function fetchSampleBuffer(path) {
  if (!path || typeof fetch !== 'function') return null;
  const ctx = resolveAudioContext();
  if (!ctx) return null;
  const cached = SAMPLE_CACHE.get(path);
  if (cached?.buffer) {
    return cached.buffer;
  }
  if (!cached) {
    const pending = fetch(path)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
      .then((arrayBuffer) => new Promise((resolve) => {
        ctx.decodeAudioData(arrayBuffer, resolve, () => resolve(null));
      }))
      .then((buffer) => {
        if (buffer) {
          SAMPLE_CACHE.set(path, { buffer });
        } else {
          SAMPLE_CACHE.delete(path);
        }
        return buffer;
      })
      .catch((error) => {
        console.warn('[footstep-audio] Failed to load sample', path, error);
        SAMPLE_CACHE.set(path, { failed: true });
        return null;
      });
    SAMPLE_CACHE.set(path, { promise: pending });
  }
  return null;
}

function tryPlaySampledFootstep(material, footProfile, materialProfile, intensity, foot) {
  const footType = footProfile?.resolvedType || DEFAULT_FOOT_TYPE;
  const path = resolveSamplePath(material, footType, foot);
  if (!path) return false;
  const buffer = fetchSampleBuffer(path);
  if (!buffer) return false;
  const ctx = resolveAudioContext();
  if (!ctx) return false;
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const playbackRate = clamp(footProfile?.pitch ?? 1, 0.6, 1.8);
  source.playbackRate.setValueAtTime(playbackRate, now);
  const gainNode = ctx.createGain();
  const baseGain = (materialProfile.gain ?? 0.2) * (footProfile?.gain ?? 0.2) * clamp(intensity, 0.3, 1.6);
  gainNode.gain.setValueAtTime(baseGain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + buffer.duration);
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(now);
  return true;
}

function playFootstepSample(material, materialProfile, footProfile, intensity, foot) {
  const played = tryPlaySampledFootstep(material, footProfile, materialProfile, intensity, foot);
  if (!played) {
    playSyntheticFootstep(materialProfile, footProfile, intensity);
  }
}

function resolveSurfaceMaterial(fighter, config) {
  const raw = typeof fighter?.surfaceMaterial === 'string' ? fighter.surfaceMaterial : '';
  if (raw) return raw;
  const groundMaterial = typeof config?.ground?.materialType === 'string' ? config.ground.materialType : '';
  return groundMaterial || 'default';
}

export function updateFighterFootsteps(fighter, config, dt) {
  if (!fighter || !Number.isFinite(dt) || dt <= 0) return;
  if (fighter.isDead || fighter.destroyed) return;
  const state = ensureFootstepState(fighter);
  const onGround = !!(fighter.onGround && !fighter.ragdoll);
  const material = resolveSurfaceMaterial(fighter, config);
  const profile = resolveFootProfile(fighter, config);
  const materialProfile = resolveMaterialProfile(material, config);
  const velX = Number.isFinite(fighter.vel?.x) ? fighter.vel.x : 0;
  const speed = Math.abs(velX);
  const strideLength = computeStrideLength(config, profile);
  const events = [];

  function enqueueFootstep(intensity) {
    const foot = state.nextFoot === 'right' ? 'right' : 'left';
    state.nextFoot = foot === 'left' ? 'right' : 'left';
    events.push({ intensity, foot });
  }

  if (onGround && !state.prevOnGround) {
    const impulse = Math.abs(Number(fighter.landedImpulse) || 0);
    const normalized = clamp(impulse / LANDING_IMPULSE_REF, 0.25, 1.4);
    enqueueFootstep(normalized);
    state.strideProgress = 0;
  } else if (onGround && speed >= MIN_STEP_SPEED && !fighter.recovering) {
    state.strideProgress += speed * dt;
    const stride = Math.max(20, strideLength);
    if (state.strideProgress >= stride) {
      state.strideProgress -= stride;
      const normalized = clamp(speed / 420, 0.2, 1);
      enqueueFootstep(normalized);
    }
  } else {
    state.strideProgress = 0;
  }

  state.prevOnGround = onGround;
  state.lastMaterial = material;

  if (!events.length) return;
  for (const event of events) {
    playFootstepSample(material, materialProfile, profile, event.intensity, event.foot);
  }
}
