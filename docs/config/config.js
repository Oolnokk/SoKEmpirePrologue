// docs/config/config.js — local mirror loader (runtime copy)
// If you have GitHub Pages set to /docs, this keeps everything same-origin.
// It fetches the canonical repo config and applies it to window.CONFIG.
(async function(){
  try {
    const res = await fetch('https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/main/config/config.js');
    const text = await res.text();
    const fn = new Function(text + '\nreturn (typeof CONFIG!==\'undefined\') ? CONFIG : window.CONFIG;');
    const cfg = fn();
    window.CONFIG = cfg || window.CONFIG || {};
    console.log('[config mirror] loaded in-repo config into window.CONFIG');
  } catch (err){
    console.error('[config mirror] failed to load remote config:', err);
    window.CONFIG ||= {};
  }
})();
