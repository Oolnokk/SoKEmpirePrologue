import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('hat hide slot rules', () => {
  it('portrait randomization applies hatHideRules to front/back/side/facial hair slots', () => {
    const content = readFileSync('docs/js/portrait-utils.js', 'utf8');

    ok(/randomizationRules\?\.hatHideRules/.test(content), 'randomization should read hatHideRules from species randomizationRules');
    ok(/hatHideSlots\.has\('hairFront'\)/.test(content), 'hairFront should support hat-based hiding');
    ok(/hatHideSlots\.has\('hairBack'\)/.test(content), 'hairBack should support hat-based hiding');
    ok(/hatHideSlots\.has\('hairSide'\)/.test(content), 'hairSide should support hat-based hiding');
    ok(/hatHideSlots\.has\('facialHair'\)/.test(content), 'facialHair should support hat-based hiding');
  });

  it('species rules define kasa hats hiding front/back hair while headband hides nothing', () => {
    const speciesFiles = [
      'docs/config/species/mao-ao.json',
      'docs/config/species/kenkari.json',
      'docs/config/species/tletingan.json'
    ];

    for (const speciesPath of speciesFiles) {
      const data = JSON.parse(readFileSync(speciesPath, 'utf8'));
      for (const genderKey of ['male', 'female']) {
        const randomizationRules = data?.[genderKey]?.randomizationRules;
        if (!randomizationRules) continue;
        const hatHideRules = randomizationRules.hatHideRules;
        ok(hatHideRules, `${speciesPath} ${genderKey} should include randomizationRules.hatHideRules`);

        strictEqual(Array.isArray(hatHideRules.basic_headband?.hideSlots), true, `${speciesPath} ${genderKey} basic_headband should define hideSlots`);
        strictEqual(hatHideRules.basic_headband.hideSlots.length, 0, `${speciesPath} ${genderKey} basic_headband should hide nothing`);

        for (const hatId of ['riverlandskasa_low', 'riverlandskasa_tight', 'riverlandskasa_wide']) {
          const hideSlots = hatHideRules[hatId]?.hideSlots || [];
          ok(hideSlots.includes('hairFront'), `${speciesPath} ${genderKey} ${hatId} should hide hairFront`);
          ok(hideSlots.includes('hairBack'), `${speciesPath} ${genderKey} ${hatId} should hide hairBack`);
          strictEqual(hideSlots.includes('hairSide'), false, `${speciesPath} ${genderKey} ${hatId} should not hide hairSide`);
          strictEqual(hideSlots.includes('facialHair'), false, `${speciesPath} ${genderKey} ${hatId} should not hide facialHair by default`);
        }
      }
    }
  });
});
