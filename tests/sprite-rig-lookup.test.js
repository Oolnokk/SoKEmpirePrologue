import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, notStrictEqual } from 'assert';

describe('Sprite rig lookup fallback', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('getBones tries direct lookup first', () => {
    // Should check G.ANCHORS_OBJ?.[fname] first
    const hasFnameLookup = /G\.ANCHORS_OBJ\?\.\[fname\]/.test(spritesContent);
    strictEqual(hasFnameLookup, true, 'getBones should try direct fname lookup first');
  });

  it('getBones falls back to player anchor when fname not found', () => {
    // Should fallback to G.ANCHORS_OBJ?.player
    const hasPlayerFallback = /G\.ANCHORS_OBJ\?\.player/.test(spritesContent);
    strictEqual(hasPlayerFallback, true, 'getBones should fallback to player anchor');
  });

  it('getBones falls back to first available anchor as final resort', () => {
    // Should have logic to get first key from G.ANCHORS_OBJ
    const hasFirstKeyFallback = /Object\.keys\(anchors\)\[0\]/.test(spritesContent) ||
                                /Object\.keys\(.*ANCHORS_OBJ.*\)\[0\]/.test(spritesContent);
    strictEqual(hasFirstKeyFallback, true, 'getBones should fallback to first available anchor');
  });

  it('getBones does not return null immediately when fname not found', () => {
    // Function should have fallback logic, not just "return X || null"
    // Look for the getBones function - search for multiple return statements
    const getBonesFnStart = spritesContent.indexOf('function getBones(');
    strictEqual(getBonesFnStart !== -1, true, 'getBones function should exist');
    
    // Find the end by looking for the closing of the function
    // We'll search for the next function or end of file
    let getBonesFnEnd = spritesContent.indexOf('\nfunction ', getBonesFnStart + 1);
    if (getBonesFnEnd === -1) {
      // If no next function, go to end of file
      getBonesFnEnd = spritesContent.length;
    }
    
    const fnBody = spritesContent.substring(getBonesFnStart, getBonesFnEnd);
    // Should have multiple return statements or conditional logic
    const returnCount = (fnBody.match(/return /g) || []).length;
    strictEqual(returnCount >= 2, true, 'getBones should have fallback logic with multiple return paths');
  });

  it('ensureFighterSprites checks f.sprites?.style as middle fallback', () => {
    // Should check f.sprites?.style between f.spriteStyle and C.spriteStyle
    const hasNestedStyleCheck = /f\.sprites\?\.style/.test(spritesContent);
    strictEqual(hasNestedStyleCheck, true, 'ensureFighterSprites should check f.sprites?.style');
    
    // Verify the order: f.spriteStyle || f.sprites?.style || C.spriteStyle
    const styleAssignMatch = spritesContent.match(/const style = ([^;]+);/);
    if (styleAssignMatch) {
      const styleExpr = styleAssignMatch[1];
      const spriteStyleIdx = styleExpr.indexOf('f.spriteStyle');
      const nestedStyleIdx = styleExpr.indexOf('f.sprites?.style');
      const globalStyleIdx = styleExpr.indexOf('C.spriteStyle');
      
      strictEqual(spriteStyleIdx !== -1, true, 'Should check f.spriteStyle');
      strictEqual(nestedStyleIdx !== -1, true, 'Should check f.sprites?.style');
      strictEqual(globalStyleIdx !== -1, true, 'Should check C.spriteStyle');
      strictEqual(spriteStyleIdx < nestedStyleIdx, true, 'f.spriteStyle should come before f.sprites?.style');
      strictEqual(nestedStyleIdx < globalStyleIdx, true, 'f.sprites?.style should come before C.spriteStyle');
    }
  });
});
