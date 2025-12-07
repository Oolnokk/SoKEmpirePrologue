import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configSrc = readFileSync('docs/config/config.js', 'utf8');
const renderSrc = readFileSync('docs/js/render.js', 'utf8');
const spritesSrc = readFileSync('docs/js/sprites.js', 'utf8');
const appSrc = readFileSync('docs/js/app.js', 'utf8');
const manifestSrc = readFileSync('docs/assets/asset-manifest.json', 'utf8');
const combatSrc = readFileSync('docs/js/combat.js', 'utf8');
const indexSrc = readFileSync('docs/index.html', 'utf8');
const abilitySrc = readFileSync('docs/config/abilities/dagger_swords_combo_light.js', 'utf8');

describe('Dagger-Swords weapon integration', () => {
  it('registers the anuris dagger-swords sprite asset', () => {
    assert.ok(
      configSrc.includes('./assets/weapons/dagger-swords/anuris_dagger-swords.png'),
      'anuris dagger-swords sprite should be referenced from the core config'
    );
    assert.ok(
      manifestSrc.includes('./assets/weapons/dagger-swords/anuris_dagger-swords.png'),
      'anuris dagger-swords sprite should be listed in the asset manifest'
    );
  });

  it('declares a knockback profile for the dagger-swords weapon', () => {
    assert.ok(
      /weaponTypes[\s\S]*['"]?dagger-swords['"]?/.test(configSrc),
      'knockback weaponTypes block should include a dagger-swords entry'
    );
  });

  it('defines weapon stance defaults for dagger-swords', () => {
    assert.ok(
      /WEAPON_STANCE_DEFAULTS[\s\S]*['"]?dagger-swords['"]?/.test(configSrc),
      'WEAPON_STANCE_DEFAULTS should include dagger-swords configuration'
    );
  });

  it('defines arm stance defaults for dagger-swords', () => {
    assert.ok(
      /ARM_STANCES[\s\S]*['"]?dagger-swords['"]?/.test(configSrc),
      'ARM_STANCES should include dagger-swords configuration'
    );
  });

  it('defines weapon sprite skins for dagger-swords', () => {
    assert.ok(
      /WEAPON_SPRITE_SKINS[\s\S]*['"]?dagger-swords['"]?/.test(configSrc),
      'WEAPON_SPRITE_SKINS should include dagger-swords with skin definitions'
    );
    assert.ok(
      /anuri_dagger-swords/.test(configSrc),
      'should define the anuri_dagger-swords skin'
    );
  });

  it('defines dual weapon bones (weapon_0 and weapon_1) in the rig', () => {
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*weapon_0/.test(configSrc),
      'weapon rig should define weapon_0 bone'
    );
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*weapon_1/.test(configSrc),
      'weapon rig should define weapon_1 bone for dual wielding'
    );
  });

  it('defines weapon colliders for both weapons', () => {
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*colliderA/.test(configSrc),
      'should define colliderA for weapon_0 short blade'
    );
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*colliderB/.test(configSrc),
      'should define colliderB for weapon_0 long blade'
    );
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*colliderC/.test(configSrc),
      'should define colliderC for weapon_1 short blade'
    );
    assert.ok(
      /weapons[\s\S]*['"]?dagger-swords['"]?[\s\S]*colliderD/.test(configSrc),
      'should define colliderD for weapon_1 long blade'
    );
  });

  it('defines weapon back offsets for sheathed display', () => {
    assert.ok(
      /weaponBackOffsets[\s\S]*['"]?dagger-swords['"]?/.test(configSrc),
      'weaponBackOffsets should include dagger-swords configuration'
    );
  });

  it('registers dagger-swords in WEAPON_STANCE_TYPES array', () => {
    assert.ok(
      /WEAPON_STANCE_TYPES\s*=\s*\[[^\]]*['"]dagger-swords['"][^\]]*\]/.test(configSrc),
      'WEAPON_STANCE_TYPES array should include dagger-swords'
    );
  });

  it('loads the dagger_swords_combo_light ability script', () => {
    assert.ok(
      indexSrc.includes('./config/abilities/dagger_swords_combo_light.js'),
      'index.html should load the dagger_swords_combo_light.js ability script'
    );
  });

  it('defines dagger-swords combo ability with proper registration', () => {
    assert.ok(
      /registerAbility\s*\(\s*['"]dagger_swords_combo_light['"]/.test(abilitySrc),
      'ability should register itself with the correct identifier'
    );
    assert.ok(
      /tags\s*:\s*\[[^\]]*['"]dagger-swords['"][^\]]*\]/.test(abilitySrc),
      'ability should be tagged with dagger-swords'
    );
  });

  it('defines weapon combos for dagger-swords in the ability', () => {
    assert.ok(
      /weaponCombos[\s\S]*['"]?dagger-swords['"]?/.test(abilitySrc),
      'ability should define weaponCombos entry for dagger-swords'
    );
  });

  it('specifies useWeaponColliders in attack data', () => {
    assert.ok(
      /useWeaponColliders\s*:\s*true/.test(abilitySrc),
      'attack definitions should opt-in to weapon colliders'
    );
  });

  it('defines alternating attacks using both hands', () => {
    assert.ok(
      /handR/.test(abilitySrc) && /handL/.test(abilitySrc),
      'combo should include attacks using both right and left hands'
    );
  });

  it('computes dedicated weapon bones in the render pipeline', () => {
    assert.ok(
      /weaponKey && C\.weapons/.test(renderSrc),
      'render.js should resolve weapon definitions when building bones'
    );
    assert.ok(
      /weapon_[0-9]+/.test(renderSrc),
      'render.js should emit weapon_[0-9] bones for debugging overlays'
    );
  });

  it('queues weapon sprite layers during sprite rendering', () => {
    assert.ok(
      /weaponConfig && weaponConfig\.sprite/.test(spritesSrc),
      'sprite renderer should check for weapon sprite definitions'
    );
    assert.ok(
      /layerTag\s*\|\|\s*'WEAPON'/.test(spritesSrc) || spritesSrc.includes("'WEAPON'"),
      'sprite renderer should enqueue weapon layers with the WEAPON tag'
    );
  });

  it('gates weapon collider activation on preset opt-in', () => {
    assert.ok(
      /useWeaponColliders/.test(combatSrc),
      'combat.js should reference useWeaponColliders when merging weapon colliders'
    );
    assert.ok(
      /activatesOn/.test(combatSrc),
      'combat.js should respect collider activation tags before enabling them'
    );
  });

  it('keeps CONFIG.knockback.currentWeapon in sync with selections', () => {
    assert.ok(
      /setConfigCurrentWeapon/.test(appSrc),
      'app.js should define a helper to synchronize weapon selection'
    );
    assert.ok(
      /CONFIG\.knockback\.currentWeapon/.test(appSrc),
      'app.js should update CONFIG.knockback.currentWeapon when selections change'
    );
  });

  it('assigns dagger-swords to a playable character', () => {
    assert.ok(
      /anuri[\s\S]*weapon\s*:\s*['"]dagger-swords['"]/.test(configSrc),
      'anuri character should be configured with dagger-swords weapon'
    );
  });
});
