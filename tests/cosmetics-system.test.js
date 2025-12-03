import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETIC_SLOTS, cosmeticTagFor, ensureCosmeticLayers, clearCosmeticCache, resolveFighterBodyColors, registerFighterCosmeticProfile } from '../docs/js/cosmetics.js';
import { clearPaletteCache } from '../docs/js/cosmetic-palettes.js';
import { composeStyleXformEntry } from '../docs/js/style-xform.js';
import { readFileSync } from 'node:fs';

const previousWindowForAnimator = typeof global.window === 'undefined' ? undefined : global.window;
if (previousWindowForAnimator === undefined){
  global.window = globalThis;
}
const { updateBreathing, applyStyleTransformComposer } = await import('../docs/js/animator.js');
if (previousWindowForAnimator === undefined){
  delete global.window;
} else {
  global.window = previousWindowForAnimator;
}

const EXPECTED_SLOTS = [
  'hat',
  'hood',
  'overwear',
  'torso',
  'legs',
  'arms',
  'upper-face',
  'lower-face',
  'hands',
  'feet',
  'shoulders',
  'beard',
  'hair'
];

test('COSMETIC_SLOTS includes all required slots', () => {
  deepStrictEqual(COSMETIC_SLOTS, EXPECTED_SLOTS);
});

test('cosmeticTagFor uppercases base tag and slot', () => {
  strictEqual(cosmeticTagFor('torso', 'hat'), 'TORSO__COS__HAT');
  strictEqual(cosmeticTagFor('torso', 'hat', 'back'), 'TORSO__COS__HAT__BACK');
  strictEqual(cosmeticTagFor('torso', 'hat', 'back', 'layer2'), 'TORSO__COS__HAT__BACK__LAYER2');
  strictEqual(cosmeticTagFor('torso', 'hat', 'front', 'exposed'), 'TORSO__COS__HAT__EXPOSED');
});

test('ensureCosmeticLayers resolves equipment with HSL limits applied', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'hat',
        hsl: {
          defaults: { h: 0, s: 0, l: 0 },
          limits: { h: [-30, 30], s: [-0.25, 0.25], l: [-0.5, 0.5] }
        },
        parts: {
          head: {
            image: { url: 'https://example.com/head.png' },
            spriteStyle: {
              base: { xform: { head: { scaleX: 1.1 } } }
            },
            warp: {
              base: {
                units: 'percent',
                tl: { y: -0.1 }
              }
            }
          }
        }
      }
    },
    fighters: {
      hero: {
        cosmetics: {
          slots: {
            hat: { id: 'demo_item', hsl: { h: 60, s: 1, l: 1 } }
          }
        }
      }
    }
  };
  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  strictEqual(layers[0].slot, 'hat');
  strictEqual(layers[0].partKey, 'head');
  strictEqual(layers[0].position, 'front');
  strictEqual(layers[0].layerRole, 'layer1');
  deepStrictEqual(layers[0].hsl, { h: 30, s: 0.25, l: 0.5 });
  strictEqual(typeof layers[0].styleOverride, 'object');
});

test('breathing overrides preserve cosmetic spriteStyle transforms', () => {
  const previousWindow = global.window;
  global.window = { GAME: {} };
  const fighter = {
    anim: {
      dt: 0.5,
      breath: { phase: 0, direction: 1, styleOverride: null, shoulderOffsets: null, active: false }
    },
    stamina: { current: 100, max: 100 }
  };
  const spec = {
    frames: [
      { torsoScaleX: 1, torsoScaleY: 1, left: { ax: 0, ay: 0 }, right: { ax: 0, ay: 0 } },
      { torsoScaleX: 1.2, torsoScaleY: 1.05, left: { ax: 0, ay: 0 }, right: { ax: 0, ay: 0 } }
    ],
    cycle: 4,
    speedMultiplier: { min: 1, max: 1 }
  };
  updateBreathing(fighter, 'fighter_1', spec);
  applyStyleTransformComposer(fighter, 'fighter_1', {});
  const override = global.window.GAME.ANIM_STYLE_OVERRIDES?.fighter_1;
  strictEqual(typeof override, 'object');
  const torsoAnimXform = override?.xform?.torso;
  strictEqual(torsoAnimXform?.scaleMulX > 1, true);
  strictEqual(torsoAnimXform?.scaleMulX <= 1.2, true);
  strictEqual(torsoAnimXform?.scaleMulY > 1, true);
  strictEqual(torsoAnimXform?.scaleMulY <= 1.05, true);
  const cosmeticXform = { scaleX: 0.8, scaleY: 0.9, ax: 6 };
  const composed = composeStyleXformEntry(cosmeticXform, torsoAnimXform);
  strictEqual(Math.abs(composed.scaleX - cosmeticXform.scaleX * torsoAnimXform.scaleMulX) < 1e-9, true);
  strictEqual(Math.abs(composed.scaleY - cosmeticXform.scaleY * torsoAnimXform.scaleMulY) < 1e-9, true);
  strictEqual(composed.ax, 6);
  strictEqual(cosmeticXform.scaleX, 0.8, 'composeStyleXformEntry should not mutate source');
  if (previousWindow === undefined){
    delete global.window;
  } else {
    global.window = previousWindow;
  }
});

