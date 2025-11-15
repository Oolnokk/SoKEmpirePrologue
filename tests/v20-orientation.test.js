import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

test('render.js forces "up" as zero angle', async () => {
  const source = await readJs('render.js');
  
  // Check that angleZero() returns 'up' unconditionally
  assert.match(
    source,
    /function angleZero\(\)\s*{\s*return\s+['"]up['"];?\s*}/,
    'angleZero() must unconditionally return "up"'
  );
  
  // Check that basis() uses 'up' convention unconditionally
  assert.match(
    source,
    /function basis\(ang\)\s*{\s*const c = Math\.cos\(ang\),\s*s = Math\.sin\(ang\);\s*return\s*{\s*fx:\s*s,\s*fy:\s*-c,\s*rx:\s*c,\s*ry:\s*s\s*};\s*}/,
    'basis() must use "up" convention unconditionally'
  );
});

test('render.js uses correct torso angle without offset', async () => {
  const source = await readJs('render.js');
  
  // Check that torsoAng is set directly from torsoAngRaw for 'up' convention
  assert.match(
    source,
    /const torsoAng = torsoAngRaw;.*with 'up' as zero/,
    'torsoAng should use torsoAngRaw directly with "up" as zero'
  );
  
  // Check that the old Math.PI * 1.5 offset is gone
  assert.doesNotMatch(
    source,
    /torsoAngRaw \+ Math\.PI \* 1\.5/,
    'torsoAng should not add Math.PI * 1.5 offset'
  );
});

test('render.js uses correct arm base offset', async () => {
  const source = await readJs('render.js');
  
  // Check that shoulder angles are relative to torso (match reference HTML logic)
  assert.match(
    source,
    /lShoulderRel - torsoAngRaw|rShoulderRel - torsoAngRaw/,
    'Shoulder angles should be relative to torso (subtract torso from shoulder)'
  );
  
  // Check that the old Math.PI / 2 offset is gone
  assert.doesNotMatch(
    source,
    /const armBaseOffset = -Math\.PI \/ 2;/,
    'armBaseOffset should not be -Math.PI / 2'
  );
});

test('render.js angleFromDelta uses "up" convention', async () => {
  const source = await readJs('render.js');
  
  // Check that angleFromDelta returns Math.atan2(dx, -dy) for 'up' convention
  assert.match(
    source,
    /return Math\.atan2\(dx,\s*-dy\);/,
    'angleFromDelta must use Math.atan2(dx, -dy) for "up" convention'
  );
});

test('sprites.js forces "up" as zero angle', async () => {
  const source = await readJs('sprites.js');
  
  // Check that angleZero() returns 'up' unconditionally
  assert.match(
    source,
    /function angleZero\(\)\s*{\s*return\s+['"]up['"];?\s*}/,
    'angleZero() must unconditionally return "up"'
  );
  
  // Check that spriteAngleZero() returns 'up' unconditionally
  assert.match(
    source,
    /function spriteAngleZero\(\)\s*{\s*return\s+['"]up['"];?\s*}/,
    'spriteAngleZero() must unconditionally return "up"'
  );
  
  // Check that basisFor() uses 'up' convention unconditionally
  assert.match(
    source,
    /return\s*{\s*fx:\s*s,\s*fy:\s*-c,\s*rx:\s*c,\s*ry:\s*s\s*};/,
    'basisFor() must use "up" convention'
  );
});

test('sprites.js angle function uses "up" convention', async () => {
  const source = await readJs('sprites.js');
  
  // Check that angle() uses Math.atan2(dx, -dy) for 'up' convention
  assert.match(
    source,
    /return Math\.atan2\(dx,\s*-dy\);/,
    'angle() must use Math.atan2(dx, -dy) for "up" convention'
  );
});

test('sprites.js does not apply per-sprite facing flip', async () => {
  const source = await readJs('sprites.js');
  
  // Check that drawBoneSprite does not have facingFlip parameter
  assert.match(
    source,
    /function drawBoneSprite\(ctx,\s*asset,\s*bone,\s*styleKey,\s*style\)\s*{/,
    'drawBoneSprite() should not have facingFlip parameter'
  );
  
  // Verify the removal of the facingFlip scale transform line
  assert.doesNotMatch(
    source,
    /if\s*\(\s*facingFlip\s*\)\s*{\s*ctx\.scale\(-1,\s*1\)/,
    'drawBoneSprite() should not apply facingFlip with ctx.scale(-1, 1)'
  );
});

test('sprites.js renderSprites applies canvas-level facing flip (reference HTML approach)', async () => {
  const source = await readJs('sprites.js');
  
  // Check that renderSprites uses flipLeft from G.FLIP_STATE
  assert.match(
    source,
    /G\.FLIP_STATE/,
    'renderSprites() should check G.FLIP_STATE for flip state'
  );
  
  // Check that there IS a ctx.save/scale/restore pattern for facing flip in renderSprites
  const renderSpritesSection = source.substring(
    source.indexOf('export function renderSprites'),
    source.indexOf('export function initSprites')
  );
  assert.match(
    renderSpritesSection,
    /ctx\.scale\(-1,\s*1\)/,
    'renderSprites() should apply canvas-level scale(-1, 1) transform for facing (matching reference HTML)'
  );
});

test('sprites.js drawArmBranch does not have facingFlip parameter', async () => {
  const source = await readJs('sprites.js');
  
  assert.match(
    source,
    /function drawArmBranch\(ctx,\s*rig,\s*side,\s*assets,\s*style,\s*segment\s*=\s*['"]both['"]\)\s*{/,
    'drawArmBranch() should not have facingFlip parameter'
  );
});

test('sprites.js drawLegBranch does not have facingFlip parameter', async () => {
  const source = await readJs('sprites.js');
  
  assert.match(
    source,
    /function drawLegBranch\(ctx,\s*rig,\s*side,\s*assets,\s*style,\s*segment\s*=\s*['"]both['"]\)\s*{/,
    'drawLegBranch() should not have facingFlip parameter'
  );
});

test('sprites.js uses correct rotation formula in drawBoneSprite', async () => {
  const source = await readJs('sprites.js');
  
  // Check that rotation uses bone.ang + alignRad + Math.PI
  assert.match(
    source,
    /const theta = bone\.ang \+ alignRad(?: \+ extraRotRad)? \+ Math\.PI;/,
    'rotation should combine alignRad, optional extraRotRad, and Math.PI'
  );
  
  // Check the comment matches
  assert.match(
    source,
    /Rotation \(fixed\):\s*bone\.ang \+ alignRad \+ extraRotRad \+ Math\.PI/,
    'comment should document rotation formula correctly'
  );
});

test('sprites.js defaults anchor to midpoint', async () => {
  const source = await readJs('sprites.js');
  
  // Check that anchor mode defaults to 'mid'
  assert.match(
    source,
    /const anchorMode = anchorCfg\[styleKey\] \|\| ['"]mid['"]/,
    'anchor should default to "mid" (midpoint)'
  );
  
  // Check comment mentions midpoint as default
  assert.match(
    source,
    /anchors at bone midpoint by default/,
    'comment should mention midpoint as default anchor'
  );
});

test('render.js computes flipLeft but does NOT mirror bones (reference HTML approach)', async () => {
  const source = await readJs('render.js');
  
  // Check that flipLeft logic exists
  assert.match(
    source,
    /const flipLeft = Math\.cos\(facingRad\) < 0;/,
    'flipLeft should be determined by facingRad'
  );
  
  // Check that flipLeft is returned to sprite renderer
  assert.match(
    source,
    /return.*flipLeft/,
    'flipLeft should be returned from computeAnchorsForFighter'
  );
  
  // Check that bones are NOT mirrored (reference HTML approach uses canvas scale instead)
  assert.doesNotMatch(
    source,
    /if \(flipLeft\)\s*{\s*[\s\S]*?b\.x = mirrorX\(b\.x\)/,
    'bones should NOT be mirrored when flipLeft is true (canvas scale handles this instead)'
  );
});
