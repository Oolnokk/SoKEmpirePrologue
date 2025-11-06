import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';

describe('RENDER.MIRROR per-limb flipping', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('renderSprites does NOT call resetMirror to allow attack-based limb flipping', () => {
    // renderSprites should NOT clear RENDER.MIRROR flags every frame
    // This allows attack animations to set limb-specific mirror flags that persist
    const renderSpritesFunc = spritesContent.match(/export function renderSprites\([^)]*\)\s*\{[^}]*\}/s);
    ok(renderSpritesFunc, 'Should find renderSprites function');
    const callsResetMirror = /resetMirror\(\)/.test(renderSpritesFunc[0]);
    strictEqual(callsResetMirror, false, 'renderSprites should NOT call resetMirror to allow limb-specific mirroring');
  });

  it('resetMirror function is still exported for manual clearing', () => {
    // Check that resetMirror is exported for use by animation system
    const exportsResetMirror = /export\s+function\s+resetMirror/.test(spritesContent);
    strictEqual(exportsResetMirror, true, 'Should export resetMirror function for manual use');
  });

  it('renderSprites has comment explaining RENDER.MIRROR system', () => {
    // Check that there's a comment explaining the mirror flag system
    const hasComment = /RENDER\.MIRROR flags control per-limb mirroring/i.test(spritesContent);
    strictEqual(hasComment, true, 'Should have comment explaining RENDER.MIRROR per-limb mirroring system');
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
