// hitdetect.js — simple collider vs. NPC body hit detection
export function initHitDetect(){
  const G = window.GAME ||= {};
  G.HITDEBUG = { lastPhase: null, collidedThisPhase: false, lastColliders: [] };
  return G;
}

export function runHitDetect(){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!G.FIGHTERS || !G.COLLIDERS_POS) return;
  const P = G.FIGHTERS.player;
  const N = G.FIGHTERS.npc;
  if (!P || !N) return;

  // Basic body circle for NPC
  const s = C.actor?.scale ?? 0.7;
  const bodyR = (C.parts?.hitbox?.h ?? 100) * s * 0.28;
  const bodyX = N.pos.x;
  const bodyY = N.pos.y;

  // Reset phase bookkeeping on phase change
  const phase = P.attack?.currentPhase || 'Stance';
  if (G.HITDEBUG?.lastPhase !== phase){
    G.HITDEBUG.lastPhase = phase;
    G.HITDEBUG.collidedThisPhase = false;
  }

  // Only allow scoring in Strike phase
  if (!(P.attack?.active && phase.toLowerCase().includes('strike'))) return;

  const activeKeys = G.colliders?.getActiveColliders?.() || [];
  const collisions = [];
  for (const key of activeKeys){
    const pos = G.COLLIDERS_POS[key];
    if (!pos) continue;
    const dx = pos.x - bodyX;
    const dy = pos.y - bodyY;
    if ((dx*dx + dy*dy) <= (bodyR*bodyR)) collisions.push(key);
  }

  G.HITDEBUG.lastColliders = collisions;

  if (collisions.length && !G.HITDEBUG.collidedThisPhase){
    // Register a single hit per strike phase
    G.HITDEBUG.collidedThisPhase = true;
    // Increment counts
    const hc = G.HIT_COUNTS?.npc;
    if (hc){ for (const k of collisions){ hc[k] = (hc[k]||0) + 1; } hc.body = (hc.body||0) + 1; }
    const context = P.attack?.context;
    if (context && typeof context.onHit === 'function'){
      try {
        context.onHit(N, collisions);
      } catch(err){
        console.warn('[hitdetect] onHit handler error', err);
      }
    } else {
      const dir = Math.cos(P.facingRad) >= 0 ? 1 : -1;
      N.pos.x += 8 * dir;
    }
  }

  // Optional: overdraw colliders with collision tint
  if (G.colliders?.drawAttackColliders){
    G.colliders.drawAttackColliders(G.COLLIDERS_POS, activeKeys, G.HITDEBUG.lastColliders, G.HIT_COUNTS?.npc);
  }
}
