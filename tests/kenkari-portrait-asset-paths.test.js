import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'assert';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const SPECIES_PATH = 'docs/config/species/kenkari.json';
const COSMETICS_INDEX_PATH = 'docs/config/cosmetics/index.json';
const COSMETICS_CONFIG_ROOT = 'docs/config/cosmetics/';
const ASSETS_ROOT = 'docs/assets/';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function toAssetPath(url) {
  if (typeof url !== 'string' || !url) return null;
  if (url.startsWith('./assets/')) return `docs/${url.slice(2)}`;
  if (url.startsWith('assets/')) return `docs/${url}`;
  return `${ASSETS_ROOT}${url}`;
}

function collectPortraitUrlsForGender(genderData) {
  const urls = [];
  if (!genderData || typeof genderData !== 'object') return urls;
  if (genderData.headSprite) urls.push(genderData.headSprite);
  for (const layer of genderData.headUrLayers || []) {
    if (layer?.url) urls.push(layer.url);
  }
  for (const layer of genderData.portraitBodyLayers || []) {
    if (layer?.url) urls.push(layer.url);
  }
  return urls;
}

function loadKenkariCosmeticUrls() {
  const species = readJson(SPECIES_PATH);
  const index = readJson(COSMETICS_INDEX_PATH);
  const entriesById = new Map((index.entries || []).map((entry) => [entry.id, entry.path]));

  const cosmeticIds = new Set([
    ...(species.male?.allowedCosmetics || []),
    ...(species.female?.allowedCosmetics || []),
    ...(species.male?.allowedPortraitClothing || []),
    ...(species.female?.allowedPortraitClothing || []),
  ]);

  const urls = [];
  for (const cosmeticId of cosmeticIds) {
    const entryPath = entriesById.get(cosmeticId);
    ok(entryPath, `Missing cosmetics index entry for "${cosmeticId}".`);
    const resolvedPath = path.resolve(COSMETICS_CONFIG_ROOT, entryPath);
    const cosmeticJson = readJson(resolvedPath);
    const parts = cosmeticJson?.parts || {};
    for (const part of Object.values(parts)) {
      if (!part || typeof part !== 'object') continue;
      if (part.image?.url) urls.push(part.image.url);
      for (const layer of Object.values(part.layers || {})) {
        if (layer?.image?.url) urls.push(layer.image.url);
      }
    }
  }
  return urls;
}

describe('kenkari portrait asset references', () => {
  it('resolve to existing files used by portrait rendering flow', () => {
    const species = readJson(SPECIES_PATH);
    const portraitUrls = [
      ...collectPortraitUrlsForGender(species.male),
      ...collectPortraitUrlsForGender(species.female),
      ...loadKenkariCosmeticUrls(),
    ];

    const uniqueAssetPaths = [...new Set(portraitUrls.map(toAssetPath).filter(Boolean))];
    const missing = uniqueAssetPaths.filter((assetPath) => !existsSync(assetPath));

    deepStrictEqual(
      missing,
      [],
      `Kenkari portrait flow references missing assets: ${missing.join(', ')}`
    );
  });
});
