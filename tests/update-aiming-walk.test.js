import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} function should exist`);
  let depth = 0;
  let began = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      began = true;
    } else if (ch === '}') {
      depth -= 1;
      if (began && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test('updateAiming stays active when allowAiming is unspecified', async () => {
  const source = await readFile('docs/js/animator.js', 'utf8');
  const clampSrc = extractFunction(source, 'clamp');
  const normalizeSrc = extractFunction(source, 'normalizeRad');
  const convertSrc = extractFunction(source, 'convertAimToHeadRad');
  const updateAimingSrc = extractFunction(source, 'updateAiming');

  const script = `
    const degToRad = (deg) => deg * Math.PI / 180;
    const radToDegNum = (rad) => rad * 180 / Math.PI;
    ${clampSrc}
    ${normalizeSrc}
    ${convertSrc}
    ${updateAimingSrc}
    exports.updateAiming = updateAiming;
  `;

  const context = {
    Math,
    exports: {},
    window: {
      CONFIG: {
        aiming: {
          enabled: true,
          smoothing: 8,
          maxTorsoAngle: 45,
          maxShoulderAngle: 60
        }
      },
      GAME: {
        AIMING: { manualAim: false },
        JOYSTICK: { active: false },
        MOUSE: { worldX: 100, worldY: 0, isDown: false }
      }
    },
    performance: { now: () => 0 }
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  const { updateAiming } = context.exports;
  const fighter = {
    pos: { x: 0, y: 0 },
    facingRad: 0,
    anim: { dt: 0.016 },
    aim: {
      active: false,
      currentAngle: 0,
      torsoOffset: 0,
      shoulderOffset: 0,
      hipOffset: 0,
      headWorldTarget: null
    }
  };

  const pose = {}; // allowAiming is undefined for walk poses
  updateAiming(fighter, pose, 'player');

  assert.equal(fighter.aim.active, true, 'Aiming should remain active when allowAiming is not specified');
  assert.equal(typeof fighter.aim.headWorldTarget, 'number', 'Head target should be computed');
});
