import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETIC_SLOTS, cosmeticTagFor, ensureCosmeticLayers, clearCosmeticCache } from '../docs/js/cosmetics.js';
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

test('sprites.js integrates cosmetic layers and z-order expansion', () => {
  const spritesContent = readFileSync(new URL('../docs/js/sprites.js', import.meta.url), 'utf8');
  strictEqual(/expanded\.push\(cosmeticTagFor\(tag, slot\)\);/.test(spritesContent), true, 'buildZMap should add cosmetic tags');
  strictEqual(/const \{ assets, style, offsets, cosmetics } = ensureFighterSprites/.test(spritesContent), true, 'renderSprites should read cosmetics');
});

test('config registers cosmetic library and fighter slot data', () => {
  const configContent = readFileSync(new URL('../docs/config/config.js', import.meta.url), 'utf8');
  strictEqual(/cosmeticLibrary:\s*COSMETIC_LIBRARY/.test(configContent), true, 'config should expose cosmeticLibrary');
  strictEqual(/cosmetics:\s*\{\s*slots:\s*\{\s*hat:/.test(configContent), true, 'fighters should define cosmetics slots');
});
