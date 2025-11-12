import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETIC_SLOTS, cosmeticTagFor, ensureCosmeticLayers, clearCosmeticCache } from '../docs/js/cosmetics.js';
import { registerPaletteForImage, clearPaletteCache, applyShade } from '../docs/js/cosmetic-palettes.js';
import { readFileSync } from 'node:fs';

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
});

test('ensureCosmeticLayers resolves equipment with HSV limits applied', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'hat',
        hsv: {
          defaults: { h: 0, s: 0, v: 0 },
          limits: { h: [-30, 30], s: [-0.25, 0.25], v: [-0.5, 0.5] }
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
            hat: { id: 'demo_item', hsv: { h: 60, s: 1, v: 1 } }
          }
        }
      }
    }
  };
  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  strictEqual(layers[0].slot, 'hat');
  strictEqual(layers[0].partKey, 'head');
  deepStrictEqual(layers[0].hsv, { h: 30, s: 0.25, v: 0.5 });
  strictEqual(typeof layers[0].styleOverride, 'object');
});

test('ensureCosmeticLayers normalizes hsv arrays and string values', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'hat',
        hsv: {
          defaults: { h: 10, s: 0.1, v: -0.1 },
          limits: { h: [-45, 45], s: [-0.5, 0.5], v: [-0.5, 0.5] }
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
            hat: { id: 'demo_item', hsv: ['30', '0.4', '-0.2'] }
          }
        }
      }
    }
  };
  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  deepStrictEqual(layers[0].hsv, { h: 30, s: 0.4, v: -0.2 });
});

test('ensureCosmeticLayers interprets percentage-style saturation and value', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    cosmeticLibrary: {
      demo_item: {
        slot: 'legs',
        hsv: {
          defaults: { h: 0, s: 0, v: 0 },
          limits: { h: [-45, 45], s: [-0.5, 0.5], v: [-0.5, 0.5] }
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
            legs: { id: 'demo_item', hsv: { h: 10, s: 80, v: -50 } }
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 2);
  layers.forEach((layer) => {
    strictEqual(layer.slot, 'legs');
    deepStrictEqual(layer.hsv, { h: 10, s: 0.5, v: -0.5 });
  });
});

test('appearance cosmetics inherit character body colors', () => {
  clearCosmeticCache();
  clearPaletteCache();
  const config = {
    characters: {
      hero: {
        fighter: 'hero',
        bodyColors: {
          A: { h: 15, s: 0.3, v: 0.1 }
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
  deepStrictEqual(layers[0].hsv, { h: 15, s: 0.3, v: 0.1 });
  deepStrictEqual(layers[0].extra?.appearance?.bodyColors, ['A']);
  strictEqual(layers[0].styleKey, 'torso');
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
      deepStrictEqual(layer.hsv, { h: -120, s: 0.8, v: 0.1 });
    });

  enemyLayers
    .filter((layer) => layer.slot === 'legs')
    .forEach((layer) => {
      deepStrictEqual(layer.hsv, { h: 0, s: 0.85, v: 0.05 });
    });
});

test('palette sidecars provide bucket colors and per-fighter variants', () => {
  clearCosmeticCache();
  clearPaletteCache();
  registerPaletteForImage('https://example.com/hat.png', {
    defaultRow: 'default',
    rows: {
      default: {
        colors: {
          primary: '#ccaa88',
          secondary: '#334455',
          tertiary: '#8899aa'
        },
        shading: { primary: -0.2, secondary: -0.3, tertiary: -0.4 }
      },
      hero: {
        extends: 'default',
        colors: {
          primary: '#336699'
        },
        shading: { primary: -0.35 }
      }
    },
    fighters: {
      hero: 'hero'
    }
  });

  const config = {
    cosmeticLibrary: {
      palette_hat: {
        slot: 'hat',
        parts: {
          brim: {
            image: { url: 'https://example.com/hat.png' },
            palette: {
              bucketMap: {
                highlight: 'primary',
                shadow: { of: 'primary', shade: -0.4 },
                trim: 'secondaryShade'
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
            hat: { id: 'palette_hat' }
          }
        }
      }
    }
  };

  const layers = ensureCosmeticLayers(config, 'hero', {});
  strictEqual(layers.length, 1);
  const palette = layers[0].palette;
  strictEqual(palette?.rowId, 'hero');
  strictEqual(palette?.buckets.primary, '#336699');
  strictEqual(palette?.buckets.primaryShade, applyShade('#336699', -0.35));
  strictEqual(palette?.buckets.shadow, applyShade('#336699', -0.4));
  strictEqual(palette?.buckets.trim, applyShade('#334455', -0.3));
  strictEqual(palette?.buckets.secondaryShade, applyShade('#334455', -0.3));
});

test('sprites.js integrates cosmetic layers and z-order expansion', () => {
  const spritesContent = readFileSync(new URL('../docs/js/sprites.js', import.meta.url), 'utf8');
  strictEqual(/expanded\.push\(cosmeticTagFor\(tag, slot\)\);/.test(spritesContent), true, 'buildZMap should add cosmetic tags');
  strictEqual(/const \{ assets, style, offsets, cosmetics(?:, bodyColors)? } = ensureFighterSprites/.test(spritesContent), true, 'renderSprites should read cosmetics');
  strictEqual(/withBranchMirror\(ctx,\s*originX,\s*mirror,\s*\(\)\s*=>\s*\{\s*drawBoneSprite\(ctx, layer\.asset, bone, styleKey/.test(spritesContent), true, 'cosmetic layers should mirror with their limbs');
});

test('config references cosmetic library sources and fighter slot data', () => {
  const configContent = readFileSync(new URL('../docs/config/config.js', import.meta.url), 'utf8');
  strictEqual(/librarySources:\s*COSMETIC_LIBRARY_SOURCES/.test(configContent), true, 'config should expose librarySources');
  strictEqual(/cosmetics:\s*\{\s*slots:\s*\{\s*hat:/.test(configContent), true, 'fighters should define cosmetics slots');
});
