import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js';
import { initFighters } from './fighter.js';
import { initControls } from './controls.js';
import { initCombat } from './combat.js';

const $$ = (sel, el=document) => el.querySelector(sel);
function show(el, v){ if(!el) return; el.style.display = v ? '' : 'none'; }

// Setup canvas
const cv = $$('#game');
const cx = cv?.getContext('2d');
window.GAME ||= {};

// HUD refs
const staminaFill = $$('#staminaFill');
const footingFill = $$('#footingFill');
const healthFill = $$('#healthFill');
const statusInfo = $$('#statusInfo');

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
  cx.clearRect(0,0,cv.width,cv.height);
  cx.fillStyle = '#0b1220';
  cx.fillRect(0,0,cv.width,cv.height);
  // ground
  const gy = (C.canvas?.h||460) * (C.groundRatio||0.7);
  cx.strokeStyle = 'rgba(255,255,255,.15)';
  cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(cv.width, gy); cx.stroke();
  cx.fillStyle = '#93c5fd';
  cx.fillText('KHY Modular Build', 14, 22);
}

let last = performance.now();
function loop(t){
  const dt = (t - last) / 1000; last = t;
  if (window.GAME?.combat) window.GAME.combat.tick(dt);
  drawStage();
  updateHUD();
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
    requestAnimationFrame(loop);
    setTimeout(()=>{ const p=$$('#interactPrompt'); show(p,true); setTimeout(()=>show(p,false),1200); }, 600);
  } catch (e){
    const b=document.getElementById('bootError'), m=document.getElementById('bootErrorMsg');
    if(b&&m){ m.textContent=(e.message||'Unknown error'); b.style.display='block'; }
    console.error(e);
  }
}

boot();
