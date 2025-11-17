import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

const bootstrapLoaderPattern = /<script\s+src="\.\/js\/bootstrap\.js\?v=\d+"><\/script>/i;

async function readIndex() {
  return readFile(path.resolve('docs/index.html'), 'utf8');
}

test('app.js no longer imports the legacy clear override shim', async () => {
  const source = await readJs('app.js');
  assert.ok(
    !/\.\/_clearOverride\.js/.test(source),
    'docs/js/app.js should not import the legacy clear override shim',
  );
});

test('clearOverride shim files have been removed', async () => {
  await assert.rejects(
    () => readJs('_clearOverride.js'),
    { code: 'ENOENT' },
    'docs/js/_clearOverride.js should be removed',
  );
  await assert.rejects(
    () => readJs('clearOverride.js'),
    { code: 'ENOENT' },
    'docs/js/clearOverride.js should be removed',
  );
});

test('combat module does not define a clearPoseOverride bandaid', async () => {
  const combat = await readJs('combat.js');
  assert.ok(
    !/function\s+clearPoseOverride\s*\(/.test(combat),
    'docs/js/combat.js should not carry the clearPoseOverride helper',
  );
});

test('index.html loads the versioned bootstrap loader', async () => {
  const html = await readIndex();
  assert.match(
    html,
    bootstrapLoaderPattern,
    'docs/index.html must load ./js/bootstrap.js via a versioned script tag',
  );
});

test('bootstrap loader triggers the versioned app module', async () => {
  const loader = await readJs('bootstrap.js');
  assert.match(
    loader,
    /script\.src\s*=\s*'\.\/js\/app\.js\?v=\d+'/,
    'docs/js/bootstrap.js must load ./js/app.js via a versioned module script tag',
  );
});
