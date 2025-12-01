(function () {
  const CFG = window.HUD_ARCH_CONFIG;

  function getViewportRect(rootEl) {
    const gameplayRoot =
      (rootEl && rootEl !== document.body ? rootEl : null) ||
      document.getElementById("gameStage") ||
      document.querySelector(".stage");

    if (gameplayRoot && gameplayRoot !== document.body) {
      const rect = gameplayRoot.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        offsetLeft: 0,
        offsetTop: 0,
      };
    }

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

  function vpPoint(coord, vp, flipVertical) {
    const normY = flipVertical ? 1 - coord.y : coord.y;
    return {
      x: vp.offsetLeft + coord.x * vp.width,
      y: vp.offsetTop + normY * vp.height,
    };
  }

  function normalizeAngleDelta(delta) {
    if (delta > Math.PI) return delta - Math.PI * 2;
    if (delta < -Math.PI) return delta + Math.PI * 2;
    return delta;
  }

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function radToDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  function buildButtonArch(rootEl) {
    const archCfg = CFG.arch;
    const btnCfgs = [...CFG.buttons];
    const scale = archCfg.scale || 1;
    const baseButtonHeight =
      (archCfg.buttonHeightPx ?? archCfg.buttonSizePx ?? archCfg.buttonWidthPx ?? 0) * scale;
    const baseButtonWidth =
      (archCfg.buttonWidthPx ?? archCfg.buttonHeightPx ?? archCfg.buttonSizePx ?? 0) * scale;

    const container = document.createElement("div");
    container.className = "arch-hud";
    container.style.position = rootEl === document.body ? "fixed" : "absolute";
    container.style.inset = "0";
    container.style.setProperty(
      "--arch-button-height",
      `${baseButtonHeight}px`
    );
    container.style.setProperty(
      "--arch-button-width",
      `${baseButtonWidth}px`
    );
    container.style.setProperty(
      "--arch-button-size",
      `${baseButtonHeight}px`
    );

    rootEl.appendChild(container);

    const vp = getViewportRect(rootEl);
    const radius = archCfg.circleRadius * scale;
    const flipY = archCfg.flipVertical !== false;
    const center = vpPoint(archCfg.circleCenter, vp, flipY);

    const startRad = degToRad(archCfg.startDegree);
    const endRad = degToRad(archCfg.endDegree);
    const arcDirection = archCfg.concave ? -1 : 1;
    const totalAngle = normalizeAngleDelta(endRad - startRad) * arcDirection;
    const totalLength = Math.abs(radius * totalAngle);
    if (!Number.isFinite(totalLength) || totalLength === 0) return container;

    const totalWeight = btnCfgs.reduce(
      (sum, btn) => sum + (btn.coverageWeight != null ? btn.coverageWeight : 1),
      0
    );
    if (!totalWeight) return container;

    btnCfgs.sort((a, b) => a.order - b.order);

    let cursorAngle = 0;
    const debug = archCfg.debug;
    const debugInfo = [];
    const archDebug = !debug
      ? null
      : {
          concave: !!archCfg.concave,
          center,
          radius,
          start: {
            x: center.x + radius * Math.cos(startRad),
            y: center.y + radius * Math.sin(startRad),
            deg: radToDeg(startRad),
          },
          end: {
            x: center.x + radius * Math.cos(endRad),
            y: center.y + radius * Math.sin(endRad),
            deg: radToDeg(endRad),
          },
          totalAngleDeg: radToDeg(totalAngle),
          totalWeight,
          arcDirection,
          arcLengthPx: totalLength,
        };

    if (debug) {
      const centerDot = document.createElement("div");
      centerDot.className = "arch-hud__debug-dot arch-hud__debug-dot--center";
      centerDot.style.left = `${center.x - 4}px`;
      centerDot.style.top = `${center.y - 4}px`;
      container.appendChild(centerDot);

      const startDot = document.createElement("div");
      startDot.className = "arch-hud__debug-dot arch-hud__debug-dot--start";
      startDot.style.left = `${archDebug.start.x - 3}px`;
      startDot.style.top = `${archDebug.start.y - 3}px`;
      container.appendChild(startDot);

      const endDot = document.createElement("div");
      endDot.className = "arch-hud__debug-dot arch-hud__debug-dot--end";
      endDot.style.left = `${archDebug.end.x - 3}px`;
      endDot.style.top = `${archDebug.end.y - 3}px`;
      container.appendChild(endDot);

      [
        { angleRad: startRad, color: "#f97316", height: radius },
        { angleRad: endRad, color: "#a78bfa", height: radius },
      ].forEach(({ angleRad, color, height }) => {
        const ray = document.createElement("div");
        ray.className = "arch-hud__debug-line";
        ray.style.height = `${height}px`;
        ray.style.background = color;
        ray.style.left = `${center.x - 1}px`;
        ray.style.top = `${center.y - height}px`;
        ray.style.transform = `rotate(${(angleRad * 180) / Math.PI}deg)`;
        container.appendChild(ray);
      });
    }

    btnCfgs.forEach((btnCfg) => {
      const weight = btnCfg.coverageWeight != null ? btnCfg.coverageWeight : 1;
      const spanAngle = Math.abs(totalAngle) * (weight / totalWeight);
      const sign = Math.sign(totalAngle) || 1;
      const gapDeg = btnCfg.gapDeg != null ? btnCfg.gapDeg : archCfg.defaultGapDeg || 0;
      const gapRad = degToRad(gapDeg);

      // Raw angles along arc
      const rawStartAngle = startRad + cursorAngle * sign;
      const rawEndAngle = rawStartAngle + spanAngle * sign;

      // Carve AFTER sizing
      const carvedStartAngle = rawStartAngle + (gapRad / 2) * sign;
      const carvedEndAngle = rawEndAngle - (gapRad / 2) * sign;

      const startA = Math.min(carvedStartAngle, carvedEndAngle);
      const endA = Math.max(carvedStartAngle, carvedEndAngle);
      const centerA = (startA + endA) * 0.5;

      const x = center.x + radius * Math.cos(centerA);
      const y = center.y + radius * Math.sin(centerA);

      const btnWidth = (btnCfg.widthPx != null ? btnCfg.widthPx : archCfg.buttonWidthPx) * scale;
      const btnHeight = baseButtonHeight;
      const halfWidth = btnWidth / 2;
      const halfHeight = btnHeight / 2;

      const btnEl = document.createElement("button");
      btnEl.className = "arch-hud__button";
      btnEl.id = `arch-btn-${btnCfg.id}`;

      let rotDeg = 0;
      if (archCfg.rotateWithArch) {
        rotDeg = radToDeg(centerA) + 90;
      }

      btnEl.style.left = `${x - halfWidth}px`;
      btnEl.style.top = `${y - halfHeight}px`;
      btnEl.style.transform = `rotate(${rotDeg}deg)`;
      btnEl.style.width = `${btnWidth}px`;
      btnEl.style.height = `${btnHeight}px`;

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
          weight,
          rawStartDeg: radToDeg(rawStartAngle),
          rawEndDeg: radToDeg(rawEndAngle),
          carvedStartDeg: radToDeg(startA),
          carvedEndDeg: radToDeg(endA),
          spanDeg: radToDeg(spanAngle),
          gapDeg,
          angleDeg: radToDeg(centerA),
          screenX: x,
          screenY: y,
          widthPx: btnWidth,
          heightPx: btnHeight,
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
        line.style.transform = `rotate(${radToDeg(centerA)}deg)`;
        container.appendChild(line);
      }

      cursorAngle += spanAngle;
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
      dbg.textContent = JSON.stringify(
        {
          arch: archDebug,
          buttons: debugInfo,
        },
        null,
        2
      );
      container.appendChild(dbg);
    }

    return container;
  }

  let currentContainer = null;
  let resizeTimer = null;

  function getHudRoot() {
    const stage = document.getElementById("gameStage") || document.querySelector(".stage");
    if (stage) return stage;
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
