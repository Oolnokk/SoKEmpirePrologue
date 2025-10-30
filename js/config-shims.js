/* Shims to keep the app resilient if the CDN config fails or is delayed. */
window.CONFIG = window.CONFIG || {};

/* Provide minimal defaults for fields the app expects so we don't explode
   if the external config hasn't loaded yet. These will be overwritten. */
Object.assign(window.CONFIG, {
  poses: window.CONFIG.poses || {},
  durations: window.CONFIG.durations || {},
  presets: window.CONFIG.presets || {},
  fighters: window.CONFIG.fighters || { defaultFighter: {} },
  movement: Object.assign({ authoredWeight: 0.6, physicsWeight: 0.4, lockFacingDuringAttack: true }, window.CONFIG.movement || {}),
  ik: Object.assign({ calvesOnly: true }, window.CONFIG.ik || {}),
  colliders: Object.assign({ handMultiplier: 2.0, footMultiplier: 1.0 }, window.CONFIG.colliders || {}),
  actor: Object.assign({ scale: 0.70 }, window.CONFIG.actor || {}),
  canvas: Object.assign({ w: 720, h: 460 }, window.CONFIG.canvas || {}),
  basePose: window.CONFIG.basePose || { lKnee: 0, rKnee: 0 },
  offsets: window.CONFIG.offsets || {},
  parts: window.CONFIG.parts || { arm: { upper: 20, lower: 20 }, leg: { upper: 26, lower: 26 }, hitbox: { h: 100 } },
  groundRatio: window.CONFIG.groundRatio || 0.70,
  activeFighter: window.CONFIG.activeFighter || null
});

window.loadConfigSet ||= async function loadConfigSet(/* base, files */){
  console.warn('[shim] loadConfigSet missing; returning empty set.');
  return { poses:{}, durations:{}, presets:{}, flags:{} };
};

window.initParallaxSystem ||= function initParallaxSystem(opts){
  console.warn('[shim] initParallaxSystem missing; parallax disabled.', opts);
  window.PARALLAX = window.PARALLAX || { layers:[], areas:{}, currentAreaId:'main_hall' };
  return { update(){}, setEnabled(){} };
};

window.updateInteractPrompt ||= function updateInteractPrompt(){ /* no-op */ };
