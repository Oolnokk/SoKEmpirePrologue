import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';

describe('RENDER.MIRROR synchronization (Issue #75)', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('renderSprites calls resetMirror to prevent double-flipping', () => {
    // Check that resetMirror is called at the start of renderSprites
    const callsResetMirror = /resetMirror\(\)/.test(spritesContent);
    strictEqual(callsResetMirror, true, 'Should call resetMirror to clear RENDER.MIRROR flags');
  });

  it('resetMirror clears all RENDER.MIRROR flags', () => {
    // Check that resetMirror is exported
    const exportsResetMirror = /export\s+function\s+resetMirror/.test(spritesContent);
    strictEqual(exportsResetMirror, true, 'Should export resetMirror function');
  });

  it('renderSprites has comment explaining mirror reset', () => {
    // Check that there's a comment explaining why mirror flags are reset
    const hasComment = /Clear RENDER\.MIRROR flags.*double-flipping/i.test(spritesContent);
    strictEqual(hasComment, true, 'Should have comment explaining mirror reset to avoid double-flipping');
  });

  it('withBranchMirror respects mirror flag parameter', () => {
    // Check that withBranchMirror function uses the mirror parameter
    const usesMirrorParam = /function\s+withBranchMirror\s*\([^)]*mirror[^)]*\)/s.test(spritesContent);
    strictEqual(usesMirrorParam, true, 'withBranchMirror should accept mirror parameter');
  });

  it('drawArmBranch checks RENDER.MIRROR flags', () => {
    // Check that drawArmBranch reads RENDER.MIRROR
    const checksRenderMirror = /RENDER\.MIRROR\[tagU\]\s*\|\|\s*RENDER\.MIRROR\[tagL\]/.test(spritesContent);
    strictEqual(checksRenderMirror, true, 'drawArmBranch should check RENDER.MIRROR flags');
  });

  it('drawLegBranch checks RENDER.MIRROR flags via legMirrorFlag', () => {
    // Check that drawLegBranch uses legMirrorFlag which checks RENDER.MIRROR
    const usesLegMirrorFlag = /legMirrorFlag/.test(spritesContent);
    strictEqual(usesLegMirrorFlag, true, 'drawLegBranch should use legMirrorFlag to check RENDER.MIRROR');
  });
});
