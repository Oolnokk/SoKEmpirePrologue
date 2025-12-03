// cosmetic-render.js — Shared rendering utilities for cosmetic editor
// Provides canvas-based rendering that exactly matches the game's rendering logic
// by delegating to sprites.js and render.js. If the game's rendering logic changes,
// this module will automatically use the updated logic.

import { computeAnchorsForFighter } from './render.js?v=4';
import { renderSprites, ensureFighterSprites } from './sprites.js?v=8';
import { ensureCosmeticLayers } from './cosmetics.js?v=1';
import { degToRad } from './math-utils.js?v=1';

/**
 * Builds a fighter entity object suitable for rendering.
 * This creates the same structure used by the game's rendering system.
 * @param {string} fighterName - Name of the fighter
 * @param {Object} options - Additional options
 * @param {Object} options.jointAngles - Joint angle overrides
 * @param {Object} options.pos - Position override { x, y }
 * @param {Object} options.profile - Render profile overrides
 * @returns {Object|null} Entity object or null if creation failed
 */
export function buildFighterEntity(fighterName, options = {}) {
  if (!fighterName) return null;
  const C = window.CONFIG || {};
  
  const jointAngles = options.jointAngles || getDefaultPoseAngles();
  const pos = options.pos || { x: 0, y: 0 };
  
  const fighter = {
    id: options.id || 'previewFighter',
    renderProfile: { fighterName, ...(options.profile || {}) },
    pos,
    jointAngles,
    facingSign: options.facingSign ?? 1,
    facingRad: options.facingRad ?? 0
  };
  
  let result;
  try {
    result = computeAnchorsForFighter(fighter, C, fighterName);
  } catch (err) {
    console.warn('[cosmetic-render] Failed to compute anchors', err);
    return null;
  }
  
  if (!result?.B) return null;
  
  return {
    id: options.id || 'previewEntity',
    fighter,
    fighterName: result.fighterName || fighterName,
    bones: result.B,
    flipLeft: !!result.flipLeft,
    hitbox: result.hitbox,
    centerX: result.hitbox?.x ?? pos.x,
    profile: { fighterName, ...(options.profile || {}) },
    lengths: result.L
  };
}

/**
 * Gets the default pose angles from CONFIG.poses.Stance
 * @returns {Object} Joint angles object with values in radians
 */
