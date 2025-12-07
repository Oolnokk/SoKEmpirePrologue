/**
 * Scene3D Preview Module
 * 
 * Minimal Three.js-based GLTF renderer for quick previewing in the map editor.
 * This is NOT a full renderer integration - just a lightweight test harness
 * for visualizing 3D assets anchored to the scene3d ground plane.
 */

import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';

let renderer = null;
let scene = null;
let camera = null;
let animationFrameId = null;
let containerElement = null;
let canvas = null;
let currentCameraSide = 'center';
let cameraOffset = 0;
let loadedModels = [];

const DEFAULT_CONFIG = {
  sceneUrl: './assets/3D/tower_commercial3D.glb',
  fallbackUrl: './assets/3D/scene3d-demo.gltf',
  ground: {
    planeZ: 0,
    unitsPerPixel: 1,
  },
  camera: {
    projection: 'perspective',
    fov: 50,
  },
  instanceCount: 8,
  spacing: 220,
  lighting: 'basic',
};

/**
 * Initialize Three.js renderer and scene
 */
function initializeThreeJS(container) {
  // Create canvas if not exists
  canvas = container.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
  }

  // Create renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
  });
  
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setClearColor(0x0a0e14, 1);

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e14);

  // Create camera
  const aspect = rect.width / rect.height;
  camera = new THREE.PerspectiveCamera(DEFAULT_CONFIG.camera.fov, aspect, 0.1, 10000);
  camera.position.set(0, 200, 500);
  camera.lookAt(0, 0, 0);

  // Add basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 200, 100);
  scene.add(directionalLight);

  // Add grid helper for reference
  const gridHelper = new THREE.GridHelper(2000, 20, 0x444444, 0x222222);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  // Handle window resize
  const resizeObserver = new ResizeObserver(() => {
    if (!container || !renderer || !camera) return;
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  // Store for cleanup
  container._resizeObserver = resizeObserver;

  return { renderer, scene, camera };
}

/**
 * Load GLTF model with fallback
 */
async function loadGLTFModel(url, fallbackUrl) {
  const loader = new GLTFLoader();
  
  const loadPromise = (modelUrl) => {
    return new Promise((resolve, reject) => {
      loader.load(
        modelUrl,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      );
    });
  };

  try {
    return await loadPromise(url);
  } catch (error) {
    console.warn(`[scene3d-preview] Failed to load ${url}, trying fallback...`, error);
    if (fallbackUrl && fallbackUrl !== url) {
      try {
        return await loadPromise(fallbackUrl);
      } catch (fallbackError) {
        console.error(`[scene3d-preview] Failed to load fallback ${fallbackUrl}`, fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}

/**
 * Create instanced models arranged in a row
 */
function createInstancedModels(gltfScene, config) {
  const instances = [];
  const count = config.instanceCount || DEFAULT_CONFIG.instanceCount;
  const spacing = config.spacing || DEFAULT_CONFIG.spacing;
  const unitsPerPixel = config.ground?.unitsPerPixel || DEFAULT_CONFIG.ground.unitsPerPixel;

  const startX = -(count - 1) * spacing * unitsPerPixel / 2;

  for (let i = 0; i < count; i++) {
    const model = gltfScene.clone();
    const x = startX + i * spacing * unitsPerPixel;
    const y = config.ground?.planeZ || DEFAULT_CONFIG.ground.planeZ;
    
    model.position.set(x, y, 0);
    
    // Apply slight random rotation for visual interest
    const randomRotation = (Math.random() - 0.5) * 0.2;
    model.rotation.y = randomRotation;

    scene.add(model);
    instances.push(model);
  }

  return instances;
}

/**
 * Animation loop
 */
function animate() {
  if (!renderer || !scene || !camera) return;
  
  animationFrameId = requestAnimationFrame(animate);
  
  // Apply camera offset based on side
  camera.position.x = cameraOffset;
  
  renderer.render(scene, camera);
}

/**
 * Start 3D preview
 * @param {Object} opts - Configuration options
 * @param {HTMLElement} opts.containerElement - Container for the canvas
 * @param {string} opts.sceneUrl - URL to GLTF/GLB file
 * @param {Object} opts.ground - Ground plane config { planeZ, unitsPerPixel }
 * @param {Object} opts.camera - Camera config { projection, fov }
 * @param {number} opts.instanceCount - Number of models to create
 * @param {number} opts.spacing - Spacing between models in pixels
 */
export async function startPreview(opts = {}) {
  try {
    // Stop any existing preview
    stopPreview();

    // Validate container
    if (!opts.containerElement) {
      throw new Error('containerElement is required');
    }

    containerElement = opts.containerElement;

    // Merge config with defaults
    const config = {
      ...DEFAULT_CONFIG,
      ...opts,
      ground: { ...DEFAULT_CONFIG.ground, ...(opts.ground || {}) },
      camera: { ...DEFAULT_CONFIG.camera, ...(opts.camera || {}) },
    };

    // Initialize Three.js
    initializeThreeJS(containerElement);

    // Load GLTF model
    const sceneUrl = config.sceneUrl || DEFAULT_CONFIG.sceneUrl;
    const fallbackUrl = config.fallbackUrl || DEFAULT_CONFIG.fallbackUrl;
    
    console.log(`[scene3d-preview] Loading model from ${sceneUrl}...`);
    const gltf = await loadGLTFModel(sceneUrl, fallbackUrl);
    
    if (!gltf || !gltf.scene) {
      throw new Error('Failed to load GLTF scene');
    }

    console.log('[scene3d-preview] Model loaded successfully');

    // Create instances
    loadedModels = createInstancedModels(gltf.scene, config);
    console.log(`[scene3d-preview] Created ${loadedModels.length} instances`);

    // Start animation loop
    animate();

    return {
      success: true,
      instanceCount: loadedModels.length,
    };
  } catch (error) {
    console.error('[scene3d-preview] Failed to start preview:', error);
    stopPreview();
    throw error;
  }
}

/**
 * Stop 3D preview and cleanup
 */
export function stopPreview() {
  // Stop animation loop
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Cleanup models
  if (loadedModels && loadedModels.length > 0) {
    loadedModels.forEach(model => {
      if (model.parent) {
        model.parent.remove(model);
      }
      if (model.traverse) {
        model.traverse(node => {
          if (node.geometry) {
            node.geometry.dispose();
          }
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach(mat => mat.dispose());
            } else {
              node.material.dispose();
            }
          }
        });
      }
    });
    loadedModels = [];
  }

  // Cleanup scene
  if (scene) {
    while (scene.children.length > 0) {
      const child = scene.children[0];
      scene.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    scene = null;
  }

  // Cleanup renderer
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // Cleanup resize observer
  if (containerElement && containerElement._resizeObserver) {
    containerElement._resizeObserver.disconnect();
    containerElement._resizeObserver = null;
  }

  // Remove canvas
  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
    canvas = null;
  }

  camera = null;
  containerElement = null;
  currentCameraSide = 'center';
  cameraOffset = 0;
}

/**
 * Toggle camera side for left/right parallax preview
 * @param {string} side - 'left', 'right', or 'center'
 */
export function toggleCameraSide(side) {
  if (!camera) {
    console.warn('[scene3d-preview] No active preview to toggle camera');
    return;
  }

  currentCameraSide = side;
  
  switch (side) {
    case 'left':
      cameraOffset = -150;
      break;
    case 'right':
      cameraOffset = 150;
      break;
    case 'center':
    default:
      cameraOffset = 0;
      break;
  }

  console.log(`[scene3d-preview] Camera side set to ${side} (offset: ${cameraOffset})`);
}

/**
 * Check if preview is currently active
 */
export function isPreviewActive() {
  return renderer !== null && scene !== null && camera !== null;
}

export default {
  startPreview,
  stopPreview,
  toggleCameraSide,
  isPreviewActive,
};
