import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

describe('Untinted overlay alignment inheritance', () => {
  const spritesContent = readFileSync('docs/js/sprites.js', 'utf8');

  it('ensureFighterSprites passes sprite map to resolveUntintedOverlayMap', () => {
    const callPattern = /const\s+untintedOverlays\s*=\s*resolveUntintedOverlayMap\(f,\s*S\);/;
    strictEqual(callPattern.test(spritesContent), true,
      'resolveUntintedOverlayMap should receive the sprite asset map');
  });

  it('resolveUntintedOverlayMap falls back to sprite alignRad for overlays', () => {
    const fallbackPattern = /const\s+baseAsset\s*=\s*spriteMap\?\?\.\[partKey\];/;
    const fallbackPatternAlt = /const\s+baseAsset\s*=\s*spriteMap\?\.\[partKey\];/;
    const usesBaseAsset = fallbackPattern.test(spritesContent) || fallbackPatternAlt.test(spritesContent);
    strictEqual(usesBaseAsset, true, 'resolveUntintedOverlayMap should read alignRad from spriteMap');

    const assignmentPattern = /if \(!Number\.isFinite\(options\.alignRad\)\)\s*{\s*const baseAsset = spriteMap\?\.\[partKey\];[\s\S]*?options\.alignRad = baseAsset\.alignRad;/;
    strictEqual(assignmentPattern.test(spritesContent), true,
      'Overlays should inherit alignRad from their base sprite when not provided');
  });
});
