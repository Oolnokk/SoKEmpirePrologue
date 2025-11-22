import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadPhysicsFns() {
  const source = await readFile('docs/js/physics.js', 'utf8');

  const extractFunction = (name) => {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `${name} should be defined in physics.js`);
    let depth = 0;
    let began = false;
    for (let i = start; i < source.length; i += 1) {
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
  };

  const resolveWorldWidthSrc = extractFunction('resolveWorldWidth');
  const clampSrc = extractFunction('clamp');
  const clampBoundsSrc = extractFunction('clampFighterToBounds');

  const script = `
    const window = globalThis.window || {};
    function computeGroundY(config){ return Number.isFinite(config?.groundY) ? config.groundY : 0; }
    ${resolveWorldWidthSrc}
    ${clampSrc}
    ${clampBoundsSrc}
    exports.resolveWorldWidth = resolveWorldWidth;
    exports.clampFighterToBounds = clampFighterToBounds;
  `;

  const context = {
    Math,
    exports: {},
    globalThis: {},
    window: { GAME: { CAMERA: { worldWidth: 1000, viewportWidth: 900 } } },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(script, context);
  return context.exports;
}

test('resolveWorldWidth favors configured world width over fallback', async () => {
  const { resolveWorldWidth } = await loadPhysicsFns();
  const config = { world: { width: 1880 }, canvas: { w: 720 } };
  assert.equal(resolveWorldWidth(config), 1880);
});

test('resolveWorldWidth uses camera metadata when config lacks canvas width', async () => {
  const { resolveWorldWidth } = await loadPhysicsFns();
  const config = {};
  assert.equal(resolveWorldWidth(config), 1000);
});

test('clampFighterToBounds applies world width from camera', async () => {
  const { clampFighterToBounds } = await loadPhysicsFns();
  const fighter = { pos: { x: 2400, y: 0 } };
  const config = {};
  clampFighterToBounds(fighter, config);
  assert.equal(fighter.pos.x, 960);
});
