import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js';
import { initFighters } from './fighter.js';
import { initControls } from './controls.js';

(function boot(){
  const statusInfo = document.getElementById('statusInfo');
  const cv = document.getElementById('game');
  const cx = cv.getContext('2d');

  // Initialize presets & fighters
  initPresets();
  const GAME = initFighters(cv, cx);
  ensureAltSequenceUsesKickAlt();
  initControls();

  // Canvas sizing / world metrics
  function resizeCanvas(){
    const ratio = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * ratio);
    cv.height = Math.round(rect.height * ratio);
    cx.setTransform(ratio, 0, 0, ratio, 0, 0);
    window.CONFIG.canvas.w = cv.width / ratio;
    window.CONFIG.canvas.h = cv.height / ratio;
  }
  window.addEventListener('resize', resizeCanvas, { passive:true });
  resizeCanvas();

  // Simple loop to keep HUD & canvas alive while deeper systems are refactored
  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t - last) / 1000); // clamp to ~30 FPS step
    last = t;

    // Regen stamina a bit for the demo
    const P = GAME.FIGHTERS.player;
    P.stamina.current = Math.min(P.stamina.max, P.stamina.current + (P.stamina.regenRate * dt));

    // Clear and draw a simple background grid as a 'stage'
    const cv = GAME.cv, cx = GAME.cx;
    cx.clearRect(0,0,cv.width,cv.height);
    cx.globalAlpha = 0.08;
    for (let x=0; x<cv.width; x+=20){ cx.fillRect(x,0,1,cv.height); }
    for (let y=0; y<cv.height; y+=20){ cx.fillRect(0,y,cv.width,1); }
    cx.globalAlpha = 1;

    // (Stub) draw active colliders if any positions are known (in later passes these will be filled by skeleton draw)
    const hasAny = GAME.COLLIDERS_POS.handL || GAME.COLLIDERS_POS.handR || GAME.COLLIDERS_POS.footL || GAME.COLLIDERS_POS.footR;
    if (hasAny){
      GAME.colliders.drawAttackColliders();
    }

    // HUD
    GAME.updateHUD?.();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  if (statusInfo) statusInfo.textContent = 'Game initialized successfully! All systems operational.';
  console.log('[boot] Modular app started');
})();
