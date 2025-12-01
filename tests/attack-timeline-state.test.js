import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} function should exist`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (ch === '{' && parenDepth === 0) {
      bodyStart = i;
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `Could not locate body for ${name}`);
  let depth = 1;
  for (let i = bodyStart + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not extract ${name}`);
}

test('attack timeline retains a single definition and exposes timeline state', async () => {
  const source = await readFile('docs/js/combat.js', 'utf8');
  const occurrences = (source.match(/function\s+runAttackTimeline/g) || []).length;
  assert.equal(occurrences, 1, 'runAttackTimeline should only be defined once');

  const runTimelineSrc = extractFunction(source, 'runAttackTimeline');
  const updateTimelineSrc = extractFunction(source, 'updateAttackTimeline');
  const normalizeStepsSrc = extractFunction(source, 'normalizeSequenceStepTimings');

  const script = [
    'const ATTACK = { timelineState: null };',
    'const stepsTriggered = [];',
    'let lastTransitionCallback = null;',
    'const poseTarget = "fighter";',
    'function playAttackSequenceStep(step, context) { stepsTriggered.push({ step, context }); }',
    'function resetMirror() {}',
    'function startTransition(pose, phase, duration, callback) {',
    '  lastTransitionCallback = callback;',
    '}',
    normalizeStepsSrc,
    runTimelineSrc,
    '',
    updateTimelineSrc,
    'exports.runAttackTimeline = runAttackTimeline;',
    'exports.updateAttackTimeline = updateAttackTimeline;',
    'exports.ATTACK = ATTACK;',
    'exports.stepsTriggered = stepsTriggered;',
    'exports.getLastTransitionCallback = () => lastTransitionCallback;',
  ].join('\n');

  const context = { exports: {}, performance: { now: () => 0 } };
  vm.createContext(context);
  vm.runInContext(script, context);

  const { runAttackTimeline, updateAttackTimeline, ATTACK, stepsTriggered, getLastTransitionCallback } = context.exports;
  const segments = [
    { phase: 'Windup', pose: {}, duration: 120, startTime: 0, endTime: 120 },
    { phase: 'Strike', pose: {}, duration: 100, startTime: 120, endTime: 220 }
  ];
  const steps = [
    { startMs: 60, move: 'ComboA' },
    { startMs: 180, move: 'ComboB' }
  ];

  runAttackTimeline({ segments, sequenceSteps: steps, context: { preset: 'Combo' } });
  assert.ok(ATTACK.timelineState, 'timeline state should be stored when attack starts');

  updateAttackTimeline(0.03);
  assert.equal(stepsTriggered.length, 0, 'no sequence step should fire before its start time');

  updateAttackTimeline(0.03);
  assert.equal(stepsTriggered.length, 1, 'sequence step should fire once elapsed time passes the threshold');

  const firstCallback = getLastTransitionCallback();
  assert.equal(typeof firstCallback, 'function', 'first segment callback should be captured');
  firstCallback();
  const secondCallback = getLastTransitionCallback();
  assert.equal(typeof secondCallback, 'function', 'second segment callback should be captured');
  secondCallback();
  assert.equal(ATTACK.timelineState, null, 'timeline state should clear after the segments finish');
});

test('attack timeline resets limb mirrors when hitting stance or completing', async () => {
  const source = await readFile('docs/js/combat.js', 'utf8');
  const runTimelineSrc = extractFunction(source, 'runAttackTimeline');

  const script = [
    'const ATTACK = { timelineState: null };',
    'const resetCalls = [];',
    'const poseTarget = "fighter";',
    'function playAttackSequenceStep() {}',
    'function resetMirror(target) { resetCalls.push(target); }',
    'function startTransition(pose, phase, duration, callback) { if (typeof callback === "function") callback(); }',
    'function normalizeSequenceStepTimings(){ return []; }',
    runTimelineSrc,
    'exports.ATTACK = ATTACK;',
    'exports.resetCalls = resetCalls;',
    'exports.runAttackTimeline = runAttackTimeline;',
  ].join('\n');

  const context = { exports: {}, performance: { now: () => 0 } };
  vm.createContext(context);
  vm.runInContext(script, context);

  const { runAttackTimeline, resetCalls } = context.exports;
  const segments = [
    { phase: 'Windup', pose: {}, duration: 50, startTime: 0, endTime: 50 },
    { phase: 'Stance', pose: {}, duration: 80, startTime: 50, endTime: 130 },
  ];

  runAttackTimeline({ segments, context: {}, resetMirrorBeforeStance: false });

  assert.ok(resetCalls.length >= 1, 'resetMirror should be called for stance cleanup even without pose metadata');
  assert.equal(resetCalls[0], 'fighter');
});
