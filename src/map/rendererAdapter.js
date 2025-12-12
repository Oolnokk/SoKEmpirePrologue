/**
 * Adapter to integrate scene3d descriptors with the renderer module
 * 
 * This adapter bridges the existing scene3d configuration format with the
 * lightweight renderer, allowing 3D visual maps to be loaded and positioned
 * according to gameplay coordinates.
 */

import { projectToGroundPlane, buildRenderSettings } from './scene3d.js';

/**
 * Resolve a scene URL to an absolute URL, handling GitHub Pages deployment paths
 * 
 * @param {string} sceneUrl - The URL from scene3d descriptor (may be absolute or relative)
 * @returns {string} Resolved absolute URL
 */
function resolveSceneUrl(sceneUrl) {
  if (!sceneUrl) return sceneUrl;
  
  try {
    // If it's already a complete URL (http://, https://, etc.), return as-is
    if (/^[a-z][a-z0-9+.-]*:/i.test(sceneUrl)) {
      return sceneUrl;
    }
    
    // Use document.baseURI (or location.href as fallback) to resolve relative URLs
    const baseUrl = (typeof document !== 'undefined' && document.baseURI) || 
                    (typeof location !== 'undefined' && location.href) || 
                    '';
    
    if (!baseUrl) {
      console.warn('[rendererAdapter] Cannot resolve URL: no baseURI available, returning original:', sceneUrl);
      return sceneUrl;
    }
    
    // For absolute paths starting with '/', resolve against the origin + base path
    // This handles GitHub Pages deployment (e.g., /SoKEmpirePrologue/)
    if (sceneUrl.startsWith('/')) {
      // Extract base path from baseURI (e.g., /SoKEmpirePrologue/ from https://oolnokk.github.io/SoKEmpirePrologue/docs/)
      const baseUrlObj = new URL(baseUrl);
      const pathParts = baseUrlObj.pathname.split('/').filter(p => p);
      
      // If we're in a subdirectory (GitHub Pages repo deployment), prepend the repo name
      // Heuristic: if path starts with a repo-like segment (not 'docs', 'assets', etc.), include it
      const repoSegment = pathParts.length > 0 && !['docs', 'assets', 'config', 'js', 'vendor'].includes(pathParts[0]) 
        ? '/' + pathParts[0] 
        : '';
      
      const resolvedUrl = baseUrlObj.origin + repoSegment + sceneUrl;
      console.log('[rendererAdapter] Resolved absolute path:', sceneUrl, '→', resolvedUrl);
      return resolvedUrl;
    }
    
    // For relative paths, use standard URL resolution
    const resolved = new URL(sceneUrl, baseUrl).href;
    console.log('[rendererAdapter] Resolved relative path:', sceneUrl, '→', resolved);
    return resolved;
  } catch (error) {
    console.warn('[rendererAdapter] Error resolving URL:', sceneUrl, error);
    return sceneUrl;
  }
}

/**
 * Generate fallback URL candidates for loading
 * 
 * @param {string} originalUrl - The original (potentially failing) URL
 * @returns {string[]} Array of fallback URLs to try
 */
function generateFallbackUrls(originalUrl) {
  if (!originalUrl) return [];
  
  const fallbacks = [];
  
  try {
    // If the original URL is absolute and starts with '/', try relative versions
    if (originalUrl.startsWith('/')) {
      // Try removing leading slash (relative to current directory)
      fallbacks.push('.' + originalUrl);
      
      // Try relative to parent directory
      fallbacks.push('..' + originalUrl);
    }
    
    // If URL contains protocol, try stripping it and making relative
    const urlMatch = originalUrl.match(/^https?:\/\/[^/]+(\/.*)/);
    if (urlMatch && urlMatch[1]) {
      const pathPart = urlMatch[1];
      if (pathPart.startsWith('/')) {
        fallbacks.push('.' + pathPart);
      }
    }
  } catch (error) {
    console.warn('[rendererAdapter] Error generating fallback URLs:', error);
  }
  
  return fallbacks;
}

