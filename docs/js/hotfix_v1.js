/* hotfix_v1.js
   Goals:
   1) Touch controls -> movement events
   2) Ensure sprites load & fighter dropdown populates
   3) Add Quick/Heavy1/Heavy2/Weapon dropdowns; hook to combat if present

   Safe: does not replace existing functions; only augments via feature detection.
   Toggle debug: add ?debug=1 to URL.
*/

(function(){
  'use strict';

  const DEBUG = (()=>{
    try { return new URLSearchParams(location.search).get('debug') === '1'; }
    catch(_) { return false; }
  })();

  // ---------- On-screen logger (mobile friendly) ----------
  let logEl = null;
  function logInit(){
    if (logEl) return;
    logEl = document.createElement('div');
    logEl.id = 'hotfix-log';
    Object.assign(logEl.style, {
      position:'fixed', left:'8px', bottom:'8px', width:'calc(100% - 16px)',
      background:'rgba(20,24,28,.85)', color:'#cbd5e1', padding:'6px 8px', font:'12px system-ui, sans-serif',
      borderRadius:'8px', zIndex:'99999', maxHeight:'38vh', overflow:'auto', display: DEBUG ? 'block' : 'none'
    });
    document.body.appendChild(logEl);
  }
  function log(msg){
    if (!logEl) return;
    const div = document.createElement('div');
    div.textContent = String(msg);
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- Sprite loader guard ----------
  function ensureSpritesLoaded(cb){
    // Expect CONFIG.sprites.sprites URLs and SPRITES.cache. If not, attempt to (re)build cache.
    const C = globalThis.CONFIG || {};
    const S = globalThis.SPRITES || (globalThis.SPRITES = { cache:{}, loaded:{}, failed:new Set(), pending:new Set() });
    const map = (C.sprites && C.sprites.sprites) || (C.sprites && C.sprites.urls) || C.sprites || {};
    const entries = [];

    // Accept flat map {torso:'url', head:'url', ...} or nested {arm:{upper:'...', lower:'...'}, ...}
    function walk(prefix, obj){
      if (!obj) return;
      Object.keys(obj).forEach(k=>{
        const v = obj[k];
        const key = prefix ? (prefix + k[0].toUpperCase() + k.slice(1)) : k; // e.g., arm.upper -> armUpper
        if (typeof v === 'string') entries.push([key, v]);
        else if (v && typeof v === 'object') walk(key, v);
      });
    }
    walk('', map);

    if (!entries.length) {
      log('SPRITES: no URLs found in CONFIG; skipping preload.');
      return cb && cb();
    }

    let remaining = 0;
    entries.forEach(([key, url])=>{
      if (S.cache[key] && S.cache[key].complete) return;
      const img = new Image();
      S.cache[key] = img;
      S.pending.add(key);
      remaining++;
      img.onload = ()=>{ S.loaded[key] = true; S.pending.delete(key); if (--remaining===0) cb && cb(); };
      img.onerror = ()=>{ S.failed.add(key); S.pending.delete(key); log('failed to load '+key+' '+url); if (--remaining===0) cb && cb(); };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
    if (remaining===0) cb && cb();
  }

  // ---------- Fighter dropdown population ----------
  function ensureFighterDropdown(){
    let sel = document.querySelector('#fighterSelect');
    if (!sel){
      sel = document.createElement('select');
      sel.id = 'fighterSelect';
      Object.assign(sel.style, { position:'fixed', top:'8px', right:'8px', zIndex:'99998' });
      document.body.appendChild(sel);
    }
    const cfg = globalThis.CONFIG || {};
    const fighters = (cfg.actors) || (cfg.fighters) || {};
    const keys = Object.keys(fighters);
    if (!keys.length) {
      log('fighters: none in CONFIG');
      return;
    }
    sel.innerHTML = keys.map(k=>`<option value="${k}">${k}</option>`).join('');
    sel.onchange = ()=>{
      const k = sel.value;
      if (globalThis.setCurrentFighter) { globalThis.setCurrentFighter(k); }
      if (globalThis.ACTOR) { globalThis.ACTOR.kind = k; }
      log('fighter -> '+k);
    };
    // Choose first if none selected
    if (!sel.value && keys.length) { sel.value = keys[0]; sel.onchange(); }
  }

  // ---------- Touch controls ----------
  function ensureTouchControls(){
    // Bind to existing buttons if present, else build a simple D-pad + 2 buttons
    const move = globalThis.MOVE || (globalThis.MOVE = { left:false, right:false, jump:false, attack:false });
    function bindPress(el, onDown, onUp){
      const down = (e)=>{ e.preventDefault(); onDown(); };
      const up   = (e)=>{ e.preventDefault(); onUp(); };
      ['touchstart','pointerdown','mousedown'].forEach(t=>el.addEventListener(t, down));
      ['touchend','pointerup','mouseup','touchcancel','mouseleave'].forEach(t=>el.addEventListener(t, up));
    }
    function mkBtn(txt){
      const b = document.createElement('button');
      b.textContent = txt;
      Object.assign(b.style, {
        font:'16px system-ui, sans-serif', padding:'10px 12px', margin:'6px', borderRadius:'10px',
        background:'#1f2937', color:'#e5e7eb', border:'1px solid #374151'
      });
      return b;
    }
    let pad = document.querySelector('#hotfix-pad');
    if (!pad){
      pad = document.createElement('div');
      pad.id = 'hotfix-pad';
      Object.assign(pad.style, { position:'fixed', left:'8px', bottom:'56px', zIndex:'99997', display:'flex', alignItems:'center' });
      const left = mkBtn('◀'); const right = mkBtn('▶');
      const jump = mkBtn('⤴'); const atk = mkBtn('⚔');
      bindPress(left,  ()=>{ move.left=true;  }, ()=>{ move.left=false;  });
      bindPress(right, ()=>{ move.right=true; }, ()=>{ move.right=false; });
      bindPress(jump,  ()=>{ move.jump=true;  if (globalThis.requestJump) globalThis.requestJump(); }, ()=>{ move.jump=false; });
      bindPress(atk,   ()=>{ move.attack=true; if (globalThis.requestAttackPress) globalThis.requestAttackPress(); },
                      ()=>{ move.attack=false; if (globalThis.requestAttackRelease) globalThis.requestAttackRelease(); });
      pad.append(left, right, jump, atk);
      document.body.appendChild(pad);
    }
    log('touch controls ready');
  }

  // ---------- Combat setup panel ----------
  function ensureCombatPanel(){
    let panel = document.querySelector('#combat-setup');
    if (!panel){
      panel = document.createElement('div');
      panel.id = 'combat-setup';
      Object.assign(panel.style, {
        position:'fixed', right:'8px', bottom:'56px', zIndex:'99996',
        background:'rgba(17,24,39,.9)', color:'#e5e7eb', padding:'8px 10px', borderRadius:'10px',
        font:'12px system-ui, sans-serif', minWidth:'220px'
      });
      panel.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">Combat Setup</div>
        <label>Quick <select id="selQuick"></select></label><br/>
        <label>Heavy 1 <select id="selHeavy1"></select></label><br/>
        <label>Heavy 2 <select id="selHeavy2"></select></label><br/>
        <label>Weapon <select id="selWeapon"></select></label>
      `;
      document.body.appendChild(panel);
    }

    const attacks = (globalThis.CONFIG && globalThis.CONFIG.attacks) || {};
    const weapons = (globalThis.CONFIG && globalThis.CONFIG.weapons) || (globalThis.CONFIG && globalThis.CONFIG.items && globalThis.CONFIG.items.weapons) || {};

    function fillSelect(sel, opts){
      sel.innerHTML = Object.keys(opts).map(k=>`<option value="${k}">${k}</option>`).join('');
    }

    fillSelect(panel.querySelector('#selQuick'), attacks);
    fillSelect(panel.querySelector('#selHeavy1'), attacks);
    fillSelect(panel.querySelector('#selHeavy2'), attacks);
    fillSelect(panel.querySelector('#selWeapon'), weapons);

    function bind(selId, key){
      const sel = panel.querySelector(selId);
      sel.onchange = ()=>{
        const v = sel.value;
        const COMBAT = globalThis.COMBAT || (globalThis.COMBAT = {});
        if (!COMBAT.loadout) COMBAT.loadout = {};
        COMBAT.loadout[key] = v;
        // optional: inform your combat system if methods exist
        if (globalThis.setAttackLoadout) globalThis.setAttackLoadout(COMBAT.loadout);
        log(`loadout.${key} -> ${v}`);
      };
      // default first if empty
      if (!panel.querySelector(selId).value && panel.querySelector(selId).options.length>0) {
        panel.querySelector(selId).selectedIndex = 0;
        sel.onchange();
      }
    }

    bind('#selQuick', 'quick');
    bind('#selHeavy1', 'heavy1');
    bind('#selHeavy2', 'heavy2');
    bind('#selWeapon', 'weapon');
  }

  // ---------- Bootstrap order ----------
  function start(){
    logInit();
    log('hotfix_v1 boot');
    // Ensure fighters exist (if not, attempt to fetch config files that are common)
    const ensureConfig = ()=>{
      if (globalThis.CONFIG && (globalThis.CONFIG.fighters || globalThis.CONFIG.actors)) return Promise.resolve();
      // Try a few standard files; ignore failures (repo variations)
      const tries = [
        'config/config.json', 'config/config.js',
        'config/fighters.json'
      ];
      const tasks = tries.map(p=>fetch(p).then(r=>r.ok?r.json():Promise.reject()).catch(()=>null));
      return Promise.all(tasks).then(list=>{
        const data = list.find(Boolean);
        if (data) {
          globalThis.CONFIG = Object.assign({}, globalThis.CONFIG||{}, data);
          log('CONFIG loaded from fallback');
        } else {
          log('CONFIG fallback not found (ok if your app sets it later)');
        }
      });
    };

    ensureConfig()
      .then(()=> ensureSpritesLoaded(()=>{
        if (globalThis.initSprites) try { globalThis.initSprites(); } catch(e){ log('initSprites error: '+e.message); }
        ensureFighterDropdown();
        ensureTouchControls();
        ensureCombatPanel();
        log('hotfix ready');
      }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
