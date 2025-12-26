/**
 * render3d.js - Three.js rendering for game entities
 *
 * This module translates 2D game logic to 3D rendering using Three.js.
 * Game logic continues to run in 2D (pixel coordinates), but entities
 * are rendered as 3D objects using coordinate transformation.
 */

import { transform2dTo3d } from './coordinate-transform.js';

/**
 * Entity3D - Represents a 3D mesh for a game entity (fighter)
 */
class Entity3D {
  constructor(id, scene, THREE) {
    this.id = id;
    this.scene = scene;
    this.THREE = THREE;

    // Create simple 3D representation (box for now)
    // In future: could be full skeletal mesh
    const geometry = new THREE.BoxGeometry(30, 60, 20);
    const material = new THREE.MeshPhongMaterial({
      color: id === 'player' ? 0x4488ff : 0xff4444,
      emissive: id === 'player' ? 0x224488 : 0x882222,
      shininess: 30
    });
    this.mesh = new THREE.Mesh(geometry, material);

    // Add label (for debugging)
    this.createLabel(id);

    // Add to scene
    this.scene.add(this.mesh);
  }

  createLabel(text) {
    // Create a small sphere above the entity as a label marker
    const labelGeometry = new this.THREE.SphereGeometry(5, 8, 8);
    const labelMaterial = new this.THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.labelMarker = new this.THREE.Mesh(labelGeometry, labelMaterial);
    this.labelMarker.position.y = 40;
    this.mesh.add(this.labelMarker);
  }

  /**
   * Update entity position from 2D game state
   */
  update(fighter) {
    if (!fighter || !fighter.pos) return;

    // Transform 2D position to 3D
    const pos3d = transform2dTo3d(fighter.pos);
    this.mesh.position.set(pos3d.x, pos3d.y + 30, pos3d.z); // +30 to lift above ground

    // Apply rotation based on facing direction
    if (typeof fighter.facingRad === 'number') {
      // In 2D: 0 = up, rotate clockwise
      // In 3D: rotate around Y axis
      // Add Math.PI to face opposite direction (character facing)
      this.mesh.rotation.y = fighter.facingRad + Math.PI;
    }

    // Handle death alpha (fade out)
    if (fighter.isDead) {
      const alpha = 1 - (fighter.deadTime || 0) / 3.5; // Fade over 3.5s
      this.mesh.material.opacity = Math.max(0, alpha);
      this.mesh.material.transparent = true;
    } else {
      this.mesh.material.opacity = 1;
      this.mesh.material.transparent = false;
    }
  }

  /**
   * Remove entity from scene
   */
  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
    }
  }
}

/**
 * Renderer3D - Main 3D rendering manager
 */
export class Renderer3D {
  constructor(renderer) {
    this.renderer = renderer;
    this.THREE = renderer.THREE;
    this.scene = renderer.scene;
    this.entities = new Map(); // Map<fighterId, Entity3D>

    // Add ground plane for reference
    this.addGroundPlane();

    // Add lights
    this.addLights();
  }

  addGroundPlane() {
    const geometry = new this.THREE.PlaneGeometry(2000, 1000);
    const material = new this.THREE.MeshStandardMaterial({
      color: 0x336633,
      roughness: 0.8,
      metalness: 0.2
    });
    this.groundPlane = new this.THREE.Mesh(geometry, material);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0;
    this.scene.add(this.groundPlane);
  }

  addLights() {
    // Ambient light
    const ambient = new this.THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Directional light (sun)
    const directional = new this.THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(100, 200, 100);
    this.scene.add(directional);
  }

  /**
   * Update all entities from game state
   */
  update() {
    const fighters = window.GAME?.FIGHTERS;
    if (!fighters) return;

    // Track which entities exist in current frame
    const activeIds = new Set();

    // Update or create entities
    for (const [fighterId, fighter] of Object.entries(fighters)) {
      if (!fighter) continue;

      activeIds.add(fighterId);

      // Create entity if it doesn't exist
      if (!this.entities.has(fighterId)) {
        this.entities.set(fighterId, new Entity3D(fighterId, this.scene, this.THREE));
      }

      // Update entity
      const entity = this.entities.get(fighterId);
      entity.update(fighter);
    }

    // Remove entities that no longer exist
    for (const [fighterId, entity] of this.entities.entries()) {
      if (!activeIds.has(fighterId)) {
        entity.dispose();
        this.entities.delete(fighterId);
      }
    }
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    for (const entity of this.entities.values()) {
      entity.dispose();
    }
    this.entities.clear();

    if (this.groundPlane) {
      this.scene.remove(this.groundPlane);
      this.groundPlane.geometry.dispose();
      this.groundPlane.material.dispose();
    }
  }
}

/**
 * Initialize 3D rendering system
 */
export function init3DRendering(renderer) {
  if (!renderer || !renderer.THREE) {
    console.warn('[render3d] Three.js not available');
    return null;
  }

  console.log('[render3d] Initializing 3D rendering system');
  return new Renderer3D(renderer);
}
