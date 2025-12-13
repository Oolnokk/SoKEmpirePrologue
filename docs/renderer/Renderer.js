/**
 * Lightweight, reusable renderer module that wraps Three.js when available
 * and falls back to safe no-op implementation in non-rendering environments.
 * 
 * Usage examples can be found in:
 * - docs/3Dmapbuilder.html
 * - docs/gameplay-map-editor.html
 * - docs/renderer-README.md
 */

/**
 * Check if Three.js rendering is supported in the current environment
 * @returns {boolean} True if THREE is available, false otherwise
 */
export function isSupported() {
  return typeof globalThis !== 'undefined' && 
         typeof globalThis.THREE !== 'undefined';
}

/**
 * Create a new renderer instance
 * @param {Object} options - Configuration options
 * @param {HTMLElement|null} options.container - Container element for the canvas (can be null)
 * @param {number} [options.width=800] - Initial width
 * @param {number} [options.height=600] - Initial height
 * @param {number} [options.pixelRatio] - Pixel ratio (defaults to window.devicePixelRatio or 1)
 * @param {number} [options.clearColor=0x000000] - Background clear color
 * @returns {Renderer} A new Renderer instance
 */
export function createRenderer(options = {}) {
  return new Renderer(options);
}

/**
 * Renderer class that wraps Three.js functionality
 */
export class Renderer {
  constructor(options = {}) {
    this.container = options.container || null;
    this.width = options.width || 800;
    this.height = options.height || 600;
    this.pixelRatio = options.pixelRatio || (typeof globalThis !== 'undefined' && globalThis.devicePixelRatio) || 1;
    this.clearColor = options.clearColor !== undefined ? options.clearColor : 0x000000;
    
    // Three.js instances (null if not supported)
    this.THREE = isSupported() ? globalThis.THREE : null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationId = null;
    
    // Event handlers
    this.eventHandlers = {
      ready: [],
      error: [],
      frame: []
    };
    
    // Flags
    this.initialized = false;
    this.running = false;
  }

