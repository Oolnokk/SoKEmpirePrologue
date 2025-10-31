/* config-shims.js — seed resilient defaults before modules run */
(function(){
  const C = (window.CONFIG = window.CONFIG || {});
  C.actor   = Object.assign({ scale: 0.70 }, C.actor || {});
  C.canvas  = Object.assign({ w: 720, h: 460 }, C.canvas || {});
  if (typeof C.groundRatio !== 'number') C.groundRatio = 0.70;

  C.parts   = C.parts || {};
  C.parts.arm    = Object.assign({ upper: 20, lower: 20 }, C.parts.arm || {});
  C.parts.leg    = Object.assign({ upper: 26, lower: 26 }, C.parts.leg || {});
  C.parts.hitbox = Object.assign({ h: 100 }, C.parts.hitbox || {});

  C.colliders = Object.assign({ handMultiplier: 2.0, footMultiplier: 1.0 }, C.colliders || {});
})();
