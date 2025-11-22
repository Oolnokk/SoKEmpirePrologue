import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadClampFunction() {
  const source = await readFile('docs/js/physics.js', 'utf8');

  function extractFunction(name) {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `${name} should be defined in physics.js`);
    let depth = 0;
    let began = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') {
        depth += 1;
        began = true;
      } else if (ch === '}') {
        depth -= 1;
        if (began && depth === 0) {
          return source.slice(start, i + 1);
        }
      }
    }
    throw new Error(`Could not extract ${name}`);
  }

  const clampSrc = extractFunction('clamp');
  const resolveWorldWidthSrc = extractFunction('resolveWorldWidth');
  const clampBoundsSrc = extractFunction('clampFighterToBounds');

  const script = `
    function computeGroundY(config){ return Number.isFinite(config?.groundY) ? config.groundY : 0; }
    const window = globalThis.window || {};
    ${clampSrc}
    ${resolveWorldWidthSrc}
    ${clampBoundsSrc}
    exports.clamp = clamp;
    exports.clampFighterToBounds = clampFighterToBounds;
  `;

  const context = { Math, exports: {}, globalThis: {}, window: { GAME: { CAMERA: { worldWidth: 720 } } } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(script, context);
  return context.exports.clampFighterToBounds;
}

test('clampFighterToBounds uses playableBounds when provided', async () => {
  const clampFighterToBounds = await loadClampFunction();
  const fighter = { pos: { x: 300, y: 0 } };
  const config = {
    groundY: 0,
    canvas: { w: 800 },
    map: {
      playableBounds: { left: -120, right: 180, source: 'layout' },
      playAreaMinX: -400,
      playAreaMaxX: 400,
    },
  };

  clampFighterToBounds(fighter, config);
  assert.equal(fighter.pos.x, 180);
});
