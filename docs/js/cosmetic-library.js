import { registerCosmeticLibrary } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};
const sources = CONFIG.cosmetics?.librarySources || {};

function resolveLibraryUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const resolver = CONFIG?.resolveConfigUrl;
  if (typeof resolver === 'function') {
    try {
      return resolver(url);
    } catch (error) {
      // fall through to location-based resolution
    }
  }
  if (typeof URL === 'function') {
    try {
      const base = CONFIG?.__siteRoot || ROOT?.location?.href;
      if (base) {
        return new URL(url, base).href;
      }
    } catch (_error) {
      // ignore resolution failures
    }
  }
  return url;
}

async function loadCosmetic(id, url){
  if (!id || !url) return;
  const resolvedUrl = resolveLibraryUrl(url);
  try {
    const response = await fetch(resolvedUrl, { cache: 'no-cache' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    registerCosmeticLibrary({ [id]: data });
  } catch (err) {
    console.warn(`[cosmetics] Failed to load cosmetic ${id} from ${resolvedUrl}`, err);
  }
}

const loadEntries = Object.entries(sources)
  .filter(([id, url]) => typeof id === 'string' && id.length && typeof url === 'string' && url.length);

if (typeof fetch !== 'function'){
  console.warn('[cosmetics] Skipping cosmetic library loading: fetch is unavailable in this environment');
} else if (loadEntries.length){
  await Promise.all(loadEntries.map(([id, url]) => loadCosmetic(id, url)));
}
