import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

test('map-bootstrap no longer writes to window.PARALLAX', async () => {
  const source = await readJs('map-bootstrap.js');
  
  // Check that ensureParallaxContainer is marked as no-op/deprecated
  assert.match(
    source,
    /REMOVED:.*Legacy parallax container/i,
    'ensureParallaxContainer should be marked as REMOVED/deprecated'
  );
  
  assert.match(
    source,
    /no-op.*window\.PARALLAX/i,
    'ensureParallaxContainer should document it is a no-op'
  );
  
  // Check that adaptSceneToParallax was renamed
  assert.match(
    source,
    /adaptSceneForLegacyParallax/,
    'adaptSceneToParallax should be renamed to adaptSceneForLegacyParallax'
  );
  
  assert.match(
    source,
    /REMOVED:.*Legacy parallax adapter/i,
    'adaptSceneForLegacyParallax should be marked as REMOVED'
  );
  
  // Check that applyArea has the removal comment
  assert.match(
    source,
    /REMOVED:.*Legacy PARALLAX writes/i,
    'applyArea should have comment about PARALLAX writes removal'
  );
  
  assert.match(
    source,
    /window\.PARALLAX no longer populated/i,
    'applyArea should document that window.PARALLAX is no longer populated'
  );
  
  // Check that console.info warning is present
  assert.match(
    source,
    /console\.info.*Legacy 2D parallax pipeline removed/i,
    'Should have console.info warning about parallax removal'
  );
  
  // Verify CONFIG.areas is still written to
  assert.match(
    source,
    /window\.CONFIG\.areas\[area\.id\]\s*=\s*area/,
    'CONFIG.areas should be populated with the area descriptor'
  );
});

test('map-bootstrap does not call ensureParallaxContainer in applyArea', async () => {
  const source = await readJs('map-bootstrap.js');
  
  // Extract the applyArea function
  const applyAreaMatch = source.match(/function applyArea\(area\)\s*{[\s\S]*?^}/m);
  assert.ok(applyAreaMatch, 'applyArea function should exist');
  
  const applyAreaCode = applyAreaMatch[0];
  
  // Check that ensureParallaxContainer is NOT called (exclude comments)
  const codeWithoutComments = applyAreaCode.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(
    codeWithoutComments,
    /ensureParallaxContainer\(\)/,
    'applyArea should NOT call ensureParallaxContainer'
  );
  
  // Check that parallax.areas is NOT written to
  assert.doesNotMatch(
    codeWithoutComments,
    /parallax\.areas\[/,
    'applyArea should NOT write to parallax.areas'
  );
  
  // Check that parallax.currentAreaId is NOT written to
  assert.doesNotMatch(
    codeWithoutComments,
    /parallax\.currentAreaId\s*=/,
    'applyArea should NOT write to parallax.currentAreaId'
  );
  
  // Check that adaptSceneToParallax is NOT called (old name)
  assert.doesNotMatch(
    codeWithoutComments,
    /adaptSceneToParallax\(/,
    'applyArea should NOT call adaptSceneToParallax (old function name)'
  );
  
  // Check that adaptSceneForLegacyParallax is NOT called (new name)
  assert.doesNotMatch(
    codeWithoutComments,
    /adaptSceneForLegacyParallax\(/,
    'applyArea should NOT call adaptSceneForLegacyParallax'
  );
});

test('render.js no longer checks window.PARALLAX', async () => {
  const source = await readJs('render.js');
  
  // Check that render.js doesn't check window.PARALLAX
  assert.doesNotMatch(
    source,
    /window\.PARALLAX/,
    'render.js should not reference window.PARALLAX'
  );
  
  // Check that it checks CONFIG.areas instead
  assert.match(
    source,
    /window\.CONFIG.*areas.*window\.GAME.*currentAreaId/,
    'render.js should check CONFIG.areas and GAME.currentAreaId'
  );
  
  // Check for fallback background code
  assert.match(
    source,
    /NO AREA LOADED.*fallback ground/i,
    'render.js should still have fallback background message'
  );
});

test('documentation reflects parallax removal', async () => {
  // Check NOTICE_PARALLAX_REMOVAL.md exists
  const notice = await readFile(path.resolve('docs/NOTICE_PARALLAX_REMOVAL.md'), 'utf8');
  assert.match(
    notice,
    /Legacy 2D Parallax Pipeline Removed/i,
    'NOTICE_PARALLAX_REMOVAL.md should have proper title'
  );
  
  assert.match(
    notice,
    /window\.PARALLAX.*no longer written/i,
    'NOTICE should document that window.PARALLAX is no longer written to'
  );
  
  // Check 3d-parallel-renderer.md has REMOVED banner
  const renderer3d = await readFile(path.resolve('docs/3d-parallel-renderer.md'), 'utf8');
  assert.match(
    renderer3d,
    /⛔\s*REMOVED FROM RUNTIME/i,
    '3d-parallel-renderer.md should have REMOVED banner'
  );
  
  // Check parallax_map_builder_notes.md has REMOVED banner
  const builderNotes = await readFile(path.resolve('tools/parallax_map_builder_notes.md'), 'utf8');
  assert.match(
    builderNotes,
    /⛔\s*REMOVED FROM RUNTIME/i,
    'parallax_map_builder_notes.md should have REMOVED banner'
  );
  
  // Check toc.html references the notice
  const toc = await readFile(path.resolve('docs/toc.html'), 'utf8');
  assert.match(
    toc,
    /NOTICE_PARALLAX_REMOVAL\.md/,
    'toc.html should link to NOTICE_PARALLAX_REMOVAL.md'
  );
});
