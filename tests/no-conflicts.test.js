import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const trackedFiles = [
  'docs/index.html',
  'docs/js/app.js',
  'docs/js/_clearOverride.js',
];

const markers = ['<<<<<<<', '=======', '>>>>>>>'];

test('no git conflict markers linger in critical published assets', async () => {
  for (const file of trackedFiles) {
    const content = await readFile(file, 'utf8');
    for (const marker of markers) {
      assert.ok(
        !content.includes(marker),
        `${file} still contains the git merge marker "${marker}"`
      );
    }
  }
});
