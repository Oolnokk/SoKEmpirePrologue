import { test } from 'node:test';
import assert from 'node:assert/strict';

function setupWindow(){
  globalThis.window = globalThis.window || {};
  const win = globalThis.window;
  win.ASSETS = win.ASSETS || {};
  win.GAME = win.GAME || {};
  win.RENDER = win.RENDER || {};
  win.RENDER_DEBUG = win.RENDER_DEBUG || {};
  return win;
}

test('white pixels receive tint when positive lightness adjustments are provided', async (t) => {
  setupWindow();
  t.after(() => {
    delete globalThis.window;
  });
  const { __TESTING__ } = await import('../docs/js/sprites.js');
  const { applyHslAdjustmentsToPixel, normalizeHslInput } = __TESTING__;

  const tint = normalizeHslInput({ h: 18, s: 1, l: 0.9 });
  const [r, g, b] = applyHslAdjustmentsToPixel(255, 255, 255, tint);

  assert.deepStrictEqual([r, g, b], [255, 219, 204]);
});

