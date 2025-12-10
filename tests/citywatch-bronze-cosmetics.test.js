import { describe, it } from 'node:test';
import { ok } from 'assert';
import { readFileSync } from 'fs';

/**
 * Tests for citywatch_watchman bronze armbands/footbands configuration
 * 
 * Requirements:
 * 1. citywatch_watchman template should have bronze_armbands on arms slot
 * 2. citywatch_watchman template should have bronze_footbands on feet slot
 * 3. Both should use white_bronze material HSV values
 */

describe('Citywatch watchman bronze cosmetics', () => {
  it('citywatch_watchman template includes bronze armbands and footbands', () => {
    const configContent = readFileSync(
      new URL('../docs/config/config.js', import.meta.url), 
      'utf8'
    );
    
    // Check that citywatch_watchman template exists
    ok(configContent.includes('citywatch_watchman:'), 
      'config should define citywatch_watchman template');
    
    // Check for bronze_armbands in arms slot
    ok(/arms:\s*{\s*id:\s*['"]bronze_armbands['"]/m.test(configContent), 
      'citywatch_watchman should have bronze_armbands in arms slot');
    
    // Check for bronze_footbands in feet slot
    ok(/feet:\s*{\s*id:\s*['"]bronze_footbands['"]/m.test(configContent), 
      'citywatch_watchman should have bronze_footbands in feet slot');
  });

  it('bronze armbands and footbands use white_bronze material', () => {
    const configContent = readFileSync(
      new URL('../docs/config/config.js', import.meta.url), 
      'utf8'
    );
    
    // Check that bronze_armbands uses white_bronze
    ok(/arms:\s*{\s*id:\s*['"]bronze_armbands['"],\s*hsv:\s*{\s*\.\.\.MATERIALS\.white_bronze\s*}/m.test(configContent), 
      'bronze_armbands should use white_bronze material');
    
    // Check that bronze_footbands uses white_bronze
    ok(/feet:\s*{\s*id:\s*['"]bronze_footbands['"],\s*hsv:\s*{\s*\.\.\.MATERIALS\.white_bronze\s*}/m.test(configContent), 
      'bronze_footbands should use white_bronze material');
  });

  it('MATERIALS.white_bronze is defined in config', () => {
    const configContent = readFileSync(
      new URL('../docs/config/config.js', import.meta.url), 
      'utf8'
    );
    
    // Check that white_bronze material is defined
    ok(/white_bronze:\s*{\s*h:\s*-?\d+,\s*s:\s*[\d.]+,\s*v:\s*[\d.]+\s*}/m.test(configContent), 
      'MATERIALS.white_bronze should be defined with h, s, v properties');
  });

  it('cosmetics slots structure is maintained', () => {
    const configContent = readFileSync(
      new URL('../docs/config/config.js', import.meta.url), 
      'utf8'
    );
    
    // Verify that the citywatch_watchman has the expected cosmetics structure
    // Check for hat (existing)
    ok(/hat:\s*{\s*id:\s*['"]citywatch_helmet['"]/m.test(configContent), 
      'citywatch_watchman should still have citywatch_helmet in hat slot');
    
    // Check for legs (existing)
    ok(/legs:\s*{\s*id:\s*['"]basic_pants['"]/m.test(configContent), 
      'citywatch_watchman should still have basic_pants in legs slot');
    
    // Check for overwear (existing)
    ok(/overwear:\s*{[\s\S]*?\$kind:\s*['"]pool['"]/m.test(configContent), 
      'citywatch_watchman should still have overwear with pool configuration');
  });
});
