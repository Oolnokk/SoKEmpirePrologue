import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('basic headband is explicitly tagged as cloth material', () => {
  const headband = JSON.parse(readFileSync('docs/config/cosmetics/basic_headband.json', 'utf8'));
  ok(Array.isArray(headband.tags), 'basic_headband should define tags');
  ok(headband.tags.includes('material:cloth'), 'basic_headband should carry material:cloth tag');
});

test('portrait randomization applies clothing hue rules to cloth hats and syncs only cloth hats', () => {
  const source = readFileSync('docs/js/portrait-utils.js', 'utf8');
  ok(source.includes('const clothMaterialTag = window.CONFIG?.portraitRandomization?.materialTags?.cloth || \'cloth\';'),
    'portrait-utils should resolve cloth material tag from config fallback');
  ok(source.includes('const hatUsesClothMaterial = isMaterialTag(hat, clothMaterialTag);'),
    'portrait-utils should detect cloth hats via material tags');
  ok(source.includes('|| (hatUsesClothMaterial ? (ruleRange || hat?.colorRange || null) : (hat?.colorRange || null));'),
    'portrait-utils should apply clothing color range to cloth hats');
  ok(source.includes('syncAcrossPieces && hatUsesClothMaterial && bodyColors.CLOTH'),
    'portrait-utils should only sync HAT to CLOTH when hat material is cloth');
});

test('portrait randomization material tags are centralized in config', () => {
  const configSource = readFileSync('docs/config/config.js', 'utf8');
  ok(configSource.includes('window.CONFIG.portraitRandomization = window.CONFIG.portraitRandomization || {};'),
    'config should define portraitRandomization namespace');
  ok(configSource.includes('window.CONFIG.portraitRandomization.materialTags = {'),
    'config should centralize portrait randomization material tags');
  ok(configSource.includes("cloth: 'cloth'"),
    'config should define cloth material tag value');
});

test('kenkari clothing color ranges remain earthy for male and bright for female profiles', () => {
  const species = JSON.parse(readFileSync('docs/config/species/kenkari.json', 'utf8'));
  const maleRange = species?.male?.randomizationRules?.clothingColors?.range;
  const femaleRange = species?.female?.randomizationRules?.clothingColors?.range;
  deepStrictEqual(
    { minH: maleRange?.minH, maxH: maleRange?.maxH },
    { minH: -40, maxH: 65 },
    'male kenkari clothing range should stay earthy'
  );
  deepStrictEqual(
    { minH: femaleRange?.minH, maxH: femaleRange?.maxH },
    { minH: -150, maxH: 115 },
    'female kenkari clothing range should stay bright/flowery'
  );
});
