// HUD arch configuration
window.HUD_ARCH_CONFIG = {
  arch: {
    // circle geometry
    radiusPx: 180,
    start: {
      x: 0.25,
      y: 0.75
    },
    end: {
      x: 0.5,
      y: 0.25
    },

    scale: 1.0,
    buttonSizePx: 30,
    defaultGapPx: 36,
    rotateWithArch: true,
    flipVertical: false,
    debug: false,
    gridSnapPx: 24
  },

  // Container transform for the entire arch
  container: {
    rotation: 0,
    scale: 0.5,
    // Viewport-relative offsets (0-1 range, where 0.5 = center)
    // These scale with viewport size, unlike pixel offsets
    offsetXPct: 0.115, 
    offsetYPct: 0.045 
  },

  // YOU ONLY EDIT THIS LIST:
  buttons: [
    {
      id: "attackA",
      action: "buttonA",
      order: 2,
      lengthPct: 0.25,
      gapPx: 36,
      letter: "A"
    },
    {
      id: "attackB",
      action: "buttonB",
      order: 3,
      lengthPct: 0.25,
      gapPx: 36,
      letter: "B"
    },
    {
      id: "attackC",
      action: "buttonC",
      order: 4,
      lengthPct: 0.25,
      gapPx: 36,
      letter: "C"
    },
    {
      id: "jump",
      action: "jump",
      order: 1,
      lengthPct: 0.25,
      gapPx: 36,
      letter: "J"
    }
  ]
};
