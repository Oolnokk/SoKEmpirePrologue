import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

async function findFiles(dir, pattern) {
  const files = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(dir);
  return files;
}

const criticalEntryPoints = [
  'docs/index.html',
  'docs/js/app.js',
  'docs/js/_clearOverride.js',
  'docs/js/clearOverride.js',
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

  // Find all HTML and JS files in docs/
  const htmlFiles = await findFiles('docs', /\.html$/);
  const jsFiles = await findFiles('docs', /\.js$/);
  
  for (const file of [...htmlFiles, ...jsFiles]) {
    files.add(file);
  }

  if (files.size === 0) {
    throw new Error(
      `Conflict marker scan did not match any files.`
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
