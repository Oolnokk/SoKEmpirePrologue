/**
 * Held Item Rendering
 * Simple system to render props held in player's hand
 */

/**
 * Render held items for all fighters
 * Renders items from dynamicInstances that have heldBy set
 */
export function renderHeldItems(ctx) {
  const G = window.GAME || {};

  if (!ctx || !G.dynamicInstances) return;

  const camera = G.CAMERA || {};
  const camX = camera.x || 0;
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;

  // Get ground Y for camera transform (same as renderBottles)
  const groundY = window.CONFIG?.groundY;
  const cv = window.GAME?.CV;
  const pivotY = Number.isFinite(groundY) ? groundY : cv?.height || 0;

  ctx.save();
  // Apply same camera transform as bottles
  ctx.translate(0, pivotY);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -pivotY);

  // Render held items from dynamicInstances
  for (const inst of G.dynamicInstances) {
    if (!inst || !inst.heldBy) continue;

    const prefab = inst.prefab;
    if (!prefab || !prefab.parts || !prefab.parts.length) continue;

    const part = prefab.parts.find(p => p?.propTemplate);
    const template = part?.propTemplate;
    if (!template || !template.url) continue;

    // Use prop config scale (NOT affected by bone transforms)
    const scaleX = inst.scale?.x || 1;
    const scaleY = inst.scale?.y || scaleX;

    // Position and rotation come from bone (already set in update loop)
    const pos = inst.position;
    const rotRad = (inst.rotationDeg || 0) * Math.PI / 180;

    // Load image
    const img = window.GAME?.prefabImageCache?.[template.url];
    const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;
    const width = Number.isFinite(template.w) ? template.w : (img?.naturalWidth || 100);
    const height = Number.isFinite(template.h) ? template.h : (img?.naturalHeight || 100);

    // Compute anchor point
    let ax = width * ((template.anchorXPct ?? 50) / 100);
    let ay = height * ((template.anchorYPct ?? 100) / 100);

    // Adjust anchor if prop config specifies sprite base
    if (inst.propConfig?.spriteBase) {
      const base = inst.propConfig.spriteBase;
      ax -= base.x;
      ay -= base.y;
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(scaleX, scaleY); // Apply prop config scale
    if (rotRad) ctx.rotate(rotRad);

    if (ready) {
      ctx.drawImage(img, -ax, -ay, width, height);
    } else {
      // Placeholder - use prop config render settings if available
      const renderConfig = inst.propConfig?.render || {};
      ctx.fillStyle = renderConfig.color || 'rgba(148, 163, 184, 0.3)';
      ctx.fillRect(-ax, -ay, width, height);
      ctx.strokeStyle = renderConfig.outlineColor || 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-ax, -ay, width, height);
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Render a bottle sprite in hand
 * Mimics weapon sprite rendering - bottle size based on fixed dimensions,
 * rendered in world space like weapons on bones
 */
function renderBottleInHand(ctx, handX, handY, handAngle, camX, zoom) {
  ctx.save();

  // Position at hand bone end (world coordinates)
  ctx.translate(handX, handY);

  // Rotate with bone angle + PI (same as weapon sprites)
  ctx.rotate(handAngle + Math.PI);

  // Bottle dimensions - fixed size in world space (like a weapon)
  // Total height: 9.25px, attachment at 75% up from bottom
  const bottleHeight = 9.25;
  const bottleWidth = 1.5;

  // Offset so attachment point (75% up from bottom) is at origin
  // Bottom at +3.75, top at -5.5, 75% up = -3.1875
  const attachmentOffset = 3.1875;
  ctx.translate(0, -attachmentOffset);

  // Draw bottle shape
  ctx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // Brown glass
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.25;

  // Bottle body
  ctx.beginPath();
  ctx.rect(-bottleWidth / 2, -3.75, bottleWidth, 7.5);
  ctx.fill();
  ctx.stroke();

  // Bottle neck
  ctx.fillStyle = 'rgba(100, 50, 10, 0.9)';
  ctx.beginPath();
  ctx.rect(-0.5, -5, 1, 1.25);
  ctx.fill();
  ctx.stroke();

  // Bottle cap
  ctx.fillStyle = 'rgba(180, 120, 60, 1)';
  ctx.beginPath();
  ctx.rect(-0.75, -5.5, 1.5, 0.5);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Initialize held item rendering (if needed)
 */
export function initHeldItemRendering() {
  console.log('[HeldItemRender] ✓ Held item rendering initialized');
}
