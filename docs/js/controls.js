// controls.js — keyboard/mouse input with tap/hold detection (matching reference HTML)
// A/D move, E = button A, F = button B, with proper timing for tap vs hold

export function initControls(){
  const G = (window.GAME ||= {});
  G.input ||= { 
    left:false, right:false, jump:false, dash:false,
    buttonA: { down:false, downTime:0, upTime:0 },
    buttonB: { down:false, downTime:0, upTime:0 }
  };
  const I = G.input;
  const now = ()=> performance.now();

  function setButton(btn, down){
    const state = I[btn];
    if (!state) return;
    
    const wasDown = state.down;
    state.down = down;
    
    if (down && !wasDown){
      // Button pressed
      state.downTime = now();
    } else if (!down && wasDown){
      // Button released
      state.upTime = now();
    }
  }

  function onKey(e, down){
    if (e.repeat && down) return; // Ignore key repeats
    
    switch(e.code){
      case 'KeyA': case 'ArrowLeft': I.left = down; break;
      case 'KeyD': case 'ArrowRight': I.right = down; break;
      case 'KeyW': case 'ArrowUp': case 'Space': case 'AltLeft': case 'AltRight':
        I.jump = down;
        if (down) e.preventDefault();
        break;
      case 'ShiftLeft': case 'ShiftRight': I.dash = down; break;
      case 'KeyE': case 'KeyJ': setButton('buttonA', down); break;
      case 'KeyF': case 'KeyK': setButton('buttonB', down); break;
      default: return;
    }
  }
  
  function onMouse(e, down){
    if (e.button===0) setButton('buttonA', down);
    else if (e.button===2) setButton('buttonB', down);
  }

  window.addEventListener('keydown', e=>onKey(e,true));
  window.addEventListener('keyup',   e=>onKey(e,false));
  window.addEventListener('mousedown', e=>onMouse(e,true));
  window.addEventListener('mouseup',   e=>onMouse(e,false));
  window.addEventListener('contextmenu', e=>e.preventDefault()); // Prevent right-click menu
  window.addEventListener('blur', ()=>{ 
    Object.assign(I,{left:false,right:false,jump:false,dash:false});
    I.buttonA.down = false;
    I.buttonB.down = false;
  });

  console.log('[controls] wired');
}

