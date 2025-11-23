// controls.js — keyboard/mouse input with tap/hold detection (matching reference HTML)
// A/D move, E = button A, F = button B, R = button C (with proper timing for tap vs hold)

export function initControls(){
  const G = (window.GAME ||= {});
  G.input ||= {
    left:false, right:false, jump:false, dash:false,
    nonCombatRagdoll: false,
    shift: false,
    weaponDrawn: true,
    buttonA: { down:false, downTime:0, upTime:0 },
    buttonB: { down:false, downTime:0, upTime:0 },
    buttonC: { down:false, downTime:0, upTime:0 }
  };
  const I = G.input;
  const now = ()=> performance.now();
  const mouseBindings = { 0: null, 1: null, 2: null };

  function toggleNonCombatRagdoll(){
    I.nonCombatRagdoll = !I.nonCombatRagdoll;
    const fighter = window.GAME?.FIGHTERS?.player;
    if (fighter) {
      fighter.nonCombatRagdoll = I.nonCombatRagdoll;
    }
  }

  function toggleWeaponDrawn(){
    I.weaponDrawn = !I.weaponDrawn;
    const fighter = window.GAME?.FIGHTERS?.player;
    if (fighter) {
      fighter.weaponDrawn = I.weaponDrawn;
      fighter.renderProfile ||= {};
      fighter.renderProfile.weaponDrawn = I.weaponDrawn;
      fighter.renderProfile.weaponStowed = !I.weaponDrawn;
      if (fighter.anim?.weapon) {
        fighter.anim.weapon.stowed = !I.weaponDrawn;
      }
      if (typeof window.syncWeaponDrawnState === 'function') {
        window.syncWeaponDrawnState({ fighterKey: 'player', weaponDrawn: I.weaponDrawn });
      }
    }
  }

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
      case 'KeyW': case 'ArrowUp': case 'Space': I.jump = down; if(down) e.preventDefault(); break;
      case 'KeyE': case 'KeyJ': setButton('buttonA', down); break;
      case 'KeyF': case 'KeyK': setButton('buttonB', down); break;
      case 'KeyR': case 'KeyL': setButton('buttonC', down); break;
      case 'ShiftLeft': case 'ShiftRight': I.shift = down; break;
      case 'KeyN': if (down) toggleNonCombatRagdoll(); break;
      case 'KeyT': case 'KeyX': if (down) toggleWeaponDrawn(); break;
      default: return;
    }
  }
  
  const blockSelector = '[data-block-game-input]';

  function isBlockedTarget(target){
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest(blockSelector);
  }

  function onMouse(e, down){
    if (down && isBlockedTarget(e.target)) return;
    if (down){
      if (e.button === 0){
        const binding = e.shiftKey ? 'buttonB' : 'buttonA';
        mouseBindings[0] = binding;
        setButton(binding, true);
      } else if (e.button === 2){
        mouseBindings[2] = 'buttonC';
        setButton('buttonC', true);
      }
    } else {
      const binding = mouseBindings[e.button];
      if (binding){
        setButton(binding, false);
        mouseBindings[e.button] = null;
      } else if (e.button === 0){
        // Ensure primary buttons are released if binding context was lost
        setButton('buttonA', false);
        setButton('buttonB', false);
      } else if (e.button === 2){
        setButton('buttonC', false);
      }
    }
  }

  window.addEventListener('keydown', e=>onKey(e,true));
  window.addEventListener('keyup',   e=>onKey(e,false));
  window.addEventListener('mousedown', e=>onMouse(e,true));
  window.addEventListener('mouseup',   e=>onMouse(e,false));
  window.addEventListener('contextmenu', e=>{
    if (isBlockedTarget(e.target)) return;
    e.preventDefault();
  }); // Prevent right-click menu over game viewport
  window.addEventListener('blur', ()=>{
    Object.assign(I,{left:false,right:false,jump:false,dash:false,nonCombatRagdoll:false,weaponDrawn:true,shift:false});
    I.buttonA.down = false;
    I.buttonB.down = false;
    I.buttonC.down = false;
    const fighter = window.GAME?.FIGHTERS?.player;
    if (fighter) {
      fighter.nonCombatRagdoll = false;
      fighter.weaponDrawn = true;
      fighter.renderProfile ||= {};
      fighter.renderProfile.weaponDrawn = true;
      fighter.renderProfile.weaponStowed = false;
      if (fighter.anim?.weapon) {
        fighter.anim.weapon.stowed = false;
      }
      if (typeof window.syncWeaponDrawnState === 'function') {
        window.syncWeaponDrawnState({ fighterKey: 'player', weaponDrawn: true });
      }
    }
    mouseBindings[0] = mouseBindings[1] = mouseBindings[2] = null;
  });

  console.log('[controls] wired');
}

