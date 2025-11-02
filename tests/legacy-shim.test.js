import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve('docs/js');

async function file(pathname) {
  const loc = path.join(rootDir, pathname);
  return loc;
}

test('app imports the legacy clear override shim with a versioned path', async () => {
  const appPath = await file('app.js');
  const src = await readFile(appPath, 'utf8');
  const importRegex = /import\s+['"]\.\/_clearOverride\.js\?v=(\d+)['"]/;
  const match = src.match(importRegex);
  assert.ok(match, 'docs/js/app.js must import ./_clearOverride.js with a version query');
  const shimPath = await file('_clearOverride.js');
  await access(shimPath);
});

test('index.html loads the app entry point with a cache-busting query', async () => {
  const html = await readFile(path.resolve('docs/index.html'), 'utf8');
  const scriptRegex = /<script\s+type="module"\s+src="\.\/js\/app\.js\?v=(\d+)"><\/script>/;
  const match = html.match(scriptRegex);
  assert.ok(match, 'docs/index.html must load ./js/app.js with a numeric cache-busting query parameter');
  assert.ok(Number.isInteger(Number(match[1])), 'cache-busting query should be an integer');
});

test('legacy clear override shim executes safely when GAME.poseOverride exists', async () => {
  const shimSource = await readFile(await file('_clearOverride.js'), 'utf8');
  const context = { GAME: { poseOverride: true } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(shimSource, context);
  assert.equal('poseOverride' in context.GAME, false, 'shim should delete poseOverride');
});

test('legacy clear override shim no-ops when GAME is missing', async () => {
  const shimSource = await readFile(await file('_clearOverride.js'), 'utf8');
  const context = { };
  context.globalThis = context;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
});
