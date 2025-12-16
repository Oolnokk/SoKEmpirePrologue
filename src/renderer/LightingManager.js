/**
 * LightingManager handles scene lighting based on time of day.
 * It manages ambient and directional lights, applies color tints,
 * and updates the scene background.
 * 
 * Usage:
 *   const lightingManager = new LightingManager(renderer, timeOfDay);
 *   lightingManager.init();
 */

/**
 * LightingManager class manages scene lighting
 */
export class LightingManager {
  /**
   * @param {Object} renderer - Three.js renderer wrapper
   * @param {Object} timeOfDay - TimeOfDay instance
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.enabled=true] - Whether lighting updates are enabled
   */
  constructor(renderer, timeOfDay, options = {}) {
    this.renderer = renderer;
    this.timeOfDay = timeOfDay;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    // Light references
    this.ambientLight = null;
    this.directionalLight = null;
    this.originalClearColor = null;
    
    // Track if we've initialized
    this.initialized = false;
    
    // Bind event handlers
    this.handleTimeChange = this.handleTimeChange.bind(this);
  }

  /**
   * Initialize the lighting manager
   * Creates lights and sets up event listeners
   */
  init() {
    if (this.initialized) {
      console.warn('[LightingManager] Already initialized');
      return;
    }

    if (!this.renderer || !this.renderer.THREE || !this.renderer.scene) {
      console.warn('[LightingManager] Renderer not ready or Three.js not available');
      return;
    }

    try {
      // Create ambient light
      this.ambientLight = new this.renderer.THREE.AmbientLight(0xffffff, 0.8);
      this.renderer.add(this.ambientLight);

      // Create directional light
      this.directionalLight = new this.renderer.THREE.DirectionalLight(0xffffff, 1.0);
      this.directionalLight.position.set(50, 100, 50);
      this.renderer.add(this.directionalLight);

      // Store original clear color
      if (this.renderer.scene.background) {
        this.originalClearColor = this.renderer.scene.background.getHex();
      }

      // Listen to time changes
      this.timeOfDay.on('change', this.handleTimeChange);

      // Apply initial lighting
      this.updateLighting(this.timeOfDay.getLightingProperties());

      this.initialized = true;
      console.log('[LightingManager] Initialized successfully');
    } catch (error) {
      console.error('[LightingManager] Failed to initialize:', error);
    }
  }

  /**
   * Handle time of day change events
   * @param {Object} data - Time change data
   */
  handleTimeChange(data) {
    if (!this.enabled || !this.initialized) return;
    
    this.updateLighting(data.properties);
  }

  /**
   * Update scene lighting based on properties
   * @param {Object} properties - Lighting properties
   */
  updateLighting(properties) {
    if (!this.initialized || !this.enabled) return;

    try {
      // Update ambient light
      if (this.ambientLight) {
        this.ambientLight.color.setHex(properties.ambientColor);
        this.ambientLight.intensity = properties.ambientIntensity;
      }

      // Update directional light
      if (this.directionalLight) {
        this.directionalLight.color.setHex(properties.directionalColor);
        this.directionalLight.intensity = properties.directionalIntensity;
      }

      // Update scene background
      if (this.renderer.scene && this.renderer.scene.background) {
        this.renderer.scene.background.setHex(properties.backgroundColor);
      }

      // Update fog if present
      if (this.renderer.scene && this.renderer.scene.fog) {
        this.renderer.scene.fog.color.setHex(properties.fogColor);
      }
    } catch (error) {
      console.error('[LightingManager] Failed to update lighting:', error);
    }
  }

  /**
   * Apply lighting to a specific object
   * @param {THREE.Object3D} object - Object to apply lighting to
   */
  applyToObject(object) {
    if (!this.initialized || !this.enabled) return;
    if (!object || !object.traverse) return;

    const properties = this.timeOfDay.getLightingProperties();

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        // For MeshStandardMaterial or MeshPhongMaterial, materials respond to lights automatically
        // For MeshBasicMaterial (unlit), we can apply color tinting
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material) => {
          if (material.isMeshBasicMaterial) {
            // Store original color if not already stored
            if (!material.userData.originalColor) {
              material.userData.originalColor = material.color.getHex();
            }
            
            // Apply a subtle tint based on ambient color
            // This creates the impression of lighting even on unlit materials
            const originalColor = material.userData.originalColor;
            const r1 = (originalColor >> 16) & 0xff;
            const g1 = (originalColor >> 8) & 0xff;
            const b1 = originalColor & 0xff;
            
            const r2 = (properties.ambientColor >> 16) & 0xff;
            const g2 = (properties.ambientColor >> 8) & 0xff;
            const b2 = properties.ambientColor & 0xff;
            
            // Mix original color with ambient color (50/50)
            const mixFactor = 0.5 * properties.ambientIntensity;
            const r = Math.round(r1 * (1 - mixFactor) + r2 * mixFactor);
            const g = Math.round(g1 * (1 - mixFactor) + g2 * mixFactor);
            const b = Math.round(b1 * (1 - mixFactor) + b2 * mixFactor);
            
            material.color.setHex((r << 16) | (g << 8) | b);
          }
        });
      }
    });
  }

  /**
   * Set directional light position
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} z - Z position
   */
  setDirectionalLightPosition(x, y, z) {
    if (this.directionalLight) {
      this.directionalLight.position.set(x, y, z);
    }
  }

  /**
   * Enable or disable lighting updates
   * @param {boolean} enabled - Whether to enable lighting updates
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    
    if (enabled && this.initialized) {
      // Apply current lighting immediately
      this.updateLighting(this.timeOfDay.getLightingProperties());
    }
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (!this.initialized) return;

    try {
      // Remove event listeners
      this.timeOfDay.off('change', this.handleTimeChange);

      // Remove lights from scene
      if (this.ambientLight) {
        this.renderer.remove(this.ambientLight);
        this.ambientLight = null;
      }

      if (this.directionalLight) {
        this.renderer.remove(this.directionalLight);
        this.directionalLight = null;
      }

      // Restore original clear color
      if (this.originalClearColor !== null && this.renderer.scene && this.renderer.scene.background) {
        this.renderer.scene.background.setHex(this.originalClearColor);
      }

      this.initialized = false;
      console.log('[LightingManager] Disposed successfully');
    } catch (error) {
      console.error('[LightingManager] Error during disposal:', error);
    }
  }

  /**
   * Get current lighting state
   * @returns {Object} Current lighting state
   */
  getState() {
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      hasAmbientLight: !!this.ambientLight,
      hasDirectionalLight: !!this.directionalLight,
      properties: this.initialized ? this.timeOfDay.getLightingProperties() : null,
    };
  }
}
