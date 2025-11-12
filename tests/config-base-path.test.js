import { strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const CONFIG_SOURCE = readFileSync(new URL('../docs/config/config.js', import.meta.url), 'utf8');

function executeConfig({ currentScriptSrc = null, scriptTagSrcs = [], locationHref = 'https://example.com/prologue/index.html' } = {}) {
  const window = { CONFIG: {} };
  if (locationHref) {
    window.location = { href: locationHref };
  }
  const document = {
    currentScript: currentScriptSrc ? { src: currentScriptSrc } : null,
    getElementsByTagName: (tagName) => {
      if (tagName?.toLowerCase() !== 'script') return [];
      return scriptTagSrcs.map((src) => ({ src }));
    },
  };
  const context = {
    window,
    document,
    console,
    URL,
  };
  Object.defineProperty(context, 'CONFIG', {
    configurable: true,
    enumerable: true,
    get() {
      return context.window.CONFIG;
    },
    set(value) {
      context.window.CONFIG = value;
      return true;
    },
  });
  context.globalThis = context;
  runInNewContext(CONFIG_SOURCE, context, { filename: 'config.js' });
  return context.window.CONFIG;
}

test('config derives site root from the published config script', () => {
  const CONFIG = executeConfig({
    currentScriptSrc: 'https://cdn.example.com/SoK/config/config.js?v=123',
    locationHref: 'https://cdn.example.com/SoK/index.html',
  });
  strictEqual(CONFIG.__siteRoot, 'https://cdn.example.com/SoK/');
  strictEqual(CONFIG.resolveConfigUrl('./config/cosmetics/demo.json'),
    'https://cdn.example.com/SoK/config/cosmetics/demo.json');
});

test('config falls back to matching script tags when currentScript is unavailable', () => {
  const CONFIG = executeConfig({
    currentScriptSrc: null,
    scriptTagSrcs: ['https://assets.example.org/prologue/config/config.js?cache=abc123'],
    locationHref: 'https://other.example.org/ignored/index.html',
  });
  strictEqual(CONFIG.__siteRoot, 'https://assets.example.org/prologue/');
  strictEqual(CONFIG.resolveConfigUrl('./assets/asset-manifest.json'),
    'https://assets.example.org/prologue/assets/asset-manifest.json');
});

test('config falls back to window.location when script URLs are unavailable', () => {
  const CONFIG = executeConfig({
    currentScriptSrc: null,
    scriptTagSrcs: [],
    locationHref: 'https://player.example.net/sok/index.html?mode=game',
  });
  strictEqual(CONFIG.__siteRoot, 'https://player.example.net/sok/');
  strictEqual(CONFIG.resolveConfigUrl('./config/cosmetics/basic_headband.json'),
    'https://player.example.net/sok/config/cosmetics/basic_headband.json');
});
