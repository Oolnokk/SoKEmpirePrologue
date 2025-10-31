// docs/config/config.js — same-origin mirror with live reload + merge defaults
(function(){
  async function loadCfg(){
    try {
      const url = 'https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/main/config/config.js?ts=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      const fn = new Function(text + '\nreturn (typeof CONFIG!==\'undefined\') ? CONFIG : window.CONFIG;');
      const cfg = fn() || {};
      // Merge onto any defaults that config-shims.js seeded
      window.CONFIG = Object.assign({}, window.CONFIG || {}, cfg);
      try { document.dispatchEvent(new Event('config:updated')); } catch(_){}
      console.log('[config mirror] loaded in-repo config into window.CONFIG');
      return window.CONFIG;
    } catch (err){
      console.error('[config mirror] failed to load remote config:', err);
      window.CONFIG = window.CONFIG || {};
      throw err;
    }
  }
  window.reloadConfig = loadCfg;
  loadCfg();
})();
