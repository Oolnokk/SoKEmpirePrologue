// controls.js — keyboard/mouse input → window.GAME.input with edge taps
// A/D move, Space/W jump (reserved), J/MouseLeft = button1, K/MouseRight = button2

export function initControls(){
  const G = (window.GAME ||= {});
  G.input ||= { left:false, right:false, jump:false, dash:false, button1:false, button2:false, _taps:{} };
  const I = G.input;
  const setTap = (k)=>{ I._taps[k] = true; };
  const setKey = (k, v)=>{ const was = !!I[k]; I[k] = !!v; if (v && !was && (k==='button1' || k==='button2')) setTap(k+'Tap'); };

  function onKey(e, down){
    switch(e.code){
      case 'KeyA': setKey('left', down); break;
      case 'KeyD': setKey('right', down); break;
      case 'KeyW': case 'Space': setKey('jump', down); break;
      case 'KeyJ': setKey('button1', down); break;
      case 'KeyK': setKey('button2', down); break;
      default: return;
    }
    e.preventDefault();
  }
  function onMouse(e, down){
    if (e.button===0) setKey('button1', down);
    else if (e.button===2) setKey('button2', down);
  }

  window.addEventListener('keydown', e=>onKey(e,true));
  window.addEventListener('keyup',   e=>onKey(e,false));
  window.addEventListener('mousedown', e=>onMouse(e,true));
  window.addEventListener('mouseup',   e=>onMouse(e,false));
  window.addEventListener('blur', ()=>{ Object.assign(I,{left:false,right:false,jump:false,dash:false,button1:false,button2:false}); I._taps={}; });

  console.log('[controls] wired');
}

export function consumeTaps(){ const I = (window.GAME?.input)||{}; const t = I._taps||{}; I._taps = {}; return t; }
