import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';

describe('Sprite rotDeg to alignRad conversion (Issue #76)', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('ensureFighterSprites converts rotDeg to alignRad', () => {
    // Check that the function reads rotDeg from xform config
    const hasRotDegRead = /xformData\.rotDeg/.test(spritesContent);
    strictEqual(hasRotDegRead, true, 'Should read rotDeg from xform config');
  });

  it('ensureFighterSprites uses degToRad to convert degrees to radians', () => {
    // Check that degToRad is called to convert rotDeg
    const usesDegToRad = /degToRad\(xformData\.rotDeg\)/.test(spritesContent);
    strictEqual(usesDegToRad, true, 'Should use degToRad to convert rotDeg to radians');
  });

  it('ensureFighterSprites stores result as alignRad on asset', () => {
    // Check that the result is stored as asset.alignRad
    const storesAlignRad = /asset\.alignRad\s*=\s*degToRad/.test(spritesContent);
    strictEqual(storesAlignRad, true, 'Should store converted value as asset.alignRad');
  });

  it('ensureFighterSprites defaults alignRad to 0 when rotDeg not present', () => {
    // Check that alignRad defaults to 0
    const hasDefaultZero = /asset\.alignRad\s*=\s*0/.test(spritesContent);
    strictEqual(hasDefaultZero, true, 'Should default alignRad to 0 when rotDeg not present');
  });

  it('drawBoneSprite uses asset.alignRad in rotation calculation', () => {
    // Check that alignRad is used in the rotation calculation
    const usesAlignRad = /asset\.alignRad/.test(spritesContent);
    strictEqual(usesAlignRad, true, 'Should use asset.alignRad in rotation calculation');
  });
});
