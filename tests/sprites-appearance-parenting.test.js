import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';

describe('Appearance cosmetics parenting', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('defines partitionCosmeticLayers helper', () => {
    const hasHelper = /function\s+partitionCosmeticLayers\s*\(/.test(spritesContent);
    strictEqual(hasHelper, true, 'partitionCosmeticLayers should be defined to split appearance cosmetics');
  });

  it('renderSprites separates appearance cosmetics from clothing layers', () => {
    const usesPartition = /const\s*\{\s*appearanceLayers,\s*clothingLayers\s*}\s*=\s*partitionCosmeticLayers\(cosmetics\);/.test(spritesContent);
    ok(usesPartition, 'renderSprites should partition cosmetics before queuing clothing layers');
  });

  it('draws torso appearance layers before and after the base torso sprite', () => {
    const drawsBack = /drawAppearanceLayers\('torso',\s*rig\.torso,\s*'torso',\s*'back'\);/.test(spritesContent);
    const drawsFront = /drawAppearanceLayers\('torso',\s*rig\.torso,\s*'torso',\s*'front'\);/.test(spritesContent);
    strictEqual(drawsBack && drawsFront, true,
      'Torso rendering should include appearance layers both before and after the base sprite');
  });

  it('checks appearance metadata on cosmetic layers', () => {
    const checksMetadata = /layer\.extra\?\.appearance/.test(spritesContent);
    ok(checksMetadata, 'partitionCosmeticLayers should detect appearance layers via layer.extra.appearance');
  });
});
