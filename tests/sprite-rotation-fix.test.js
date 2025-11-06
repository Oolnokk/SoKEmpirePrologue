import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

describe('Sprite double-rotation fix (Issue: Fix sprite rendering issues)', () => {
  const configContent = readFileSync('docs/config/config.js', 'utf8');

  it('TLETINGAN fighter sprites do not have alignDeg property', () => {
    // Extract TLETINGAN fighter section
    const tletinganMatch = configContent.match(/TLETINGAN:\s*\{[\s\S]*?sprites:\s*\{[\s\S]*?\},\s*spriteStyle:/);
    if (tletinganMatch) {
      const tletinganSection = tletinganMatch[0];
      // Check that alignDeg is not present in the sprites section
      const hasAlignDeg = /alignDeg/.test(tletinganSection);
      strictEqual(hasAlignDeg, false, 'TLETINGAN sprites should not have alignDeg property (causes double-rotation)');
    }
  });

  it('Mao-ao_M fighter sprites do not have alignDeg property', () => {
    // Extract Mao-ao_M fighter section
    const maoaoMatch = configContent.match(/['"]Mao-ao_M['"]:\s*\{[\s\S]*?sprites:\s*\{[\s\S]*?\},\s*spriteStyle:/);
    if (maoaoMatch) {
      const maoaoSection = maoaoMatch[0];
      // Check that alignDeg is not present in the sprites section
      const hasAlignDeg = /alignDeg/.test(maoaoSection);
      strictEqual(hasAlignDeg, false, 'Mao-ao_M sprites should not have alignDeg property (causes double-rotation)');
    }
  });

  it('rotation should only come from xform.rotDeg, not sprite alignDeg', () => {
    // Verify that rotDeg is present in xform configurations
    const hasRotDegInXform = /xform:\s*\{[\s\S]*?rotDeg:/.test(configContent);
    strictEqual(hasRotDegInXform, true, 'Rotation should be defined in xform.rotDeg');
  });
});
