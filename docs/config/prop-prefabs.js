/**
 * Prop Prefab Definitions
 * Defines configuration for interactive props including attachment points and contextual actions
 */

export const PROP_PREFABS = {
  // Glass bottle - first test prop
  bottle_01: {
    prefabId: 'bottle_01',
    displayName: 'Glass Bottle',
    tags: ['prop', 'item', 'container', 'throwable'],

    // Visual transform
    transform: {
      scale: { x: 0.25, y: 0.25 },  // 25% of original size
      rotation: 0
    },

    // Ground contact point (relative to sprite center)
    spriteBase: {
      x: 0,
      y: 3.7  // Bottom of bottle (75% up from bottom = 3.7px at 25% scale)
    },

    // Attachment configuration for holding
    // Point 1 is the grip (where the bone attaches)
    // Point 2 defines the forward direction (like weapon handle)
    attachment: {
      point1: { x: 0, y: 3.2 },    // Grip at 75% up the bottle
      point2: { x: 0, y: -4.6 }    // Orientation point at top (bottle points along bone)
    },

    // Contextual actions that appear on HUD arch when held
    // These are placeholder for future integration
    actions: [
      {
        id: 'use',
        label: 'drink',  // Khymeryyan font label
        icon: null,
        handler: 'useProp'  // Will call window.GAME.propActions.useProp(prop)
      },
      {
        id: 'drop',
        label: 'drop',
        icon: null,
        handler: 'dropProp'
      },
      {
        id: 'throw',
        label: 'throw',
        icon: null,
        handler: 'throwProp'
      }
    ],

    // Physics properties
    physics: {
      mass: 0.5,
      drag: 0.2,
      restitution: 0.3  // Bounce factor
    },

    // Render properties
    render: {
      renderType: 'sprite',
      spriteUrl: './assets/props/bottle_tall.png',  // Path to bottle sprite
      spriteWidth: 37,   // Natural sprite dimensions
      spriteHeight: 100,
      color: 'rgba(139, 69, 19, 0.8)',  // Fallback color for placeholder
      outlineColor: 'rgba(255, 255, 255, 0.3)'
    }
  },

  // Template for future props
  // sword_01: {
  //   prefabId: 'sword_01',
  //   displayName: 'Iron Sword',
  //   tags: ['prop', 'weapon', 'throwable'],
  //   transform: {
  //     scale: { x: 1, y: 1 },
  //     rotation: 0
  //   },
  //   spriteBase: { x: 0, y: 20 },
  //   attachment: {
  //     point1: { x: 0, y: 5 },   // Grip on handle
  //     point2: { x: 0, y: -30 }  // Points to blade tip
  //   },
  //   actions: [
  //     { id: 'equip', label: 'equip', icon: null, handler: 'equipWeapon' },
  //     { id: 'drop', label: 'drop', icon: null, handler: 'dropProp' },
  //     { id: 'throw', label: 'throw', icon: null, handler: 'throwProp' }
  //   ],
  //   physics: {
  //     mass: 2,
  //     drag: 0.15,
  //     restitution: 0.2
  //   },
  //   render: {
  //     renderType: 'sprite',
  //     spriteUrl: './assets/props/sword_01.png'
  //   }
  // }
};

/**
 * Get prop prefab by ID
 * @param {string} prefabId - The prefab identifier
 * @returns {Object|null} The prop prefab or null if not found
 */
export function getPropPrefab(prefabId) {
  return PROP_PREFABS[prefabId] || null;
}

/**
 * Get all prop prefab IDs
 * @returns {Array<string>} Array of prefab IDs
 */
export function getAllPropPrefabIds() {
  return Object.keys(PROP_PREFABS);
}

/**
 * Apply prop configuration to an instance
 * @param {Object} instance - The prop instance
 * @param {string} prefabId - The prefab ID to apply
 * @returns {Object} The configured instance
 */
export function applyPropConfig(instance, prefabId) {
  const prefab = getPropPrefab(prefabId);
  if (!prefab) {
    console.warn(`[PropConfig] Prefab not found: ${prefabId}`);
    return instance;
  }

  // Apply transform
  if (prefab.transform) {
    if (prefab.transform.scale) {
      instance.scale = { ...prefab.transform.scale };
    }
    if (prefab.transform.rotation !== undefined) {
      instance.rotationDeg = prefab.transform.rotation;
    }
  }

  // Store configuration on instance for later use
  instance.propConfig = {
    prefabId: prefab.prefabId,
    displayName: prefab.displayName,
    spriteBase: prefab.spriteBase ? { ...prefab.spriteBase } : { x: 0, y: 0 },
    attachment: prefab.attachment ? {
      point1: { ...prefab.attachment.point1 },
      point2: { ...prefab.attachment.point2 }
    } : null,
    actions: prefab.actions ? [...prefab.actions] : [],
    physics: prefab.physics ? { ...prefab.physics } : {},
    render: prefab.render ? { ...prefab.render } : {}
  };

  // Apply physics properties
  if (prefab.physics && instance.physics) {
    if (prefab.physics.mass !== undefined) instance.physics.mass = prefab.physics.mass;
    if (prefab.physics.drag !== undefined) instance.physics.drag = prefab.physics.drag;
    if (prefab.physics.restitution !== undefined) instance.physics.restitution = prefab.physics.restitution;
  }

  return instance;
}
