(function () {
  const CFG = window.HUD_ARCH_CONFIG;

  function getViewportRect() {
    const vv = window.visualViewport;
    if (vv) {
      return {
        width: vv.width,
        height: vv.height,
        offsetLeft: vv.offsetLeft,
        offsetTop: vv.offsetTop,
      };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
    };
  }

  function vpPoint(coord, vp) {
    return {
      x: vp.offsetLeft + coord.x * vp.width,
      y: vp.offsetTop + coord.y * vp.height,
    };
  }

  function chooseCircleCenter(p0, p1, radius, preference) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dSq = dx * dx + dy * dy;
    const d = Math.sqrt(dSq);
    if (!d || d > radius * 2) return null;

    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;
    const h = Math.sqrt(Math.max(radius * radius - (d / 2) * (d / 2), 0));

    const ux = -dy / d;
    const uy = dx / d;

    const c1 = { x: mx + ux * h, y: my + uy * h };
    const c2 = { x: mx - ux * h, y: my - uy * h };

    const target = preference || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const dist1 = (c1.x - target.x) ** 2 + (c1.y - target.y) ** 2;
    const dist2 = (c2.x - target.x) ** 2 + (c2.y - target.y) ** 2;
    return dist1 <= dist2 ? c1 : c2;
  }

  function normalizeAngleDelta(delta) {
    if (delta > Math.PI) return delta - Math.PI * 2;
    if (delta < -Math.PI) return delta + Math.PI * 2;
    return delta;
  }

  function buildButtonArch(rootEl) {
    const archCfg = CFG.arch;
    const btnCfgs = [...CFG.buttons];

    const container = document.createElement("div");
    container.className = "arch-hud";
    container.style.setProperty(
      "--arch-button-size",
      `${archCfg.buttonSizePx * (archCfg.scale || 1)}px`
    );

    rootEl.appendChild(container);

    const vp = getViewportRect();
    const radius = archCfg.radiusPx * (archCfg.scale || 1);
    const startPt = vpPoint(archCfg.start, vp);
    const endPt = vpPoint(archCfg.end, vp);
    const center = chooseCircleCenter(startPt, endPt, radius, {
      x: vp.offsetLeft + vp.width * 0.5,
      y: vp.offsetTop + vp.height * 0.5,
    });
    if (!center) return container;

    const startRad = Math.atan2(startPt.y - center.y, startPt.x - center.x);
    const endRad = Math.atan2(endPt.y - center.y, endPt.x - center.x);
    const totalAngle = normalizeAngleDelta(endRad - startRad);
    const totalLength = Math.abs(radius * totalAngle);
    if (!Number.isFinite(totalLength) || totalLength === 0) return container;

    btnCfgs.sort((a, b) => a.order - b.order);

    let cursorLen = 0;
    const debug = archCfg.debug;
    const debugInfo = [];

    btnCfgs.forEach((btnCfg) => {
      const segLength = btnCfg.lengthPct * totalLength;
      const gap = btnCfg.gapPx != null ? btnCfg.gapPx : archCfg.defaultGapPx || 0;

      // Raw segment along arc
      const rawStart = cursorLen;
      const rawEnd = cursorLen + segLength;

      // Carve AFTER sizing
      const carvedStart = rawStart + gap / 2;
      const carvedEnd = rawEnd - gap / 2;

      const startL = Math.min(carvedStart, carvedEnd);
      const endL = Math.max(carvedStart, carvedEnd);
      const centerL = (startL + endL) * 0.5;

      const t = centerL / totalLength; // 0..1 along the arch
      const angleAlong = totalAngle * t + startRad; // radians

      const x = center.x + radius * Math.cos(angleAlong);
      const y = center.y + radius * Math.sin(angleAlong);

      const size = archCfg.buttonSizePx * (archCfg.scale || 1);
      const halfSize = size / 2;

      const btnEl = document.createElement("button");
      btnEl.className = "arch-hud__button";
      btnEl.id = `arch-btn-${btnCfg.id}`;

      let rotDeg = 0;
      if (archCfg.rotateWithArch) {
        rotDeg = (angleAlong * 180) / Math.PI + 90;
      }

      btnEl.style.left = `${x - halfSize}px`;
      btnEl.style.top = `${y - halfSize}px`;
      btnEl.style.transform = `rotate(${rotDeg}deg)`;

      if (btnCfg.sprite) {
        const img = document.createElement("img");
        img.src = btnCfg.sprite;
        img.alt = btnCfg.id;
        btnEl.appendChild(img);
      }

      // --- Hook your existing ability logic here ----------------------------
      // Example:
      // btnEl.addEventListener("pointerdown", () => triggerAbility(btnCfg.id));
      // Replace `triggerAbility` with whatever your current buttons call.
      // ----------------------------------------------------------------------

      container.appendChild(btnEl);

      if (debug) {
        debugInfo.push({
          id: btnCfg.id,
          rawStart,
          rawEnd,
          carvedStart: startL,
          carvedEnd: endL,
          angleDeg: (angleAlong * 180) / Math.PI,
          screenX: x,
          screenY: y
        });

        const dot = document.createElement("div");
        dot.className = "arch-hud__debug-dot";
        dot.style.left = `${x - 3}px`;
        dot.style.top = `${y - 3}px`;
        container.appendChild(dot);

        const line = document.createElement("div");
        line.className = "arch-hud__debug-line";
        line.style.left = `${x - 1}px`;
        line.style.top = `${y - radius - 18}px`;
        line.style.transform = `rotate(${(angleAlong * 180) / Math.PI}deg)`;
        container.appendChild(line);
      }

      cursorLen += segLength;
    });

    if (debug) {
      const dbg = document.createElement("pre");
      dbg.style.position = "fixed";
      dbg.style.left = "8px";
      dbg.style.bottom = "8px";
      dbg.style.maxWidth = "70vw";
      dbg.style.maxHeight = "40vh";
      dbg.style.overflow = "auto";
      dbg.style.fontSize = "10px";
      dbg.style.background = "rgba(15,23,42,0.9)";
      dbg.style.color = "#e5e7eb";
      dbg.style.padding = "6px 8px";
      dbg.style.borderRadius = "6px";
      dbg.style.zIndex = "999";
      dbg.textContent = JSON.stringify(debugInfo, null, 2);
      container.appendChild(dbg);
    }

    return container;
  }

  let currentContainer = null;
  let resizeTimer = null;

  function getHudRoot() {
    return document.fullscreenElement || document.body;
  }

  function rebuildArchHUD() {
    const root = getHudRoot(); // or your HUD root element
    if (currentContainer && currentContainer.parentNode) {
      currentContainer.parentNode.removeChild(currentContainer);
    }
    currentContainer = buildButtonArch(root);
  }

  // Public API you can call from elsewhere if the scale/anchor changes
  window.rebuildArchHUD = rebuildArchHUD;

  function initArchHUD() {
    rebuildArchHUD();
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuildArchHUD, 80);
    });
    document.addEventListener("fullscreenchange", rebuildArchHUD);
  }

  window.addEventListener("DOMContentLoaded", initArchHUD);
})();
