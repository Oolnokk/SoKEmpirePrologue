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
 * Now with sprite billboard support!
 */
class Entity3D {
  constructor(id, scene, THREE) {
    this.id = id;
    this.scene = scene;
    this.THREE = THREE;

    // Create off-screen canvas for sprite rendering
    this.spriteCanvas = document.createElement('canvas');
    this.spriteCanvas.width = 256;
    this.spriteCanvas.height = 256;
    this.spriteCtx = this.spriteCanvas.getContext('2d');

    // Create canvas texture
    this.spriteTexture = new THREE.CanvasTexture(this.spriteCanvas);
    this.spriteTexture.minFilter = THREE.LinearFilter;
    this.spriteTexture.magFilter = THREE.LinearFilter;

    // Create billboard sprite (plane that always faces camera)
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.spriteTexture,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true
    });

    this.sprite = new THREE.Sprite(spriteMaterial);
    this.sprite.scale.set(80, 80, 1); // Size of the billboard
    this.scene.add(this.sprite);

    // Create simple box for reference (optional, can be removed)
    const geometry = new THREE.BoxGeometry(30, 60, 20);
    const material = new THREE.MeshPhongMaterial({
      color: id === 'player' ? 0x4488ff : 0xff4444,
      emissive: id === 'player' ? 0x224488 : 0x882222,
      shininess: 30,
      transparent: true,
      opacity: 0.3 // Semi-transparent so we can see the sprite
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Add label (for debugging)
    this.createLabel(id);
  }

  createLabel(text) {
    // Create a small sphere above the entity as a label marker
    const labelGeometry = new this.THREE.SphereGeometry(5, 8, 8);
    const labelMaterial = new this.THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.labelMarker = new this.THREE.Mesh(labelGeometry, labelMaterial);
    this.labelMarker.position.y = 50;
    this.sprite.add(this.labelMarker);
  }

  /**
   * Render sprite to canvas texture
   */
  renderSpriteToCanvas(fighter) {
    const ctx = this.spriteCtx;
    const canvas = this.spriteCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get render state from game
    const renderState = window.GAME?.RENDER_STATE;
    const entity = renderState?.entities?.find(e => e.id === this.id);

    if (!entity || !entity.bones) {
      // Draw fallback (simple colored circle)
      ctx.fillStyle = this.id === 'player' ? '#4488ff' : '#ff4444';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 40, 0, Math.PI * 2);
      ctx.fill();

      // Add label text
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.id, canvas.width / 2, canvas.height / 2 + 60);
      return;
    }

    // Draw stick figure representation from bone data
    const bones = entity.bones;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = 0.8; // Scale down to fit in canvas

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);

    // Draw bones as lines
    ctx.strokeStyle = this.id === 'player' ? '#4488ff' : '#ff4444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    const drawBone = (bone) => {
      if (!bone) return;
      ctx.beginPath();
      ctx.moveTo(bone.x - centerX / scale, bone.y - centerY / scale);
      ctx.lineTo(bone.ex - centerX / scale, bone.ey - centerY / scale);
      ctx.stroke();
    };

    // Draw all bones
    if (bones.torso) drawBone(bones.torso);
    if (bones.head) drawBone(bones.head);
    if (bones.arm_L_upper) drawBone(bones.arm_L_upper);
    if (bones.arm_L_lower) drawBone(bones.arm_L_lower);
    if (bones.arm_R_upper) drawBone(bones.arm_R_upper);
    if (bones.arm_R_lower) drawBone(bones.arm_R_lower);
    if (bones.leg_L_upper) drawBone(bones.leg_L_upper);
    if (bones.leg_L_lower) drawBone(bones.leg_L_lower);
    if (bones.leg_R_upper) drawBone(bones.leg_R_upper);
    if (bones.leg_R_lower) drawBone(bones.leg_R_lower);

    // Draw joints as circles
    ctx.fillStyle = '#ffffff';
    const drawJoint = (bone) => {
      if (!bone) return;
      ctx.beginPath();
      ctx.arc(bone.x - centerX / scale, bone.y - centerY / scale, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bone.ex - centerX / scale, bone.ey - centerY / scale, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    if (bones.torso) drawJoint(bones.torso);
    if (bones.head) drawJoint(bones.head);

    ctx.restore();

    // Add label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(this.id, centerX, canvas.height - 10);
    ctx.fillText(this.id, centerX, canvas.height - 10);
  }

  /**
   * Update entity position from 2D game state
   */
  update(fighter) {
    if (!fighter || !fighter.pos) return;

    // Transform 2D position to 3D
    const pos3d = transform2dTo3d(fighter.pos);

    // Update both mesh and sprite positions
    this.mesh.position.set(pos3d.x, pos3d.y + 30, pos3d.z); // +30 to lift above ground
    this.sprite.position.set(pos3d.x, pos3d.y + 40, pos3d.z); // Billboard slightly higher

    // Apply rotation based on facing direction (mesh only, sprite is billboard)
    if (typeof fighter.facingRad === 'number') {
      // In 2D: 0 = up, rotate clockwise
      // In 3D: rotate around Y axis
      // Add Math.PI to face opposite direction (character facing)
      this.mesh.rotation.y = fighter.facingRad + Math.PI;
    }

    // Render sprite to canvas and update texture
    this.renderSpriteToCanvas(fighter);
    this.spriteTexture.needsUpdate = true;

    // Handle death alpha (fade out)
    if (fighter.isDead) {
      const alpha = 1 - (fighter.deadTime || 0) / 3.5; // Fade over 3.5s
      this.mesh.material.opacity = Math.max(0, alpha) * 0.3; // Keep semi-transparent
      this.mesh.material.transparent = true;
      this.sprite.material.opacity = Math.max(0, alpha);
    } else {
      this.mesh.material.opacity = 0.3; // Semi-transparent
      this.mesh.material.transparent = true;
      this.sprite.material.opacity = 1.0;
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
    if (this.sprite) {
      this.scene.remove(this.sprite);
      if (this.sprite.material) {
        if (this.sprite.material.map) this.sprite.material.map.dispose();
        this.sprite.material.dispose();
      }
    }
    if (this.spriteTexture) {
      this.spriteTexture.dispose();
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
