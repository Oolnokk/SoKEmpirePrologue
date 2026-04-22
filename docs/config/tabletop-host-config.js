(function attachTabletopHostConfig(globalScope) {
  const defaultConfig = {
    srcParamName: 'src',
    fallbackSrc: '../ScratchbonesBluffGame.html',
    viewportWidthParamName: 'vw',
    viewportHeightParamName: 'vh',
    defaultDesignedViewportWidth: 1920,
    defaultDesignedViewportHeight: 1080,
    minTopEdgeRatio: 0.62,
    maxTopEdgeRatio: 0.95,
    topEdgeRatioByWidth: 0.78,
    maxTiltDeg: 36,
    minTiltDeg: 18,
    tiltDegByHeight: 26,
    perspectivePxByWidth: 1000,
    minPerspectivePx: 700,
    maxPerspectivePx: 2200,
    minHostPaddingPx: 10,
    maxHostPaddingPx: 64,
    borderRadiusPxByWidth: 22,
    minBorderRadiusPx: 10,
    maxBorderRadiusPx: 34,
    tabletopShadow: '0 34px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)'
  };

  globalScope.TABLETOP_HOST_CONFIG = Object.assign({}, defaultConfig, globalScope.TABLETOP_HOST_CONFIG || {});
})(window);
