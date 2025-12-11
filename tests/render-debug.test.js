import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

test('render.js initializes RENDER_DEBUG with default values', async () => {
  const source = await readJs('render.js');
  
  // Check that RENDER_DEBUG is initialized
  assert.match(
    source,
    /window\.RENDER_DEBUG\s*=\s*window\.RENDER_DEBUG\s*\|\|\s*{/,
    'RENDER_DEBUG should be initialized as a global object'
  );
  
  // Check default values
  assert.match(
    source,
    /showSprites:\s*true/,
    'showSprites should default to true'
  );
  
  assert.match(
    source,
    /showBones:\s*true/,
    'showBones should default to true'
  );
  
  assert.match(
    source,
    /showHitbox:\s*true/,
    'showHitbox should default to true'
  );
  
  // Check showBone object exists with bone keys
  assert.match(
    source,
    /showBone:\s*{/,
    'showBone should be an object'
  );
  
  assert.match(
    source,
    /torso:\s*true/,
    'showBone.torso should default to true'
  );
});

test('render.js documents the coordinate system and math basis', async () => {
  const source = await readJs('render.js');
  
  // Check for coordinate system documentation
  assert.match(
    source,
    /COORDINATE SYSTEM & MATH BASIS/i,
    'Should have coordinate system documentation header'
  );
  
  // Check for zero angle documentation
  assert.match(
    source,
    /Zero angle.*points UP/i,
    'Should document that zero angle points up'
  );
  
  // Check for forward vector documentation
  assert.match(
    source,
    /Forward vector:.*fx\s*=\s*sin\(angle\).*fy\s*=\s*-cos\(angle\)/,
    'Should document forward vector as fx=sin(angle), fy=-cos(angle)'
  );
  
  // Check for right vector documentation
  assert.match(
    source,
    /Right vector:.*rx\s*=\s*cos\(angle\).*ry\s*=\s*sin\(angle\)/,
    'Should document right vector as rx=cos(angle), ry=sin(angle)'
  );
  
  // Check that rad() function is documented as null-safe accessor
  assert.match(
    source,
    /rad\(\) function.*null-safe accessor/i,
    'Should document rad() as a null-safe accessor'
  );
  
  assert.match(
    source,
    /does NOT convert degrees to radians/i,
    'Should clarify that rad() does NOT convert degrees to radians'
  );
});

test('render.js drawStick respects showBones flag', async () => {
  const source = await readJs('render.js');
  
  // Check that drawStick checks showBones
  const drawStickMatch = source.match(/function drawStick\(ctx, B\)\s*{[\s\S]*?^}/m);
  assert.ok(drawStickMatch, 'drawStick function should exist');
  
  const drawStickCode = drawStickMatch[0];
  assert.match(
    drawStickCode,
    /DEBUG\.showBones\s*===\s*false/,
    'drawStick should check if showBones is false'
  );
  
  assert.match(
    drawStickCode,
    /return;.*Skip.*bone rendering/i,
    'drawStick should return early when showBones is false'
  );
});

test('render.js drawSegment respects showBone per-bone flags', async () => {
  const source = await readJs('render.js');
  
  // Check that drawSegment checks showBone map
  const drawSegmentMatch = source.match(/function drawSegment\(ctx, boneKey, B\)\s*{[\s\S]*?drawJoint\(ctx, ex, ey, color\);[\s\S]*?^}/m);
  assert.ok(drawSegmentMatch, 'drawSegment function should exist');
  
  const drawSegmentCode = drawSegmentMatch[0];
  assert.match(
    drawSegmentCode,
    /DEBUG\.showBone/,
    'drawSegment should access DEBUG.showBone'
  );
  
  assert.match(
    drawSegmentCode,
    /hasOwnProperty\(boneKey\).*!showBoneMap\[boneKey\]/,
    'drawSegment should check per-bone visibility'
  );
});

test('render.js drawHitbox respects showHitbox flag', async () => {
  const source = await readJs('render.js');
  
  // Check that drawHitbox checks showHitbox
  const drawHitboxMatch = source.match(/function drawHitbox\(ctx, hb\)\s*{[\s\S]*?ctx\.restore\(\);/m);
  assert.ok(drawHitboxMatch, 'drawHitbox function should exist');
  
  const drawHitboxCode = drawHitboxMatch[0];
  assert.match(
    drawHitboxCode,
    /DEBUG\.showHitbox\s*===\s*false/,
    'drawHitbox should check if showHitbox is false'
  );
  
  assert.match(
    drawHitboxCode,
    /return;.*Skip.*hitbox rendering/i,
    'drawHitbox should return early when showHitbox is false'
  );
});

test('sprites.js renderSprites respects showSprites flag', async () => {
  const source = await readJs('sprites.js');
  
  // Check that renderSprites checks showSprites
  const renderSpritesMatch = source.match(/export function renderSprites\(ctx\)\s*{[\s\S]*?const { assets/m);
  assert.ok(renderSpritesMatch, 'renderSprites function should exist');
  
  const renderSpritesCode = renderSpritesMatch[0];
  assert.match(
    renderSpritesCode,
    /DEBUG\.showSprites\s*===\s*false/,
    'renderSprites should check if showSprites is false'
  );
  
  assert.match(
    renderSpritesCode,
    /return;.*Skip.*sprite rendering/i,
    'renderSprites should return early when showSprites is false'
  );
});

test('sprites.js provides legacy support for hideSprites', async () => {
  const source = await readJs('sprites.js');
  
  // Check for legacy support comment or code
  assert.match(
    source,
    /legacy.*hideSprites/i,
    'Should document legacy support for hideSprites'
  );
  
  assert.match(
    source,
    /RENDER\.hideSprites/,
    'Should check for old RENDER.hideSprites'
  );
  
  assert.match(
    source,
    /RENDER_DEBUG.*showSprites\s*=\s*!.*hideSprites/,
    'Should map hideSprites to showSprites (inverted)'
  );
});

test('index.html includes render debug controls', async () => {
  const html = await readFile(path.resolve('docs/index.html'), 'utf8');
  
  // Check for render debug box
  assert.match(
    html,
    /id="renderDebugBox"/,
    'Should have a render debug controls box'
  );
  
  // Check for individual toggles
  assert.match(
    html,
    /id="toggleShowSprites"/,
    'Should have a toggle for showSprites'
  );
  
  assert.match(
    html,
    /id="toggleShowBones"/,
    'Should have a toggle for showBones'
  );
  
  assert.match(
    html,
    /id="toggleShowHitbox"/,
    'Should have a toggle for showHitbox'
  );
  
  // Check that toggles are checkboxes
  assert.match(
    html,
    /toggleShowSprites.*type="checkbox"/,
    'showSprites toggle should be a checkbox'
  );
  
  assert.match(
    html,
    /toggleShowBones.*type="checkbox"/,
    'showBones toggle should be a checkbox'
  );
  
  assert.match(
    html,
    /toggleShowHitbox.*type="checkbox"/,
    'showHitbox toggle should be a checkbox'
  );
  
  // Check that toggles default to checked
  assert.match(
    html,
    /toggleShowSprites.*checked/,
    'showSprites toggle should default to checked'
  );
  
  assert.match(
    html,
    /toggleShowBones.*checked/,
    'showBones toggle should default to checked'
  );
  
  assert.match(
    html,
    /toggleShowHitbox.*checked/,
    'showHitbox toggle should default to checked'
  );
});

test('app.js wires up render debug controls', async () => {
  const source = await readJs('app.js');
  
  // Check that app.js gets references to the toggle elements
  assert.match(
    source,
    /toggleShowSprites\s*=.*\$\$\(['"]#toggleShowSprites['"]\)/,
    'Should get reference to toggleShowSprites'
  );
  
  assert.match(
    source,
    /toggleShowBones\s*=.*\$\$\(['"]#toggleShowBones['"]\)/,
    'Should get reference to toggleShowBones'
  );
  
  assert.match(
    source,
    /toggleShowHitbox\s*=.*\$\$\(['"]#toggleShowHitbox['"]\)/,
    'Should get reference to toggleShowHitbox'
  );
  
  // Check that event listeners are added
  assert.match(
    source,
    /toggleShowSprites.*addEventListener\(['"]change['"]/,
    'Should add change listener to toggleShowSprites'
  );
  
  assert.match(
    source,
    /toggleShowBones.*addEventListener\(['"]change['"]/,
    'Should add change listener to toggleShowBones'
  );
  
  assert.match(
    source,
    /toggleShowHitbox.*addEventListener\(['"]change['"]/,
    'Should add change listener to toggleShowHitbox'
  );
  
  // Check that listeners update RENDER_DEBUG
  assert.match(
    source,
    /window\.RENDER_DEBUG\.showSprites\s*=.*checked/,
    'Should update RENDER_DEBUG.showSprites on change'
  );
  
  assert.match(
    source,
    /window\.RENDER_DEBUG\.showBones\s*=.*checked/,
    'Should update RENDER_DEBUG.showBones on change'
  );
  
  assert.match(
    source,
    /window\.RENDER_DEBUG\.showHitbox\s*=.*checked/,
    'Should update RENDER_DEBUG.showHitbox on change'
  );
});

test('render.js fallback background uses CONFIG.areas instead of PARALLAX', async () => {
  const source = await readJs('render.js');
  
  // Check that render.js doesn't check window.PARALLAX for fallback
  assert.doesNotMatch(
    source,
    /window\.PARALLAX/,
    'render.js should not reference window.PARALLAX'
  );
  
  // Check that it checks CONFIG.areas and GAME.currentAreaId
  assert.match(
    source,
    /window\.CONFIG\?\.areas\?\.\[window\.GAME\?\.currentAreaId\]/,
    'render.js should check CONFIG.areas[GAME.currentAreaId] for active area'
  );
  
  // Verify fallback background still draws when no area is loaded
  assert.match(
    source,
    /NO AREA LOADED.*fallback ground/,
    'render.js should still have fallback background with message'
  );
  
  // Check that the fallback includes sky gradient
  assert.match(
    source,
    /createLinearGradient[\s\S]{0,200}#cfe8ff/,
    'Fallback background should include sky gradient'
  );
  
  // Check that the fallback includes ground fill
  assert.match(
    source,
    /#c8d0c3/,
    'Fallback background should include ground fill color'
  );
});
