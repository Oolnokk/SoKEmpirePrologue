/**
 * EmissiveManager handles emissive properties for structures and decorations.
 * It loads emissive configuration, applies emissive materials, and adjusts
 * emissive intensity based on time of day.
 * 
 * Usage:
 *   const emissiveManager = new EmissiveManager(renderer, timeOfDay);
 *   await emissiveManager.loadConfig('/path/to/emissive-config.json');
 *   emissiveManager.applyEmissiveProperties(object, 'torch');
 */

/**
 * Parse color from various formats to hex number
 * @param {string|number} color - Color in hex string or number format
 * @returns {number} Color as hex number
 */
function parseColor(color) {
  if (typeof color === 'number') {
    return color;
  }
  
  if (typeof color === 'string') {
    // Remove # if present
    const cleanColor = color.replace('#', '');
    return parseInt(cleanColor, 16);
  }
  
  return 0xffffff; // Default white
}

/**
 * EmissiveManager class manages emissive properties
 */
export class EmissiveManager {
  /**
   * @param {Object} renderer - Three.js renderer wrapper
   * @param {Object} timeOfDay - TimeOfDay instance
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.enabled=true] - Whether emissive updates are enabled
   */
  constructor(renderer, timeOfDay, options = {}) {
    this.renderer = renderer;
    this.timeOfDay = timeOfDay;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    // Configuration storage
    this.config = {
      structures: {},
      decorations: {},
    };
    
    // Track emissive objects
    this.emissiveObjects = new Map();
    
    // Bind event handlers
    this.handleTimeChange = this.handleTimeChange.bind(this);
  }

  /**
   * Initialize the emissive manager
   */
  init() {
    if (!this.renderer || !this.renderer.THREE) {
      console.warn('[EmissiveManager] Renderer not ready or Three.js not available');
      return;
    }

    // Listen to time changes
    this.timeOfDay.on('change', this.handleTimeChange);
    
    console.log('[EmissiveManager] Initialized successfully');
  }

  /**
   * Load emissive configuration from URL
   * @param {string} url - URL to configuration JSON
   * @returns {Promise<void>}
   */
  async loadConfig(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }
      
      const config = await response.json();
      this.config = {
        structures: config.structures || {},
        decorations: config.decorations || {},
      };
      
