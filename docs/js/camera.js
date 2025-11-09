// camera.js — modular camera follow (ported from Ancient Code-Monolith V2)
// Smoothly tracks the player, clamps to world bounds, and keeps a legacy
// `window.CAMERA` alias so older helpers continue to function.

const DEFAULT_VIEW_WIDTH = 720;
const DEFAULT_WORLD_WIDTH = 1600;

function clamp(v, lo, hi){
  if (lo > hi) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function ensureCameraState(){
  const G = (window.GAME ||= {});
  const C = window.CONFIG || {};
  const cam = (G.CAMERA ||= {});
  if (!Number.isFinite(cam.x)) cam.x = 0;
  if (!Number.isFinite(cam.targetX)) cam.targetX = cam.x;
  const cfg = C.camera || {};
  if (!Number.isFinite(cam.worldWidth)){
    cam.worldWidth = C.world?.width || cfg.worldWidth || DEFAULT_WORLD_WIDTH;
  }
  if (!Number.isFinite(cam.smoothing)){
    cam.smoothing = cfg.smoothing ?? 0.15;
  }
  if (!Number.isFinite(cam.lookAhead)){
    cam.lookAhead = cfg.lookAhead ?? 0;
  }
  if (!Number.isFinite(cam.deadZone)){
    cam.deadZone = cfg.deadZone ?? 0;
  }
  // Maintain backwards-compatible global alias
  const legacy = (window.CAMERA ||= {});
  legacy.worldWidth = cam.worldWidth;
  legacy.smoothing = cam.smoothing;
  if (!Number.isFinite(legacy.x)) legacy.x = cam.x;
  if (!Number.isFinite(legacy.targetX)) legacy.targetX = cam.targetX;
  legacy.lookAhead = cam.lookAhead;
  legacy.deadZone = cam.deadZone;
  return cam;
}

function computeSmoothingFactor(base, dt){
  // Convert frame-rate dependent factor into time-based easing.
  // Matches legacy behavior at 60fps when dt ≈ 1/60.
  const coeff = Number.isFinite(base) ? Math.max(0, base) : 0.15;
  const delta = Math.max(0, dt || 0);
  return 1 - Math.exp(-coeff * (delta * 60 || 1));
}

export function updateCamera(canvas, dt){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!G.FIGHTERS) return;
  const cam = ensureCameraState();
  const player = G.FIGHTERS.player;
  if (!player || !player.pos) return;

  const viewW = canvas?.width || C.canvas?.w || DEFAULT_VIEW_WIDTH;
  const worldW = Math.max(viewW, cam.worldWidth || DEFAULT_WORLD_WIDTH);

  let target = player.pos.x - viewW * 0.5;
  if (Number.isFinite(cam.lookAhead) && cam.lookAhead !== 0){
    const velX = player.vel?.x || 0;
    target += velX * cam.lookAhead;
  }
  target = clamp(target, 0, worldW - viewW);

  if (cam.deadZone > 0){
    const half = cam.deadZone * 0.5;
    const camLeft = cam.x + viewW * 0.5 - half;
    const camRight = cam.x + viewW * 0.5 + half;
    const playerX = player.pos.x;
    if (playerX > camLeft && playerX < camRight){
      target = cam.targetX;
    }
  }

  cam.targetX = target;
  const smoothing = computeSmoothingFactor(cam.smoothing, dt);
  cam.x += (target - cam.x) * smoothing;

  const legacy = (window.CAMERA ||= {});
  legacy.x = cam.x;
  legacy.targetX = target;
  legacy.worldWidth = worldW;
}
