// touch-controls.js — Virtual joystick and touch button handlers for mobile
// v=1

import { DEFAULT_BOTTOM_BUTTON_ACTIONS } from './hud-layout.js?v=1';

export function initTouchControls(){
  const G = window.GAME || {};
  if (!G.JOYSTICK || !G.AIMING) return;

  const input = G.input || null;
  if (!input){
    console.warn('[touch-controls] GAME.input missing – ensure initControls() runs first');
    return;
  }

  const JOY = G.JOYSTICK;
  JOY.maxDistance = JOY.maxDistance || 64;

  const joystickArea = document.getElementById('joystickArea');
  const joystickStick = document.getElementById('joystickStick');
  const btnJump = document.getElementById('btnJump');
  const btnAttackA = document.getElementById('btnAttackA');
  const btnAttackB = document.getElementById('btnAttackB');
  const btnAttackC = document.getElementById('btnAttackC');
  const btnInteract = document.getElementById('btnInteract');

  const buttonActions = { ...DEFAULT_BOTTOM_BUTTON_ACTIONS, ...(window.CONFIG?.hud?.bottomButtons?.actions || {}) };
  const resolveButtonAction = (key) => buttonActions[key] || DEFAULT_BOTTOM_BUTTON_ACTIONS[key] || key;

  if (!joystickArea || !joystickStick) {
    console.warn('[touch-controls] Joystick elements not found');
    return;
  }

  const now = () => performance.now();
  const setJoystickHomePosition = () => {
    joystickArea.classList.add('visible');
    joystickArea.style.left = '';
    joystickArea.style.top = '';
    joystickArea.style.bottom = '';
  };
  const getJoystickSize = () => {
    const rect = joystickArea.getBoundingClientRect();
    if (rect.width) return rect.width;
    const size = parseFloat(getComputedStyle(joystickArea).width);
    return Number.isFinite(size) ? size : 0;
  };

  setJoystickHomePosition();

  function isPlayerBusy(){
    if (typeof G.combat?.isPlayerBusy === 'function'){
      try { return !!G.combat.isPlayerBusy(); }
      catch(err){ console.warn('[touch-controls] combat.isPlayerBusy threw', err); }
    }
    const player = G.FIGHTERS?.player;
    return !!player?.attack?.active;
  }

  function clearHorizontalInput(){
    input.left = false;
    input.right = false;
  }

  function updateJoystickVisual(){
    if (!joystickStick) return;
    if (JOY.active){
      joystickStick.classList.add('active');
      joystickStick.style.transform = `translate(calc(-50% + ${JOY.deltaX}px), calc(-50% + ${JOY.deltaY}px))`;
    } else {
      joystickStick.classList.remove('active');
      joystickStick.style.transform = 'translate(-50%, -50%)';
    }
  }

  function resolveFacingAngle(){
    const player = G.FIGHTERS?.player;
    if (player){
      if (Number.isFinite(player.facingRad)) return player.facingRad;
      const sign = Number.isFinite(player.facingSign) ? player.facingSign : 1;
      return sign < 0 ? Math.PI : 0;
    }
    return 0;
  }

  function applyAim(normalized, angle){
    if (normalized > 0.3){
      G.AIMING.manualAim = true;
      G.AIMING.targetAngle = angle;
    } else if (!JOY.active || normalized < 0.3){
      G.AIMING.manualAim = false;
      G.AIMING.targetAngle = resolveFacingAngle();
    }
  }

  function processJoystickInput(){
    const maxDistance = JOY.maxDistance || 64;
    const normalized = JOY.active ? Math.min(1, JOY.distance / maxDistance) : 0;
    const angle = JOY.angle || 0;
    const horizontalStrength = Math.cos(angle) * normalized;
    // Use configurable deadzone from headTracking config, fallback to 0.15
    const C = window.CONFIG || {};
    const deadzone = C.headTracking?.joystickDeadzone ?? 0.15;

    JOY.normalized = normalized;
    JOY.horizontalStrength = horizontalStrength;

    if (!JOY.active){
      clearHorizontalInput();
      return;
    }

    if (isPlayerBusy()){
      clearHorizontalInput();
      applyAim(normalized, angle);
      return;
    }

    if (normalized < deadzone){
      clearHorizontalInput();
    } else if (horizontalStrength > deadzone){
      input.right = true;
      input.left = false;
    } else if (horizontalStrength < -deadzone){
      input.left = true;
      input.right = false;
    } else {
      clearHorizontalInput();
    }

    applyAim(normalized, angle);
  }

  function updateJoystickPosition(){
    let dx = JOY.currentX - JOY.startX;
    let dy = JOY.currentY - JOY.startY;

    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = JOY.maxDistance || 50;

    if (distance > maxDistance){
      const scale = maxDistance / distance;
      dx *= scale;
      dy *= scale;
    }

    JOY.deltaX = dx;
    JOY.deltaY = dy;
    JOY.distance = Math.min(distance, maxDistance);
    JOY.angle = Math.atan2(dy, dx);

    updateJoystickVisual();
    processJoystickInput();
  }

  function handleJoystickStart(e){
    e.preventDefault();
    JOY.active = true;

    const touch = e.touches ? e.touches[0] : e;

    // Position joystick at touch point
    const joystickSize = getJoystickSize();
    const joystickOffset = joystickSize ? joystickSize / 2 : 0;

    // Center the joystick on the touch point
    joystickArea.style.left = `${touch.clientX - joystickOffset}px`;
    joystickArea.style.bottom = 'auto';
    joystickArea.style.top = `${touch.clientY - joystickOffset}px`;

    // Show the joystick
    joystickArea.classList.add('visible');

    JOY.startX = touch.clientX;
    JOY.startY = touch.clientY;
    JOY.currentX = touch.clientX;
    JOY.currentY = touch.clientY;

    updateJoystickPosition();
  }

  function handleJoystickMove(e){
    if (!JOY.active) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    JOY.currentX = touch.clientX;
    JOY.currentY = touch.clientY;

    updateJoystickPosition();
  }

  function handleJoystickEnd(e){
    e && e.preventDefault();
    JOY.active = false;
    JOY.deltaX = 0;
    JOY.deltaY = 0;
    JOY.distance = 0;
    JOY.normalized = 0;
    JOY.horizontalStrength = 0;

    setJoystickHomePosition();

    clearHorizontalInput();
    G.AIMING.manualAim = false;
    G.AIMING.targetAngle = resolveFacingAngle();

    updateJoystickVisual();
    processJoystickInput();
  }

  // Global touch listener for left third of screen
  const controlsOverlay = document.querySelector('.controls-overlay');
  let activeJoystickTouch = null;

  function handleGlobalTouchStart(e){
    if (activeJoystickTouch) return; // Already have an active joystick touch

    // Don't trigger joystick if touching a button or interactive element
    const target = e.target;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
        target.closest('button') || target.closest('.ui-btn') ||
        target.closest('.action-btn') || target.closest('.debug-panel')){
      return;
    }

    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    const leftThird = screenWidth / 3;

    // Check if touch is in left third of screen
    if (touch.clientX <= leftThird){
      activeJoystickTouch = touch.identifier;
      handleJoystickStart(e);
    }
  }

  function handleGlobalTouchMove(e){
    if (activeJoystickTouch === null) return;

    // Find our specific touch
    for (let i = 0; i < e.touches.length; i++){
      if (e.touches[i].identifier === activeJoystickTouch){
        // Create a synthetic event with just our touch
        const syntheticEvent = {
          touches: [e.touches[i]],
          preventDefault: () => e.preventDefault()
        };
        handleJoystickMove(syntheticEvent);
        break;
      }
    }
  }

  function handleGlobalTouchEnd(e){
    if (activeJoystickTouch === null) return;

    // Check if our touch ended
    let touchStillActive = false;
    for (let i = 0; i < e.touches.length; i++){
      if (e.touches[i].identifier === activeJoystickTouch){
        touchStillActive = true;
        break;
      }
    }

    if (!touchStillActive){
      activeJoystickTouch = null;
      handleJoystickEnd(e);
    }
  }

  if (controlsOverlay){
    controlsOverlay.addEventListener('touchstart', handleGlobalTouchStart, { passive: false });
    controlsOverlay.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    controlsOverlay.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    controlsOverlay.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: false });
  }

  // Keep mouse support on the joystick area itself for desktop testing
  joystickArea.addEventListener('mousedown', handleJoystickStart);
  document.addEventListener('mousemove', handleJoystickMove);
  document.addEventListener('mouseup', handleJoystickEnd);

  function setButtonState(buttonKey, down){
    const state = input[buttonKey];
    if (!state) return;
    const wasDown = !!state.down;
    if (down){
      state.down = true;
      if (!wasDown) state.downTime = now();
    } else {
      if (wasDown){
        state.down = false;
        state.upTime = now();
      }
    }
  }

  function bindHold(btn, onDown, onUp){
    if (!btn) return;
    const start = (e)=>{
      e.preventDefault();
      btn.classList.add('active');
      onDown();
    };
    const end = (e)=>{
      if (e) e.preventDefault();
      btn.classList.remove('active');
      onUp();
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
  }

  function dispatchKey(code, type){
    const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
    const evt = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
  }

  bindHold(btnAttackA, () => setButtonState(resolveButtonAction('attackA'), true), () => setButtonState(resolveButtonAction('attackA'), false));
  bindHold(btnAttackB, () => setButtonState(resolveButtonAction('attackB'), true), () => setButtonState(resolveButtonAction('attackB'), false));
  bindHold(btnAttackC, () => setButtonState(resolveButtonAction('attackC'), true), () => setButtonState(resolveButtonAction('attackC'), false));

  if (btnJump){
    bindHold(btnJump, () => setButtonState(resolveButtonAction('jump'), true), () => setButtonState(resolveButtonAction('jump'), false));
  }

  if (btnInteract){
    bindHold(btnInteract, () => dispatchKey('KeyE', 'keydown'), () => dispatchKey('KeyE', 'keyup'));
  }

  console.log('[touch-controls] Initialized');
}
