import { test } from 'node:test';
import assert from 'node:assert/strict';

import { updateFighterFootsteps } from '../docs/js/footstep-audio.js';

test('footsteps continue while walking even with low velocity animation drift', () => {
  const fighter = {
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    walk: { pendingContacts: [] },
    onGround: true,
  };
  const config = {};
  const emitted = [];

  for (let i = 0; i < 8; i += 1) {
    fighter.pos.x += 15; // Movement from animation offsets rather than velocity
    updateFighterFootsteps(fighter, config, 0.16);
    emitted.push(...(fighter._footstepState?.lastEvents || []));
  }

  const contactCount = emitted.length;
  assert.ok(contactCount >= 2, 'multiple footsteps should play during sustained movement');

  const feet = new Set(emitted.map((ev) => ev.foot));
  assert.ok(feet.size >= 2, 'footsteps should alternate feet over the cadence');
});
