(function () {
  const CFG = window.HUD_ARCH_CONFIG;

  function vpX(frac) {
    return frac * window.innerWidth;
  }
  function vpY(frac) {
    return frac * window.innerHeight;
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

    const radius = archCfg.radiusPx * (archCfg.scale || 1);
    const startRad = (archCfg.startAngleDeg * Math.PI) / 180;
    const endRad = (archCfg.endAngleDeg * Math.PI) / 180;
    const totalAngle = endRad - startRad; // signed
    const totalLength = Math.abs(radius * totalAngle);

    const cx = vpX(archCfg.anchor.x);
    const cy = vpY(archCfg.anchor.y);

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

      const x = cx + radius * Math.cos(angleAlong);
      const y = cy + radius * Math.sin(angleAlong);

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

  function rebuildArchHUD() {
    const root = document.body; // or your HUD root element
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
  }

  window.addEventListener("DOMContentLoaded", initArchHUD);
})();
