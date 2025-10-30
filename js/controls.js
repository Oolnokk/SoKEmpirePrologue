// Wires DOM controls, help, fullscreen, joystick, sliders.
export function initControls(){
  const doc = document;
  const GAME = window.GAME;

  // Buttons & panels
  const btnHelp = doc.getElementById('btnHelp');
  const btnFullscreen = doc.getElementById('btnFullscreen');
  const helpPanel = doc.getElementById('helpPanel');

  // Controls
  const btnJump = doc.getElementById('btnJump');
  const btnAttackA = doc.getElementById('btnAttackA');
  const btnAttackB = doc.getElementById('btnAttackB');
  const btnInteract = doc.getElementById('btnInteract');

  // Joystick
  const joystickArea = doc.getElementById('joystickArea');
  const joystickStick = doc.getElementById('joystickStick');

  // Settings
  const wAuth = doc.getElementById('wAuth');
  const wPhys = doc.getElementById('wPhys');
  const ikCalvesOnly = doc.getElementById('ikCalvesOnly');
  const lockFacing = doc.getElementById('lockFacing');
  const actorScaleInput = doc.getElementById('actorScale');
  const groundRatioInput = doc.getElementById('groundRatio');
  const handMultiplierInput = doc.getElementById('handMultiplier');
  const footMultiplierInput = doc.getElementById('footMultiplier');
  const fighterSelect = doc.getElementById('fighterSelect');

  // Combo UI
  const comboFields = doc.getElementById('comboFields');
  const hitSlider = doc.getElementById('hitSlider');

  // HUD bars
  const healthFill = doc.getElementById('healthFill');
  const healthLabel = doc.getElementById('healthLabel');
  const staminaFill = doc.getElementById('staminaFill');
  const staminaLabel = doc.getElementById('staminaLabel');
  const footingFill = doc.getElementById('footingFill');
  const footingLabel = doc.getElementById('footingLabel');

  // Help toggle
  btnHelp?.addEventListener('click', ()=> helpPanel?.classList.toggle('visible'));

  // Fullscreen toggle
  btnFullscreen?.addEventListener('click', ()=>{
    const el = document.documentElement;
    if (!document.fullscreenElement){ el.requestFullscreen?.(); }
    else { document.exitFullscreen?.(); }
  });

  // Simple action handlers
  btnJump?.addEventListener('click', ()=> { console.log('[UI] Jump'); });
  btnAttackA?.addEventListener('click', ()=> { console.log('[UI] Attack A'); });
  btnAttackB?.addEventListener('click', ()=> { console.log('[UI] Attack B'); });
  btnInteract?.addEventListener('click', ()=> { console.log('[UI] Interact'); });

  // Joystick (touch)
  let joyActive = false, startX = 0, startY = 0;
  function setStick(dx, dy){
    joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  joystickArea?.addEventListener('touchstart', (e)=>{
    joyActive = true;
    const t = e.changedTouches[0];
    const rect = joystickArea.getBoundingClientRect();
    startX = t.clientX - (rect.left + rect.width/2);
    startY = t.clientY - (rect.top + rect.height/2);
    joystickStick.classList.add('active');
    setStick(startX, startY);
  }, {passive:true});
  joystickArea?.addEventListener('touchmove', (e)=>{
    if (!joyActive) return;
    const t = e.changedTouches[0];
    const rect = joystickArea.getBoundingClientRect();
    const dx = t.clientX - (rect.left + rect.width/2);
    const dy = t.clientY - (rect.top + rect.height/2);
    setStick(dx, dy);
  }, {passive:true});
  joystickArea?.addEventListener('touchend', ()=>{
    joyActive = false; joystickStick.classList.remove('active'); setStick(0,0);
  });

  // Settings listeners
  const C = window.CONFIG;
  wAuth?.addEventListener('input', ()=> C.movement.authoredWeight = +wAuth.value);
  wPhys?.addEventListener('input', ()=> C.movement.physicsWeight  = +wPhys.value);
  ikCalvesOnly?.addEventListener('change', ()=> C.ik.calvesOnly = ikCalvesOnly.checked);
  lockFacing?.addEventListener('change', ()=> C.movement.lockFacingDuringAttack = lockFacing.checked);
  actorScaleInput?.addEventListener('input', ()=>{ C.actor.scale = +actorScaleInput.value; window.dispatchEvent(new Event('resize')); });
  groundRatioInput?.addEventListener('input', ()=>{ C.groundRatio = +groundRatioInput.value; window.dispatchEvent(new Event('resize')); });
  handMultiplierInput?.addEventListener('input', ()=> C.colliders.handMultiplier = +handMultiplierInput.value);
  footMultiplierInput?.addEventListener('input', ()=> C.colliders.footMultiplier = +footMultiplierInput.value);

  // Fighter select (if fighters list exists in external config)
  if (fighterSelect && C.fighters){
    const names = Object.keys(C.fighters);
    fighterSelect.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    fighterSelect.value = C.activeFighter || names[0] || '';
    fighterSelect.addEventListener('change', ()=>{ C.activeFighter = fighterSelect.value; console.log('[Fighter] apply', C.activeFighter); });
  }

  // Manual hit slider -> exposes simple value for other modules to read
  if (hitSlider){ hitSlider.addEventListener('input', ()=>{ GAME.manualHits = parseInt(hitSlider.value, 10) || 0; }); }

  // HUD updater exposed for other modules
  GAME.updateHUD = function updateHUD(){
    const P = GAME.FIGHTERS?.player;
    if (!P) return;
    const hp = 100; // placeholder; no HP system in this modular first pass
    const st = Math.max(0, Math.min(100, P.stamina.current));
    const ft = Math.max(0, Math.min(100, P.footing));
    healthFill.style.width = hp + '%';
    healthLabel.textContent = 'HP: ' + hp;
    staminaFill.style.width = st + '%';
    staminaLabel.textContent = 'STAMINA';
    footingFill.style.width = ft + '%';
    footingLabel.textContent = 'FOOTING';
  };

  console.log('[initControls] DOM controls wired');
}
