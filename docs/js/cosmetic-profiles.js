import { registerFighterCosmeticProfile } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};
const sources = CONFIG.cosmetics?.profileSources || {};

function resolveProfileUrl(url) {
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

async function loadProfile(fighterName, url){
  if (!fighterName || !url) return;
  const resolvedUrl = resolveProfileUrl(url);
  try {
    const response = await fetch(resolvedUrl, { cache: 'no-cache' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    registerFighterCosmeticProfile(fighterName, data);
  } catch (err) {
    console.warn(`[cosmetics] Failed to load profile for ${fighterName} from ${resolvedUrl}`, err);
  }
}

const loadEntries = Object.entries(sources)
  .filter(([fighterName, url]) => typeof fighterName === 'string' && typeof url === 'string' && url.length);

if (typeof fetch !== 'function'){
  console.warn('[cosmetics] Skipping fighter profile loading: fetch is unavailable in this environment');
} else if (loadEntries.length){
  await Promise.all(loadEntries.map(([fighterName, url]) => loadProfile(fighterName, url)));
}