test('ensureCosmeticLayers normalizes hsl arrays and string values', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'hat',
        hsl: {
          defaults: { h: 10, s: 0.1, l: -0.1 },
          limits: { h: [-45, 45], s: [-0.5, 0.5], l: [-0.5, 0.5] }
        },
        parts: {
          head: {
            image: { url: 'https://example.com/head.png' }
          }
        }
      }
    },
    fighters: {
      hero: {
        cosmetics: {
          slots: {
            hat: { id: 'demo_item', hsl: ['30', '0.4', '-0.2'] }
          }
        }
      }
    }
  };
  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  strictEqual(layers[0].position, 'front');
  deepStrictEqual(layers[0].hsl, { h: 30, s: 0.4, l: -0.2 });
});

test('ensureCosmeticLayers interprets percentage-style saturation and lightness', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'legs',
        hsl: {
          defaults: { h: 0, s: 0, l: 0 },
          limits: { h: [-45, 45], s: [-0.5, 0.5], l: [-0.5, 0.5] }
        },
        parts: {
          leg_L_upper: { image: { url: 'https://example.com/pants-left.png' } },
          leg_R_upper: { image: { url: 'https://example.com/pants-right.png' } }
        }
      }
    },
    fighters: {
      hero: {
        cosmetics: {
          slots: {
            legs: { id: 'demo_item', hsl: { h: 10, s: 80, l: -50 } }
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 2);
  layers.forEach((layer) => {
    strictEqual(layer.slot, 'legs');
    strictEqual(layer.position, 'front');
    deepStrictEqual(layer.hsl, { h: 10, s: 0.5, l: -0.5 });
  });
});

test('ensureCosmeticLayers expands layered part definitions', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      layered_hat: {
        slot: 'hat',
        parts: {
          head: {
            layers: {
              back: { image: { url: 'https://example.com/hair-back.png' } },
              front: { image: { url: 'https://example.com/hair-front.png' } }
            }
          }
        }
      }
    },
    fighters: {
      hero: {
        cosmetics: {
          slots: {
            hat: 'layered_hat'
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 2);
  const back = layers.find((layer) => layer.position === 'back');
  const front = layers.find((layer) => layer.position !== 'back');
  strictEqual(back?.asset?.url, 'https://example.com/hair-back.png');
  strictEqual(front?.asset?.url, 'https://example.com/hair-front.png');
});

test('appearance cosmetics inherit character body colors', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    characters: {
      hero: {
        fighter: 'hero',
        bodyColors: {
          A: { h: 15, s: 0.3, l: 0.1 }
        },
        appearance: {
          slots: {
            torso: { id: 'hero_markings', colors: ['A'] }
          },
          library: {
            hero_markings: {
              appearance: { inheritSprite: 'torso', bodyColors: ['A'] },
              parts: {
                torso: { image: { url: 'https://example.com/markings.png' } }
              }
            }
          }
        }
      }
    },
    fighters: {
      hero: {}
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  strictEqual(layers[0].slot, 'appearance:torso');
  deepStrictEqual(layers[0].hsl, { h: 15, s: 0.3, l: 0.1 });
  deepStrictEqual(layers[0].extra?.appearance?.bodyColors, ['A']);
  strictEqual(layers[0].styleKey, 'torso');
  strictEqual(layers[0].asset.alignRad, undefined);
});

test('appearance cosmetics apply profile overrides via base cosmetic id', () => {
  clearCosmeticCache();
  clearPaletteCache();
  registerFighterCosmeticProfile('hero', {
    cosmetics: {
      hero_markings: {
        parts: {
          torso: { spriteStyle: { base: { xform: { torso: { ax: 12 } } } } }
        }
      }
    }
  });

  const config = {
    fighters: {
      hero: {
        appearance: {
          slots: {
            torso: 'hero_markings'
          },
          library: {
            hero_markings: {
              slot: 'torso',
              appearance: { inheritSprite: 'torso' },
              parts: {
                torso: { image: { url: 'https://example.com/markings.png' } }
              }
            }
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  strictEqual(layers[0].slot, 'appearance:torso');
  strictEqual(layers[0].partKey, 'torso');
  strictEqual(layers[0].styleOverride?.base?.xform?.torso?.ax, 12);
});

test('resolveFighterBodyColors ignores stale palette when fighter changes', () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = {
      GAME: {
        selectedFighter: 'hero',
        selectedCharacter: 'rivalChar',
        selectedBodyColors: { A: { h: 0, s: 0, v: 0 } },
        selectedBodyColorsFighter: 'rival'
      }
    };

    const config = {
      fighters: {
        hero: {
          bodyColors: {
            A: { h: 68, s: 0.9, v: -0.5 }
          }
        },
        rival: {
          bodyColors: {
            A: { h: 0, s: 0, v: 0 }
          }
        }
      },
      characters: {
        rivalChar: { fighter: 'rival', bodyColors: { A: { h: 0, s: 0, v: 0 } } }
      }
    };

    const colors = resolveFighterBodyColors(config, 'hero');
    deepStrictEqual(colors, { A: { h: 68, s: 0.9, l: -0.5 } });
  } finally {
    globalThis.window = previousWindow;
  }
});

test('resolveFighterBodyColors reuses runtime palette when fighter matches metadata', () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = {
      GAME: {
        selectedFighter: 'hero',
        selectedBodyColors: { A: { h: 12, s: 0.25, v: 0.1 } },
        selectedBodyColorsFighter: 'hero'
      }
    };

    const config = {
      fighters: {
        hero: {
          bodyColors: {
            A: { h: 68, s: 0.9, v: -0.5 }
          }
        }
      }
    };

    const colors = resolveFighterBodyColors(config, 'hero');
    deepStrictEqual(colors, { A: { h: 12, s: 0.25, l: 0.1 } });
  } finally {
    globalThis.window = previousWindow;
  }
});

test('default character pants tint to blue for player and red for enemy', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const pants = JSON.parse(readFileSync(new URL('../docs/config/cosmetics/basic_pants.json', import.meta.url), 'utf8'));
  const config = {
    cosmeticLibrary: {
      basic_pants: pants
    },
    fighters: {
      player: {
        cosmetics: {
          slots: {
            legs: { id: 'basic_pants', hsv: { h: -120, s: 80, v: 10 } }
          }
        }
      },
      enemy1: {
        cosmetics: {
          slots: {
            legs: { id: 'basic_pants', hsv: { h: 0, s: 85, v: 5 } }
          }
        }
      }
    }
  };

  const playerLayers = ensureCosmeticLayers(config, 'player', {});
  const enemyLayers = ensureCosmeticLayers(config, 'enemy1', {});

  playerLayers
    .filter((layer) => layer.slot === 'legs')
    .forEach((layer) => {
      deepStrictEqual(layer.hsl, { h: -120, s: 0.8, l: 0.1 });
    });

  enemyLayers
    .filter((layer) => layer.slot === 'legs')
    .forEach((layer) => {
      deepStrictEqual(layer.hsl, { h: 0, s: 0.85, l: 0.05 });
    });
});

test('ensureCosmeticLayers exposes layer extra bone influence metadata', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const poncho = JSON.parse(readFileSync(new URL('../docs/config/cosmetics/simple_poncho.json', import.meta.url), 'utf8'));
  const config = {
    cosmeticLibrary: {
      simple_poncho: poncho
    },
    fighters: {
      drifter: {
        cosmetics: {
          slots: {
            overwear: { id: 'simple_poncho' }
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'drifter', {});
  const torsoFront = layers.find((layer) =>
    layer.cosmeticId === 'simple_poncho' && layer.partKey === 'torso' && layer.position === 'front'
  );
  strictEqual(Array.isArray(torsoFront?.extra?.boneInfluences), true, 'torso layer should retain bone influence metadata');
  strictEqual(torsoFront.extra.boneInfluences.length >= 3, true, 'torso layer should expose all configured influences');
  strictEqual(torsoFront.extra.boneInfluences[0].bone, 'torso');
});

test('sprites.js integrates cosmetic layers and z-order expansion', () => {
  const spritesContent = readFileSync(new URL('../docs/js/sprites.js', import.meta.url), 'utf8');
  strictEqual(/cosmeticTagFor\(tag, slot, 'back', role\)/.test(spritesContent), true, 'buildZMap should add back-facing cosmetic tags with layer roles');
  strictEqual(/cosmeticTagFor\(tag, slot, 'front', role\)/.test(spritesContent), true, 'buildZMap should add front-facing cosmetic tags with layer roles');
  strictEqual(/const \{ assets, style, cosmetics(?:, bodyColors)?(?:, untintedOverlays: [^}]+)? } = ensureFighterSprites/.test(spritesContent), true, 'renderSprites should read cosmetics');
  strictEqual(/withBranchMirror\(ctx,\s*originX,\s*mirror,\s*\(\)\s*=>\s*\{[\s\S]*?drawBoneSprite\(ctx,\s*layer\.asset,\s*bone,\s*styleKey,\s*style,/.test(spritesContent), true, 'cosmetic layers should mirror with their limbs');
});

test('config references cosmetic library sources and fighter slot data', () => {
  const configContent = readFileSync(new URL('../docs/config/config.js', import.meta.url), 'utf8');
  strictEqual(/librarySources:\s*COSMETIC_LIBRARY_SOURCES/.test(configContent), true, 'config should expose librarySources');
  strictEqual(/cosmetics:\s*\{\s*slots:\s*\{\s*hat:/.test(configContent), true, 'fighters should define cosmetics slots');
});
