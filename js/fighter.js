// Fighter state, helpers, and collider drawing.
// Exposes initFighters() which sets up globals on window.GAME.
export function initFighters(cv, cx){
  const C = window.CONFIG;
  const GAME = window.GAME ||= {};
  GAME.cv = cv; GAME.cx = cx;

  // ===== Helpers =====
  const TAU = Math.PI * 2;
  const deg2rad = (d)=>d*Math.PI/180;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const now=()=>performance.now();
  const segPos=(x,y,len,ang)=>[x + Math.cos(ang)*len, y + Math.sin(ang)*len];
  function withAX(x,y,ang,off){ return [x + Math.cos(ang)*(off[0]||0) - Math.sin(ang)*(off[1]||0), y + Math.sin(ang)*(off[0]||0) + Math.cos(ang)*(off[1]||0)]; }

  // Expose for other modules
  GAME.math = { TAU, deg2rad, clamp, lerp, now, segPos, withAX };

  // ===== Compute endpoints for limbs (used by colliders) =====
  function computeArmEnd(baseX, baseY, shoulderRel, elbowRel){
    let x = baseX, y = baseY;
    const offUpper = C.offsets?.arm?.upper;
    if (offUpper?.origin){ [x, y] = withAX(x, y, shoulderRel, offUpper.origin); }
    const upperLen = (C.parts.arm.upper || 0) * C.actor.scale;
    let elbow = segPos(x, y, upperLen, shoulderRel);
    if (offUpper?.elbow){ elbow = withAX(elbow[0], elbow[1], shoulderRel, offUpper.elbow); }
    const foreAng = shoulderRel + elbowRel;
    const offLower = C.offsets?.arm?.lower;
    let wristStart = elbow;
    if (offLower?.origin){ wristStart = withAX(elbow[0], elbow[1], foreAng, offLower.origin); }
    const lowerLen = (C.parts.arm.lower || 0) * C.actor.scale;
    const wrist = segPos(wristStart[0], wristStart[1], lowerLen, foreAng);
    return { x: wrist[0], y: wrist[1] };
  }
  function computeFootEnd(baseX, baseY, hipAng, kneeRel){
    let x = baseX, y = baseY;
    const legOff = C.offsets?.leg;
    if (legOff?.upper?.origin){ [x, y] = withAX(x, y, hipAng, legOff.upper.origin); }
    const upperLen = (C.parts.leg.upper || 0) * C.actor.scale;
    let knee = segPos(x, y, upperLen, hipAng);
    if (legOff?.upper?.knee){ knee = withAX(knee[0], knee[1], hipAng, legOff.upper.knee); }
    const shinAng = hipAng + kneeRel;
    let ankleStart = knee;
    if (legOff?.lower?.origin){ ankleStart = withAX(knee[0], knee[1], shinAng, legOff.lower.origin); }
    const lowerLen = (C.parts.leg.lower || 0) * C.actor.scale;
    const foot = segPos(ankleStart[0], ankleStart[1], lowerLen, shinAng);
    return { x: foot[0], y: foot[1] };
  }

  // Expose
  GAME.kin = { computeArmEnd, computeFootEnd };

  // ===== Colliders =====
  const COLLIDERS_POS = GAME.COLLIDERS_POS = {
    handL: null, handR: null, footL: null, footR: null,
    hitCenter: { x: 0, y: 0 }, lunge: null
  };

  function getActiveColliders(){
    const ATTACK = GAME.FIGHTERS?.player?.attack;
    if (!ATTACK || !ATTACK.active) return [];
    const preset = (ATTACK.preset || '').toUpperCase();
    if (preset.startsWith('KICK')) return ['footL','footR'];
    if (preset.startsWith('PUNCH')) return ['handL','handR'];
    return ['handL','handR','footL','footR'];
  }

  function drawAttackColliders(posObj, activeKeys=[], collisionKeys=[], hitCounts={}, facingRad=0){
    const target = posObj || COLLIDERS_POS;
    const active = Array.isArray(activeKeys) ? activeKeys : getActiveColliders();
    const collisions = Array.isArray(collisionKeys) ? collisionKeys : [];
    const counts = hitCounts || {};
    const baseRadius = 8 * C.actor.scale;

    cx.save();
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `${Math.round(8 * C.actor.scale)}px system-ui, sans-serif`;
    for (const key of ['handL','handR','footL','footR']){
      const pos = target[key];
      if (!pos) continue;
      let radius = baseRadius;
      if (key === 'handL' || key === 'handR') radius *= C.colliders.handMultiplier;
      else if (key === 'footL' || key === 'footR') radius *= C.colliders.footMultiplier;

      cx.beginPath();
      cx.arc(pos.x, pos.y, radius, 0, Math.PI*2);
      let color;
      if (collisions.includes(key)) color = 'rgba(255, 60, 60, 0.9)';
      else if (active.includes(key)) color = 'rgba(255, 120, 80, 0.8)';
      else color = 'rgba(255, 255, 255, 0.25)';
      cx.fillStyle = color;
      cx.fill();
      const cnt = counts[key] || 0;
      if (cnt > 0){ cx.fillStyle = '#ffffff'; cx.fillText(String(cnt), pos.x, pos.y); }
    }
    cx.restore();
  }

  GAME.colliders = { getActiveColliders, drawAttackColliders };

  // ===== Fighter factory =====
  function createFighter(config){
    return {
      id: config.id,
      isPlayer: !!config.isPlayer,
      pos: config.pos || {x: 0, y: 0},
      vel: {x: 0, y: 0},
      onGround: true,
      prevOnGround: true,
      landedImpulse: 0,
      facingRad: config.facingRad || 0,
      footing: config.footing ?? 50,
      ragdoll: false,
      ragdollTime: 0,
      ragdollVel: {x: 0, y: 0},
      jointAngles: {},
      recovering: false,
      recoveryTime: 0, recoveryDuration: 0.8,
      recoveryStartAngles: {}, recoveryStartY: 0, recoveryTargetY: 0,
      stamina: { current: config.stamina ?? 100, max: 100, drainRate: 40, regenRate: 25, minToDash: 10, isDashing: false },
      attack: { active:false, preset:null, slot:null, facingRadAtPress:0, dirSign:1, downT:0, holdStartTime:0, holdWindupDuration:0, isHoldRelease:false, strikeLanded:false, currentPhase:null, currentActiveKeys:[], sequence:[], durations:[], phaseIndex:0, timer:0,
        lunge:{ active:false, paused:false, distance:0, targetDistance:60, speed:400, lungeVel:{x:0, y:0} } },
      aim: { targetAngle:0, currentAngle:0, torsoOffset:0, shoulderOffset:0, hipOffset:0, active:false },
      combo: { active:false, sequenceIndex:0, attackDelay:0 },
      walk: { phase:0, amp:0 },
      input: config.isPlayer ? {left:false,right:false,jump:false,dash:false} : null,
      ai: config.ai ? { mode:'approach', timer:0, cooldown:0 } : null,
      trailColor: config.trailColor || 'cyan'
    };
  }

  const groundY = (C.canvas.h * (C.groundRatio || 0.7));
  const FIGHTERS = {
    player: createFighter({
      id:'player', isPlayer:true,
      pos: { x: (C.canvas.w/2), y: groundY - C.parts.hitbox.h/2 },
      facingRad: 0, footing: 50, stamina: 100, trailColor: 'cyan'
    }),
    npc: createFighter({
      id:'npc', pos: { x: (C.canvas.w * 0.75), y: groundY - (C.parts.hitbox.h * C.actor.scale) / 2 },
      facingRad: Math.PI, footing:100, stamina:100, trailColor:'red', ai:true
    })
  };

  GAME.FIGHTERS = FIGHTERS;
  GAME.MOVE = FIGHTERS.player;
  GAME.STAMINA = FIGHTERS.player.stamina;

  // Camera & mouse
  GAME.CAMERA = { x: 0, smoothing: 0.15, worldWidth: 1600 };
  GAME.MOUSE = { isDown: false, x:0, y:0, worldX:0, worldY:0, isInCanvas:false };

  // Hit counters
  GAME.HIT_COUNTS = {
    player: { handL: 0, handR: 0, footL: 0, footR: 0 },
    npc:    { handL: 0, handR: 0, footL: 0, footR: 0, body: 0 }
  };

  console.log('[initFighters] Fighters initialized', GAME.FIGHTERS);
  return GAME;
}
