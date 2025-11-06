// face-lock.js — Simple head/face locking system for manual overrides (e.g., aiming, poses)
// Matches reference logic in `ancient code-monolith of truth.html` (FACE global + aiming integration)

export function initFaceLock(){
  const G = (window.GAME ||= {});
  G.FACE = { active: false, rad: 0 };
  console.log('[face-lock] initialized');
}

export function setFaceLock(radians){
  const G = (window.GAME ||= {});
  if (!G.FACE) G.FACE = { active: false, rad: 0 };
  G.FACE.active = true;
  G.FACE.rad = radians;
}

export function clearFaceLock(){
  const G = (window.GAME ||= {});
  if (!G.FACE) G.FACE = { active: false, rad: 0 };
  G.FACE.active = false;
}

export function getFaceLock(){
  const G = (window.GAME ||= {});
  return (G.FACE && G.FACE.active) ? G.FACE.rad : null;
}
