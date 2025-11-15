import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const animatorSrc = readFileSync('docs/js/animator.js', 'utf8');

describe('animator weapon bone synthesis', () => {
  it('defines a helper that derives a synthetic weapon bone', () => {
    assert.ok(
      animatorSrc.includes('function createSyntheticWeaponBone'),
      'animator.js should declare createSyntheticWeaponBone to generate derived bones'
    );
  });

  it('appends the derived weapon bone to the computed rig output', () => {
    assert.ok(
      /decoratedBones\s*=\s*Array\.isArray\(finalBuild\.bones\)/.test(animatorSrc),
      'animator.js should create a decoratedBones array before storing state'
    );
    assert.ok(
      /decoratedBones\.push\(syntheticWeaponBone\)/.test(animatorSrc),
      'animator.js should push the synthetic weapon bone into the decorated list'
    );
  });

  it('stores the derived weapon bone alongside the rest of the state', () => {
    assert.ok(
      /weaponBone:\s*syntheticWeaponBone/.test(animatorSrc),
      'animator.js should expose the derived bone on weapon state for downstream systems'
    );
  });
});
