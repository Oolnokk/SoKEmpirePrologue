import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

describe('Sprite style configuration location', () => {
  const configContent = readFileSync('docs/config/config.js', 'utf8');
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('TLETINGAN fighter has spriteStyle at fighter level, not in sprites', () => {
    // Check that TLETINGAN has spriteStyle at fighter level
    const tletinganIndex = configContent.indexOf('TLETINGAN:');
    strictEqual(tletinganIndex !== -1, true, 'TLETINGAN fighter should exist');
    
    // Find the fighter section (ends at the next fighter or closing brace)
    const nextFighterIndex = configContent.indexOf("'Mao-ao_M':", tletinganIndex);
    const tletinganSection = configContent.substring(tletinganIndex, nextFighterIndex);
    
    // Should have spriteStyle at fighter level
    const hasFighterLevelStyle = tletinganSection.includes('spriteStyle:');
    strictEqual(hasFighterLevelStyle, true, 'TLETINGAN should have spriteStyle at fighter level');
    
    // Extract the sprites section (between "sprites: {" and "},\n      spriteStyle:")
    const spritesStart = tletinganSection.indexOf('sprites: {');
    const spritesEnd = tletinganSection.indexOf('},\n      spriteStyle:', spritesStart);
    strictEqual(spritesStart !== -1 && spritesEnd !== -1, true, 'Should be able to find sprites section boundaries');
    
    const spritesSection = tletinganSection.substring(spritesStart, spritesEnd);
    
    // Should NOT have "style: {" nested inside sprites
    // Count opening braces after "sprites: {" and ensure we don't see "style: {" before closing
    const hasNestedStyle = /\bstyle:\s*{/.test(spritesSection);
    strictEqual(hasNestedStyle, false, 'TLETINGAN sprites should NOT have nested style object');
  });

  it('Mao-ao_M fighter has spriteStyle at fighter level, not in sprites', () => {
    // Find the Mao-ao_M fighter section
    const maoaoIndex = configContent.indexOf("'Mao-ao_M':");
    strictEqual(maoaoIndex !== -1, true, 'Mao-ao_M fighter should exist');
    
    // Find the section (ends at closing braces before 'movement:')
    const movementIndex = configContent.indexOf('movement:', maoaoIndex);
    const maoaoSection = configContent.substring(maoaoIndex, movementIndex);
    
    // Should have spriteStyle at fighter level
    const hasFighterLevelStyle = maoaoSection.includes('spriteStyle:');
    strictEqual(hasFighterLevelStyle, true, 'Mao-ao_M should have spriteStyle at fighter level');
    
    // Extract the sprites section (between "sprites: {" and "},\n      spriteStyle:")
    const spritesStart = maoaoSection.indexOf('sprites: {');
    const spritesEnd = maoaoSection.indexOf('},\n      spriteStyle:', spritesStart);
    strictEqual(spritesStart !== -1 && spritesEnd !== -1, true, 'Should be able to find sprites section boundaries');
    
    const spritesSection = maoaoSection.substring(spritesStart, spritesEnd);
    
    // Should NOT have "style: {" nested inside sprites
    const hasNestedStyle = /\bstyle:\s*{/.test(spritesSection);
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

  it('ensureFighterSprites does not rely on legacy spriteOffsets config', () => {
    const referencesSpriteOffsets = /spriteOffsets/.test(spritesContent);
    strictEqual(referencesSpriteOffsets, false, 'ensureFighterSprites should not read spriteOffsets');
  });
});
