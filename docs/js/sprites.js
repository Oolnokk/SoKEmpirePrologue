/* sprites.js — v2 aligned to khy-stage-game-v19.html
   - Single draw path for all parts
   - Limb sprites: joint at TOP-CENTER of image
   - Torso/head respect CONFIG.sprites.style.xform.rotDeg (deg)
   - Minimal, dependency-free debug overlay (toggle with ?debug=1)
*/

(() => {
  'use strict';

  // ====== Utilities kept tiny on purpose ======
  const TAU = Math.PI * 2;
  const deg2rad = (d) => d * Math.PI / 180;

  // Query toggle: add ?debug=1 to URL
  const DEBUG = (() => {
    try { return new URLSearchParams(location.search).get('debug') === '1'; }
    catch (_) { return false; }
  })();

  function debugAxes(ctx, size = 22, lw = 2) {
    ctx.save();
    ctx.lineWidth = lw;
    // X
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size, 0); ctx.stroke();
    // Y
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, size); ctx.stroke();
    ctx.restore();
  }

  function debugRect(ctx, x, y, w, h) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function debugLabel(ctx, text) {
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#9aa6b2';
    ctx.fillText(text, 6, 6);
    ctx.restore();
  }

  // Compute a point offset along a direction by percent units (kept for parity with demo)
  function withAX(x, y, ang, axay) {
    if (!axay) return [x, y];
    const ax = +axay.ax || 0; // % in "xformUnits: percent"
    const ay = +axay.ay || 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return [x + ax * ca - ay * sa, y + ax * sa + ay * ca];
  }

  // Accessors into CONFIG, defensively
  function getStyleXform(key) {
    const s = (window.CONFIG && window.CONFIG.sprites && window.CONFIG.sprites.style) || {};
    const xf = (s.xform && s.xform[key]) || { ax: 0, ay: 0, scaleX: 1, scaleY: 1, rotDeg: 0 };
    return {
      ax: +xf.ax || 0,
      ay: +xf.ay || 0,
      scaleX: +xf.scaleX || 1,
      scaleY: +xf.scaleY || 1,
      rotDeg: +xf.rotDeg || 0
    };
  }

  function getWidthFactor(key) {
    const wf = (window.CONFIG && window.CONFIG.sprites && window.CONFIG.sprites.style && window.CONFIG.sprites.style.widthFactor) || {};
    return +wf[key] || 1;
  }

  // Resolve image from your sprite cache (matches your HTML demo structure)
  function getSpriteImage(key) {
    const c = window.SPRITES && window.SPRITES.cache;
    const img = c && c[key];
    return img && img.complete ? img : null;
  }

  // ====== Core draw: matches khy-stage-game-v19.html behavior ======
  // Signature reused from your repo calls:
  // drawBoneSprite(x, y, segLen, baseAngle, key, widthFactorOverride)
  window.drawBoneSprite = function drawBoneSprite(x, y, segLen, baseAng, partKey, wfOverride) {
    const img = getSpriteImage(partKey);
    if (!img) return;

    // 1) pull per-part style from CONFIG
    const xf = getStyleXform(partKey);
    const partRot = deg2rad(xf.rotDeg);   // torso/head often use 180 deg here
    const sx = xf.scaleX, sy = xf.scaleY;

    // 2) angle = bone direction + per-part rot (mirrors the demo)
    const ang = baseAng + partRot;

    const ctx = window.cx || (window.cv && window.cv.getContext && window.cv.getContext('2d'));
    if (!ctx) return;

    ctx.save();

    // 3) world translate to bone start (origin/joint)
    ctx.translate(x, y);

    // 4) rotate to face along the bone (plus partRot)
    ctx.rotate(ang);

    // 5) local scale (mirroring handled by caller’s local flip blocks, same as demo)
    ctx.scale(sx, sy);

    // 6) width scaling: in the demo, widthFactor multiplies image width; it's passed from caller.
    const wf = (wfOverride != null ? wfOverride : getWidthFactor(partKey)) || 1;
    const drawW = img.width * wf;
    const drawH = img.height;

    // 7) TOP-CENTER is the joint
    const drawX = -drawW * 0.5;
    const drawY = 0;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    if (DEBUG) {
      debugAxes(ctx);
      debugRect(ctx, drawX, drawY, drawW, drawH);
      debugLabel(ctx, partKey);
    }
    ctx.restore();
  };

  // ====== Convenience wrapper for torso/head if needed ======
  window.drawSpriteWithPivot = function drawSpriteWithPivot(opts) {
    const {
      x, y, baseAng = 0, partKey,
      pivot = { x: 0.5, y: 0.0 } // normalized [0..1], default top-center
    } = opts || {};
    const img = getSpriteImage(partKey);
    if (!img) return;

    const xf = getStyleXform(partKey);
    const sx = xf.scaleX, sy = xf.scaleY;
    const partRot = deg2rad(xf.rotDeg);
    const ang = baseAng + partRot;

    const ctx = window.cx || (window.cv && window.cv.getContext && window.cv.getContext('2d'));
    if (!ctx) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(sx, sy);

    const drawX = -img.width * pivot.x;
    const drawY = -img.height * pivot.y;
    ctx.drawImage(img, drawX, drawY);

    if (DEBUG) {
      debugAxes(ctx);
      debugRect(ctx, drawX, drawY, img.width, img.height);
      debugLabel(ctx, partKey);
    }
    ctx.restore();
  };

  // ====== Back-compat / graceful torso missing ======
  function ensureTorsoAlias() {
    const S = window.SPRITES;
    if (!S || !S.cache) return;
    if (!S.cache.torso && S.cache.body) {
      S.cache.torso = S.cache.body; // alias
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTorsoAlias);
  } else {
    ensureTorsoAlias();
  }

})();
