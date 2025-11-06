import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

test('Character mirroring produces correct bone values (Issue #58)', async (t) => {
  await t.test('bones are mirrored correctly during creation', async () => {
    // Load render.js source
    const renderSource = await readFile(path.join(rootDir, 'render.js'), 'utf8');
    
    // Check that facing direction is determined early
    assert.match(
      renderSource,
      /\/\/ Determine facing direction early/,
      'Should have comment about determining facing early'
    );
    
    // Check that mirrorX and mirrorAng are created based on flipLeft
    assert.match(
      renderSource,
      /const mirrorX = flipLeft \?/,
      'Should create mirrorX function based on flipLeft'
    );
    
    assert.match(
      renderSource,
      /const mirrorAng = flipLeft \?/,
      'Should create mirrorAng function based on flipLeft'
    );
    
    // Verify all bone X coordinates use mirrorX
    const boneXUsages = renderSource.match(/x:mirrorX\(/g);
    assert.ok(boneXUsages, 'Should use mirrorX for bone X positions');
    assert.ok(boneXUsages.length >= 10, 'Should use mirrorX for multiple bones');
    
    // Verify all bone angles use mirrorAng
    const boneAngUsages = renderSource.match(/ang:mirrorAng\(/g);
    assert.ok(boneAngUsages, 'Should use mirrorAng for bone angles');
    assert.ok(boneAngUsages.length >= 2, 'Should use mirrorAng for bone angles');
  });
  
  await t.test('post-process mirroring loop is removed', async () => {
    const renderSource = await readFile(path.join(rootDir, 'render.js'), 'utf8');
    
    // Verify the old post-process loop is gone
    assert.doesNotMatch(
      renderSource,
      /for \(const k in B\)\s*{\s*const b=B\[k\];/,
      'Should not have post-process loop iterating over bones'
    );
    
    // Verify we don't modify bones after creation
    assert.doesNotMatch(
      renderSource,
      /b\.x = mirrorX\(b\.x\)/,
      'Should not modify bone.x after creation'
    );
  });
  
  await t.test('mirroring logic is documented clearly', async () => {
    const mappingDoc = await readFile(path.join('docs', 'BONE_SYSTEM_MAPPING.md'), 'utf8');
    
    // Check documentation mentions the change
    assert.match(
      mappingDoc,
      /applied.*DURING.*bone.*creation/i,
      'Documentation should mention mirroring during creation'
    );
    
    assert.match(
      mappingDoc,
      /intermediate.*values.*correct/i,
      'Documentation should mention intermediate values being correct'
    );
    
    const visualDoc = await readFile(path.join('docs', 'BONE_SYSTEM_VISUAL.md'), 'utf8');
    
    // Check visual documentation explains the new approach
    assert.match(
      visualDoc,
      /Issue #58/,
      'Visual doc should reference Issue #58'
    );
    
    assert.match(
      visualDoc,
      /during.*bone.*computation/i,
      'Visual doc should mention computation-time mirroring'
    );
  });
  
  await t.test('facing direction helpers are identity functions when facing right', async () => {
    const renderSource = await readFile(path.join(rootDir, 'render.js'), 'utf8');
    
    // When facing right, mirrorX and mirrorAng should be identity functions
    assert.match(
      renderSource,
      /mirrorX = flipLeft \? .+ : \(\(x\) => x\)/,
      'mirrorX should be identity when facing right'
    );
    
    assert.match(
      renderSource,
      /mirrorAng = flipLeft \? .+ : \(\(ang\) => ang\)/,
      'mirrorAng should be identity when facing right'
    );
  });
});
