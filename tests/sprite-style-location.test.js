import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

describe('Sprite style configuration location', () => {
  const configContent = readFileSync('docs/config/config.js', 'utf8');
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('TLETINGAN fighter has spriteStyle at fighter level, not in sprites', () => {
    // Extract TLETINGAN fighter section
    const tletinganMatch = configContent.match(/TLETINGAN:\s*{[\s\S]+?^\s{4}},/m);
    strictEqual(!!tletinganMatch, true, 'TLETINGAN fighter should exist');
    
    const tletinganSection = tletinganMatch[0];
    
    // Should have spriteStyle at fighter level
    const hasFighterLevelStyle = /spriteStyle:\s*{/.test(tletinganSection);
    strictEqual(hasFighterLevelStyle, true, 'TLETINGAN should have spriteStyle at fighter level');
    
    // Extract just the sprites object
    const spritesMatch = tletinganSection.match(/sprites:\s*{([^}]*(?:{[^}]*}[^}]*)*?)},\s*spriteStyle:/s);
    strictEqual(!!spritesMatch, true, 'Should be able to extract sprites section');
    
    const spritesSection = spritesMatch[1];
    
    // Should NOT have style nested inside sprites
    const hasNestedStyle = /style:\s*{/.test(spritesSection);
    strictEqual(hasNestedStyle, false, 'TLETINGAN sprites should NOT have nested style object');
  });

  it('Mao-ao_M fighter has spriteStyle at fighter level, not in sprites', () => {
    // Extract Mao-ao_M fighter section
    const maoaoMatch = configContent.match(/['"]Mao-ao_M['"]\s*:\s*{[\s\S]+?^\s{4}}/m);
    strictEqual(!!maoaoMatch, true, 'Mao-ao_M fighter should exist');
    
    const maoaoSection = maoaoMatch[0];
    
    // Should have spriteStyle at fighter level
    const hasFighterLevelStyle = /spriteStyle:\s*{/.test(maoaoSection);
    strictEqual(hasFighterLevelStyle, true, 'Mao-ao_M should have spriteStyle at fighter level');
    
    // Extract just the sprites object
    const spritesMatch = maoaoSection.match(/sprites:\s*{([^}]*(?:{[^}]*}[^}]*)*?)},\s*spriteStyle:/s);
    strictEqual(!!spritesMatch, true, 'Should be able to extract sprites section');
    
    const spritesSection = spritesMatch[1];
    
    // Should NOT have style nested inside sprites
    const hasNestedStyle = /style:\s*{/.test(spritesSection);
    strictEqual(hasNestedStyle, false, 'Mao-ao_M sprites should NOT have nested style object');
  });

  it('ensureFighterSprites looks for style in fighter config first', () => {
    // Check that ensureFighterSprites function looks for f.spriteStyle
    const hasFighterStyleLookup = /f\.spriteStyle/.test(spritesContent);
    strictEqual(hasFighterStyleLookup, true, 'ensureFighterSprites should check f.spriteStyle');
    
    // Should fallback to C.spriteStyle
    const hasGlobalStyleFallback = /C\.spriteStyle/.test(spritesContent);
    strictEqual(hasGlobalStyleFallback, true, 'ensureFighterSprites should fallback to C.spriteStyle');
    
    // Check the order (fighter level first, then global)
    const fighterStyleIndex = spritesContent.indexOf('f.spriteStyle');
    const globalStyleIndex = spritesContent.indexOf('C.spriteStyle');
    strictEqual(fighterStyleIndex < globalStyleIndex, true, 
      'Should check f.spriteStyle before C.spriteStyle');
  });

  it('ensureFighterSprites looks for offsets in fighter config first', () => {
    // Check that ensureFighterSprites function looks for f.spriteOffsets
    const hasFighterOffsetsLookup = /f\.spriteOffsets/.test(spritesContent);
    strictEqual(hasFighterOffsetsLookup, true, 'ensureFighterSprites should check f.spriteOffsets');
    
    // Should fallback to C.spriteOffsets
    const hasGlobalOffsetsFallback = /C\.spriteOffsets/.test(spritesContent);
    strictEqual(hasGlobalOffsetsFallback, true, 'ensureFighterSprites should fallback to C.spriteOffsets');
  });
});