/**
 * Adapt a scene3d descriptor to the renderer
 * 
 * @param {Renderer} renderer - The renderer instance
 * @param {Object} scene3dDescriptor - Scene3D configuration object
 * @param {string} [scene3dDescriptor.sceneUrl] - URL to the GLTF/GLB file
 * @param {Object} [scene3dDescriptor.ground] - Ground plane settings
 * @param {number} [scene3dDescriptor.ground.planeZ] - Z-coordinate of ground plane
 * @param {number} [scene3dDescriptor.ground.unitsPerPixel] - Scale factor
 * @param {Object} [options] - Additional options
 * @param {Object} [options.position] - Position offset {x, y, z}
 * @param {Object} [options.rotation] - Rotation {x, y, z}
 * @param {Object} [options.scale] - Scale {x, y, z}
 * @returns {Promise<Object>} Resolves to { root, dispose } where root is the loaded scene
 */
export async function adaptScene3dToRenderer(renderer, scene3dDescriptor, options = {}) {
  if (!renderer) {
    console.warn('adaptScene3dToRenderer: renderer is required');
    return { root: null, dispose: () => {} };
  }

  if (!scene3dDescriptor || typeof scene3dDescriptor !== 'object') {
    console.warn('adaptScene3dToRenderer: invalid scene3dDescriptor');
    return { root: null, dispose: () => {} };
  }

  // Get render settings from scene3d config
  const renderSettings = buildRenderSettings(scene3dDescriptor);
  
  // If no sceneUrl, return empty adapter
  if (!scene3dDescriptor.sceneUrl) {
    console.warn('adaptScene3dToRenderer: no sceneUrl in scene3dDescriptor');
    return { root: null, dispose: () => {} };
  }

  try {
    // Resolve the scene URL to handle GitHub Pages deployment paths
    const resolvedUrl = resolveSceneUrl(scene3dDescriptor.sceneUrl);
    console.log('[adaptScene3dToRenderer] Loading scene from:', resolvedUrl);
    
    // Try to load the GLTF scene with fallback URLs
    let loadedScene = null;
    let lastError = null;
    const urlsToTry = [resolvedUrl, ...generateFallbackUrls(scene3dDescriptor.sceneUrl)];
    
    for (let i = 0; i < urlsToTry.length && !loadedScene; i++) {
      const urlToTry = urlsToTry[i];
      if (!urlToTry) continue;
      
      try {
        console.log(`[adaptScene3dToRenderer] Attempt ${i + 1}/${urlsToTry.length}: trying ${urlToTry}`);
        loadedScene = await renderer.loadGLTF(urlToTry);
        
        if (loadedScene) {
          console.log('[adaptScene3dToRenderer] ✓ Scene loaded successfully from:', urlToTry);
          break;
        }
      } catch (error) {
        lastError = error;
        console.warn(`[adaptScene3dToRenderer] Failed to load from ${urlToTry}:`, error.message);
      }
    }
    
    if (!loadedScene) {
      const errorMsg = lastError ? lastError.message : 'Unknown error';
      console.error('[adaptScene3dToRenderer] Failed to load scene after all attempts. Original URL:', scene3dDescriptor.sceneUrl, 'Last error:', errorMsg);
      return { 
        root: null, 
        dispose: () => {},
        error: lastError || new Error('Failed to load scene from any URL')
      };
    }

    // Apply position, rotation, scale based on scene3d descriptor and options
    const position = options.position || { x: 0, y: 0, z: 0 };
    const rotation = options.rotation || { x: 0, y: 0, z: 0 };
    const scale = options.scale || { x: 1, y: 1, z: 1 };

    // Project position to ground plane if needed
    const groundPlanePos = projectToGroundPlane(position, scene3dDescriptor);
    
    loadedScene.position.set(groundPlanePos.x, groundPlanePos.y, groundPlanePos.z);
    loadedScene.rotation.set(rotation.x, rotation.y, rotation.z);
    loadedScene.scale.set(scale.x, scale.y, scale.z);

    // Add to renderer
    renderer.add(loadedScene);

    // Return adapter object
    return {
      root: loadedScene,
      renderSettings,
      dispose: () => {
        if (loadedScene && renderer) {
          renderer.remove(loadedScene);
        }
      }
    };
  } catch (error) {
    console.error('adaptScene3dToRenderer: error loading scene', error);
    return { 
      root: null, 
      dispose: () => {},
      error 
    };
  }
}
