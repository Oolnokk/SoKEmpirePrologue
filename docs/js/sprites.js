// sprites.js — v19 sprite parenting + local flip (ESM exports)
// Exports: initSprites(), renderSprites(ctx)

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});

function rad(deg){ return (deg||0) * Math.PI / 180; }
function dist(a,b){ const dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }
function angle(a,b){ return Math.atan2(b[0]-a[0], -(b[1]-a[1])); } // (sin,-cos) convention
function segEnd(sx,sy,len,ang){ return [ sx + len*Math.sin(ang), sy - len*Math.cos(ang) ]; }
function withAX(x,y,ang,ax,ay,unitsLen){ const L=(unitsLen||1); const u=(ax||0)*L, v=(ay||0)*L; const dx=u*Math.sin(ang)+v*Math.cos(ang); const dy=u*-Math.cos(ang)+v*Math.sin(ang); return [x+dx,y+dy]; }
function load(url){ if(!url) return null; if(CACHE[url]) return CACHE[url]; const img=new Image(); img.crossOrigin='anonymous'; img.src=url; CACHE[url]=img; return img; }

function pickFighterName(C,G){ if(G.selectedFighter && C.fighters?.[G.selectedFighter]) return G.selectedFighter; if(C.fighters?.TLETINGAN) return 'TLETINGAN'; const k=Object.keys(C.fighters||{}); return k.length?k[0]:'default'; }

function getBones(C,G,fname){
  const AO = G.ANCHORS_OBJ?.player;
  if (AO){
    return {
      torso: AO.torso, head: AO.head,
      arm_L_upper: AO.arm_L_upper, arm_L_lower: AO.arm_L_lower,
      arm_R_upper: AO.arm_R_upper, arm_R_lower: AO.arm_R_lower,
      leg_L_upper: AO.leg_L_upper, leg_L_lower: AO.leg_L_lower,
      leg_R_upper: AO.leg_R_upper, leg_R_lower: AO.leg_R_lower
    };
  }
  const A = G.ANCHORS?.player;
  if (A){
    const torsoStart=A.torsoBot, torsoEnd=A.torsoTop;
    const lUpStart=A.lShoulderBase, lElbow=A.lElbow, lHand=A.lHand;
    const rUpStart=A.rShoulderBase, rElbow=A.rElbow, rHand=A.rHand;
    const lHipStart=A.lHipBase, lKnee=A.lKnee, lFoot=A.lFoot;
    const rHipStart=A.rHipBase, rKnee=A.rKnee, rFoot=A.rFoot;
    const headStart=A.neckBase || A.torsoTop;
    function boneFrom(s,e){ const len=dist(s,e); const ang=angle(s,e); return {x:s[0],y:s[1],len,ang}; }
    const torso = boneFrom(torsoStart, torsoEnd);
    const fcfg = (C.fighters?.[fname]) || {};
    const headNeck=(fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14)*(C.actor?.scale ?? 1)*(fcfg.actor?.scale ?? 1);
    const headRad=(fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16)*(C.actor?.scale ?? 1)*(fcfg.actor?.scale ?? 1);
    const headLen=headNeck+2*headRad;
    return {
      torso,
      head:{x:headStart[0],y:headStart[1],len:headLen,ang:torso.ang},
      arm_L_upper:boneFrom(lUpStart,lElbow),
      arm_L_lower:boneFrom(lElbow,lHand),
      arm_R_upper:boneFrom(rUpStart,rElbow),
      arm_R_lower:boneFrom(rElbow,rHand),
      leg_L_upper:boneFrom(lHipStart,lKnee),
      leg_L_lower:boneFrom(lKnee,lFoot),
      leg_R_upper:boneFrom(rHipStart,rKnee),
      leg_R_lower:boneFrom(rKnee,rFoot)
    };
  }
  return null;
}