export function getDefaultPoseAngles() {
  const pose = (window.CONFIG?.poses?.Stance) || {};
  const keys = ['torso', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee'];
  const result = {};
  
  keys.forEach((key) => {
    if (pose[key] != null) {
      result[key] = degToRad(pose[key]);
    }
  });
  
  if (result.head == null && result.torso != null) {
    result.head = result.torso;
  }
  
  return result;
}

/**
 * Translates bone positions by an offset
 * @param {Object} bones - Bone objects keyed by bone name
 * @param {number} offsetX - X offset
 * @param {number} offsetY - Y offset
 * @returns {Object} New bones object with translated positions
 */
export function translateBones(bones, offsetX, offsetY) {
  const adjusted = {};
  for (const [key, bone] of Object.entries(bones || {})) {
    if (!bone) continue;
    adjusted[key] = {
      ...bone,
      x: Number.isFinite(bone.x) ? bone.x + offsetX : bone.x,
      y: Number.isFinite(bone.y) ? bone.y + offsetY : bone.y,
      endX: Number.isFinite(bone.endX) ? bone.endX + offsetX : bone.endX,
      endY: Number.isFinite(bone.endY) ? bone.endY + offsetY : bone.endY
    };
  }
  return adjusted;
}

/**
 * Translates hitbox position by an offset
 * @param {Object} hitbox - Hitbox object
 * @param {number} offsetX - X offset
 * @param {number} offsetY - Y offset
 * @returns {Object} New hitbox with translated positions
 */
export function translateHitbox(hitbox, offsetX, offsetY) {
  if (!hitbox) return hitbox;
  return {
    ...hitbox,
    x: Number.isFinite(hitbox.x) ? hitbox.x + offsetX : hitbox.x,
    y: Number.isFinite(hitbox.y) ? hitbox.y + offsetY : hitbox.y,
    attachX: Number.isFinite(hitbox.attachX) ? hitbox.attachX + offsetX : hitbox.attachX,
    attachY: Number.isFinite(hitbox.attachY) ? hitbox.attachY + offsetY : hitbox.attachY
  };
}

/**
 * Collects the bounding box of all bones and optional hitbox
 * @param {Object} bones - Bone objects
 * @param {Object} hitbox - Optional hitbox
 * @returns {Object} Bounds { minX, maxX, minY, maxY }
 */
export function collectBounds(bones, hitbox) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  };
  
  Object.values(bones || {}).forEach((bone) => {
    if (!bone) return;
    const points = [
      [bone.x, bone.y],
      [bone.endX, bone.endY]
    ];
    points.forEach(([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  });
  
  if (hitbox) {
    const corners = [
      [hitbox.x - hitbox.w / 2, hitbox.y - hitbox.h / 2],
      [hitbox.x + hitbox.w / 2, hitbox.y + hitbox.h / 2]
    ];
    corners.forEach(([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    });
  }
  
  return bounds;
}

/**
 * Creates a centered fighter entity for preview rendering.
 * Positions the fighter so it's centered and fits within the given dimensions.
 * @param {string} fighterName - Name of the fighter
 * @param {number} width - Canvas width in CSS pixels
 * @param {number} height - Canvas height in CSS pixels
 * @param {Object} options - Additional options
 * @returns {Object|null} Entity object positioned for the canvas, or null
 */
export function buildCenteredFighterEntity(fighterName, width, height, options = {}) {
  const entity = buildFighterEntity(fighterName, options);
  if (!entity) return null;
  
  const bounds = collectBounds(entity.bones, entity.hitbox);
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
    return null;
  }
  
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const bottomY = Number.isFinite(bounds.maxY) ? bounds.maxY : 0;
  const targetX = width / 2;
  const targetBottom = height * 0.9;
  const offsetX = targetX - centerX;
  const offsetY = targetBottom - bottomY;
  
  const adjustedBones = translateBones(entity.bones, offsetX, offsetY);
  const adjustedHitbox = translateHitbox(entity.hitbox, offsetX, offsetY);
  
  return {
    ...entity,
    bones: adjustedBones,
    hitbox: adjustedHitbox,
    centerX: adjustedHitbox?.x ?? targetX
  };
}

/**
 * Configures a canvas for high-DPI rendering
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @returns {Object} { width, height, dpr } - CSS dimensions and device pixel ratio
 */
export function configureCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(120, Math.round(rect.width || 260));
  const height = Math.max(220, Math.round(rect.height || 320));
  const dpr = window.devicePixelRatio || 1;
  const scaledWidth = Math.max(1, Math.round(width * dpr));
  const scaledHeight = Math.max(1, Math.round(height * dpr));
  
  if (canvas.width !== scaledWidth) {
    canvas.width = scaledWidth;
  }
  if (canvas.height !== scaledHeight) {
    canvas.height = scaledHeight;
  }
  
  return { width, height, dpr };
}

/**
 * Renders a full fighter using the game's rendering system.
 * This is the main function for rendering a complete fighter preview.
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {string} fighterName - Name of the fighter to render
 * @param {Object} slotOverrides - Cosmetic slot overrides
 * @param {Object} options - Additional rendering options
 */
export function renderFighterPreview(canvas, fighterName, slotOverrides = {}, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const { width, height, dpr } = configureCanvas(canvas);
  const entity = buildCenteredFighterEntity(fighterName, width, height, options);
  
  // Set up GAME state for rendering
  const GAME = (window.GAME ||= {});
  
  if (!entity) {
    // Render fallback message
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(148,163,184,0.65)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Unable to render fighter preview', canvas.width / 2, canvas.height / 2);
    ctx.restore();
    return;
  }
  
  // Configure GAME state for the rendering system
  GAME.CAMERA = { x: 0, zoom: 1, worldWidth: width };
  GAME.RENDER_STATE = { entities: [entity] };
  GAME.ANCHORS_OBJ = { [entity.id]: entity.bones };
  GAME.FLIP_STATE = { [entity.id]: entity.flipLeft };
  GAME.selectedFighter = fighterName;
  
  // Set up editor state for cosmetic overrides
  const overridesClone = deepClone(slotOverrides);
  GAME.editorState = { slotOverrides: overridesClone };
  
  // Clear and render
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  ctx.save();
  ctx.scale(dpr, dpr);
  renderSprites(ctx);
  ctx.restore();
}

/**
 * Renders a single bone/part using the game's rendering system.
 * Creates a minimal entity with just the specified bone for isolated part preview.
 * Note: The rendering system internally calls ensureCosmeticLayers to get cosmetic layers,
 * so layers don't need to be passed explicitly - they come from the game state.
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {string} fighterName - Name of the fighter
 * @param {string} partKey - The bone/part key to render (e.g., 'torso', 'arm_L_upper')
 * @param {Object} slotOverrides - Cosmetic slot overrides
 * @param {Object} options - Additional rendering options
 */
export function renderPartPreview(canvas, fighterName, partKey, slotOverrides = {}, options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const { width, height, dpr } = configureCanvas(canvas);
  const GAME = (window.GAME ||= {});
  const C = window.CONFIG || {};
  
  // Get a full entity first to extract the specific bone
  const fullEntity = buildCenteredFighterEntity(fighterName, width, height, options);
  if (!fullEntity || !fullEntity.bones[partKey]) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(148,163,184,0.65)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`No bone data for ${partKey}`, canvas.width / 2, canvas.height / 2);
    ctx.restore();
    return;
  }
  
  // Extract just the bone we need for part preview, centered
  const bone = fullEntity.bones[partKey];
  const boneCenter = {
    x: (bone.x + (bone.endX ?? bone.x)) / 2,
    y: (bone.y + (bone.endY ?? bone.y)) / 2
  };
  
  // Center the bone in the canvas
  const offsetX = width / 2 - boneCenter.x;
  const offsetY = height / 2 - boneCenter.y;
  
  const centeredBone = {
    ...bone,
    x: bone.x + offsetX,
    y: bone.y + offsetY,
    endX: Number.isFinite(bone.endX) ? bone.endX + offsetX : bone.endX,
    endY: Number.isFinite(bone.endY) ? bone.endY + offsetY : bone.endY
  };
  
  // Create a minimal bones object with just this bone (and related bones for limb rendering)
  const bones = { [partKey]: centeredBone };
  
  // Include related bones for context if needed (parent bones for limbs)
  const relatedBoneKeys = getRelatedBoneKeys(partKey);
  relatedBoneKeys.forEach(key => {
    const relatedBone = fullEntity.bones[key];
    if (relatedBone) {
      bones[key] = {
        ...relatedBone,
        x: relatedBone.x + offsetX,
        y: relatedBone.y + offsetY,
        endX: Number.isFinite(relatedBone.endX) ? relatedBone.endX + offsetX : relatedBone.endX,
        endY: Number.isFinite(relatedBone.endY) ? relatedBone.endY + offsetY : relatedBone.endY
      };
    }
  });
  
  const entity = {
    id: 'partPreviewEntity',
    fighterName,
    bones,
    flipLeft: false,
    hitbox: null,
    centerX: width / 2,
    profile: { fighterName }
  };
  
  // Configure GAME state
  GAME.CAMERA = { x: 0, zoom: 1, worldWidth: width };
  GAME.RENDER_STATE = { entities: [entity] };
  GAME.ANCHORS_OBJ = { [entity.id]: bones };
  GAME.FLIP_STATE = { [entity.id]: false };
  GAME.selectedFighter = fighterName;
  
  const overridesClone = deepClone(slotOverrides);
  GAME.editorState = { slotOverrides: overridesClone };
  
  // Clear and render
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  ctx.save();
  ctx.scale(dpr, dpr);
  renderSprites(ctx);
  ctx.restore();
}

