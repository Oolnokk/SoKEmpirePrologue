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

const appShimImportRegex = /import\s+['"]\.\/_clearOverride\.js\?v=(\d+)['"]/;
const appScriptRegex = /<script\s+type="module"\s+src="\.\/js\/app\.js\?v=(\d+)"><\/script>/;

async function readAppSource() {
  const appPath = await file('app.js');
  return readFile(appPath, 'utf8');
}

async function readIndexSource() {
  return readFile(path.resolve('docs/index.html'), 'utf8');
}

function extractVersion(source, regex, failureMessage) {
  const match = source.match(regex);
  assert.ok(match, failureMessage);
  const version = Number(match[1]);
  assert.ok(Number.isInteger(version), 'cache-busting query should be an integer');
  return version;
}

test('app imports the legacy clear override shim with a versioned path', async () => {
  const src = await readAppSource();
  const version = extractVersion(
    src,
    appShimImportRegex,
    'docs/js/app.js must import ./_clearOverride.js with a version query',
  );
  assert.ok(version >= 0, 'cache-busting query should be non-negative');
  const shimPath = await file('_clearOverride.js');
  await access(shimPath);
});

test('index.html loads the app entry point with a cache-busting query', async () => {
  const html = await readIndexSource();
  extractVersion(
    html,
    appScriptRegex,
    'docs/index.html must load ./js/app.js with a numeric cache-busting query parameter',
  );
});

test('cache-busting version stays in sync between index loader and shim import', async () => {
  const [appSource, indexSource] = await Promise.all([
    readAppSource(),
    readIndexSource(),
  ]);

  const shimVersion = extractVersion(
    appSource,
    appShimImportRegex,
    'docs/js/app.js must import ./_clearOverride.js with a version query',
  );
  const loaderVersion = extractVersion(
    indexSource,
    appScriptRegex,
    'docs/index.html must load ./js/app.js with a numeric cache-busting query parameter',
  );

  assert.equal(
    loaderVersion,
    shimVersion,
    'app.js and index.html cache-busting versions must match to avoid stale bundles',
  );
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
