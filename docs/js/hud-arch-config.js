// HUD arch configuration
window.HUD_ARCH_CONFIG = {
  arch: {
    // circle geometry
    // Option 1: set an absolute pixel override (number)
    // Option 2: use adaptive sizing below (preferred default)
    radiusPx: {
      base: 150, // fallback for very small viewports
      viewportPct: 0.18, // portion of the smaller viewport side
      min: 120,
      max: 240,
    },
    start: {
      x: 0.98, // near the far bottom-right edge
      y: 0.94
    },
    end: {
      x: 0.78, // lower-right edge, pulled inward
      y: 0.86
    },
    circleRadius: 150, // distance from arch center to button centers
    startDegree: 215, // degrees from +X axis
    endDegree: 140, // degrees from +X axis

    scale: 1.0, // global multiplier (can tie to character scale)
    buttonSizePx: {
      base: 84,
      viewportPct: 0.1, // portion of the smaller viewport side
      min: 68,
      max: 124,
    }, // base button square size
    defaultGapPx: 10, // default carving distance per segment
    rotateWithArch: true, // rotate along tangent? (fan out)
    flipVertical: false, // mirror along the horizontal axis to hug the gameplay viewport
    concave: false, // invert the arc direction
    debug: true // on-screen debug overlay
  },

  // YOU ONLY EDIT THIS LIST:
  buttons: [
    {
      id: "attackHeavy",
      order: 0, // first clockwise
      coverageWeight: 1.2, // share of available angle
      gapDeg: 10, // carve half on each side AFTER placement math
      widthPx: 108, // extra extrusion
      sprite: "img/ui/btn-heavy.png"
    },
    {
      id: "attackLight",
      order: 1,
      coverageWeight: 1,
      gapDeg: 8,
      sprite: "img/ui/btn-light.png"
    },
    {
      id: "attackSpecial",
      order: 2,
      coverageWeight: 1.1,
      gapDeg: 8,
      sprite: "img/ui/btn-special.png"
    },
    {
      id: "attackUtility",
      order: 3,
      coverageWeight: 1.7,
      gapDeg: 10,
      sprite: "img/ui/btn-utility.png"
    }
  ]
};
