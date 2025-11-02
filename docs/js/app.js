import './_clearOverride.js?v=1';
import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js?v=6';
import { initFighters } from './fighter.js?v=6';
import { initControls } from './controls.js?v=6';
import { initCombat } from './combat.js?v=6';
import { updatePoses } from './animator.js?v=2';
import { renderAll, LIMB_COLORS } from './render.js?v=4';
import { updateCamera } from './camera.js?v=1';
import { initHitDetect, runHitDetect } from './hitdetect.js?v=1';
import { initSprites, renderSprites } from './sprites.js?v=3';

const $$ = (sel, el=document) => el.querySelector(sel);
function show(el, v){ if(!el) return; el.style.display = v ? '' : 'none'; }

// Setup canvas
const cv = $$('#game');
const cx = cv?.getContext('2d');
window.GAME ||= {};

// === Apply render layer order (user-specified) ===
const RENDER_ORDER = ['HITBOX','ARM_R_LOWER','ARM_R_UPPER','LEG_R_LOWER','LEG_R_UPPER','HEAD','TORSO','LEG_L_UPPER','LEG_L_LOWER','ARM_L_UPPER','ARM_L_LOWER'];
function applyRenderOrder(){
  window.CONFIG ||= {};
  window.CONFIG.render ||= {};
  window.CONFIG.render.order = RENDER_ORDER;
}
applyRenderOrder();

// HUD refs
const staminaFill = $$('#staminaFill');
const footingFill = $$('#footingFill');
const healthFill = $$('#healthFill');
const statusInfo = $$('#statusInfo');
const reloadBtn = $$('#btnReloadCfg');
const toggleSpritesBtn = $$('#btnToggleSprites');
const fpsHud = $$('#fpsHud');
const boneKeyList = $$('#boneKeyList');

if (reloadBtn){
  reloadBtn.addEventListener('click', async ()=>{
    try {
      if (statusInfo) statusInfo.textContent = 'Reloading config…';
      await window.reloadConfig?.();
      initPresets();
      ensureAltSequenceUsesKickAlt();
      applyRenderOrder();
      if (statusInfo) statusInfo.textContent = 'Config reloaded';
    } catch (e){
      if (statusInfo) statusInfo.textContent = 'Config reload failed';
      console.error(e);
    }
  });
}

if (toggleSpritesBtn){
  const updateToggleLabel = ()=>{
    const hidden = !!window.RENDER?.hideSprites;
    toggleSpritesBtn.textContent = hidden ? 'Show Sprites' : 'Hide Sprites';
  };
  toggleSpritesBtn.addEventListener('click', ()=>{
    window.RENDER ||= {};
    window.RENDER.hideSprites = !window.RENDER.hideSprites;
    updateToggleLabel();
  });
  updateToggleLabel();
}

if (boneKeyList) {
  const LABELS = {
    torso: 'Torso',
    head: 'Head',
    arm_L_upper: 'Left Upper Arm',
    arm_L_lower: 'Left Lower Arm',
    arm_R_upper: 'Right Upper Arm',
    arm_R_lower: 'Right Lower Arm',
    leg_L_upper: 'Left Upper Leg',
    leg_L_lower: 'Left Lower Leg',
    leg_R_upper: 'Right Upper Leg',
    leg_R_lower: 'Right Lower Leg'
  };
  boneKeyList.innerHTML = '';
  Object.entries(LIMB_COLORS).forEach(([key, color]) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';

    const swatch = document.createElement('span');
    swatch.style.display = 'inline-block';
    swatch.style.width = '16px';
    swatch.style.height = '16px';
    swatch.style.borderRadius = '4px';
    swatch.style.background = color;
    swatch.style.border = '1px solid rgba(255,255,255,0.2)';

    const label = document.createElement('span');
    label.textContent = LABELS[key] || key;

    item.appendChild(swatch);
    item.appendChild(label);
    boneKeyList.appendChild(item);
  });
}

// Re-init presets on external config updates
document.addEventListener('config:updated', ()=>{
  initPresets();
  ensureAltSequenceUsesKickAlt();
  applyRenderOrder();
});

function updateHUD(){
  const G = window.GAME;
  const P = G.FIGHTERS?.player;
  if (!P) return;
  const S = P.stamina;
  if (S && staminaFill){ staminaFill.style.width = Math.round((S.current/S.max)*100)+'%'; }
  if (footingFill){ footingFill.style.width = Math.round(P.footing)+'%'; }
  if (healthFill){ healthFill.style.width = '100%'; }
}

function drawStage(){
  if (!cx) return;
  const C = window.CONFIG || {};
  const camX = window.GAME?.CAMERA?.x || 0;
  const worldW = window.GAME?.CAMERA?.worldWidth || 1600;
  cx.clearRect(0,0,cv.width,cv.height);
  cx.fillStyle = '#0b1220';
  cx.fillRect(0,0,cv.width,cv.height);
  // ground (with camera offset)
  const gy = (C.canvas?.h||460) * (C.groundRatio||0.7);
  cx.save();
  cx.translate(-camX, 0);
  cx.strokeStyle = 'rgba(255,255,255,.15)';
  cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(worldW, gy); cx.stroke();
  cx.restore();

  cx.fillStyle = '#93c5fd';
  cx.fillText('KHY Modular Build', 14, 22);
}

let last = performance.now();
let fpsLast = performance.now();
let frames = 0;
function loop(t){
  const dt = (t - last) / 1000; last = t;
  if (window.GAME?.combat) window.GAME.combat.tick(dt);
  updatePoses();
  updateCamera(cv);
  drawStage();
  renderAll(cx);
  renderSprites(cx);
  runHitDetect();
  updateHUD();

  // FPS HUD
  frames++;
  const elapsed = (t - fpsLast);
  if (elapsed >= 250){ // update every 1/4s for stability
    const fps = Math.round((frames / elapsed) * 1000);
    if (fpsHud) fpsHud.textContent = 'FPS: ' + fps;
    fpsLast = t;
    frames = 0;
  }

  requestAnimationFrame(loop);
}

function boot(){
  try {
    if (statusInfo) statusInfo.textContent = 'Booted';
    initPresets();
    ensureAltSequenceUsesKickAlt();
    initFighters(cv, cx);
    initControls();
    initCombat();
    initHitDetect();
    requestAnimationFrame(loop);
    setTimeout(()=>{ const p=$$('#interactPrompt'); show(p,true); setTimeout(()=>show(p,false),1200); }, 600);
  } catch (e){
    const b=document.getElementById('bootError'), m=document.getElementById('bootErrorMsg');
    if(b&&m){ m.textContent=(e.message||'Unknown error'); b.style.display='block'; }
    console.error(e);
  }
}

(async function start(){
  try { if (window.reloadConfig) await window.reloadConfig(); } catch(_){ }
  applyRenderOrder();
  await initSprites();
  boot();
})();
