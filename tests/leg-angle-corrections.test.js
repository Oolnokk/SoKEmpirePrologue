import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual, ok } from 'assert';

describe('Leg angle corrections (Issue: Fix sprite rendering issues)', () => {
  const configContent = readFileSync('docs/config/config.js', 'utf8');

  // Helper to extract angle values from a pose
  function extractPoseAngles(poseName) {
    const posePattern = new RegExp(`${poseName}:\\s*\\{[^}]*?lHip:([-\\d]+)[^}]*?rHip:([-\\d]+)`);
    const match = configContent.match(posePattern);
    if (match) {
      return {
        lHip: parseInt(match[1], 10),
        rHip: parseInt(match[2], 10)
      };
    }
    return null;
  }

  // Helper to check if angle is in natural standing range (90-210°)
  function isInNaturalRange(angle) {
    return angle >= 90 && angle <= 210;
  }

  it('Windup pose has leg hip angles in natural standing range (90-210°)', () => {
    const angles = extractPoseAngles('Windup');
    ok(angles, 'Windup pose should exist');
    ok(isInNaturalRange(angles.lHip), 
      `Windup lHip (${angles.lHip}°) should be in natural standing range (90-210°)`);
    ok(isInNaturalRange(angles.rHip), 
      `Windup rHip (${angles.rHip}°) should be in natural standing range (90-210°)`);
  });

  it('Strike pose has leg hip angles in natural standing range (90-210°)', () => {
    const angles = extractPoseAngles('Strike');
    ok(angles, 'Strike pose should exist');
    ok(isInNaturalRange(angles.lHip), 
      `Strike lHip (${angles.lHip}°) should be in natural standing range (90-210°)`);
    ok(isInNaturalRange(angles.rHip), 
      `Strike rHip (${angles.rHip}°) should be in natural standing range (90-210°)`);
  });

  it('Recoil pose has leg hip angles in natural standing range (90-210°)', () => {
    const angles = extractPoseAngles('Recoil');
    ok(angles, 'Recoil pose should exist');
    ok(isInNaturalRange(angles.lHip), 
      `Recoil lHip (${angles.lHip}°) should be in natural standing range (90-210°)`);
    ok(isInNaturalRange(angles.rHip), 
      `Recoil rHip (${angles.rHip}°) should be in natural standing range (90-210°)`);
  });

  it('Windup pose has expected corrected values', () => {
    const angles = extractPoseAngles('Windup');
    ok(angles, 'Windup pose should exist');
    strictEqual(angles.lHip, 130, 'Windup lHip should be 130°');
    strictEqual(angles.rHip, 100, 'Windup rHip should be 100°');
  });

  it('Strike pose has expected corrected values', () => {
    const angles = extractPoseAngles('Strike');
    ok(angles, 'Strike pose should exist');
    strictEqual(angles.lHip, 180, 'Strike lHip should be 180°');
    strictEqual(angles.rHip, 110, 'Strike rHip should be 110°');
  });

  it('Recoil pose has expected corrected values', () => {
    const angles = extractPoseAngles('Recoil');
    ok(angles, 'Recoil pose should exist');
    strictEqual(angles.lHip, 110, 'Recoil lHip should be 110°');
    strictEqual(angles.rHip, 100, 'Recoil rHip should be 100°');
  });
});
