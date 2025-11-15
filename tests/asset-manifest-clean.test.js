import { describe, it } from 'node:test';
import { readFileSync } from 'fs';
import { strictEqual } from 'assert';

const MANIFEST_PATH = 'docs/assets/asset-manifest.json';

function loadManifest() {
  const content = readFileSync(MANIFEST_PATH, 'utf8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : [];
}

describe('asset manifest hygiene', () => {
  it('does not list fallback-tagged sprite files', () => {
    const manifest = loadManifest();
    const fallbackPattern = /(\(old[0-9]*\)|\(delete\))/i;
    const offenders = manifest.filter((entry) => typeof entry === 'string' && fallbackPattern.test(entry));
    strictEqual(offenders.length, 0, `Manifest should exclude fallback assets, found: ${offenders.join(', ')}`);
  });
});
