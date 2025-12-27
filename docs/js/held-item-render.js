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

    // Get weapon bone (weapon should be stowed when holding prop)
    const bones = G.ANCHORS_OBJ?.[id];
    if (!bones) continue;

    // Use weapon_0 bone (same as weapon attachment)
    const weaponBone = bones.weapon_0;
    if (!weaponBone) continue;

    // Use start of weapon bone as attachment point
    const boneX = weaponBone.x;
    const boneY = weaponBone.y;

    // Simple bottle rendering for now
    const heldItem = fighter.currentHeldItem;
    if (heldItem.prefabId === 'bottle_tall') {
      renderBottleInHand(ctx, boneX, boneY, weaponBone.ang || 0, camX, zoom);
    }
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
