(function initScratchbonesPngElevationRuntime() {
  const rootConfig = window.SCRATCHBONES_CONFIG?.game?.pngElevation || {};
  const cfg = {
    enabled: rootConfig.enabled !== false,
    debug: rootConfig.debug === true,
    easingEnabled: rootConfig.easing?.enabled !== false,
    easingSpeed: Number.isFinite(rootConfig.easing?.speed) ? rootConfig.easing.speed : 0.18,
    cards: {
      enabled: rootConfig.cards?.enabled !== false,
      perspectiveDepthPx: Number.isFinite(rootConfig.cards?.perspectiveDepthPx) ? rootConfig.cards.perspectiveDepthPx : 920,
      physicalEnabled: rootConfig.cards?.physicalFace?.enabled !== false,
      offsetFactor: Number.isFinite(rootConfig.cards?.physicalFace?.offsetFactor) ? rootConfig.cards.physicalFace.offsetFactor : 0
    },
    coins: {
      enabled: rootConfig.coins?.enabled !== false,
      perspectiveDepthPx: Number.isFinite(rootConfig.coins?.perspectiveDepthPx) ? rootConfig.coins.perspectiveDepthPx : 1900,
      physicalEnabled: rootConfig.coins?.physicalFace?.enabled !== false,
      offsetFactor: Number.isFinite(rootConfig.coins?.physicalFace?.offsetFactor) ? rootConfig.coins.physicalFace.offsetFactor : 0
    }
  };

  if (!cfg.enabled) {
    window.ScratchbonesPngElevation = {
      setDebug() {},
      rescan() {},
      getState() { return { enabled: false }; }
    };
    return;
  }

  const state = {
    observed: new Set(),
    records: new Map(),
    frameId: 0,
    observer: null,
    debug: cfg.debug
  };

  const STYLE_ID = 'scratchbones-png-elevation-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.sb-png-elevation-host{position:relative;display:inline-block;vertical-align:middle;perspective:var(--sb-perspective-depth,920px);transform-style:preserve-3d;}',
      '.sb-png-elevation-face{position:relative;z-index:2;display:block;filter:drop-shadow(0 8px 10px rgba(0,0,0,.24));}',
      '.sb-png-physical-face{position:absolute;left:0;top:0;z-index:1;pointer-events:none;transform-origin:center center;filter:brightness(.5);opacity:.98;}'
    ].join('');
    document.head.appendChild(style);
  }

  function log(...args) {
    if (state.debug) console.log('[ScratchbonesPngElevation]', ...args);
  }

  function classifyImage(img) {
    const src = (img.currentSrc || img.src || '').toLowerCase();
    const classText = `${img.className || ''} ${img.closest('[class]')?.className || ''}`.toLowerCase();
    const isCoin = src.includes('coin') || classText.includes('stake') || classText.includes('coin');
    const isCard = src.includes('scratchbone') || classText.includes('card') || classText.includes('scratchbone');
    if (isCoin && cfg.coins.enabled) return 'coin';
    if (isCard && cfg.cards.enabled) return 'card';
    return null;
  }

  function ensureWrapped(img, kind) {
    if (!(img instanceof HTMLImageElement) || img.dataset.sbPngElevation === 'true') return;
    if (img.closest('.sb-png-elevation-host')) return;

    const host = document.createElement('span');
    host.className = `sb-png-elevation-host sb-png-elevation-host-${kind}`;
    host.style.setProperty('--sb-perspective-depth', `${kind === 'coin' ? cfg.coins.perspectiveDepthPx : cfg.cards.perspectiveDepthPx}px`);

    img.parentNode.insertBefore(host, img);
    host.appendChild(img);

    img.classList.add('sb-png-elevation-face');
    img.dataset.sbPngElevation = 'true';

    const physicalEnabled = kind === 'coin' ? cfg.coins.physicalEnabled : cfg.cards.physicalEnabled;
    let physical = null;
    if (physicalEnabled) {
      physical = img.cloneNode(false);
      physical.removeAttribute('id');
      physical.className = 'sb-png-physical-face';
      physical.setAttribute('aria-hidden', 'true');
      physical.dataset.sbPngElevationPhysical = 'true';
      host.insertBefore(physical, img);
    }

    state.observed.add(img);
    state.records.set(img, {
      kind,
      host,
      physical,
      currentX: 0,
      currentY: 0,
      currentScale: 1
    });
    log('wrapped image', kind, img.currentSrc || img.src || '(no src)');
  }

  function syncPhysicalImage(record, img) {
    if (!record?.physical) return;
    if (record.physical.src !== img.currentSrc && record.physical.src !== img.src) {
      record.physical.src = img.currentSrc || img.src;
    }
    record.physical.style.width = `${img.clientWidth || img.naturalWidth || 0}px`;
    record.physical.style.height = `${img.clientHeight || img.naturalHeight || 0}px`;
  }

  function updateTransforms() {
    if (!state.observed.size) {
      state.frameId = 0;
      return;
    }

    state.observed.forEach((img) => {
      const record = state.records.get(img);
      if (!record) {
        state.observed.delete(img);
        return;
      }
      if (!img.isConnected || !record.host.isConnected) {
        state.records.delete(img);
        state.observed.delete(img);
        return;
      }

      syncPhysicalImage(record, img);

      if (!record.physical) return;

      const hostRect = record.host.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const centerX = (imgRect.left + (imgRect.width / 2)) - (hostRect.left + (hostRect.width / 2));
      const centerY = (imgRect.top + (imgRect.height / 2)) - (hostRect.top + (hostRect.height / 2));

      const factor = record.kind === 'coin' ? cfg.coins.offsetFactor : cfg.cards.offsetFactor;
      const targetX = centerX * factor;
      const targetY = centerY * factor;
      const targetScale = Math.max(0.6, 1 - (Math.abs(centerY) / Math.max(1, imgRect.height)) * 0.06);

      if (cfg.easingEnabled) {
        record.currentX += (targetX - record.currentX) * cfg.easingSpeed;
        record.currentY += (targetY - record.currentY) * cfg.easingSpeed;
        record.currentScale += (targetScale - record.currentScale) * cfg.easingSpeed;
      } else {
        record.currentX = targetX;
        record.currentY = targetY;
        record.currentScale = targetScale;
      }

      record.physical.style.transform = `translate3d(${record.currentX.toFixed(3)}px, ${record.currentY.toFixed(3)}px, -1px) scale(${record.currentScale.toFixed(4)})`;
    });

    state.frameId = requestAnimationFrame(updateTransforms);
  }

  function scanWithin(node) {
    if (!(node instanceof Element || node instanceof Document)) return;
    const candidates = node.querySelectorAll ? node.querySelectorAll('img') : [];
    candidates.forEach((img) => {
      const kind = classifyImage(img);
      if (kind) ensureWrapped(img, kind);
    });
  }

  function observeDom() {
    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(scanWithin);
        }
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
          const kind = classifyImage(mutation.target);
          if (kind) ensureWrapped(mutation.target, kind);
        }
      }
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'style']
    });
  }

  function boot() {
    scanWithin(document);
    observeDom();
    if (!state.frameId) state.frameId = requestAnimationFrame(updateTransforms);
    log('runtime started');
  }

  window.ScratchbonesPngElevation = {
    setDebug(enabled) {
      state.debug = Boolean(enabled);
      log('debug', state.debug ? 'enabled' : 'disabled');
    },
    rescan() {
      scanWithin(document);
      if (!state.frameId) state.frameId = requestAnimationFrame(updateTransforms);
      log('manual rescan complete');
    },
    getState() {
      return {
        enabled: true,
        wrappedCount: state.records.size,
        cards: cfg.cards,
        coins: cfg.coins,
        easing: { enabled: cfg.easingEnabled, speed: cfg.easingSpeed }
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
