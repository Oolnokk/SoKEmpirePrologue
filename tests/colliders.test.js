import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Ensure the collider store persists between calls like it would in the browser
if (typeof global.window === 'undefined') {
  global.window = { GAME: {} };
} else {
  global.window.GAME ||= {};
}

const collidersModule = await import('../docs/js/colliders.js');
const { updateFighterColliders, getFighterColliders, pruneFighterColliders } = collidersModule;

const baseConfig = {
  actor: { scale: 1 },
  colliders: { handMultiplier: 2, footMultiplier: 1 }
};

function makeBones({ len = 32, endX = 96, endY = 64 } = {}) {
  return {
    center: { x: 40, y: 80 },
    arm_L_lower: { x: 64, y: 48, len, ang: 0, endX, endY },
    arm_R_lower: { x: 64, y: 48, len, ang: 0, endX, endY },
    leg_L_lower: { x: 64, y: 96, len: 40, ang: 0, endX: 64, endY: 136 },
    leg_R_lower: { x: 64, y: 96, len: 40, ang: 0, endX: 64, endY: 136 },
  };
}

describe('collider sampling guards', () => {
  beforeEach(() => {
    pruneFighterColliders([]);
  });

  it('captures finite limb endpoints as collider centers', () => {
    updateFighterColliders('player', makeBones(), { config: baseConfig, hitCenter: { x: 40, y: 80 } });
    const colliders = getFighterColliders('player');
    assert.ok(colliders);
    assert.deepStrictEqual(colliders.handL, { x: 96, y: 64 });
    assert.strictEqual(colliders.handLRadius > 0, true);
  });

  it('drops invalid limb samples instead of emitting 0,0 fallbacks', () => {
    const invalidBones = makeBones({ len: Number.NaN, endX: Number.NaN, endY: Number.NaN });
    updateFighterColliders('player', invalidBones, { config: baseConfig, hitCenter: { x: 40, y: 80 } });
    const colliders = getFighterColliders('player');
    assert.ok(colliders);
    assert.strictEqual(colliders.handL, null);
    assert.strictEqual(colliders.handLRadius, null);
  });
});
