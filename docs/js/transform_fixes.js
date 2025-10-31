(function () {
  const __old_withAX = (typeof window.withAX === 'function') ? window.withAX : null;
  function withAX_fixed(x, y, ang, off, segLen, units) {
    if (!off) return [x, y];
    let ax = 0, ay = 0;
    if (Array.isArray(off)) { ax = +off[0] || 0; ay = +off[1] || 0; }
    else if (typeof off === 'object') { ax = +((off.ax !== undefined) ? off.ax : (off.x !== undefined ? off.x : 0)) || 0; ay = +((off.ay !== undefined) ? off.ay : (off.y !== undefined ? off.y : 0)) || 0; }
    else { return [x, y]; }
    const U = (units || 'px'); const L = Math.max(0, +segLen || 0);
    if (U === 'percent' || U === '%' || U === 'pct') { ax *= L; ay *= L; }
    const dx = ax * Math.sin(ang) + ay * Math.cos(ang);
    const dy = -ax * Math.cos(ang) + ay * Math.sin(ang);
    return [x + dx, y + dy];
  }
  window.withAX = withAX_fixed;
  if (typeof window.EVENT_LINEAR_TIMING === 'undefined') { window.EVENT_LINEAR_TIMING = true; }
  (function patchProcessAnimEvents() {
    const hasActive = typeof window.active !== 'undefined';
    const hasEVENT  = typeof window.EVENT  !== 'undefined';
    const nowFn     = (typeof window.now === 'function') ? window.now : (() => performance.now ? performance.now() : Date.now());
    const oldProc = window.processAnimEvents;
    if (typeof oldProc === 'function') {
      window.processAnimEvents = function (kEased) {
        let k = +kEased || 0;
        if (window.EVENT_LINEAR_TIMING && hasActive && window.active) {
          const dur = Math.max(1, window.active.dur);
          k = Math.max(0, Math.min(1, (nowFn() - window.active.start) / dur));
        }
        return oldProc.call(this, k);
      };
    } else if (hasEVENT && typeof window.applyAnimEvent === 'function') {
      window.processAnimEvents = function (kEased) {
        if (!window.EVENT || !window.EVENT.list) return;
        let k = +kEased || 0;
        if (window.EVENT_LINEAR_TIMING && hasActive && window.active) {
          const dur = Math.max(1, window.active.dur);
          k = Math.max(0, Math.min(1, (nowFn() - window.active.start) / dur));
        }
        while (window.EVENT.idx < window.EVENT.list.length && ((window.EVENT.list[window.EVENT.idx].time || 0) <= (k + 1e-6))) {
          const ev = window.EVENT.list[window.EVENT.idx++];
          window.applyAnimEvent(ev);
        }
      };
    }
  })();
  (function injectSettingsToggles() {
    const box = document.querySelector('#appSettingsBox .fields') || document.querySelector('#appSettingsBox') || document.querySelector('#settings') || null;
    if (!box) return;
    function addToggle(label, get, set) {
      const row = document.createElement('label');
      row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.margin = '6px 0';
      const span = document.createElement('span'); span.textContent = label;
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!get();
      input.addEventListener('change', () => set(!!input.checked));
      row.appendChild(span); row.appendChild(input); box.appendChild(row);
    }
    addToggle('Linear event timing', () => !!window.EVENT_LINEAR_TIMING, v => { window.EVENT_LINEAR_TIMING = v; });
    window.CONFIG = window.CONFIG || {}; window.CONFIG.hierarchy = window.CONFIG.hierarchy || {};
    if (typeof window.CONFIG.hierarchy.legsFollowTorsoRotation === 'undefined') { window.CONFIG.hierarchy.legsFollowTorsoRotation = false; }
    addToggle('Legs follow torso rotation', () => !!(window.CONFIG.hierarchy && window.CONFIG.hierarchy.legsFollowTorsoRotation), v => { window.CONFIG.hierarchy.legsFollowTorsoRotation = v; });
  })();
  (function hud() {
    const hud = document.createElement('div');
    Object.assign(hud.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: 9999, background: 'rgba(0,0,0,0.6)', color: '#e5f0ff', font: '12px ui-monospace, Menlo, monospace', padding: '8px', borderRadius: '8px', maxWidth: '92vw', whiteSpace: 'pre-wrap', display: 'none'});
    hud.textContent = 'Transform HUD (D to toggle)'; document.body.appendChild(hud);
    window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'd') hud.style.display = (hud.style.display === 'none' ? 'block' : 'none'); });
    const og = window.drawBoneSprite;
    if (typeof og === 'function') {
      window.drawBoneSprite = function (xStart, yStart, len, ang, key, widthFactor) {
        const out = og.apply(this, arguments);
        hud.textContent = `key:${key} len:${(+len||0).toFixed(1)} ang:${(+ang||0).toFixed(2)} EVENT_LINEAR:${!!window.EVENT_LINEAR_TIMING}`;
        return out;
      };
    }
  })();
})();