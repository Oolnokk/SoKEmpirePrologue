import { registerCosmeticLibrary } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};

function dispatchLibraryEvent(name, detail){
  if (!ROOT || typeof ROOT.dispatchEvent !== 'function') return;
  try {
    ROOT.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (err) {
    console.warn(`[cosmetics] Failed to dispatch ${name}`, err);
  }
}

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

/**
 * Resolves the base URL for a relative path found inside the index file.
 * The index file lives at `indexUrl`, so its sibling paths are resolved
 * relative to that directory.
 */
function resolveIndexPath(indexUrl, relativePath){
  if (!indexUrl || !relativePath) return null;
  try {
    return new URL(relativePath, indexUrl).href;
  } catch {
    return relativePath;
  }
}

/**
 * Loads the cosmetic index file and returns an array of {id, url} pairs.
 * Paths in the index are relative to the index file itself.
 */
async function loadEntriesFromIndex(indexPath){
  try {
    const response = await fetch(indexPath, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return entries
      .filter((entry) => typeof entry.id === 'string' && entry.id.length && typeof entry.path === 'string' && entry.path.length)
      .flatMap((entry) => {
        const url = resolveIndexPath(indexPath, entry.path);
        return url ? [[entry.id, url]] : [];
      });
  } catch (err) {
    console.warn(`[cosmetics] Failed to load cosmetic index from ${indexPath}`, err);
    return [];
  }
}

async function resolveLoadEntries(){
  const indexPath = CONFIG.cosmetics?.libraryIndexPath;
  if (indexPath && typeof fetch === 'function'){
    const entries = await loadEntriesFromIndex(indexPath);
    if (entries.length) return entries;
  }
  // Fallback: use the flat librarySources map from config
  const sources = CONFIG.cosmetics?.librarySources || {};
  return Object.entries(sources)
    .filter(([id, url]) => typeof id === 'string' && id.length && typeof url === 'string' && url.length);
}

let libraryLoadPromise = null;

async function runLibraryLoad({ reload = false } = {}){
  if (typeof fetch !== 'function'){
    console.warn('[cosmetics] Skipping cosmetic library loading: fetch is unavailable in this environment');
    return;
  }

  dispatchLibraryEvent('cosmetics:library-loading', { reload });

  const loadEntries = await resolveLoadEntries();
  if (!loadEntries.length) return;

  for (const [id, url] of loadEntries){
    // Sequentialize loads to avoid exhausting limited browser fetch slots.
    // eslint-disable-next-line no-await-in-loop
    await loadCosmetic(id, url);
  }
}

function ensureLibraryLoad({ reload = false } = {}){
  if (reload || !libraryLoadPromise){
    libraryLoadPromise = runLibraryLoad({ reload })
      .catch((err) => console.warn('[cosmetics] Cosmetic library loading failed', err))
      .finally(() => dispatchLibraryEvent('cosmetics:library-ready', { reload }));
    if (ROOT){
      ROOT.cosmeticLibraryReady = libraryLoadPromise;
    }
  }
  return libraryLoadPromise;
}

export function whenCosmeticLibraryReady(){
  return ensureLibraryLoad();
}

export function refreshCosmeticLibrary(){
  return ensureLibraryLoad({ reload: true });
}

ensureLibraryLoad();
