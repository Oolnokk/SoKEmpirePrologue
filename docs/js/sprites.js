// sprites.js — v19-accurate sprite parenting to bones, with anchoring/xform and fixed draw order
// Loads per-fighter sprite images and draws each sprite parented to the corresponding bone.
// Uses CONFIG.fighters[<name>].sprites with style { widthFactor, xformUnits, anchor, debug, xform }.
// Falls back to G.ANCHORS_OBJ (object bones) or reconstructs from legacy G.ANCHORS arrays.

(function(){
  const W = (window.ASSETS ||= {});
  const CACHE = (W.sprites ||= {});

  function rad(deg){ return (deg||0) * Math.PI / 180; }
  function dist(a,b){ const dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }
  function angle(a,b){ return Math.atan2(b[0]-a[0], -(b[1]-a[1])); } // (sin,-cos) convention
  function segEnd(sx,sy,len,ang){ return [ sx + len*Math.sin(ang), sy - len*Math.cos(ang) ]; }
  function withAX(x,y,ang,ax,ay,unitsLen){
    const L = (unitsLen||1);
    const u = (ax||0) * L, v = (ay||0) * L;
    const dx = u*Math.sin(ang) + v*Math.cos(ang);
    const dy = u*-Math.cos(ang) + v*Math.sin(ang);
    return [x+dx, y+dy];
  }

  function load(url){
    if (!url) return null;
    if (CACHE[url]) return CACHE[url];
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
    CACHE[url] = img;
    return img;
  }

  function pickFighterName(C, G){
    if (G.selectedFighter && C.fighters?.[G.selectedFighter]) return G.selectedFighter;
    if (C.fighters?.TLETINGAN) return 'TLETINGAN';
    const k = Object.keys(C.fighters||{});
    return k.length? k[0] : 'default';
  }

  // Build bones from either object form or legacy arrays
  function getBones(C, G, fname){
    const AO = G.ANCHORS_OBJ?.player;
    if (AO){
      return {
        torso:        { x:AO.torso.x,        y:AO.torso.y,        len:AO.torso.len,        ang:AO.torso.ang },
        head:         { x:AO.head.x,         y:AO.head.y,         len:AO.head.len,         ang:AO.head.ang },
        arm_L_upper:  { x:AO.arm_L_upper.x,  y:AO.arm_L_upper.y,  len:AO.arm_L_upper.len,  ang:AO.arm_L_upper.ang },
        arm_L_lower:  { x:AO.arm_L_lower.x,  y:AO.arm_L_lower.y,  len:AO.arm_L_lower.len,  ang:AO.arm_L_lower.ang },
        arm_R_upper:  { x:AO.arm_R_upper.x,  y:AO.arm_R_upper.y,  len:AO.arm_R_upper.len,  ang:AO.arm_R_upper.ang },
        arm_R_lower:  { x:AO.arm_R_lower.x,  y:AO.arm_R_lower.y,  len:AO.arm_R_lower.len,  ang:AO.arm_R_lower.ang },
        leg_L_upper:  { x:AO.leg_L_upper.x,  y:AO.leg_L_upper.y,  len:AO.leg_L_upper.len,  ang:AO.leg_L_upper.ang },
        leg_L_lower:  { x:AO.leg_L_lower.x,  y:AO.leg_L_lower.y,  len:AO.leg_L_lower.len,  ang:AO.leg_L_lower.ang },
        leg_R_upper:  { x:AO.leg_R_upper.x,  y:AO.leg_R_upper.y,  len:AO.leg_R_upper.len,  ang:AO.leg_R_upper.ang },
        leg_R_lower:  { x:AO.leg_R_lower.x,  y:AO.leg_R_lower.y,  len:AO.leg_R_lower.len,  ang:AO.leg_R_lower.ang }
      };
    }
    const A = G.ANCHORS?.player;
    if (A){
      // reconstruct using legacy arrays (starts and ends)
      const torsoStart = A.torsoBot, torsoEnd = A.torsoTop;
      const lUpStart = A.lShoulderBase, lElbow = A.lElbow, lHand = A.lHand;
      const rUpStart = A.rShoulderBase, rElbow = A.rElbow, rHand = A.rHand;
      const lHipStart = A.lHipBase, lKnee = A.lKnee, lFoot = A.lFoot;
      const rHipStart = A.rHipBase, rKnee = A.rKnee, rFoot = A.rFoot;
      const headStart = A.neckBase || A.torsoTop;

      function boneFrom(start,end){ const len=dist(start,end); const ang=angle(start,end); return { x:start[0], y:start[1], len, ang }; }

      const torso = boneFrom(torsoStart, torsoEnd);
      // head length: use CONFIG like render.js
      const fcfg = (C.fighters?.[fname]) || {}; const headNeck = (fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14) * (C.actor?.scale ?? 1) * (fcfg.actor?.scale ?? 1); const headRad = (fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16) * (C.actor?.scale ?? 1) * (fcfg.actor?.scale ?? 1); const headLen = headNeck + 2*headRad;

      return {
        torso,
        head:        { x:headStart[0], y:headStart[1], len:headLen, ang:torso.ang },
        arm_L_upper:  boneFrom(lUpStart, lElbow),
        arm_L_lower:  boneFrom(lElbow,   lHand),
        arm_R_upper:  boneFrom(rUpStart, rElbow),
        arm_R_lower:  boneFrom(rElbow,   rHand),
        leg_L_upper:  boneFrom(lHipStart, lKnee),
        leg_L_lower:  boneFrom(lKnee,     lFoot),
        leg_R_upper:  boneFrom(rHipStart, rKnee),
        leg_R_lower:  boneFrom(rKnee,     rFoot)
      };
    }
    return null;
  }

  // Core draw: parent sprite to bone midpoint or start depending on style.anchor; then apply xform (ax,ay,rotDeg,scale)
  function drawBoneSprite(ctx, img, bone, styleKey, style){
    if (!img || !img.complete) return;
    const anchorMap = (style.anchor||{});
    const anchor = anchorMap[styleKey] || 'mid'; // 'start' or 'mid' (default mid like v19)
    const t = (anchor === 'start') ? 0.0 : 0.5;
    const px = bone.x + bone.len * t * Math.sin(bone.ang);
    const py = bone.y - bone.len * t * Math.cos(bone.ang);

    const xform = (style.xform||{})[styleKey] || {};
    const units = (style.xformUnits||'percent');
    const Lunit = (units === 'percent') ? bone.len : 1;
    const pos = withAX(px, py, bone.ang, xform.ax||0, xform.ay||0, Lunit);

    const widthFactor = (style.widthFactor && (style.widthFactor[styleKey] ?? style.widthFactor[styleKey.replace(/_.*/, '')])) ?? 1.0;
    const baseH = bone.len * (xform.scaleY != null ? xform.scaleY : 1);
    const aspect = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : 1;
    const baseW = baseH * aspect * (xform.scaleX != null ? xform.scaleX : 1) * widthFactor;

    const theta = bone.ang + rad(xform.rotDeg || 0);

    ctx.save();
    ctx.translate(pos[0], pos[1]);
    ctx.rotate(theta);
    // draw centered on anchor (v19 behavior)
    ctx.drawImage(img, -baseW/2, -baseH/2, baseW, baseH);

    // debug gizmo if requested
    const dbg = (style.debug||{});
    if (dbg[styleKey]){
      ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fillStyle = '#00e5ff'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(baseW*0.25,0); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth=2; ctx.stroke();
    }
    ctx.restore();
  }

  // Fixed draw order from your spec
  const DRAW_ORDER = [
    'arm_R_lower','arm_R_upper','leg_R_lower','leg_R_upper','head','torso','leg_L_upper','leg_L_lower','arm_L_upper','arm_L_lower'
  ];

  function resolveImages(spriteConf){
    return {
      torso: load(spriteConf.torso),
      head:  load(spriteConf.head),
      arm_L_upper: load(spriteConf.arm?.upper),
      arm_L_lower: load(spriteConf.arm?.lower),
      arm_R_upper: load(spriteConf.arm?.upper), // same art mirrored by world transform
      arm_R_lower: load(spriteConf.arm?.lower),
      leg_L_upper: load(spriteConf.leg?.upper),
      leg_L_lower: load(spriteConf.leg?.lower),
      leg_R_upper: load(spriteConf.leg?.upper),
      leg_R_lower: load(spriteConf.leg?.lower)
    };
  }

  function ensureFighterSprites(C, G, fname){
    const f = C.fighters?.[fname];
    const S = (f?.sprites) || {};
    const imgs = resolveImages(S);
    return { imgs, style: (S.style||{}) };
  }

  function drawFighterSprites(ctx, C, G){
    const fname = pickFighterName(C, G);
    const rig = getBones(C, G, fname);
    if (!rig) return;
    const pack = ensureFighterSprites(C, G, fname);
    const { imgs, style } = pack;

    for (const key of DRAW_ORDER){
      const img = imgs[key]; const bone = rig[key];
      if (!bone) continue;
      const styleKey = mapStyleKey(key);
      drawBoneSprite(ctx, img, bone, styleKey, style);
    }
  }

  function mapStyleKey(boneKey){
    // Convert bone keys to style keys in CONFIG.style maps
    switch (boneKey){
      case 'arm_L_upper':
      case 'arm_R_upper': return 'armUpper';
      case 'arm_L_lower':
      case 'arm_R_lower': return 'armLower';
      case 'leg_L_upper':
      case 'leg_R_upper': return 'legUpper';
      case 'leg_L_lower':
      case 'leg_R_lower': return 'legLower';
      case 'head': return 'head';
      case 'torso': return 'torso';
      default: return boneKey;
    }
  }

  function renderSprites(ctx){
    const G = (window.GAME ||= {});
    const C = (window.CONFIG || {});
    if (!ctx || !G.FIGHTERS) return;
    drawFighterSprites(ctx, C, G);
  }

  // Export
  window.renderSprites = renderSprites;
  console.log('[sprites] ready for', (window.CONFIG?.fighters?.TLETINGAN ? 'TLETINGAN' : 'default'));
})();