/**
 * Gets related bone keys that should be included for context when rendering a part.
 * @param {string} partKey - The primary bone key
 * @returns {string[]} Array of related bone keys
 */
function getRelatedBoneKeys(partKey) {
  const relationships = {
    // Arms
    'arm_L_upper': [],
    'arm_L_lower': ['arm_L_upper'],
    'arm_R_upper': [],
    'arm_R_lower': ['arm_R_upper'],
    // Legs  
    'leg_L_upper': [],
    'leg_L_lower': ['leg_L_upper'],
    'leg_R_upper': [],
    'leg_R_lower': ['leg_R_upper'],
    // Core
    'torso': [],
    'head': ['torso']
  };
  
  return relationships[partKey] || [];
}

/**
 * Deep clones an object/array, handling null/undefined gracefully
 * @param {*} value - Value to clone
 * @returns {*} Cloned value
 */
function deepClone(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/**
 * Gets the sprite style for a fighter
 * @param {string} fighterName - Name of the fighter
 * @returns {Object} Sprite style configuration
 */
export function getFighterSpriteStyle(fighterName) {
  const C = window.CONFIG || {};
  const fighter = C.fighters?.[fighterName] || {};
  return fighter.spriteStyle || fighter.sprites?.style || C.spriteStyle || {};
}

/**
 * Gets cosmetic layers for a fighter, using the game's resolution logic
 * @param {string} fighterName - Name of the fighter
 * @param {Object} options - Options to pass to ensureCosmeticLayers
 * @returns {Array} Array of cosmetic layers
 */
export function getCosmeticLayers(fighterName, options = {}) {
  const C = window.CONFIG || {};
  const style = getFighterSpriteStyle(fighterName);
  return ensureCosmeticLayers(C, fighterName, style, options) || [];
}

// Re-export key functions from sprites.js for convenience
export { renderSprites, ensureFighterSprites };

// Re-export key functions from render.js for convenience
export { computeAnchorsForFighter };
