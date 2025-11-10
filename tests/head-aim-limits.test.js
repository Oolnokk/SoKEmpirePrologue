import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('head limits allow wrap-around ranges after normalization', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');

  function extractFunction(name) {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `${name} function should exist`);
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

  const normalizeSrc = extractFunction('normalizeRad');
  const getLimitsSrc = extractFunction('getHeadLimitsRad');
  const convertSrc = extractFunction('convertAimToHeadRad');

  const script = `
    function degToRad(deg){ return deg * Math.PI / 180; }
    ${normalizeSrc}
    ${getLimitsSrc}
    ${convertSrc}
    exports.getHeadLimitsRad = getHeadLimitsRad;
    exports.convertAimToHeadRad = convertAimToHeadRad;
  `;

  const context = { Math, exports: {} };
  vm.createContext(context);
  vm.runInContext(script, context);

  const { getHeadLimitsRad, convertAimToHeadRad } = context.exports;
  assert.equal(typeof getHeadLimitsRad, 'function', 'getHeadLimitsRad should be exported for testing');
  assert.equal(typeof convertAimToHeadRad, 'function', 'convertAimToHeadRad should be exported for testing');

  const limits = getHeadLimitsRad(
    { limits: { head: {} } },
    { limits: { head: { relMin: 75, relMax: 270 } } }
  );

  assert.ok(limits, 'limits object should be returned');
  const minDeg = limits.min * 180 / Math.PI;
  const maxDeg = limits.max * 180 / Math.PI;

  assert.ok(minDeg <= -80 && minDeg >= -100,
    `Expected min limit near -90°, got ${minDeg.toFixed(3)}°`);
  assert.ok(maxDeg >= 70 && maxDeg <= 90,
    `Expected max limit near 75°, got ${maxDeg.toFixed(3)}°`);

  const rightAim = convertAimToHeadRad(0, 1);
  const leftAimMirrored = convertAimToHeadRad(Math.PI, -1);
  assert.ok(Math.abs(rightAim - leftAimMirrored) < 1e-6,
    `Expected mirrored head aim to match when facing left vs right (got ${rightAim} vs ${leftAimMirrored})`);

  const upRightAim = convertAimToHeadRad(Math.PI / 4, 1);
  const upLeftMirrored = convertAimToHeadRad((3 * Math.PI) / 4, -1);
  assert.ok(Math.abs(upRightAim - upLeftMirrored) < 1e-6,
    `Expected mirrored diagonal aim to match (got ${upRightAim} vs ${upLeftMirrored})`);
});
