/**
 * SpriteHolster Manager
 * Manages 3D visual placeholders (holsters) for props and NPCs that can be interacted with
 * to spawn/activate their corresponding 2D gameplay entities.
 */

export class SpriteHolsterManager {
  constructor(scene, coordinateTransform, THREE) {
    // THREE is passed from renderer
    this.THREE = THREE;
    if (!this.THREE) {
      console.error('[SpriteHolsterManager] THREE not provided');
      throw new Error('THREE.js is required for SpriteHolsterManager');
    }

    this.scene = scene;
    this.coordinateTransform = coordinateTransform;
    this.holsters = new Map(); // holsterId -> holster data
    this.holsterGroup = new this.THREE.Group();
    this.holsterGroup.name = 'SpriteHolsters';
    this.scene.add(this.holsterGroup);
  }

  /**
   * Create a holster from gameplaymap entity data
   * @param {Object} entity - Entity from gameplaymap with type "spriteholster"
   */
  addHolster(entity) {
    if (!entity.meta) {
      console.warn('SpriteHolster entity missing meta:', entity);
      return;
    }

    const { holsterType, renderMode, linkedEntityId } = entity.meta;

    if (!holsterType || !linkedEntityId) {
      console.warn('SpriteHolster missing required meta fields:', entity);
      return;
    }

    // Convert 2D gameplay coordinates to 3D world position
    const pos3d = this.coordinateTransform.gameplayTo3D(entity.x, entity.y);

    let holsterObject;

    if (renderMode === 'billboard') {
      holsterObject = this._createBillboard(entity);
    } else {
      // Default to debug symbols (Case B)
      holsterObject = this._createDebugSymbols(entity);
    }

    if (holsterObject) {
      holsterObject.position.set(pos3d.x, pos3d.y, pos3d.z);

      // Apply Y offset if specified
      if (entity.meta.yOffset !== undefined) {
        holsterObject.position.y += entity.meta.yOffset;
      }

      this.holsterGroup.add(holsterObject);

      // Store holster data for interaction handling
      this.holsters.set(entity.id, {
        id: entity.id,
        type: holsterType,
        linkedEntityId,
        object3d: holsterObject,
        position2d: { x: entity.x, y: entity.y },
        position3d: pos3d,
        interactionRadius: entity.meta.interactionRadius || 80,
        interactionPrompt: entity.meta.interactionPrompt || 'Interact',
        entity: entity
      });

      console.log(`Created ${holsterType} holster:`, entity.id, 'linked to:', linkedEntityId);
    }
  }

  /**
   * Create debug symbols visualization (Case B - for props)
   */
  _createDebugSymbols(entity) {
    const group = new this.THREE.Group();
    group.name = `holster_${entity.id}`;

    const debugSymbols = entity.meta.debugSymbols || [
      { type: 'sphere', offset: [0, 10, 0], color: '#ff6600', size: 8 },
      { type: 'box', offset: [0, 0, 0], color: '#ffaa00', size: 6 }
    ];

    debugSymbols.forEach((symbolDef, index) => {
      let geometry, material, mesh;

      const color = new this.THREE.Color(symbolDef.color || '#ffffff');
      const size = symbolDef.size || 5;

      switch (symbolDef.type) {
        case 'sphere':
          geometry = new this.THREE.SphereGeometry(size, 16, 16);
          material = new this.THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            depthTest: true
          });
          mesh = new this.THREE.Mesh(geometry, material);
          break;

        case 'box':
          geometry = new this.THREE.BoxGeometry(size, size, size);
          material = new this.THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            depthTest: true
          });
          mesh = new this.THREE.Mesh(geometry, material);
          break;

        case 'cone':
          geometry = new this.THREE.ConeGeometry(size, size * 2, 8);
          material = new this.THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.7,
            depthTest: true
          });
          mesh = new this.THREE.Mesh(geometry, material);
          break;

        default:
          console.warn('Unknown debug symbol type:', symbolDef.type);
          return;
      }

      if (mesh) {
        // Apply offset
        const offset = symbolDef.offset || [0, 0, 0];
        mesh.position.set(offset[0], offset[1], offset[2]);
        mesh.name = `symbol_${index}`;
        group.add(mesh);

        // Add wireframe outline
        const wireframe = new this.THREE.LineSegments(
          new this.THREE.EdgesGeometry(geometry),
          new this.THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
        );
        wireframe.position.copy(mesh.position);
        group.add(wireframe);
      }
    });

    return group;
  }

  /**
   * Create billboard sprite (Case A - for NPCs)
   * TODO: Implement when needed
   */
  _createBillboard(entity) {
    console.log('Billboard rendering not yet implemented for:', entity.id);

    // Placeholder: create a simple sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText('NPC', 20, 64);

    const texture = new this.THREE.CanvasTexture(canvas);
    const material = new this.THREE.SpriteMaterial({ map: texture });
    const sprite = new this.THREE.Sprite(material);
    sprite.scale.set(32, 64, 1);

    return sprite;
  }

  /**
   * Check if player is near any holster and return interaction data
   */
  checkProximity(playerX, playerY, interactionRange = null) {
    const nearby = [];

    for (const [id, holster] of this.holsters) {
      const dx = playerX - holster.position2d.x;
      const dy = playerY - holster.position2d.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const range = interactionRange !== null ? interactionRange : holster.interactionRadius;

      if (distance <= range) {
        nearby.push({
          ...holster,
          distance
        });
      }
    }

    // Sort by distance, closest first
    nearby.sort((a, b) => a.distance - b.distance);
    return nearby;
  }

  /**
   * Remove a holster (when player picks up the item)
   */
  removeHolster(holsterId) {
    const holster = this.holsters.get(holsterId);
    if (holster) {
      this.holsterGroup.remove(holster.object3d);

      // Dispose of geometries and materials
      holster.object3d.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });

      this.holsters.delete(holsterId);
      console.log('Removed holster:', holsterId);
      return true;
    }
    return false;
  }

  /**
   * Get holster by ID
   */
  getHolster(holsterId) {
    return this.holsters.get(holsterId);
  }

  /**
   * Get all holsters
   */
  getAllHolsters() {
    return Array.from(this.holsters.values());
  }

  /**
   * Show/hide all holsters (for debug panel)
   */
  setVisible(visible) {
    this.holsterGroup.visible = visible;
  }

  /**
   * Cleanup
   */
  dispose() {
    for (const holster of this.holsters.values()) {
      this.holsterGroup.remove(holster.object3d);
    }
    this.holsters.clear();
    this.scene.remove(this.holsterGroup);
  }
}
