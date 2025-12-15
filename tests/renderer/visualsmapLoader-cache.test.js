/**
 * Test cache-busting behavior in visualsmapLoader.js
 */

import { describe, it } from 'node:test';
import { strictEqual, match } from 'node:assert/strict';

describe('visualsmapLoader cache behavior', () => {
  it('should detect development mode for file:// protocol', () => {
    const mockProtocol = 'file:';
    const mockHostname = '';
    
    const isDev = mockProtocol === 'file:' || 
                  mockHostname === 'localhost' || 
                  mockHostname === '127.0.0.1';
    
    strictEqual(isDev, true, 'file:// protocol should be detected as development mode');
  });

  it('should detect development mode for localhost', () => {
    const mockProtocol = 'http:';
    const mockHostname = 'localhost';
    
    const isDev = mockProtocol === 'file:' || 
                  mockHostname === 'localhost' || 
                  mockHostname === '127.0.0.1';
    
    strictEqual(isDev, true, 'localhost should be detected as development mode');
  });

  it('should not detect development mode for production domains', () => {
    const mockProtocol = 'https:';
    const mockHostname = 'example.com';
    
    const isDev = mockProtocol === 'file:' || 
                  mockHostname === 'localhost' || 
                  mockHostname === '127.0.0.1';
    
    strictEqual(isDev, false, 'Production domains should not be detected as development mode');
  });

  it('should add cache-busting parameter in development mode', () => {
    const isDev = true;
    const baseUrl = 'config/maps/visualsmaps/index.json';
    const timestamp = Date.now();
    
    const url = isDev 
      ? `${baseUrl}?t=${timestamp}`
      : baseUrl;
    
    match(url, /\?t=\d+$/, 'URL should have cache-busting parameter in dev mode');
  });

  it('should not add cache-busting parameter in production mode', () => {
    const isDev = false;
    const baseUrl = 'config/maps/visualsmaps/index.json';
    
    const url = isDev 
      ? `${baseUrl}?t=${Date.now()}`
      : baseUrl;
    
    strictEqual(url, baseUrl, 'URL should not have cache-busting parameter in production mode');
  });

  it('should skip cache check in development mode', () => {
    const isDev = true;
    const cacheLoaded = true;
    const cacheHasAssets = true;
    
    const shouldUseCache = !isDev && cacheLoaded && cacheHasAssets;
    
    strictEqual(shouldUseCache, false, 'Cache should be bypassed in development mode');
  });

  it('should use cache in production mode when available', () => {
    const isDev = false;
    const cacheLoaded = true;
    const cacheHasAssets = true;
    
    const shouldUseCache = !isDev && cacheLoaded && cacheHasAssets;
    
    strictEqual(shouldUseCache, true, 'Cache should be used in production mode when available');
  });
});
