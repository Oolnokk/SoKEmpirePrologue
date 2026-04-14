window.PORTRAIT_CONFIG = {
  canvas: { width: 200, height: 200, layerSize: 80 },
  headXform: { ax: 0, ay: -0.1, sx: 0.95, sy: 1.14 },
  bodyColorLimits: {
    A: { hMin: -100, hMax: -30, sMin: 0.05, sMax: 0.75, vMin: -0.50, vMax: 0.20 },
    B: { hMin: -100, hMax: -30, sMin: -0.20, sMax: 0.90, vMin: -0.85, vMax: 0.10 },
    C: { hMin: -100, hMax: -30, sMin: -0.65, sMax: 0.65, vMin: -0.25, vMax: 0.55 }
  },
  fighters: [
    {
      id: 'M',
      label: 'Mao-ao (M)',
      headUrl: 'fightersprites/mao-ao-m/head_mint.png',
      bodyLayers: [
        { id: 'armL', url: 'portraitsprites/arm-L_mao-ao_m.png', tintSlot: 'A', pos: 'back' },
        { id: 'torso', url: 'portraitsprites/torso_mao-ao_m.png', tintSlot: 'A', pos: 'back' },
        { id: 'armR', url: 'portraitsprites/arm-R_mao-ao_m.png', tintSlot: 'A', pos: 'back' }
      ],
      urLayers: [
        { url: 'fightersprites/mao-ao-m/untinted_regions/ur-head.png' }
      ]
    },
    {
      id: 'F',
      label: 'Mao-ao (F)',
      headUrl: 'fightersprites/mao-ao-f/head.png',
      bodyLayers: [
        { id: 'armL', url: 'portraitsprites/arm-L_mao-ao_f.png', tintSlot: 'A', pos: 'back' },
        { id: 'torso', url: 'portraitsprites/torso_mao-ao_f.png', tintSlot: 'A', pos: 'back' },
        { id: 'armR', url: 'portraitsprites/arm-R_mao-ao_f.png', tintSlot: 'A', pos: 'back' }
      ],
      urLayers: [
        { url: 'fightersprites/mao-ao-f/untinted_regions/ur-head.png' }
      ]
    }
  ]
};
