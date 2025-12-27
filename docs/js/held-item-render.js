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
 */
function renderBottleInHand(ctx, handX, handY, handAngle, camX, zoom) {
  ctx.save();

  // Transform to world space
  ctx.translate(handX - camX, handY);
  ctx.rotate(handAngle + Math.PI / 2); // Orient bottle upright relative to hand

  // Draw simple bottle shape (placeholder - will use sprite later)
  ctx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // Brown glass
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;

  // Bottle body
  ctx.beginPath();
  ctx.rect(-4, -15, 8, 30);
  ctx.fill();
  ctx.stroke();

  // Bottle neck
  ctx.fillStyle = 'rgba(100, 50, 10, 0.9)';
  ctx.beginPath();
  ctx.rect(-2, -20, 4, 5);
  ctx.fill();
  ctx.stroke();

  // Bottle cap
  ctx.fillStyle = 'rgba(180, 120, 60, 1)';
  ctx.beginPath();
  ctx.rect(-3, -22, 6, 2);
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
