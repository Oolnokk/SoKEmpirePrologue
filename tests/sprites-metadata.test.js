import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

test('drawBoneSprite consumes anchor/offset metadata before style fallbacks', async () => {
  const source = await readJs('sprites.js');

  assert.match(
    source,
    /const meta = asset\?\.meta \|\| {};/,
    'drawBoneSprite should pull metadata from asset.meta'
  );
  assert.match(
    source,
    /metaAnchor = resolveMetaValue\(meta\.anchor,\s*normalizedKey,\s*styleKey\);/,
    'anchor metadata should be resolved with normalizeStyleKey support'
  );
  assert.match(
    source,
    /metaOffset = resolveMetaValue\(meta\.offset,\s*normalizedKey,\s*styleKey\);/,
    'offset metadata should be resolved with normalizeStyleKey support'
  );
});

test('unit-less offset parser handles percent and pixel tokens', async () => {
  const source = await readJs('sprites.js');

  assert.match(
    source,
    /function parseUnitlessOffset\(value, fallbackUnits\)/,
    'metadata offsets should be parsed through parseUnitlessOffset()'
  );
  assert.match(
    source,
    /match\(\/\^\(-?\\d\+\(?:\.\\d\+\)?\)\\s*%\$\//,
    'percent suffix parsing should be present'
  );
  assert.match(
    source,
    /match\(\/\^\(-?\\d\+\(?:\.\\d\+\)?\)\\s*px\$\/i\)/,
    'pixel suffix parsing should be present'
  );
});

test('cached weapon assets preserve metadata across ensureFighterSprites', async () => {
  const source = await readJs('sprites.js');

  assert.match(
    source,
    /if \(spriteDef\.meta\) {\s*asset\.meta = spriteDef\.meta;\s*}/,
    'ensureWeaponSpriteAsset should keep spriteDef.meta when caching'
  );
});
