// touch-controls.js — Virtual joystick and touch button handlers for mobile
// v=1

export function initTouchControls(){
  const G = window.GAME || {};
  if (!G.JOYSTICK || !G.AIMING) return;
  
  const joystickArea = document.getElementById('joystickArea');
  const joystickStick = document.getElementById('joystickStick');
  const btnJump = document.getElementById('btnJump');
  const btnAttackA = document.getElementById('btnAttackA');
  const btnAttackB = document.getElementById('btnAttackB');
  const btnInteract = document.getElementById('btnInteract');
  
  if (!joystickArea || !joystickStick) {
    console.warn('[touch-controls] Joystick elements not found');
    return;
  }
  
  // === Joystick Handlers ===
  
  function updateJoystickPosition(){
    let dx = G.JOYSTICK.currentX - G.JOYSTICK.startX;
    let dy = G.JOYSTICK.currentY - G.JOYSTICK.startY;
    
    const maxDistance = 40; // Max stick travel in pixels
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > maxDistance){
      dx = (dx / distance) * maxDistance;
      dy = (dy / distance) * maxDistance;
    }
    
    G.JOYSTICK.deltaX = dx;
    G.JOYSTICK.deltaY = dy;
    G.JOYSTICK.distance = Math.min(distance, maxDistance);
    G.JOYSTICK.angle = Math.atan2(dy, dx);
    
    updateJoystickVisual();
    processJoystickInput();
  }
  
  function updateJoystickVisual(){
    if (!joystickStick) return;
    
    if (G.JOYSTICK.active){
      joystickStick.style.transform = `translate(calc(-50% + ${G.JOYSTICK.deltaX}px), calc(-50% + ${G.JOYSTICK.deltaY}px))`;
      joystickStick.classList.add('active');
    } else {
      joystickStick.style.transform = 'translate(-50%, -50%)';
      joystickStick.classList.remove('active');
    }
  }
  
  function processJoystickInput(){
    const MOVE = G.FIGHTERS?.player?.move;
    if (!MOVE) return;
    
    const deadzone = 0.2;
    const normalized = G.JOYSTICK.distance / 40; // Normalize to 0-1
    const angle = G.JOYSTICK.angle;
    
    const horizontalStrength = Math.cos(angle) * normalized;
    
    // Movement input
    if (horizontalStrength > deadzone){
      MOVE.input.right = true;
      MOVE.input.left = false;
    } else if (horizontalStrength < -deadzone){
      MOVE.input.left = true;
      MOVE.input.right = false;
    } else {
      MOVE.input.left = false;
      MOVE.input.right = false;
    }
    
    // Aiming - update facing direction based on joystick
    if (normalized > 0.3){ // Require significant input for aiming
      G.AIMING.manualAim = true;
      G.AIMING.targetAngle = angle;
    } else {
      G.AIMING.manualAim = false;
    }
  }
  
  function handleJoystickStart(e){
    e.preventDefault();
    G.JOYSTICK.active = true;
    
    const rect = joystickArea.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    G.JOYSTICK.startX = centerX;
    G.JOYSTICK.startY = centerY;
    
    const touch = e.touches ? e.touches[0] : e;
    G.JOYSTICK.currentX = touch.clientX;
    G.JOYSTICK.currentY = touch.clientY;
    
    updateJoystickPosition();
  }
  
  function handleJoystickMove(e){
    if (!G.JOYSTICK.active) return;
    e.preventDefault();
    
    const touch = e.touches ? e.touches[0] : e;
    G.JOYSTICK.currentX = touch.clientX;
    G.JOYSTICK.currentY = touch.clientY;
    
    updateJoystickPosition();
  }
  
  function handleJoystickEnd(e){
    e.preventDefault();
    G.JOYSTICK.active = false;
    G.JOYSTICK.deltaX = 0;
    G.JOYSTICK.deltaY = 0;
    G.JOYSTICK.distance = 0;
    G.AIMING.manualAim = false;
    
    const MOVE = G.FIGHTERS?.player?.move;
    if (MOVE){
      MOVE.input.left = false;
      MOVE.input.right = false;
    }
    
    updateJoystickVisual();
    processJoystickInput();
  }
  
  // Attach joystick event listeners
  joystickArea.addEventListener('touchstart', handleJoystickStart, { passive: false });
  joystickArea.addEventListener('touchmove', handleJoystickMove, { passive: false });
  joystickArea.addEventListener('touchend', handleJoystickEnd, { passive: false });
  joystickArea.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
  
  // Also support mouse for testing on desktop
  joystickArea.addEventListener('mousedown', handleJoystickStart);
  document.addEventListener('mousemove', handleJoystickMove);
  document.addEventListener('mouseup', handleJoystickEnd);
  
  // === Touch Button Handlers ===
  
  function handleTouchButton(button, action){
    if (!G.combat) return;
    
    switch(button){
      case 'A':
        if (action === 'down') G.combat.slotDown('A');
        else G.combat.slotUp('A');
        break;
      case 'B':
        if (action === 'down') G.combat.slotDown('B');
        else G.combat.slotUp('B');
        break;
      case 'jump':
        if (action === 'down'){
          const P = G.FIGHTERS?.player;
          if (P) P.input.jump = true;
        }
        break;
      case 'interact':
        if (action === 'down'){
          // Trigger interact (E key equivalent)
          const event = new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' });
          window.dispatchEvent(event);
        }
        break;
    }
  }
  
  // Attach button listeners
  if (btnAttackA){
    btnAttackA.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTouchButton('A', 'down');
    }, { passive: false });
    btnAttackA.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleTouchButton('A', 'up');
    }, { passive: false });
  }
  
  if (btnAttackB){
    btnAttackB.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTouchButton('B', 'down');
    }, { passive: false });
    btnAttackB.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleTouchButton('B', 'up');
    }, { passive: false });
  }
  
  if (btnJump){
    btnJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTouchButton('jump', 'down');
    }, { passive: false });
  }
  
  if (btnInteract){
    btnInteract.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleTouchButton('interact', 'down');
    }, { passive: false });
  }
  
  console.log('[touch-controls] Initialized');
}
