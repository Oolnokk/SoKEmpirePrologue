export function initControls(){
  const GAME = window.GAME || {};
  const on = (el,ev,fn)=>{ if(el) el.addEventListener(ev,fn,{passive:false}); };
  const prevent = (e)=>{ e.preventDefault(); e.stopPropagation(); };
  const joyArea = document.getElementById('joystickArea');
  const joyStick = document.getElementById('joystickStick');
  const btnA = document.getElementById('btnAttackA');
  const btnB = document.getElementById('btnAttackB');
  const btnJump = document.getElementById('btnJump');
  const btnInteract = document.getElementById('btnInteract');
  const P = GAME.FIGHTERS && GAME.FIGHTERS.player;
  function setDir(dx,dy){ if(!P) return; P.input.left = dx < -0.2; P.input.right = dx > 0.2; }
  let start=null;
  function setStick(x,y){ if(!joyStick) return; joyStick.style.transform = 'translate(calc(-50% + '+x+'px), calc(-50% + '+y+'px))'; }
  on(joyArea,'touchstart',function(e){ prevent(e); var t=e.touches[0]; var r=joyArea.getBoundingClientRect(); start={x:t.clientX-r.left,y:t.clientY-r.top}; setStick(0,0); });
  on(joyArea,'touchmove',function(e){ prevent(e); if(!start) return; var t=e.touches[0]; var r=joyArea.getBoundingClientRect(); var dx=(t.clientX-r.left)-start.x; var dy=(t.clientY-r.top)-start.y; var lim=50; var nx=(dx/lim); var ny=(dy/lim); if (nx<-1) nx=-1; if(nx>1) nx=1; if(ny<-1) ny=-1; if(ny>1) ny=1; setDir(nx, ny); setStick(nx*lim, ny*lim); });
  on(joyArea,'touchend',function(e){ prevent(e); start=null; setDir(0,0); setStick(0,0); });
  on(document,'keydown',function(e){ if(!P) return; if(e.key==='a'||e.key==='ArrowLeft') P.input.left = true; if(e.key==='d'||e.key==='ArrowRight') P.input.right = true; if(e.key==='w'||e.key===' ') P.input.jump = true; if(e.key==='e') P.input.dash=true; });
  on(document,'keyup',function(e){ if(!P) return; if(e.key==='a'||e.key==='ArrowLeft') P.input.left = false; if(e.key==='d'||e.key==='ArrowRight') P.input.right = false; if(e.key==='w'||e.key===' ') P.input.jump = false; if(e.key==='e') P.input.dash=false; });
  on(btnA,'click',function(){ if(!P) return; P.attack.active = true; P.attack.preset = 'KICK'; P.attack.timer = 0; });
  on(btnB,'click',function(){ if(!P) return; P.attack.active = true; P.attack.preset = 'PUNCH'; P.attack.timer = 0; });
  on(btnJump,'click',function(){ if(!P) return; P.input.jump = true; setTimeout(function(){ P.input.jump=false; },180); });
  on(btnInteract,'click',function(){ var prompt = document.getElementById('interactPrompt'); if(prompt){ prompt.style.display='block'; setTimeout(function(){ prompt.style.display='none'; }, 1000); } });
  console.log('[controls] wired');
  return GAME;
}
