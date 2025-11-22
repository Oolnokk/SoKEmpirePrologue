// HUD arch configuration
window.HUD_ARCH_CONFIG = {
  arch: {
    // circle geometry
    radiusPx: 150, // distance from arch center to button centers
    startAngleDeg: -150, // where the arch starts (deg, clockwise from +X)
    endAngleDeg: -30, // where the arch ends
    anchor: {
      // where the circle center sits on screen (0–1)
      x: 0.9, // near bottom-right
      y: 0.9
    },

    scale: 1.0, // global multiplier (can tie to character scale)
    buttonSizePx: 84, // base button square size
    defaultGapPx: 10, // default carving distance per segment
    rotateWithArch: true, // rotate along tangent? (fan out)
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
