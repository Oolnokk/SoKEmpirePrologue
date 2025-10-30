// camera.js — simple x-follow camera with smoothing
export function updateCamera(canvas){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!G.FIGHTERS || !G.CAMERA) return;
  const P = G.FIGHTERS.player; if (!P) return;
  const w = canvas?.width || (C.canvas?.w || 720);
  const worldW = G.CAMERA.worldWidth || 1600;
  const target = Math.max(0, Math.min(worldW - w, P.pos.x - w*0.5));
  const k = G.CAMERA.smoothing ?? 0.15;
  G.CAMERA.x = (G.CAMERA.x||0) + (target - (G.CAMERA.x||0)) * k;
}
