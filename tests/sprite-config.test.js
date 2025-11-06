import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

describe('Sprite configuration structure', () => {
  const configContent = readFileSync('docs/config/config.js', 'utf8');
  
  // Character limits for regex patterns to match fighter config sections
  const FIGHTER_SECTION_MAX_CHARS = 2000;
  const SPRITE_SECTION_MAX_CHARS = 800;

  // Helper function to extract fighter sprite section from config
  function getFighterSpriteSection(fighterName) {
    const pattern = fighterName === 'TLETINGAN'
      ? new RegExp(`TLETINGAN[\\s\\S]{1,${FIGHTER_SECTION_MAX_CHARS}}sprites:[\\s\\S]{1,${SPRITE_SECTION_MAX_CHARS}}style:`)
      : new RegExp(`['"]${fighterName}['"]\\s*:[\\s\\S]{1,${FIGHTER_SECTION_MAX_CHARS}}sprites:[\\s\\S]{1,${SPRITE_SECTION_MAX_CHARS}}style:`);
    const match = configContent.match(pattern);
    return match ? match[0] : null;
  }

  it('TLETINGAN fighter has flat sprite keys for arms and legs', () => {
    // Check that the config has flat keys, not nested ones
    const hasFlatKeys = configContent.includes('arm_L_upper:') && 
                        configContent.includes('arm_L_lower:') && 
                        configContent.includes('arm_R_upper:') && 
                        configContent.includes('arm_R_lower:') && 
                        configContent.includes('leg_L_upper:') && 
                        configContent.includes('leg_L_lower:') && 
                        configContent.includes('leg_R_upper:') && 
                        configContent.includes('leg_R_lower:');
    strictEqual(hasFlatKeys, true, 'Config should have flat sprite keys');
  });

  it('TLETINGAN fighter does not have nested arm/leg sprite structure', () => {
    const section = getFighterSpriteSection('TLETINGAN');
    if (section) {
      // Should not have 'arm: {' followed by 'upper:' or 'lower:' in sprites section
      const hasNestedArm = /arm:\s*{\s*upper:/.test(section);
      const hasNestedLeg = /leg:\s*{\s*upper:/.test(section);
      strictEqual(hasNestedArm, false, 'TLETINGAN should not have nested arm sprite structure');
      strictEqual(hasNestedLeg, false, 'TLETINGAN should not have nested leg sprite structure');
    }
  });

  it('Mao-ao_M fighter has flat sprite keys for arms and legs', () => {
    const section = getFighterSpriteSection('Mao-ao_M');
    if (section) {
      const hasFlatKeys = section.includes('arm_L_upper:') && 
                          section.includes('arm_L_lower:') && 
                          section.includes('arm_R_upper:') && 
                          section.includes('arm_R_lower:') && 
                          section.includes('leg_L_upper:') && 
                          section.includes('leg_L_lower:') && 
                          section.includes('leg_R_upper:') && 
                          section.includes('leg_R_lower:');
      strictEqual(hasFlatKeys, true, 'Mao-ao_M should have flat sprite keys');
    }
  });

  it('Mao-ao_M fighter does not have nested arm/leg sprite structure', () => {
    const section = getFighterSpriteSection('Mao-ao_M');
    if (section) {
      const hasNestedArm = /arm:\s*{\s*upper:/.test(section);
      const hasNestedLeg = /leg:\s*{\s*upper:/.test(section);
      strictEqual(hasNestedArm, false, 'Mao-ao_M should not have nested arm sprite structure');
      strictEqual(hasNestedLeg, false, 'Mao-ao_M should not have nested leg sprite structure');
    }
  });

  it('both left and right limbs use the same sprite URL', () => {
    // Verify that left and right use the same image URLs (mirroring handled by rendering code)
    const armUpperMatch = configContent.match(/arm_L_upper:\s*{\s*url:\s*["']([^"']+)["']/);
    const armUpperRMatch = configContent.match(/arm_R_upper:\s*{\s*url:\s*["']([^"']+)["']/);
    
    if (armUpperMatch && armUpperRMatch) {
      strictEqual(armUpperMatch[1], armUpperRMatch[1], 
        'Left and right arm upper sprites should use the same URL');
    }
  });
});