      console.log('[EmissiveManager] Config loaded successfully:', this.config);
    } catch (error) {
      console.error('[EmissiveManager] Failed to load config:', error);
    }
  }

  /**
   * Set emissive configuration directly
   * @param {Object} config - Emissive configuration object
   */
  setConfig(config) {
    this.config = {
      structures: config.structures || {},
      decorations: config.decorations || {},
    };
    
    console.log('[EmissiveManager] Config set:', this.config);
  }

  /**
   * Get emissive configuration for an object
   * @param {string} objectId - Object ID (structure or decoration name)
   * @param {string} [type='structures'] - Object type ('structures' or 'decorations')
   * @returns {Object|null} Emissive configuration or null
   */
  getConfig(objectId, type = 'structures') {
    return this.config[type]?.[objectId] || null;
  }

  /**
   * Apply emissive properties to an object
   * @param {THREE.Object3D} object - Object to apply emissive properties to
   * @param {string} objectId - Object ID to look up configuration
   * @param {string} [type='structures'] - Object type ('structures' or 'decorations')
   */
  applyEmissiveProperties(object, objectId, type = 'structures') {
    if (!this.enabled || !object) return;
    
    const config = this.getConfig(objectId, type);
    if (!config || !config.emissive) return;

    const emissiveColor = parseColor(config.emissiveColor || '#ffffff');
    const emissiveIntensity = config.emissiveIntensity !== undefined ? config.emissiveIntensity : 1.0;
    const emissiveTextures = config.emissiveTextures || [];
    // Note: emissiveSprites will be used in future sprite implementation
    // const emissiveSprites = config.emissiveSprites || [];

    // Get current time of day multiplier
    const properties = this.timeOfDay.getLightingProperties();
    const timeMultiplier = properties.emissiveMultiplier || 1.0;
    const finalIntensity = emissiveIntensity * timeMultiplier;

    // Track this object for updates
    this.emissiveObjects.set(object.uuid, {
      object,
      objectId,
      type,
      baseIntensity: emissiveIntensity,
    });

    // Apply to 3D meshes
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material) => {
          // Check if this material should be emissive
          let shouldBeEmissive = emissiveTextures.length === 0; // Default: all textures if not specified
          
          if (emissiveTextures.length > 0) {
            // Check if material name or texture name matches
            const materialName = material.name || '';
            const textureName = material.map?.name || '';
            shouldBeEmissive = emissiveTextures.some(name => 
              materialName.includes(name) || textureName.includes(name)
            );
          }
          
          if (shouldBeEmissive) {
            // Store original properties
            if (!material.userData.emissiveOriginal) {
              material.userData.emissiveOriginal = {
                emissive: material.emissive ? material.emissive.getHex() : 0x000000,
                emissiveIntensity: material.emissiveIntensity || 0,
              };
            }
            
            // Apply emissive properties
            if (material.emissive) {
              material.emissive.setHex(emissiveColor);
            }
            if (material.emissiveIntensity !== undefined) {
              material.emissiveIntensity = finalIntensity;
            }
            
            // For MeshBasicMaterial, increase brightness
            if (material.isMeshBasicMaterial) {
              if (!material.userData.originalColor) {
                material.userData.originalColor = material.color.getHex();
              }
              
              // Brighten the material to simulate emission
              const r = Math.min(255, ((emissiveColor >> 16) & 0xff) * finalIntensity);
              const g = Math.min(255, ((emissiveColor >> 8) & 0xff) * finalIntensity);
              const b = Math.min(255, (emissiveColor & 0xff) * finalIntensity);
              
              material.color.setRGB(r / 255, g / 255, b / 255);
            }
          }
        });
      }
    });

    console.log(`[EmissiveManager] Applied emissive properties to ${objectId}`);
  }

  /**
   * Handle time of day change events
   * @param {Object} data - Time change data
   */
  handleTimeChange(data) {
    if (!this.enabled) return;
    
    const timeMultiplier = data.properties.emissiveMultiplier || 1.0;
    
    // Update all tracked emissive objects
    this.emissiveObjects.forEach((tracked) => {
      const finalIntensity = tracked.baseIntensity * timeMultiplier;
      
      tracked.object.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          
          materials.forEach((material) => {
            if (material.userData.emissiveOriginal) {
              // Update emissive intensity
              if (material.emissiveIntensity !== undefined) {
                material.emissiveIntensity = finalIntensity;
              }
              
              // Update brightness for MeshBasicMaterial
              if (material.isMeshBasicMaterial && material.emissive) {
                const emissiveColor = material.emissive.getHex();
                const r = Math.min(255, ((emissiveColor >> 16) & 0xff) * finalIntensity);
                const g = Math.min(255, ((emissiveColor >> 8) & 0xff) * finalIntensity);
                const b = Math.min(255, (emissiveColor & 0xff) * finalIntensity);
                
                material.color.setRGB(r / 255, g / 255, b / 255);
              }
            }
          });
        }
      });
    });
  }

  /**
   * Remove emissive properties from an object
   * @param {THREE.Object3D} object - Object to remove emissive properties from
   */
  removeEmissiveProperties(object) {
    if (!object) return;
    
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material) => {
          if (material.userData.emissiveOriginal) {
            // Restore original properties
            if (material.emissive) {
              material.emissive.setHex(material.userData.emissiveOriginal.emissive);
            }
            if (material.emissiveIntensity !== undefined) {
              material.emissiveIntensity = material.userData.emissiveOriginal.emissiveIntensity;
            }
            
            // Restore original color for MeshBasicMaterial
            if (material.isMeshBasicMaterial && material.userData.originalColor) {
              material.color.setHex(material.userData.originalColor);
            }
            
            delete material.userData.emissiveOriginal;
            delete material.userData.originalColor;
          }
        });
      }
    });
    
    // Remove from tracking
    this.emissiveObjects.delete(object.uuid);
  }

  /**
   * Enable or disable emissive updates
   * @param {boolean} enabled - Whether to enable emissive updates
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    // Remove event listeners
    this.timeOfDay.off('change', this.handleTimeChange);
    
    // Clear tracked objects
    this.emissiveObjects.clear();
    
    console.log('[EmissiveManager] Disposed successfully');
  }

  /**
   * Get current state
   * @returns {Object} Current state
   */
  getState() {
    return {
      enabled: this.enabled,
      trackedObjects: this.emissiveObjects.size,
      config: this.config,
    };
  }
}
