import { registerCosmeticLibrary } from './cosmetics.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT?.CONFIG || {};
const sources = CONFIG.cosmetics?.librarySources || {};

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

const loadEntries = Object.entries(sources)
  .filter(([id, url]) => typeof id === 'string' && id.length && typeof url === 'string' && url.length);

let libraryLoadPromise = null;

async function runLibraryLoad({ reload = false } = {}){
  if (typeof fetch !== 'function'){
    console.warn('[cosmetics] Skipping cosmetic library loading: fetch is unavailable in this environment');
    return;
  }
  if (!loadEntries.length){
    return;
  }

  dispatchLibraryEvent('cosmetics:library-loading', { reload });

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
