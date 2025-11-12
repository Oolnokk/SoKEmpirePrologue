import { test } from 'node:test';
import assert from 'node:assert/strict';

function createStubContext(ops){
  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    clearRect: (...args) => ops.push(['clearRect', ...args]),
    fillRect: (...args) => ops.push(['fillRect', ctx.fillStyle, ...args]),
    strokeRect: (...args) => ops.push(['strokeRect', ctx.strokeStyle, ...args]),
    drawImage: (...args) => ops.push(['drawImage', ...args]),
    fillText: (...args) => ops.push(['fillText', ...args])
  };
  return ctx;
}

test('tintSpriteToCanvas performs fill-then-mask tinting', async () => {
  const ops = [];
  const ctx = createStubContext(ops);
  const dest = {
    width: 0,
    height: 0,
    getContext(type){
      assert.strictEqual(type, '2d');
      return ctx;
    }
  };
  const source = { width: 12, height: 8 };
  const { tintSpriteToCanvas } = await import('../docs/js/sprite_tint_v2.js');

  const result = tintSpriteToCanvas(source, dest, [16, 32, 64, 255], { debug: true, label: 'dbg' });

  assert.strictEqual(result, true);
  assert.strictEqual(dest.width, 12);
  assert.strictEqual(dest.height, 8);
  assert.strictEqual(ops[1][1], 'rgb(16,32,64)');
  assert.strictEqual(ctx.globalCompositeOperation, 'source-over');
  assert.deepStrictEqual(ops.slice(0, 3).map(([name]) => name), ['clearRect', 'fillRect', 'drawImage']);
  const debugCalls = ops.filter(([name]) => name === 'strokeRect' || name === 'fillText');
  assert.ok(debugCalls.length >= 1);
});

test('tintSpriteToCanvas returns false when context is unavailable', async () => {
  const { tintSpriteToCanvas } = await import('../docs/js/sprite_tint_v2.js');
  const source = { width: 10, height: 10 };
  const dest = { width: 0, height: 0, getContext: () => null };
  assert.strictEqual(tintSpriteToCanvas(source, dest, [255, 0, 0, 255]), false);
});
