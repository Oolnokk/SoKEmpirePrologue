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

    // Get the base URL - prefer location.href for more reliable path resolution
    const baseUrl = (typeof window !== 'undefined' && window.location.href) ||
                    (typeof document !== 'undefined' && document.baseURI) ||
                    '';

    if (!baseUrl) {
      console.warn('[rendererAdapter] Cannot resolve URL: no baseURI available, returning original:', sceneUrl);
      return sceneUrl;
    }

    console.log('[rendererAdapter] Base URL detected:', baseUrl);

    // For absolute paths starting with '/', treat them as relative to the current directory
    // This handles GitHub Pages deployment where files are in a subdirectory (e.g., /SoKEmpirePrologue/docs/)
    // Instead of treating '/assets/...' as root-relative, we treat it as relative to the current page's directory
    if (sceneUrl.startsWith('/')) {
      // Strip the leading '/' and resolve as a relative path
      const relativeUrl = sceneUrl.substring(1);
      const resolved = new URL(relativeUrl, baseUrl).href;
      console.log('[rendererAdapter] Resolved absolute-style path as relative:', sceneUrl, '→', resolved);
      return resolved;
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

    // Load the GLTF scene
    const loadedScene = await renderer.loadGLTF(resolvedUrl);

    if (!loadedScene) {
      console.warn('adaptScene3dToRenderer: failed to load scene from', resolvedUrl);
      return { root: null, dispose: () => {} };
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
