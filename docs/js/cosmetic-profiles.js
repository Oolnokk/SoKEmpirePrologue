import { registerFighterCosmeticProfile } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};
const sources = CONFIG.cosmetics?.profileSources || {};

async function loadProfile(fighterName, url){
  if (!fighterName || !url) return;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    registerFighterCosmeticProfile(fighterName, data);
  } catch (err) {
    console.warn(`[cosmetics] Failed to load profile for ${fighterName} from ${url}`, err);
  }
}

const loadEntries = Object.entries(sources)
  .filter(([fighterName, url]) => typeof fighterName === 'string' && typeof url === 'string' && url.length);

if (typeof fetch !== 'function'){
  console.warn('[cosmetics] Skipping fighter profile loading: fetch is unavailable in this environment');
} else if (loadEntries.length){
  for (const [fighterName, url] of loadEntries){
    // Sequential load mirrors the cosmetic library to keep fetch pressure low.
    // eslint-disable-next-line no-await-in-loop
    await loadProfile(fighterName, url);
  }
}
