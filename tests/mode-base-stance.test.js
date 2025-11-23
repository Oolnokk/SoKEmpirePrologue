import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFile } from 'fs/promises';
import vm from 'node:vm';

const LEG_KEYS = ['lHip', 'rHip', 'lKnee', 'rKnee'];

const addAngles = (base = {}, delta = {}) => {
  const combined = {};
  for (const key of LEG_KEYS) {
    combined[key] = (base?.[key] ?? 0) + (delta?.[key] ?? 0);
  }
  return combined;
};

describe('Mode base poses', () => {
  it('basePose does not alter idle leg stances for each walk profile', async () => {
    const script = await readFile('docs/config/config.js', 'utf8');
    const sharedConfig = {};
    const context = { window: { CONFIG: sharedConfig }, CONFIG: sharedConfig, console };
    vm.createContext(context);
    vm.runInContext(script, context);

    const config = context.window.CONFIG || {};
    const basePose = config.basePose || {};

    const modes = [
      { key: 'combat', pose: config.poses?.Stance },
      { key: 'nonCombat', pose: config.poses?.NonCombatBase },
      { key: 'sneak', pose: config.poses?.SneakBase },
    ];

    for (const { key, pose } of modes) {
      assert.ok(pose, `${key} stance should exist`);
      const combined = addAngles(basePose, pose);
      for (const joint of LEG_KEYS) {
        assert.strictEqual(
          combined[joint],
          pose[joint],
          `basePose should not adjust ${joint} for ${key} stance`
        );
      }
    }
  });
});
