import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const rootDir = path.resolve('docs/js');

async function file(pathname) {
  const loc = path.join(rootDir, pathname);
  return loc;
}

const cacheImportInApp = /import\s+\{\s*CACHE_BUST\s*\}\s+from\s+['"]\.\/cacheVersion\.js['"];/;
const dynamicShimImport = /await\s+import\(`\.\/_clearOverride\.js\?v=\$\{CACHE_BUST\}`\)/;
const cacheImportInIndex = /import\s+\{\s*CACHE_BUST\s*\}\s+from\s+['"]\.\/js\/cacheVersion\.js['"];/;
const dynamicAppLoader = /import\(`\.\/js\/app\.js\?v=\$\{CACHE_BUST\}`\)/;

async function readAppSource() {
  const appPath = await file('app.js');
  return readFile(appPath, 'utf8');
}

async function readIndexSource() {
  return readFile(path.resolve('docs/index.html'), 'utf8');
}

async function importCacheVersionModule() {
  const modulePath = await file('cacheVersion.js');
  const url = pathToFileURL(modulePath);
  return import(url.href);
}

test('app imports the legacy clear override shim using the shared cache-bust constant', async () => {
  const src = await readAppSource();
  assert.match(
    src,
    cacheImportInApp,
    'docs/js/app.js must import CACHE_BUST from ./cacheVersion.js',
  );
  assert.match(
    src,
    dynamicShimImport,
    'docs/js/app.js must load ./_clearOverride.js using the shared CACHE_BUST value',
  );
  const shimPath = await file('_clearOverride.js');
  await access(shimPath);
});

test('index.html dynamically loads the app entry point using the shared cache-bust constant', async () => {
  const html = await readIndexSource();
  assert.match(
    html,
    cacheImportInIndex,
    'docs/index.html must import CACHE_BUST from ./js/cacheVersion.js',
  );
  assert.match(
    html,
    dynamicAppLoader,
    'docs/index.html must load ./js/app.js using the shared CACHE_BUST value',
  );
});

test('cache-bust constant is exported and shared between the loader and shim', async () => {
  const [{ CACHE_BUST }, appSource, indexSource] = await Promise.all([
    importCacheVersionModule(),
    readAppSource(),
    readIndexSource(),
  ]);

  assert.equal(
    typeof CACHE_BUST,
    'string',
    'CACHE_BUST must be a string export from cacheVersion.js',
  );
  assert.ok(CACHE_BUST.length > 0, 'CACHE_BUST must not be empty');
  assert.ok(
    dynamicShimImport.test(appSource),
    'app.js must reference CACHE_BUST when loading the legacy shim',
  );
  assert.ok(
    dynamicAppLoader.test(indexSource),
    'index.html must reference CACHE_BUST when loading app.js',
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

test('legacy clear override shim tolerates non-object GAME containers', async () => {
  const shimSource = await readFile(await file('_clearOverride.js'), 'utf8');
  const context = { GAME: 'not-an-object' };
  context.globalThis = undefined;
  context.window = undefined;
  context.self = context;
  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(shimSource, context));
  assert.equal(context.GAME, 'not-an-object');
});

test('legacy clear override shim falls back to undefined when delete fails', async () => {
  const shimSource = await readFile(await file('_clearOverride.js'), 'utf8');
  const game = {};
  Object.defineProperty(game, 'poseOverride', {
    configurable: false,
    writable: true,
    value: 'locked',
  });
  const context = { GAME: game };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(shimSource, context);
  assert.equal(context.GAME.poseOverride, undefined);
});
