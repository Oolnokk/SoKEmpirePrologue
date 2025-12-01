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
    debug: true // on-screen debug overlay
  },

  // YOU ONLY EDIT THIS LIST:
  buttons: [
    {
      id: "attackHeavy",
      order: 0, // first clockwise
      lengthPct: 0.24, // 24% of full arch length
      gapPx: 14, // carve 7px off each side AFTER placement math
      sprite: "img/ui/btn-heavy.png"
    },
    {
      id: "attackLight",
      order: 1,
      lengthPct: 0.2,
      gapPx: 10,
      sprite: "img/ui/btn-light.png"
    },
    {
      id: "attackSpecial",
      order: 2,
      lengthPct: 0.22,
      gapPx: 12,
      sprite: "img/ui/btn-special.png"
    },
    {
      id: "attackUtility",
      order: 3,
      lengthPct: 0.34,
      gapPx: 14,
      sprite: "img/ui/btn-utility.png"
    }
  ]
};
