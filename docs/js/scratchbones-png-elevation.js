/*
 * Scratchbones transparent PNG elevation runtime.
 * Wraps scratchbone-card and coin PNG <img> elements in a lightweight host that adds:
 * - a 50%-brightness physical-face duplicate underneath the original PNG
 * - an edge-aware drop-shadow on the visible PNG
 * - continuous face-offset recalculation during DOM animations/transforms
 *
 * Defaults requested by Benjam:
 * - Scratchbone card PNGs: perspective depth 920px, physical face on, face offset 0.00x
 * - Coin PNGs: perspective depth 1900px, physical face on, face offset 0.00x
 */
(function scratchbonesPngElevationRuntime() {
  'use strict';

  const STYLE_ID = 'scratchbones-png-elevation-style';
  const HOST_CLASS = 'sbPngElevatedHost';
  const MAIN_CLASS = 'sbPngMainImage';
  const FACE_CLASS = 'sbPngPhysicalFace';
  const DEBUG_FLAG = 'sbPngElevationDebug';
  const FRAME_MS = 1000 / 60;
  const LERP_STRENGTH = 0.24;
  const SNAP_EPSILON = 0.05;

  const state = {
    hosts: new Set(),
    raf: 0,
    lastFrameAt: 0,
    observer: null,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --sb-card-perspective-depth: 920px;
        --sb-card-perspective-origin-x: var(--layout-card-perspective-origin-x, 50%);
        --sb-card-perspective-origin-y: var(--layout-card-perspective-origin-y, 118%);
        --sb-card-face-enabled: 1;
        --sb-card-face-offset-scale: 0;
        --sb-card-face-alpha: 1;
        --sb-card-face-brightness: 0.5;
        --sb-card-face-saturation: 0.85;
        --sb-card-lift-z: var(--layout-card-depth-z, 14px);
        --sb-card-cast-shadow-x: var(--layout-card-shadow-offset-x, 1.5px);
        --sb-card-cast-shadow-y: var(--layout-card-shadow-offset-y, 9px);
        --sb-card-cast-shadow-blur: var(--layout-card-shadow-blur, 12px);
        --sb-card-cast-shadow-alpha: var(--layout-card-shadow-alpha, 0.34);
        --sb-card-contact-alpha: var(--layout-card-contact-alpha, 0.2);

        --sb-coin-perspective-depth: 1900px;
        --sb-coin-perspective-origin-x: 50%;
        --sb-coin-perspective-origin-y: 118%;
        --sb-coin-face-enabled: 1;
        --sb-coin-face-offset-scale: 0;
        --sb-coin-face-alpha: 1;
        --sb-coin-face-brightness: 0.5;
        --sb-coin-face-saturation: 0.9;
        --sb-coin-lift-z: 10px;
        --sb-coin-cast-shadow-x: 0px;
        --sb-coin-cast-shadow-y: 4px;
        --sb-coin-cast-shadow-blur: 7px;
        --sb-coin-cast-shadow-alpha: 0.46;
        --sb-coin-contact-alpha: 0.24;
      }

      .tableViewCard,
      .claimHandBar .tableViewCard,
      .stakeTierBtn,
      .stakeAnchor {
        overflow: visible !important;
      }

      .${HOST_CLASS} {
        --sb-face-x: 0px;
        --sb-face-y: 0px;
        --sb-face-enabled: var(--sb-card-face-enabled);
        --sb-face-alpha: var(--sb-card-face-alpha);
        --sb-face-brightness: var(--sb-card-face-brightness);
        --sb-face-saturation: var(--sb-card-face-saturation);
        --sb-cast-shadow-x: var(--sb-card-cast-shadow-x);
        --sb-cast-shadow-y: var(--sb-card-cast-shadow-y);
        --sb-cast-shadow-blur: var(--sb-card-cast-shadow-blur);
        --sb-cast-shadow-alpha: var(--sb-card-cast-shadow-alpha);
        --sb-contact-alpha: var(--sb-card-contact-alpha);
        position: relative;
        display: inline-grid;
        place-items: center;
        transform-style: preserve-3d;
        perspective: var(--sb-card-perspective-depth);
        isolation: isolate;
        overflow: visible;
        max-width: 100%;
        max-height: 100%;
        vertical-align: middle;
      }

      .${HOST_CLASS}.sbPngKind-card {
        --sb-face-enabled: var(--sb-card-face-enabled);
        --sb-face-alpha: var(--sb-card-face-alpha);
        --sb-face-brightness: var(--sb-card-face-brightness);
        --sb-face-saturation: var(--sb-card-face-saturation);
        --sb-cast-shadow-x: var(--sb-card-cast-shadow-x);
        --sb-cast-shadow-y: var(--sb-card-cast-shadow-y);
        --sb-cast-shadow-blur: var(--sb-card-cast-shadow-blur);
        --sb-cast-shadow-alpha: var(--sb-card-cast-shadow-alpha);
        --sb-contact-alpha: var(--sb-card-contact-alpha);
        perspective: var(--sb-card-perspective-depth);
      }

      .${HOST_CLASS}.sbPngKind-coin {
        --sb-face-enabled: var(--sb-coin-face-enabled);
        --sb-face-alpha: var(--sb-coin-face-alpha);
        --sb-face-brightness: var(--sb-coin-face-brightness);
        --sb-face-saturation: var(--sb-coin-face-saturation);
        --sb-cast-shadow-x: var(--sb-coin-cast-shadow-x);
        --sb-cast-shadow-y: var(--sb-coin-cast-shadow-y);
        --sb-cast-shadow-blur: var(--sb-coin-cast-shadow-blur);
        --sb-cast-shadow-alpha: var(--sb-coin-cast-shadow-alpha);
        --sb-contact-alpha: var(--sb-coin-contact-alpha);
        perspective: var(--sb-coin-perspective-depth);
      }

      .tableViewCard > .${HOST_CLASS},
      .claimHandBar .tableViewCard > .${HOST_CLASS} {
        width: 100%;
        height: 100%;
      }

      .stakeAnchor .${HOST_CLASS} {
        width: var(--layout-betting-contribution-coin-size, 52px);
        height: var(--layout-betting-contribution-coin-size, 52px);
      }

      .stakeTierBtn .${HOST_CLASS} {
        width: calc(var(--layout-betting-coin-button-size, 72px) * 0.62);
        height: calc(var(--layout-betting-coin-button-size, 72px) * 0.62);
      }

      .${HOST_CLASS}::before {
        content: '';
        position: absolute;
        left: 16%;
        right: 16%;
        bottom: 5%;
        height: 11%;
        border-radius: 999px;
        background: radial-gradient(ellipse at center, rgba(0,0,0,var(--sb-contact-alpha)) 0%, rgba(0,0,0,calc(var(--sb-contact-alpha) * 0.46)) 44%, transparent 78%);
        filter: blur(6px);
        transform: translateZ(-1px) translateY(16%);
        pointer-events: none;
        z-index: -2;
      }

      .${FACE_CLASS},
      .${MAIN_CLASS} {
        grid-area: 1 / 1;
        max-width: 100%;
        max-height: 100%;
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        -webkit-user-drag: none;
        user-select: none;
      }

      .${FACE_CLASS} {
        position: relative;
        z-index: 0;
        pointer-events: none;
        opacity: calc(var(--sb-face-alpha) * var(--sb-face-enabled));
        filter: brightness(var(--sb-face-brightness)) saturate(var(--sb-face-saturation));
        mix-blend-mode: multiply;
        transform: translate(var(--sb-face-x), var(--sb-face-y)) translateZ(-1px);
        transform-origin: center center;
      }

      .${MAIN_CLASS} {
        position: relative;
        z-index: 1;
        filter: drop-shadow(var(--sb-cast-shadow-x) var(--sb-cast-shadow-y) var(--sb-cast-shadow-blur) rgba(0,0,0,var(--sb-cast-shadow-alpha)));
        transform: translateZ(1px);
        transform-origin: center center;
      }

      .tableViewCard .${MAIN_CLASS} {
        transform: scale(var(--layout-table-card-content-scale, 1)) translateZ(1px);
      }

      .tableViewCard .${FACE_CLASS} {
        transform: scale(var(--layout-table-card-content-scale, 1)) translate(var(--sb-face-x), var(--sb-face-y)) translateZ(-1px);
      }
    `;
    document.head.appendChild(style);
  }

  function logDebug(message, data) {
    if (!window[DEBUG_FLAG]) return;
    console.log('[png-elevation]', message, data || '');
  }

  function parsePercent(raw, fallback) {
    const parsed = Number.parseFloat(String(raw || '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function classifyImage(img) {
    if (!img || img.classList.contains(FACE_CLASS) || img.closest(`.${HOST_CLASS}`)) return null;
    const src = String(img.currentSrc || img.src || img.getAttribute('src') || '').toLowerCase();
    const alt = String(img.getAttribute('alt') || '').toLowerCase();
    const attrNames = Array.from(img.getAttributeNames ? img.getAttributeNames() : []).join(' ').toLowerCase();
    const inCard = Boolean(img.closest('.tableViewCard, .claimHandBar, .cardArt, .card'));
    const inCoin = Boolean(img.closest('.stakeTierBtn, .stakeAnchor, [data-stake-betting-choice-anchor], [data-stake-pot-center-anchor], [data-stake-left-contribution-anchor], [data-stake-right-contribution-anchor]'));
    const looksCoin = src.includes('coin') || alt.includes('coin') || attrNames.includes('stake') || img.classList.contains('cin-token-icon');
    const looksScratchbone = src.includes('scratchbone') || src.includes('scratchbones') || inCard;
    if (inCoin || looksCoin) return 'coin';
    if (looksScratchbone) return 'card';
    return null;
  }

  function syncCloneSource(host) {
    const main = host.querySelector(`.${MAIN_CLASS}`);
    const face = host.querySelector(`.${FACE_CLASS}`);
    if (!main || !face) return;
    const src = main.currentSrc || main.src || main.getAttribute('src') || '';
    if (src && face.getAttribute('src') !== src) face.setAttribute('src', src);
  }

  function wrapImage(img) {
    const kind = classifyImage(img);
    if (!kind) return null;
    const wrapper = document.createElement('span');
    wrapper.className = `${HOST_CLASS} sbPngKind-${kind}`;
    wrapper.dataset.sbPngKind = kind;

    const face = img.cloneNode(false);
    face.className = `${FACE_CLASS} ${img.className || ''}`.trim();
    face.setAttribute('aria-hidden', 'true');
    face.removeAttribute('id');
    face.removeAttribute('role');
    face.removeAttribute('tabindex');

    img.classList.add(MAIN_CLASS);
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(face);
    wrapper.appendChild(img);
    state.hosts.add(wrapper);
    syncCloneSource(wrapper);
    updateHostTarget(wrapper, { immediate: true });
    logDebug('wrapped png', { kind, src: img.getAttribute('src') });
    return wrapper;
  }

  function findApp() {
    return document.getElementById('app') || document.body;
  }

  function effectiveOrigin(host) {
    const app = findApp();
    const kind = host.dataset.sbPngKind || 'card';
    const style = getComputedStyle(document.documentElement);
    const xVar = kind === 'coin' ? '--sb-coin-perspective-origin-x' : '--sb-card-perspective-origin-x';
    const yVar = kind === 'coin' ? '--sb-coin-perspective-origin-y' : '--sb-card-perspective-origin-y';
    const x = parsePercent(style.getPropertyValue(xVar), 50);
    const y = parsePercent(style.getPropertyValue(yVar), 118);
    return { app, x, y };
  }

  function updateHostTarget(host, { immediate = false } = {}) {
    if (!host.isConnected) {
      state.hosts.delete(host);
      return false;
    }
    syncCloneSource(host);
    const kind = host.dataset.sbPngKind || 'card';
    const rootStyle = getComputedStyle(document.documentElement);
    const scaleVar = kind === 'coin' ? '--sb-coin-face-offset-scale' : '--sb-card-face-offset-scale';
    const liftVar = kind === 'coin' ? '--sb-coin-lift-z' : '--sb-card-lift-z';
    const offsetScale = parsePercent(rootStyle.getPropertyValue(scaleVar), 0);
    const liftPx = parsePercent(rootStyle.getPropertyValue(liftVar), kind === 'coin' ? 10 : 14);
    const { app, x: originX, y: originY } = effectiveOrigin(host);
    const appRect = app.getBoundingClientRect();
    const rect = host.getBoundingClientRect();
    if (!appRect.width || !appRect.height || !rect.width || !rect.height) return false;

    const centerXPct = ((rect.left + rect.width / 2 - appRect.left) / appRect.width) * 100;
    const centerYPct = ((rect.top + rect.height / 2 - appRect.top) / appRect.height) * 100;
    const targetX = ((centerXPct - originX) / 100) * liftPx * 1.9 * offsetScale;
    const targetY = ((centerYPct - originY) / 100) * liftPx * 1.45 * offsetScale;
    host._sbTargetX = targetX;
    host._sbTargetY = targetY;

    if (immediate || !Number.isFinite(host._sbRenderX) || !Number.isFinite(host._sbRenderY)) {
      host._sbRenderX = targetX;
      host._sbRenderY = targetY;
      host.style.setProperty('--sb-face-x', `${targetX.toFixed(2)}px`);
      host.style.setProperty('--sb-face-y', `${targetY.toFixed(2)}px`);
    }
    return true;
  }

  function frameLerp(deltaMs) {
    const scaledFrames = Math.max(0.001, deltaMs / FRAME_MS);
    return 1 - Math.pow(1 - LERP_STRENGTH, scaledFrames);
  }

  function animationFrame(now) {
    const deltaMs = state.lastFrameAt ? now - state.lastFrameAt : FRAME_MS;
    state.lastFrameAt = now;
    const t = frameLerp(deltaMs);
    let keepRunning = false;

    for (const host of Array.from(state.hosts)) {
      if (!updateHostTarget(host)) continue;
      const currentX = Number.isFinite(host._sbRenderX) ? host._sbRenderX : host._sbTargetX;
      const currentY = Number.isFinite(host._sbRenderY) ? host._sbRenderY : host._sbTargetY;
      const nextX = currentX + (host._sbTargetX - currentX) * t;
      const nextY = currentY + (host._sbTargetY - currentY) * t;
      const snapX = Math.abs(host._sbTargetX - nextX) <= SNAP_EPSILON;
      const snapY = Math.abs(host._sbTargetY - nextY) <= SNAP_EPSILON;
      host._sbRenderX = snapX ? host._sbTargetX : nextX;
      host._sbRenderY = snapY ? host._sbTargetY : nextY;
      host.style.setProperty('--sb-face-x', `${host._sbRenderX.toFixed(2)}px`);
      host.style.setProperty('--sb-face-y', `${host._sbRenderY.toFixed(2)}px`);
      if (!snapX || !snapY) keepRunning = true;
    }

    if (keepRunning || state.hosts.size) {
      state.raf = window.requestAnimationFrame(animationFrame);
    } else {
      state.raf = 0;
      state.lastFrameAt = 0;
    }
  }

  function ensureAnimation() {
    if (!state.raf) state.raf = window.requestAnimationFrame(animationFrame);
  }

  function scan(root = document) {
    const imgs = root.matches?.('img') ? [root] : Array.from(root.querySelectorAll?.('img') || []);
    imgs.forEach(wrapImage);
    ensureAnimation();
  }

  function observe() {
    if (state.observer) return;
    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) scan(node);
          });
        } else if (mutation.type === 'attributes' && mutation.target?.classList?.contains(MAIN_CLASS)) {
          const host = mutation.target.closest(`.${HOST_CLASS}`);
          if (host) syncCloneSource(host);
        }
      }
      ensureAnimation();
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'data-stake-current-coin', 'data-stake-contrib-coin'],
    });
  }

  function init() {
    injectStyles();
    scan(document);
    observe();
    window.ScratchbonesPngElevation = {
      rescan: () => scan(document),
      hosts: state.hosts,
      setDebug: (enabled) => { window[DEBUG_FLAG] = Boolean(enabled); },
    };
    console.log('[png-elevation] ready', {
      cardPerspective: getComputedStyle(document.documentElement).getPropertyValue('--sb-card-perspective-depth').trim(),
      coinPerspective: getComputedStyle(document.documentElement).getPropertyValue('--sb-coin-perspective-depth').trim(),
      cardFaceOffset: getComputedStyle(document.documentElement).getPropertyValue('--sb-card-face-offset-scale').trim(),
      coinFaceOffset: getComputedStyle(document.documentElement).getPropertyValue('--sb-coin-face-offset-scale').trim(),
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
