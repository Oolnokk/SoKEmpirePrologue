import { registerCosmeticLibrary } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};
const sources = CONFIG.cosmetics?.librarySources || {};

async function loadCosmetic(id, url){
  if (!id || !url) return;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    registerCosmeticLibrary({ [id]: data });
  } catch (err) {
    console.warn(`[cosmetics] Failed to load cosmetic ${id} from ${url}`, err);
  }
}

const loadEntries = Object.entries(sources)
  .filter(([id, url]) => typeof id === 'string' && id.length && typeof url === 'string' && url.length);

if (typeof fetch !== 'function'){
  console.warn('[cosmetics] Skipping cosmetic library loading: fetch is unavailable in this environment');
} else if (loadEntries.length){
  await Promise.all(loadEntries.map(([id, url]) => loadCosmetic(id, url)));
}