  /**
   * Initialize the renderer and attach canvas to container when provided
   * @returns {Promise<void>} Resolves when initialization is complete
   */
  async init() {
    if (this.initialized) {
      console.warn('Renderer already initialized');
      return;
    }

    if (!this.THREE) {
      console.warn('Three.js not available - renderer operating in no-op mode');
      this.initialized = true;
      this.emit('ready', { supported: false });
      return;
    }

    try {
      // Create scene
      this.scene = new this.THREE.Scene();
      this.scene.background = new this.THREE.Color(this.clearColor);

      // Create camera (default perspective)
      this.camera = new this.THREE.PerspectiveCamera(
        50, // fov
        this.width / this.height,
        0.1,
        1000
      );
      this.camera.position.set(0, 5, 10);
      this.camera.lookAt(0, 0, 0);

      // Create renderer
      this.renderer = new this.THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: false 
      });
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height);

      // Attach to container if provided
      if (this.container && this.container.appendChild) {
        this.container.appendChild(this.renderer.domElement);
      }

      this.initialized = true;
      this.emit('ready', { supported: true, renderer: this.renderer });
    } catch (error) {
      console.error('Failed to initialize renderer:', error);
      this.emit('error', { phase: 'init', error });
      throw error;
    }
  }

  /**
   * Resize the renderer and camera
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (!this.initialized) {
      console.warn('Cannot resize: renderer not initialized');
      return;
    }

    if (!this.THREE || !this.renderer || !this.camera) {
      return; // No-op mode
    }

    this.width = width;
    this.height = height;

    try {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    } catch (error) {
      console.error('Failed to resize renderer:', error);
      this.emit('error', { phase: 'resize', error });
    }
  }

  /**
   * Set camera parameters
   * @param {Object} params - Camera parameters
   * @param {Object} [params.position] - Camera position {x, y, z}
   * @param {Object} [params.rotation] - Camera rotation {x, y, z}
   * @param {Object} [params.lookAt] - Point to look at {x, y, z}
   * @param {number} [params.fov] - Field of view
   * @param {THREE.Camera} [params.camera] - Use a specific THREE.Camera instance
   */
  setCameraParams(params = {}) {
    if (!this.initialized) {
      console.warn('Cannot set camera params: renderer not initialized');
      return;
    }

    if (!this.THREE || !this.camera) {
      return; // No-op mode
    }

    try {
      // If a THREE.Camera is provided, use it
      if (params.camera && params.camera.isCamera) {
        this.camera = params.camera;
        return;
      }

      // Set position
      if (params.position) {
        const { x = 0, y = 0, z = 0 } = params.position;
        this.camera.position.set(x, y, z);
      }

      // Set rotation
      if (params.rotation) {
        const { x = 0, y = 0, z = 0 } = params.rotation;
        this.camera.rotation.set(x, y, z);
      }

      // Look at point
      if (params.lookAt) {
        const { x = 0, y = 0, z = 0 } = params.lookAt;
        this.camera.lookAt(x, y, z);
      }

      // Set FOV (only for PerspectiveCamera)
      if (params.fov !== undefined && this.camera.isPerspectiveCamera) {
        this.camera.fov = params.fov;
        this.camera.updateProjectionMatrix();
      }
    } catch (error) {
      console.error('Failed to set camera params:', error);
      this.emit('error', { phase: 'setCameraParams', error });
    }
  }

  /**
   * Load a GLTF model
   * @param {string} url - URL to the GLTF/GLB file
   * @returns {Promise<Object|null>} Resolves to the loaded scene/object, or null if THREE not available
   */
  async loadGLTF(url) {
    if (!this.initialized) {
      console.warn('Cannot load GLTF: renderer not initialized');
      return null;
    }

    if (!this.THREE) {
      console.warn('Cannot load GLTF: Three.js not available');
      return null;
    }

    try {
      // Get GLTFLoader constructor using tolerant pattern
      const LoaderCtor = (this.THREE && this.THREE.GLTFLoader) || 
                         (globalThis.getThreeGLTFLoaderCtor && globalThis.getThreeGLTFLoaderCtor());
      
      if (!LoaderCtor) {
        console.error('[Renderer] ✗ GLTFLoader not available - cannot load glTF model');
        console.warn('[Renderer] Ensure Three.js addons are loaded via ensureThreeGlobals');
        console.warn('[Renderer] - THREE.GLTFLoader:', this.THREE && this.THREE.GLTFLoader ? 'available' : 'not available');
        console.warn('[Renderer] - getThreeGLTFLoaderCtor:', globalThis.getThreeGLTFLoaderCtor ? 'available' : 'not available');
        return null;
      }

      console.log(`[Renderer] Loading GLTF from: ${url}`);
      console.log(`[Renderer] - Using LoaderCtor:`, LoaderCtor.name || 'GLTFLoader');
      
      // Check if BufferGeometryUtils is available (optional but helpful for debugging)
      const bufferGeomUtils = (this.THREE && this.THREE.BufferGeometryUtils) ||
                              (globalThis.getThreeBufferGeometryUtils && globalThis.getThreeBufferGeometryUtils());
      console.log(`[Renderer] - BufferGeometryUtils:`, bufferGeomUtils ? 'available' : 'not available (may be needed for some models)');

      const loader = new LoaderCtor();
      
      return new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => {
            // Enhanced diagnostics for loaded GLTF
            const scene = gltf.scene;
            console.log(`[Renderer] ✓ GLTF loaded successfully: ${url}`);
            console.log(`[Renderer]   - Scene children: ${scene.children.length}`);
            console.log(`[Renderer]   - Scene bounds:`, scene);
            
            // Count meshes and geometry types
            let meshCount = 0;
            let geometryTypes = new Set();
            scene.traverse((child) => {
              if (child.isMesh) {
                meshCount++;
                if (child.geometry) {
                  const geomType = child.geometry.type || 'Unknown';
                  geometryTypes.add(geomType);
                }
              }
            });
            
            console.log(`[Renderer]   - Total meshes: ${meshCount}`);
            console.log(`[Renderer]   - Geometry types: ${Array.from(geometryTypes).join(', ')}`);
            
            if (meshCount === 0) {
              console.warn(`[Renderer] ⚠ GLTF loaded but contains no meshes: ${url}`);
            }
            
            resolve(gltf.scene);
          },
          (progress) => {
            // Optional: emit progress events
            if (progress.lengthComputable) {
              const percent = (progress.loaded / progress.total) * 100;
              this.emit('frame', { type: 'loadProgress', percent, url });
            }
          },
          (error) => {
            console.error('[Renderer] ✗ Failed to load GLTF:', url, error);
            this.emit('error', { phase: 'loadGLTF', error, url });
            reject(error);
          }
        );
      });
    } catch (error) {
      console.error('[Renderer] ✗ Exception during GLTF load:', url, error);
      this.emit('error', { phase: 'loadGLTF', error, url });
      return null;
    }
  }

  /**
   * Add an object to the scene
   * @param {THREE.Object3D|*} object - The object to add (or adapter handle)
   */
  add(object) {
    if (!this.initialized) {
      console.warn('Cannot add object: renderer not initialized');
      return;
    }

    if (!this.THREE || !this.scene) {
      return; // No-op mode
    }

    try {
      if (object && object.isObject3D) {
        const childCountBefore = this.scene.children.length;
        this.scene.add(object);
        const childCountAfter = this.scene.children.length;
        
        // Log only if something changed (useful for debugging)
        if (childCountAfter !== childCountBefore) {
          console.log(`[Renderer] Added object to scene: ${childCountBefore} -> ${childCountAfter} children`);
        }
      } else {
        console.warn('Cannot add object: not a THREE.Object3D', object);
      }
    } catch (error) {
      console.error('Failed to add object:', error);
      this.emit('error', { phase: 'add', error });
    }
  }

  /**
   * Remove an object from the scene
   * @param {THREE.Object3D|*} object - The object to remove (or adapter handle)
   */
  remove(object) {
    if (!this.initialized) {
      console.warn('Cannot remove object: renderer not initialized');
      return;
    }

    if (!this.THREE || !this.scene) {
      return; // No-op mode
    }

    try {
      if (object && object.isObject3D) {
        this.scene.remove(object);
      } else {
        console.warn('Cannot remove object: not a THREE.Object3D', object);
      }
    } catch (error) {
      console.error('Failed to remove object:', error);
      this.emit('error', { phase: 'remove', error });
    }
  }

  /**
   * Start the animation loop
   */
  start() {
    if (!this.initialized) {
      console.warn('Cannot start: renderer not initialized');
      return;
    }

    if (this.running) {
      console.warn('Renderer already running');
      return;
    }

    if (!this.THREE || !this.renderer || !this.scene || !this.camera) {
      console.warn('Cannot start: Three.js not available');
      return;
    }

    this.running = true;
    this.animate();
  }

  /**
   * Animation loop
   * @private
   */
  animate() {
    if (!this.running) return;

    if (typeof globalThis !== 'undefined' && globalThis.requestAnimationFrame) {
      this.animationId = globalThis.requestAnimationFrame(() => this.animate());
    }

    try {
      // Emit frame event (allows custom render callbacks)
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.emit('frame', { renderer: this, time: now });

      // Render the scene
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (error) {
      console.error('Error in animation loop:', error);
      this.emit('error', { phase: 'animate', error });
    }
  }

  /**
   * Stop the animation loop
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.animationId !== null && typeof globalThis !== 'undefined' && globalThis.cancelAnimationFrame) {
      globalThis.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    this.stop();

    if (!this.THREE) {
      this.initialized = false;
      return;
    }

    try {
      // Remove canvas from container
      if (this.renderer && this.renderer.domElement && this.container) {
        if (this.container.contains(this.renderer.domElement)) {
          this.container.removeChild(this.renderer.domElement);
        }
      }

      // Dispose renderer
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }

      // Clear scene
      if (this.scene) {
        while (this.scene.children.length > 0) {
          const child = this.scene.children[0];
          this.scene.remove(child);
          
          // Dispose geometry and materials
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
        this.scene = null;
      }

      this.camera = null;
    } catch (error) {
      console.error('Error during dispose:', error);
      this.emit('error', { phase: 'dispose', error });
    }

    this.initialized = false;
    this.eventHandlers = { ready: [], error: [], frame: [] };
  }

  /**
   * Register an event handler
   * @param {string} event - Event name ('ready', 'error', 'frame')
   * @param {Function} callback - Event handler function
   */
  on(event, callback) {
    if (!this.eventHandlers[event]) {
      console.warn(`Unknown event type: ${event}`);
      return;
    }

    if (typeof callback !== 'function') {
      console.warn('Event callback must be a function');
      return;
    }

    this.eventHandlers[event].push(callback);
  }

  /**
   * Unregister an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event handler function to remove
   */
  off(event, callback) {
    if (!this.eventHandlers[event]) {
      return;
    }

    const index = this.eventHandlers[event].indexOf(callback);
    if (index > -1) {
      this.eventHandlers[event].splice(index, 1);
    }
  }

  /**
   * Emit an event
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.eventHandlers[event]) {
      return;
    }

    this.eventHandlers[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }
}
