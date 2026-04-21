import { describe, it } from 'node:test';
import { deepStrictEqual } from 'assert';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const COSMETICS_INDEX_PATH = 'docs/config/cosmetics/index.json';
const COSMETICS_CONFIG_ROOT = 'docs/config/cosmetics/';
const ASSETS_ROOT = 'docs/assets/';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function toAssetPath(url) {
  if (typeof url !== 'string' || !url) return null;
  if (url.startsWith('./assets/')) return `docs/${url.slice(2)}`;
  if (url.startsWith('assets/')) return `docs/${url}`;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return null;
  return `${ASSETS_ROOT}${url}`;
}

function collectImageUrls(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectImageUrls(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.image && typeof value.image.url === 'string') out.push(value.image.url);
  for (const child of Object.values(value)) collectImageUrls(child, out);
  return out;
}

describe('cosmetics config asset paths', () => {
  it('index entries resolve and every cosmetic image url exists', () => {
    const index = readJson(COSMETICS_INDEX_PATH);
    const missing = [];

    for (const entry of index.entries || []) {
      const configPath = path.resolve(COSMETICS_CONFIG_ROOT, entry.path);
      if (!existsSync(configPath)) {
        missing.push(`missing cosmetic config: id=${entry.id} path=${entry.path}`);
        continue;
      }

      const cosmeticJson = readJson(configPath);
      const imageUrls = collectImageUrls(cosmeticJson);
      for (const url of imageUrls) {
        const assetPath = toAssetPath(url);
        if (!assetPath) continue;
        if (!existsSync(assetPath)) {
          missing.push(
            `missing cosmetic asset: id=${entry.id} config=${entry.path} url=${url} resolved=${assetPath}`
          );
        }
      }
    }

    deepStrictEqual(missing, []);
  });
});
