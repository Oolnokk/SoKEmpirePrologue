import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = path.resolve('docs/js');

async function readJs(filename) {
  return readFile(path.join(rootDir, filename), 'utf8');
}

const moduleLoaderPattern = /<script\s+type="module"\s+src="\.\/js\/app\.js\?v=\d+"><\/script>/i;

async function readIndex() {
  return readFile(path.resolve('docs/index.html'), 'utf8');
}

test('app.js avoids importing deprecated shim modules', async () => {
  const source = await readJs('app.js');
  assert.ok(
    !/from\s+'\.\/_[^']+'/.test(source),
    'docs/js/app.js should not import modules prefixed with an underscore',
  );
});

test('docs/js directory does not contain underscore-prefixed modules', async () => {
  const entries = await readdir(rootDir);
  assert.ok(
    !entries.some((name) => name.startsWith('_')),
    'docs/js should not contain underscore-prefixed modules',
  );
});

test('combat module does not define a clearPoseOverride bandaid', async () => {
  const combat = await readJs('combat.js');
  assert.ok(
    !/function\s+clearPoseOverride\s*\(/.test(combat),
    'docs/js/combat.js should not carry the clearPoseOverride helper',
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
