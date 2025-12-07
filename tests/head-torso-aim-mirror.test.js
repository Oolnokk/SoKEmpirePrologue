import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('computeAimRotation helper function exists and computes aim offsets', async () => {
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

  const clampSrc = extractFunction('clamp');
  const normalizeSrc = extractFunction('normalizeRad');
  // Extract radToDegNum from source for consistency
  const radToDegMatch = source.match(/function radToDegNum\([^)]*\)\s*{[^}]*}/);
  const radToDegSrc = radToDegMatch ? radToDegMatch[0] : 'function radToDegNum(rad){ return rad * 180 / Math.PI; }';
  const aimRotationSrc = extractFunction('computeAimRotation');

  const script = `
    ${clampSrc}
    ${normalizeSrc}
    ${radToDegSrc}
    ${aimRotationSrc}
    exports.computeAimRotation = computeAimRotation;
  `;

  const context = { Math, exports: {} };
  vm.createContext(context);
  vm.runInContext(script, context);

  const { computeAimRotation } = context.exports;
  assert.equal(typeof computeAimRotation, 'function', 'computeAimRotation should be exported');

  // Test basic aim rotation calculation
  const result = computeAimRotation(
    Math.PI / 4, // Target at 45 degrees
    0,           // Base at 0 degrees
    0,           // No previous smoothed angle
    {
      dt: 0.016,
      smoothing: 8,
      scaleFactor: 0.5, // Like torso
      maxAngleDeg: 45,
      orientationSign: 1
    }
  );

  assert.ok(result, 'computeAimRotation should return a result');
  assert.ok(typeof result.offsetDeg === 'number', 'result should have offsetDeg');
  assert.ok(typeof result.smoothedRelativeAngle === 'number', 'result should have smoothedRelativeAngle');
  
  // The offset should be positive (aiming to the right)
  assert.ok(result.offsetDeg > 0, 'offsetDeg should be positive when aiming right');
  
  // With scaleFactor 0.5, offset should be roughly half the angle
  // But smoothing means it won't reach full value on first frame
  assert.ok(result.offsetDeg < 45, 'offsetDeg should be clamped within maxAngleDeg');
});

test('computeHeadTargetDeg uses computeAimRotation for consistent behavior', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');

  // Check that computeHeadTargetDeg calls computeAimRotation
  const headTargetFn = source.indexOf('function computeHeadTargetDeg');
  assert.notEqual(headTargetFn, -1, 'computeHeadTargetDeg should exist');
  
  const headTargetBody = source.slice(headTargetFn, source.indexOf('\n}', headTargetFn) + 2);
  assert.ok(
    headTargetBody.includes('computeAimRotation'),
    'computeHeadTargetDeg should call computeAimRotation to reuse torso aim logic'
  );

  // Check for documentation about neck/hips and head/torso analogy
  assert.ok(
    headTargetBody.includes('neck') && headTargetBody.includes('hips'),
    'computeHeadTargetDeg should document neck as hips analogy'
  );
  assert.ok(
    headTargetBody.includes('head') && headTargetBody.includes('torso'),
    'computeHeadTargetDeg should document head as torso analogy'
  );
});

test('computeAimRotation applies smoothing correctly', async () => {
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

  const clampSrc = extractFunction('clamp');
  const normalizeSrc = extractFunction('normalizeRad');
  // Extract radToDegNum from source for consistency
  const radToDegMatch = source.match(/function radToDegNum\([^)]*\)\s*{[^}]*}/);
  const radToDegSrc = radToDegMatch ? radToDegMatch[0] : 'function radToDegNum(rad){ return rad * 180 / Math.PI; }';
  const aimRotationSrc = extractFunction('computeAimRotation');

  const script = `
    ${clampSrc}
    ${normalizeSrc}
    ${radToDegSrc}
    ${aimRotationSrc}
    exports.computeAimRotation = computeAimRotation;
  `;

  const context = { Math, exports: {} };
  vm.createContext(context);
  vm.runInContext(script, context);

  const { computeAimRotation } = context.exports;

  // First frame: no smoothing history
  const result1 = computeAimRotation(
    Math.PI / 2, // Target at 90 degrees
    0,           // Base at 0 degrees
    0,           // No previous smoothed angle
    {
      dt: 0.016,
      smoothing: 8,
      scaleFactor: 1.0,
      maxAngleDeg: 90,
      orientationSign: 1
    }
  );

  // Second frame: with smoothing history
  const result2 = computeAimRotation(
    Math.PI / 2, // Same target
    0,           // Same base
    result1.smoothedRelativeAngle, // Previous smoothed angle
    {
      dt: 0.016,
      smoothing: 8,
      scaleFactor: 1.0,
      maxAngleDeg: 90,
      orientationSign: 1
    }
  );

  // Smoothing should cause gradual convergence
  assert.ok(result1.offsetDeg < result2.offsetDeg, 
    'Smoothing should cause offset to increase over frames');
  assert.ok(result2.offsetDeg < 90,
    'Even after smoothing, offset should still be below target due to exponential smoothing');
});

test('head tracking scale factor is 1.0 (full tracking) vs torso 0.5', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');

  const headTargetFn = source.indexOf('function computeHeadTargetDeg');
  assert.notEqual(headTargetFn, -1, 'computeHeadTargetDeg should exist');
  
  const headTargetBody = source.slice(headTargetFn, source.indexOf('\n}', headTargetFn) + 2);
  
  // Check that head uses scaleFactor 1.0
  assert.ok(
    headTargetBody.includes('scaleFactor: 1.0'),
    'Head tracking should use scaleFactor 1.0 for full tracking'
  );
  
  // Check that there's a comment explaining why head uses 1.0
  assert.ok(
    headTargetBody.toLowerCase().includes('full') || headTargetBody.toLowerCase().includes('fully'),
    'Should document why head uses full scale factor'
  );
});
