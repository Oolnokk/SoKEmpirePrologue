import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, glob, access } from 'node:fs/promises';

const trackedPatterns = [
  'docs/**/*.html',
  'docs/**/*.js',
];

const criticalEntryPoints = [
  'docs/index.html',
  'docs/js/app.js',
  'docs/js/_clearOverride.js',
];

const markers = ['<<<<<<<', '=======', '>>>>>>>'];

test('no git conflict markers linger in critical published assets', async () => {
  const files = new Set();

  for (const entry of criticalEntryPoints) {
    try {
      await access(entry);
    } catch (err) {
      throw new Error(`Critical entry point missing: ${entry}`);
    }
    files.add(entry);
  }

  for (const pattern of trackedPatterns) {
    const globber = glob(pattern, { nodir: true });
    for await (const file of globber) {
      files.add(file);
    }
  }

  if (files.size === 0) {
    throw new Error(
      `Conflict marker scan did not match any files. Check patterns: ${trackedPatterns.join(', ')}`
    );
  }

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const marker of markers) {
      assert.ok(
        !content.includes(marker),
        `${file} still contains the git merge marker "${marker}"`
      );
    }
  }
});
