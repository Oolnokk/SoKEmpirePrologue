import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { strictEqual } from 'assert';

// Read file once at module level for better performance
const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

describe('Sprite rig lookup fallback', () => {

  it('getBones falls back to player anchor when fname not found', () => {
    // Check that getBones has fallback logic to G.ANCHORS_OBJ.player
    const hasPlayerFallback = spritesContent.includes('G.ANCHORS_OBJ?.player') ||
                              spritesContent.includes('G.ANCHORS_OBJ.player');
    strictEqual(hasPlayerFallback, true, 'getBones should fall back to player anchor');
  });

  it('getBones falls back to first available anchor as last resort', () => {
    // Check that getBones has logic to get first available key
    const hasFirstKeyFallback = /Object\.keys\(.*\)/.test(spritesContent) &&
                                /keys\[0\]/.test(spritesContent);
    strictEqual(hasFirstKeyFallback, true, 'getBones should fall back to first available anchor');
  });

  it('getBones tries direct lookup first', () => {
    // Verify getBones tries G.ANCHORS_OBJ[fname] first
    const hasFnameLookup = /G\.ANCHORS_OBJ\?\.\[fname\]|G\.ANCHORS_OBJ\[fname\]/.test(spritesContent);
    strictEqual(hasFnameLookup, true, 'getBones should try direct fname lookup first');
  });

  it('getBones function is resilient and has multi-level fallback', () => {
    // Find the getBones function
    const getBonesFnMatch = spritesContent.match(/function getBones\([^)]+\)\s*{[\s\S]*?^}/m);
    strictEqual(getBonesFnMatch !== null, true, 'getBones function should exist');
    
    if (getBonesFnMatch) {
      const fn = getBonesFnMatch[0];
      // Should have multiple return paths (direct, player fallback, first key fallback, null)
      const returnCount = (fn.match(/return/g) || []).length;
      strictEqual(returnCount >= 3, true, 'getBones should have at least 3 return paths for fallback logic');
    }
  });
});

describe('Sprite style fallback', () => {

  it('ensureFighterSprites checks f.sprites?.style in addition to f.spriteStyle', () => {
    // Check that ensureFighterSprites looks for f.sprites?.style
    const hasSpritesStyleLookup = /f\.sprites\?\.style/.test(spritesContent);
    strictEqual(hasSpritesStyleLookup, true, 'ensureFighterSprites should check f.sprites?.style');
  });

  it('ensureFighterSprites style priority: f.spriteStyle || f.sprites?.style || C.spriteStyle', () => {
    // Extract the style assignment line from ensureFighterSprites
    const styleMatch = spritesContent.match(/const style = f\.spriteStyle \|\| f\.sprites\?\.style \|\| C\.spriteStyle/);
    strictEqual(styleMatch !== null, true, 
      'ensureFighterSprites should use correct priority: f.spriteStyle || f.sprites?.style || C.spriteStyle');
  });
});
