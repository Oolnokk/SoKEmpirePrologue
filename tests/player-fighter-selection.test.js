import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fighterJsPath = join(__dirname, '..', 'docs', 'js', 'fighter.js');
const fighterJsSrc = readFileSync(fighterJsPath, 'utf-8');

function extractResolveFunction() {
  const match = fighterJsSrc.match(/function\s+resolveFighterName[\s\S]*?return fallbackFighterName;\s*\}/);
  return match ? match[0] : '';
}

describe('player fighter selection pipeline', () => {
  it('resolveFighterName prioritizes the selected fighter for the player preview', () => {
    const snippet = extractResolveFunction();
    assert.notStrictEqual(snippet, '', 'resolveFighterName function should be present in fighter.js');
    assert.ok(
      snippet.includes('function resolveFighterName(id, characterData, prevProfile)'),
      'resolveFighterName should accept the fighter id so it can detect the player entity'
    );
    assert.ok(
      /id\s*===\s*['"]player['"]/u.test(snippet),
      'resolveFighterName should check for the player id when applying the selected fighter override'
    );
    assert.ok(
      /selectedFighter\s*&&[\s\S]*C\.fighters\?\.[\[]selectedFighter[\]]/u.test(snippet),
      'resolveFighterName should ensure the selected fighter exists before using it'
    );
  });
});
