/**
 * Held Item Rendering
 * Simple system to render props held in player's hand
 */

/**
 * Render held items for all fighters
 */
export function renderHeldItems(ctx) {
  const G = window.GAME || {};
  const C = window.CONFIG || {};

  if (!ctx) return;

  const camX = G.CAMERA?.x || 0;
  const zoom = Number.isFinite(G.CAMERA?.zoom) ? G.CAMERA.zoom : 1;

  ctx.save();

  // Iterate through fighters
  const fighters = G.FIGHTERS || {};
  for (const [id, fighter] of Object.entries(fighters)) {
    if (!fighter || !fighter.currentHeldItem) continue;

    // Get hand bone position
    const bones = G.ANCHORS_OBJ?.[id];
    if (!bones) continue;

    // Use right forearm end as hand position (attach point)
    const handBone = bones.arm_R_lower;
    if (!handBone) continue;

    const handX = handBone.endX || handBone.x;
    const handY = handBone.endY || handBone.y;

    // Simple bottle rendering for now
    const heldItem = fighter.currentHeldItem;
    if (heldItem.prefabId === 'bottle_tall') {
      renderBottleInHand(ctx, handX, handY, handBone.ang || 0, camX, zoom);
    }
  }

  ctx.restore();
}

/**
 * Render a bottle sprite in hand
 * Bottle is 25% of original scale with attachment point 75% up from bottom (centered)
 * Maintains constant screen size regardless of zoom level
 */
function renderBottleInHand(ctx, handX, handY, handAngle, camX, zoom) {
  ctx.save();

  // Transform to world space
  ctx.translate(handX - camX, handY);

  // Apply inverse zoom to maintain constant screen size
  const invZoom = 1 / zoom;
  ctx.scale(invZoom, invZoom);

  ctx.rotate(handAngle); // Orient bottle same direction as katana blade (along bone)

  // Offset so attachment point is 75% up from bottle bottom
  // Bottle dimensions at 25% scale: height=9.25px (from y=-5.5 to y=3.75)
  // 75% up from bottom (y=3.75) = 3.75 - (9.25 * 0.75) = -3.1875
  // Shift bottle so this point is at y=0 (hand position)
  ctx.translate(0, 3.1875);

  // Draw simple bottle shape at 25% scale (placeholder - will use sprite later)
  ctx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // Brown glass
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.25;

  // Bottle body (25% scale)
  ctx.beginPath();
  ctx.rect(-1, -3.75, 2, 7.5);
  ctx.fill();
  ctx.stroke();

  // Bottle neck (25% scale)
  ctx.fillStyle = 'rgba(100, 50, 10, 0.9)';
  ctx.beginPath();
  ctx.rect(-0.5, -5, 1, 1.25);
  ctx.fill();
  ctx.stroke();

  // Bottle cap (25% scale)
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
