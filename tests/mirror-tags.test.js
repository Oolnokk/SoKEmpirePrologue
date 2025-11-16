import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { resolveMirrorTags, MIRROR_TAGS } from '../docs/js/mirror-utils.js';

describe('mirror tag resolution helpers', () => {
  it('expands ALL wildcard to every canonical tag', () => {
    deepStrictEqual(resolveMirrorTags('ALL'), MIRROR_TAGS);
    deepStrictEqual(resolveMirrorTags('*'), MIRROR_TAGS);
  });

  it('maps left/right limb aliases to their branches', () => {
    deepStrictEqual(resolveMirrorTags('arm_l'), ['ARM_L_UPPER', 'ARM_L_LOWER']);
    deepStrictEqual(resolveMirrorTags('Right_Leg'), ['LEG_R_UPPER', 'LEG_R_LOWER']);
  });

  it('supports grouped specs like upper/lower arms and legs', () => {
    deepStrictEqual(resolveMirrorTags('upper arms'), ['ARM_L_UPPER', 'ARM_R_UPPER']);
    deepStrictEqual(resolveMirrorTags('lowerlegs'), ['LEG_L_LOWER', 'LEG_R_LOWER']);
  });

  it('dedupes when multiple specs expand to the same tag', () => {
    deepStrictEqual(
      resolveMirrorTags(['arm_l', 'leg_r', 'arm_l']),
      ['ARM_L_UPPER', 'ARM_L_LOWER', 'LEG_R_UPPER', 'LEG_R_LOWER']
    );
  });
});
