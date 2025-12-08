import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('upright controller constants are defined in physics.js', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  assert.match(source, /UPRIGHT_KP\s*=/, 'UPRIGHT_KP constant should be defined');
  assert.match(source, /UPRIGHT_KD\s*=/, 'UPRIGHT_KD constant should be defined');
  assert.match(source, /UPRIGHT_BOOST\s*=/, 'UPRIGHT_BOOST constant should be defined');
  assert.match(source, /UPRIGHT_MAX_DELTA\s*=/, 'UPRIGHT_MAX_DELTA constant should be defined');
});

test('upright controller code is in updateJointPhysics', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  // Verify the upright controller logic is present
  assert.match(source, /joint === 'torso' && !fighter\.ragdoll/, 
    'Should check for torso joint and non-ragdoll state');
  assert.match(source, /footingNormalized/, 
    'Should compute footingNormalized');
  assert.match(source, /getBalanceScalar\('uprightKp'/, 
    'Should use getBalanceScalar for uprightKp');
  assert.match(source, /getBalanceScalar\('uprightKd'/, 
    'Should use getBalanceScalar for uprightKd');
  assert.match(source, /getBalanceScalar\('uprightBoost'/, 
    'Should use getBalanceScalar for uprightBoost');
  assert.match(source, /getBalanceScalar\('uprightMaxDelta'/, 
    'Should use getBalanceScalar for uprightMaxDelta');
  assert.match(source, /angleError = 0 - angle/, 
    'Should compute angleError assuming neutral is 0');
  assert.match(source, /correction.*kp.*angleError.*kd.*vel.*scale/, 
    'Should compute PD correction with scale');
  assert.match(source, /clamp\(correction/, 
    'Should clamp correction before applying');
});

test('upright controller is applied before standard stiffness', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  // Find the upright controller block
  const uprightIdx = source.indexOf("joint === 'torso' && !fighter.ragdoll");
  assert.notEqual(uprightIdx, -1, 'Upright controller should exist');
  
  // Find the standard stiffness application
  const stiffnessIdx = source.indexOf('vel += (target - angle) * stiffness');
  assert.notEqual(stiffnessIdx, -1, 'Standard stiffness should exist');
  
  // Verify upright controller comes before stiffness
  assert.ok(uprightIdx < stiffnessIdx, 
    'Upright controller should be applied before standard stiffness');
});

test('balance config has upright controller defaults', async () => {
  const source = await readFile('docs/config/config.js', 'utf8');
  
  assert.match(source, /uprightKp:\s*[\d.]+/, 'balance config should have uprightKp');
  assert.match(source, /uprightKd:\s*[\d.]+/, 'balance config should have uprightKd');
  assert.match(source, /uprightBoost:\s*[\d.]+/, 'balance config should have uprightBoost');
  assert.match(source, /uprightMaxDelta:\s*[\d.]+/, 'balance config should have uprightMaxDelta');
});

test('upright controller only applies when not in ragdoll', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  // Extract the condition for the upright controller
  const uprightMatch = source.match(/if\s*\(\s*joint === 'torso' && !fighter\.ragdoll\s*\)/);
  assert.ok(uprightMatch, 'Should have explicit check for !fighter.ragdoll');
});

test('upright controller uses maxFooting from config', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  // Verify maxFooting is read from config in upright controller context
  const uprightSection = source.substring(
    source.indexOf("joint === 'torso' && !fighter.ragdoll"),
    source.indexOf("joint === 'torso' && !fighter.ragdoll") + 800
  );
  
  assert.match(uprightSection, /config\?\.knockback\?\.maxFooting/, 
    'Should read maxFooting from config.knockback.maxFooting');
  assert.match(uprightSection, /\?\? 100/, 
    'Should default maxFooting to 100');
});

test('upright controller computes scale with boost formula', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  // Verify the scale computation formula
  const uprightSection = source.substring(
    source.indexOf("joint === 'torso' && !fighter.ragdoll"),
    source.indexOf("joint === 'torso' && !fighter.ragdoll") + 1000
  );
  
  assert.match(uprightSection, /scale = 1 \+ boost \* \(1 - footingNormalized\)/, 
    'Scale should use formula: 1 + boost * (1 - footingNormalized)');
});

test('upright controller clamps correction to maxDelta', async () => {
  const source = await readFile('docs/js/physics.js', 'utf8');
  
  const uprightSection = source.substring(
    source.indexOf("joint === 'torso' && !fighter.ragdoll"),
    source.indexOf("joint === 'torso' && !fighter.ragdoll") + 1000
  );
  
  assert.match(uprightSection, /clampedCorrection = clamp\(correction, -maxDelta, maxDelta\)/, 
    'Should clamp correction to [-maxDelta, maxDelta]');
  assert.match(uprightSection, /vel \+= clampedCorrection/, 
    'Should apply clamped correction to velocity');
});
