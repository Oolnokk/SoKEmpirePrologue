// config-shims.js — provides minimal back-compat for window.CONFIG
(function(){
  const ready = () => { try { document.dispatchEvent(new Event('config:ready')); } catch(_){} };
  if (!window.CONFIG) {
    window.CONFIG = { fighters:{}, durations:{}, poses:{}, attacks:{} };
    setTimeout(ready, 0);
  } else {
    ready();
  }
})();
