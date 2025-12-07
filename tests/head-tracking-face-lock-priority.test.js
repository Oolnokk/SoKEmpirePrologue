import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('computeHeadTargetDeg prioritizes FACE lock over aim-driven tracking', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');

  // Find computeHeadTargetDeg function
  const funcStart = source.indexOf('function computeHeadTargetDeg');
  assert.notEqual(funcStart, -1, 'computeHeadTargetDeg should exist');
  
  // Find the end of the function by matching braces
  let depth = 0;
  let funcEnd = funcStart;
  let inFunc = false;
  for (let i = funcStart; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
      inFunc = true;
    } else if (source[i] === '}') {
      depth--;
      if (inFunc && depth === 0) {
        funcEnd = i + 1;
        break;
      }
    }
  }
  const funcBody = source.slice(funcStart, funcEnd);
  
  // Check that getFaceLock() is called
  assert.ok(
    funcBody.includes('getFaceLock()'),
    'Should call getFaceLock() to check for face lock'
  );
  
  // Check that faceLockRad is checked before aim.headWorldTarget
  const faceLockCheck = funcBody.indexOf('faceLockRad');
  const aimCheck = funcBody.indexOf('headWorldTarget');
  
  assert.ok(faceLockCheck > 0, 'Should check faceLockRad');
  assert.ok(aimCheck > 0, 'Should check headWorldTarget');
  assert.ok(
    faceLockCheck < aimCheck,
    'faceLockRad should be checked before headWorldTarget (priority order)'
  );
  
  // Check for priority comments
  assert.ok(
    funcBody.includes('Priority') || funcBody.includes('priority'),
    'Should document the priority system with comments'
  );
  
  // Verify the if-else structure ensures FACE lock is used first
  const ifFaceLock = funcBody.match(/if\s*\(\s*typeof\s+faceLockRad\s*===\s*['"]number['"]/);
  assert.ok(
    ifFaceLock,
    'Should have if statement checking if faceLockRad is a number (active)'
  );
  
  // Check that when FACE lock is active, it's assigned to desiredWorld
  const faceLockUsage = funcBody.match(/desiredWorld\s*=\s*faceLockRad/);
  assert.ok(
    faceLockUsage,
    'When FACE lock is active, should assign it to desiredWorld'
  );
});

test('FACE lock overrides aim tracking in docs', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');
  
  // Extract function by matching braces
  const funcStart = source.indexOf('function computeHeadTargetDeg');
  let depth = 0;
  let funcEnd = funcStart;
  let inFunc = false;
  for (let i = funcStart; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
      inFunc = true;
    } else if (source[i] === '}') {
      depth--;
      if (inFunc && depth === 0) {
        funcEnd = i + 1;
        break;
      }
    }
  }
  const funcBody = source.slice(funcStart, funcEnd);
  
  // Verify the pattern: if (faceLock) use it, else if (aim) use aim
  const priorityPattern = /if\s*\([^)]*faceLockRad[^)]*\)\s*{[^}]*desiredWorld\s*=\s*faceLockRad[^}]*}\s*else\s+if\s*\([^)]*headWorldTarget/;
  
  assert.ok(
    priorityPattern.test(funcBody),
    'Should have if-else structure that prioritizes FACE lock over aim tracking'
  );
});

test('FACE lock integration is documented', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');
  
  // Extract function by matching braces
  const funcStart = source.indexOf('function computeHeadTargetDeg');
  let depth = 0;
  let funcEnd = funcStart;
  let inFunc = false;
  for (let i = funcStart; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
      inFunc = true;
    } else if (source[i] === '}') {
      depth--;
      if (inFunc && depth === 0) {
        funcEnd = i + 1;
        break;
      }
    }
  }
  const funcBody = source.slice(funcStart, funcEnd);
  
  // Check for documentation about FACE lock priority
  assert.ok(
    funcBody.toLowerCase().includes('face') && funcBody.toLowerCase().includes('lock'),
    'Should mention FACE lock in documentation'
  );
  
  assert.ok(
    funcBody.includes('Priority') || funcBody.includes('priority') || funcBody.includes('override'),
    'Should document priority or override behavior'
  );
});
