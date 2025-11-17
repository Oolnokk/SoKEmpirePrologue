import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configSrc = readFileSync('docs/config/config.js', 'utf8');
const renderSrc = readFileSync('docs/js/render.js', 'utf8');
const spritesSrc = readFileSync('docs/js/sprites.js', 'utf8');
const appSrc = readFileSync('docs/js/app.js', 'utf8');
const manifestSrc = readFileSync('docs/assets/asset-manifest.json', 'utf8');
const combatSrc = readFileSync('docs/js/combat.js', 'utf8');

describe('Sarrarru weapon integration', () => {
  it('registers the citywatch sarrarru sprite asset', () => {
    assert.ok(
      configSrc.includes("./assets/weapons/sarrarru/citywatch_sarrarru.png"),
      'weapon sprite should be referenced from the core config'
    );
    assert.ok(
      manifestSrc.includes("./assets/weapons/sarrarru/citywatch_sarrarru.png"),
      'weapon sprite should be listed in the asset manifest'
    );
  });

  it('declares a knockback profile for the sarrarru weapon', () => {
    assert.ok(
      /weaponTypes[\s\S]*sarrarru/.test(configSrc),
      'knockback weaponTypes block should include a sarrarru entry'
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
});
