// HUD arch configuration
window.HUD_ARCH_CONFIG = {
  arch: {
    // circle geometry
    circleCenter: {
      x: 1, // normalized viewport coordinate (right edge)
      y: 1 // bottom edge
    },
    circleRadius: 150, // distance from arch center to button centers
    startDegree: 215, // degrees from +X axis
    endDegree: 140, // degrees from +X axis

    scale: 1.0, // global multiplier (can tie to character scale)
    buttonHeightPx: 84, // base button height
    buttonWidthPx: 96, // base button width (tangential extrusion)
    defaultGapDeg: 8, // carve-out in degrees per segment
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