const DRAW_ORDER = [
  'arm_R_lower','arm_R_upper','leg_R_lower','leg_R_upper','head','torso','leg_L_upper','leg_L_lower','arm_L_upper','arm_L_lower'
];

function resolveImages(spriteConf){
  return {
    torso: load(spriteConf.torso),
    head:  load(spriteConf.head),
    arm_L_upper: load(spriteConf.arm?.upper),
    arm_L_lower: load(spriteConf.arm?.lower),
    arm_R_upper: load(spriteConf.arm?.upper),
    arm_R_lower: load(spriteConf.arm?.lower),
    leg_L_upper: load(spriteConf.leg?.upper),
    leg_L_lower: load(spriteConf.leg?.lower),
    leg_R_upper: load(spriteConf.leg?.upper),
    leg_R_lower: load(spriteConf.leg?.lower)
  };
}

function ensureFighterSprites(C,G,fname){
  const f=C.fighters?.[fname]; const S=(f?.sprites)||{}; const imgs=resolveImages(S); return { imgs, style:(S.style||{}) };
}

function mapStyleKey(boneKey){
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

function drawBoneSprite(ctx, img, bone, styleKey, style, flip){
  if (!img || !img.complete) return;
  const anchorMap = (style.anchor||{});
  const anchor = anchorMap[styleKey] || 'mid';
  const t = (anchor === 'start') ? 0.0 : 0.5;
  // position from bone
  const px = bone.x + bone.len * t * Math.sin(bone.ang);
  const py = bone.y - bone.len * t * Math.cos(bone.ang);

  const xform = (style.xform||{})[styleKey] || {};
  const units = (style.xformUnits||'percent');
  const Lunit = (units === 'percent') ? bone.len : 1;
  const pos = withAX(px, py, bone.ang, xform.ax||0, xform.ay||0, Lunit);

  // === v19 sizing rules (no double-apply of scaleY to width) ===
  const nh = img.naturalHeight || img.height || 1;
  const nw = img.naturalWidth  || img.width  || 1;
  const baseH = Math.max(1, bone.len);
  const s = baseH / nh;
  let w = nw * s * ((style.widthFactor && (style.widthFactor[styleKey] ?? style.widthFactor[styleKey?.replace(/_.*/, '')])) || 1);
  let h = baseH;
  const sx = (xform.scaleX==null?1:xform.scaleX);
  const sy = (xform.scaleY==null?1:xform.scaleY);
  w *= sx; h *= sy;

  // rotation matches v19: add +PI baseline so art oriented upright by default
  const theta = bone.ang + rad(xform.rotDeg || 0) + Math.PI;

  ctx.save();
  ctx.translate(pos[0], pos[1]);
  ctx.rotate(theta);
  if (flip){ ctx.scale(-1, 1); }
  ctx.drawImage(img, -w/2, -h/2, w, h);

  const dbg = (style.debug||{});
  if (dbg[styleKey]){ ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fillStyle = '#00e5ff'; ctx.fill(); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w*0.25,0); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth=2; ctx.stroke(); }
  ctx.restore();
}

function drawFighterSprites(ctx, C, G){
  const fname = pickFighterName(C, G);
  const rig = getBones(C, G, fname);
  if (!rig) return;
  const pack = ensureFighterSprites(C, G, fname);
  const { imgs, style } = pack;
  const flip = (G.FIGHTERS?.player?.facingSign || 1) < 0;
  for (const key of DRAW_ORDER){ const img = imgs[key]; const bone = rig[key]; if (!bone) continue; const styleKey = mapStyleKey(key); drawBoneSprite(ctx, img, bone, styleKey, style, flip); }
}

export function renderSprites(ctx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  if (!ctx || !G.FIGHTERS) return;
  drawFighterSprites(ctx, C, G);
}

export function initSprites(){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C, G);
  const f=C.fighters?.[fname];
  const S=(f?.sprites)||{};
  resolveImages(S);
  console.log('[sprites] ready (ESM v19 parenting + local flip) for', fname);
}
