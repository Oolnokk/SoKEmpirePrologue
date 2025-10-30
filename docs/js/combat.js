export function initCombat(){
  const GAME = window.GAME ||= {};
  const C = window.CONFIG || {};
  function usePreset(name){ return (C.presets && C.presets[name]) || null; }
  function startAttack(P, name){ const preset = usePreset(name); if(!preset){ P.attack.active=false; return; } P.attack.active=true; P.attack.preset=name; P.attack.timer=0; P.attack.phaseIndex=0; P.attack.sequence = (preset.sequence||[{pose:'Windup', durKey:'toWindup'},{pose:'Strike', durKey:'toStrike'},{pose:'Recoil', durKey:'toRecoil'},{pose:'Stance', durKey:'toStance'}]); }
  function updateAttack(P, dt){ if(!P.attack.active) return; const preset = usePreset(P.attack.preset); if(!preset){ P.attack.active=false; return; } const seq = P.attack.sequence; if(!seq||seq.length===0){ P.attack.active=false; return; } const cur = seq[P.attack.phaseIndex]; let dur = cur.durMs || 0; if (!dur && cur.durKey && preset.durations){ dur = preset.durations[cur.durKey] || 0; } P.attack.timer += dt*1000; if (P.attack.timer >= dur){ P.attack.timer = 0; P.attack.phaseIndex++; if (P.attack.phaseIndex >= seq.length){ P.attack.active=false; } } }
  function updateStamina(P, dt){ const S = P.stamina; if (!S) return; if (P.attack.active) S.current = Math.max(0, S.current - S.drainRate*dt); else S.current = Math.min(S.max, S.current + S.regenRate*dt); }
  function updateMovement(P, dt){ const input = P.input; if(!input) return; const sp = 140; if (input.left) P.pos.x -= sp*dt; if (input.right) P.pos.x += sp*dt; if (input.jump && P.onGround){ P.vel.y = -280; P.onGround=false; } P.vel.y += 700*dt; P.pos.y += P.vel.y*dt; const ground = (C.canvas?.h||460) * (C.groundRatio||0.7); const hb = (C.parts?.hitbox?.h||100) * (C.actor?.scale||0.7); const maxY = ground - hb/2; if (P.pos.y >= maxY){ P.pos.y = maxY; P.vel.y = 0; P.onGround = true; } }
  function tick(dt){ const P = GAME.FIGHTERS?.player; if(!P) return; updateMovement(P, dt); updateAttack(P, dt); updateStamina(P, dt); }
  function wireButtons(){ const A=document.getElementById('btnAttackA'); const B=document.getElementById('btnAttackB'); if(A) A.addEventListener('click',()=>startAttack(GAME.FIGHTERS.player, 'KICK')); if(B) B.addEventListener('click',()=>startAttack(GAME.FIGHTERS.player, 'PUNCH')); }
  wireButtons();
  GAME.combat = { startAttack, tick };
  return GAME;
}
