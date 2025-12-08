// touch-controls.js — Virtual joystick and touch button handlers for mobile
// v=1

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

  if (!joystickArea || !joystickStick) {
    console.warn('[touch-controls] Joystick elements not found');
    return;
  }

  const now = () => performance.now();

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

    const rect = joystickArea.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    JOY.startX = centerX;
    JOY.startY = centerY;

    const touch = e.touches ? e.touches[0] : e;
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

    clearHorizontalInput();
    G.AIMING.manualAim = false;
    G.AIMING.targetAngle = resolveFacingAngle();

    updateJoystickVisual();
    processJoystickInput();
  }

  joystickArea.addEventListener('touchstart', handleJoystickStart, { passive: false });
  joystickArea.addEventListener('touchmove', handleJoystickMove, { passive: false });
  joystickArea.addEventListener('touchend', handleJoystickEnd, { passive: false });
  joystickArea.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
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

  bindHold(btnAttackA, () => setButtonState('buttonA', true), () => setButtonState('buttonA', false));
  bindHold(btnAttackB, () => setButtonState('buttonB', true), () => setButtonState('buttonB', false));
  bindHold(btnAttackC, () => setButtonState('buttonC', true), () => setButtonState('buttonC', false));

  if (btnJump){
    bindHold(btnJump, () => { input.jump = true; }, () => { input.jump = false; });
  }

  if (btnInteract){
    bindHold(btnInteract, () => dispatchKey('KeyE', 'keydown'), () => dispatchKey('KeyE', 'keyup'));
  }

  console.log('[touch-controls] Initialized');
}
