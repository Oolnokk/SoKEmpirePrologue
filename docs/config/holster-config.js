(function attachHolsterConfig(globalScope) {
  globalScope.CONFIG = globalScope.CONFIG || {};

  const defaultHolsterConfig = {
    source: {
      srcParamName: 'src',
      fallbackSrc: '../ScratchbonesBluffGame.html'
    },
    viewport: {
      widthParamName: 'vw',
      heightParamName: 'vh',
      defaultDesignedViewportWidth: 1920,
      defaultDesignedViewportHeight: 1080
    },
    geometry: {
      hostPadding: {
        widthRatio: 0.06,
        heightRatio: 0.08,
        minPx: 10,
        maxPx: 64
      },
      trapezoid: {
        topEdgeRatioByWidth: 0.78,
        minTopEdgeRatio: 0.62,
        maxTopEdgeRatio: 0.95
      },
      borderRadius: {
        radiusPxByWidth: 22,
        minPx: 10,
        maxPx: 34
      },
      perspective: {
        depthPxByWidth: 56,
        minDepthPx: 16,
        maxDepthPx: 180
      },
      transform: {
        offsetXPx: 0,
        offsetYPx: 0,
        tabletopShadow: '0 34px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)'
      }
    },
    interaction: {
      directIframeInput: true,
      forwardPointerEvents: false
    },
    billboard: {
      selectors: [],
      avatars: [
        { selector: '[data-proj-id="avatar-1"]', scale: 3, fromLeftPx: 28, fromTopPx: 24 },
        { selector: '[data-proj-id="avatar-2"]', scale: 3, fromLeftPx: 220, fromTopPx: 20 },
        { selector: '[data-proj-id="avatar-3"]', scale: 3, fromRightPx: 28, fromTopPx: 24 }
      ]
    }
  };

  const existingHolsterConfig = globalScope.CONFIG.holster || {};
  globalScope.CONFIG.holster = {
    ...defaultHolsterConfig,
    ...existingHolsterConfig,
    source: {
      ...defaultHolsterConfig.source,
      ...(existingHolsterConfig.source || {})
    },
    viewport: {
      ...defaultHolsterConfig.viewport,
      ...(existingHolsterConfig.viewport || {})
    },
    geometry: {
      ...defaultHolsterConfig.geometry,
      ...(existingHolsterConfig.geometry || {}),
      hostPadding: {
        ...defaultHolsterConfig.geometry.hostPadding,
        ...(existingHolsterConfig.geometry?.hostPadding || {})
      },
      trapezoid: {
        ...defaultHolsterConfig.geometry.trapezoid,
        ...(existingHolsterConfig.geometry?.trapezoid || {})
      },
      borderRadius: {
        ...defaultHolsterConfig.geometry.borderRadius,
        ...(existingHolsterConfig.geometry?.borderRadius || {})
      },
      perspective: {
        ...defaultHolsterConfig.geometry.perspective,
        ...(existingHolsterConfig.geometry?.perspective || {})
      },
      transform: {
        ...defaultHolsterConfig.geometry.transform,
        ...(existingHolsterConfig.geometry?.transform || {})
      }
    },
    interaction: {
      ...defaultHolsterConfig.interaction,
      ...(existingHolsterConfig.interaction || {})
    },
    billboard: {
      ...defaultHolsterConfig.billboard,
      ...(existingHolsterConfig.billboard || {})
    }
  };
})(window);
