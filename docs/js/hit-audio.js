// hit-audio.js — plays attack collision sounds based on weapon type and damage

const HIT_SAMPLES = Object.freeze({
  sharp: [
    './assets/audio/sfx/steps/tile/sloth_step_tile_L.wav',
    './assets/audio/sfx/steps/tile/sloth_step_tile_R.wav',
  ],
  blunt: [
    './assets/audio/sfx/steps/tile/cat_step_tile_L.wav',
    './assets/audio/sfx/steps/tile/cat_step_tile_R.wav',
  ],
});

let audioCtx = null;
const BUFFER_CACHE = new Map();

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveAudioContext() {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  if (window.__GAME_AUDIO_CTX__) {
    audioCtx = window.__GAME_AUDIO_CTX__;
    return audioCtx;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioCtor !== 'function') return null;
  try {
    audioCtx = new AudioCtor();
    window.__GAME_AUDIO_CTX__ = audioCtx;
    if (typeof audioCtx.resume === 'function') {
      audioCtx.resume().catch(() => {});
    }
  } catch (error) {
    console.warn('[hit-audio] Unable to initialize AudioContext', error);
    audioCtx = null;
  }
  return audioCtx;
}

async function fetchSampleBuffer(path) {
  if (!path || typeof fetch !== 'function') return null;
  const ctx = resolveAudioContext();
  if (!ctx) return null;
  const cached = BUFFER_CACHE.get(path);
  if (cached?.buffer) return cached.buffer;
  if (cached?.promise) {
    return cached.promise;
  }
  const pending = fetch(path)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
    .then((arrayBuffer) => new Promise((resolve) => {
      ctx.decodeAudioData(arrayBuffer, resolve, () => resolve(null));
    }))
    .then((buffer) => {
      if (buffer) {
        BUFFER_CACHE.set(path, { buffer });
        return buffer;
      }
      BUFFER_CACHE.delete(path);
      return null;
    })
    .catch((error) => {
      console.warn('[hit-audio] Failed to load sample', path, error);
      BUFFER_CACHE.set(path, { failed: true });
      return null;
    });
  BUFFER_CACHE.set(path, { promise: pending });
  return pending;
}

function pickSamplePath(weaponType) {
  const key = typeof weaponType === 'string' ? weaponType.toLowerCase() : '';
  if (key.includes('sharp')) return HIT_SAMPLES.sharp[Math.floor(Math.random() * HIT_SAMPLES.sharp.length)];
  const bluntSamples = HIT_SAMPLES.blunt;
  return bluntSamples[Math.floor(Math.random() * bluntSamples.length)];
}

function normalizeDamage(damage) {
  if (!Number.isFinite(damage) || damage <= 0) return 0.4;
  return clamp(damage / 22, 0.2, 2.2);
}

function buildAudioParams(damage) {
  const normalized = normalizeDamage(damage);
  const playbackRate = clamp(1.18 - normalized * 0.35, 0.55, 1.25);
  const gain = clamp(0.18 + normalized * 0.08, 0.12, 0.46);
  return { playbackRate, gain };
}

export async function playAttackHitSound({ weaponType, damage } = {}) {
  const ctx = resolveAudioContext();
  if (!ctx) return;
  const samplePath = pickSamplePath(weaponType);
  if (!samplePath) return;
  const buffer = await fetchSampleBuffer(samplePath);
  if (!buffer) return;
  const params = buildAudioParams(damage);
  const now = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(params.playbackRate, now);
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(params.gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + buffer.duration * 1.1);
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(now);
}
