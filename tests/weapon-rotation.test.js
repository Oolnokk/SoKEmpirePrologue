import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('weapon rotation handling', () => {
  it('treats pose weapon angles as offsets from the anchor orientation', async () => {
    const animatorSrc = await readFile(new URL('../docs/js/animator.js', import.meta.url), 'utf8');
    assert.match(
      animatorSrc,
      /const\s+weaponAngleOffset\s*=\s*Number\.isFinite\(target\?\.weapon\)\s*\?\s*target\.weapon\s*:\s*0;/
    );
    assert.match(
      animatorSrc,
      /const\s+anchorAngle\s*=\s*Number\.isFinite\(anchor\?\.ang\)\s*\?\s*anchor\.ang\s*:\s*0;/
    );
    assert.match(
      animatorSrc,
      /const\s+boneAng\s*=\s*anchorAngle\s*\+\s*weaponAngleOffset\s*\+\s*baseAngleOffset\s*\+\s*boneAngleOffset;/
    );
  });
});
