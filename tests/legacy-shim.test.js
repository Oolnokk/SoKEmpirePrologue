import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

const shimImportPattern = /import\s+['"]\.\/_clearOverride\.js\?v=\d+['"];?/;
const aliasImportPattern = /import\s+['"]\.\/_clearOverride\.js\?v=\d+['"];?/;
const moduleLoaderPattern = /<script\s+type="module"\s+src="\.\/js\/app\.js\?v=\d+"><\/script>/i;

async function readIndex() {
  return readFile(path.resolve('docs/index.html'), 'utf8');
}

test('app.js eagerly imports the legacy clear override shim', async () => {
  const source = await readJs('app.js');
  assert.match(
    source,
    shimImportPattern,
    'docs/js/app.js must import ./_clearOverride.js with a cache-busting query',
  );
});

test('clearOverride.js delegates to the underscore-prefixed shim', async () => {
  const source = await readJs('clearOverride.js');
  assert.match(
    source,
    aliasImportPattern,
    'docs/js/clearOverride.js must import ./_clearOverride.js to stay in sync',
  );
});

test('index.html references the versioned app module directly', async () => {
  const html = await readIndex();
  assert.match(
    html,
    moduleLoaderPattern,
    'docs/index.html must load ./js/app.js via a versioned module script tag',
  );
});

test('legacy clear override shim explains that it is intentionally blank', async () => {
  const shimSource = await readJs('_clearOverride.js');
  assert.match(
    shimSource,
    /intentionally\s+blank/i,
    'shim should document that it no longer performs any work',
  );
});

test('legacy clear override shim evaluates without side effects on GAME.poseOverride', async () => {
  const shimSource = await readJs('_clearOverride.js');
  const context = { GAME: { poseOverride: 'stale' } };
  context.globalThis = context;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
  assert.equal(context.GAME.poseOverride, 'stale');
});

test('legacy clear override shim evaluates safely when GAME is missing', async () => {
  const shimSource = await readJs('_clearOverride.js');
  const context = {};
  context.globalThis = context;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
});

test('legacy clear override shim evaluates safely with non-object GAME containers', async () => {
  const shimSource = await readJs('_clearOverride.js');
  const context = { GAME: 'not-an-object' };
  context.globalThis = undefined;
  context.window = undefined;
  context.self = context;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
  assert.equal(context.GAME, 'not-an-object');
});

test('legacy clear override shim evaluates when only Node global is available', async () => {
  const shimSource = await readJs('_clearOverride.js');
  const context = { GAME: { poseOverride: 'legacy' } };
  context.global = context;
  context.globalThis = undefined;
  context.window = undefined;
  context.self = undefined;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
  assert.equal(context.GAME.poseOverride, 'legacy');
});
