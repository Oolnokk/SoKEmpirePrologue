/**
 * Ground-based Prop Pickup System
 * Allows players to pick up props directly from the 2D ground (dynamicInstances)
 * Simpler than holster system - for testing held item mechanics
 */

export class GroundPickupManager {
  constructor(playerGetter, dynamicInstancesGetter) {
    // Functions that return current player and dynamicInstances
    this.getPlayer = playerGetter;
    this.getDynamicInstances = dynamicInstancesGetter;

    this.nearbyProps = [];
    this.currentPrompt = null;
    this.interactionKey = 'e';
    this.interactionRange = 80; // pixels in 2D gameplay space
    this.enabled = true;

    // UI elements
    this.promptElement = null;
    this.createPromptUI();

    // Bind keyboard handler
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);

    console.log('[GroundPickup] ✓ Ground pickup manager initialized');
  }

  /**
   * Create the interaction prompt UI element
   */
  createPromptUI() {
    this.promptElement = document.createElement('div');
    this.promptElement.id = 'groundPickupPrompt';
    this.promptElement.style.cssText = `
      position: absolute;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid rgba(106, 167, 255, 0.6);
      border-radius: 12px;
      padding: 12px 20px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #e8eef7;
      display: none;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(this.promptElement);
  }

  /**
   * Update - called every frame by game loop
   */
  update() {
    if (!this.enabled) {
      this.hidePrompt();
      return;
    }

    const player = this.getPlayer();
    if (!player || !player.pos) {
      this.hidePrompt();
      return;
    }

    const playerX = player.pos.x;
    const playerY = player.pos.y;

    // Find nearby pickupable props
    this.nearbyProps = this.findNearbyProps(playerX, playerY);

    if (this.nearbyProps.length > 0) {
      const closest = this.nearbyProps[0];
      this.showPrompt(closest);
    } else {
      this.hidePrompt();
    }
  }

  /**
   * Find props near player position
   */
  findNearbyProps(playerX, playerY) {
    const instances = this.getDynamicInstances();
    if (!Array.isArray(instances)) return [];

    const nearby = [];

    for (const inst of instances) {
      if (!inst || !inst.position) continue;

      // Skip if already picked up (has pickedUp flag)
      if (inst.pickedUp) continue;

      // Check if it's a pickupable prop (bottles for now)
      const isPickupable = this.isPickupableProp(inst);
      if (!isPickupable) continue;

      // Calculate distance in 2D gameplay space
      const dx = playerX - inst.position.x;
      const dy = playerY - inst.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.interactionRange) {
        nearby.push({
          instance: inst,
          distance: distance,
          promptText: this.getPromptText(inst)
        });
      }
    }

    // Sort by distance, closest first
    nearby.sort((a, b) => a.distance - b.distance);
    return nearby;
  }

  /**
   * Check if an instance is a pickupable prop
   */
  isPickupableProp(inst) {
    // For now, only bottles
    if (inst.prefabId === 'bottle_tall') return true;
    if (inst.id?.startsWith('bottle_')) return true;

    // Could add more prop types here
    return false;
  }

  /**
   * Get prompt text for a prop
   */
  getPromptText(inst) {
    if (inst.prefabId === 'bottle_tall') return 'Pick up bottle';
    return 'Pick up';
  }

  /**
   * Show interaction prompt
   */
  showPrompt(propData) {
    if (!this.promptElement) return;

    const promptText = propData.promptText;
    const keyText = this.interactionKey.toUpperCase();

    this.promptElement.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <kbd style="background: rgba(106, 167, 255, 0.2); padding: 4px 8px; border-radius: 6px; font-weight: bold;">${keyText}</kbd>
        <span>${promptText}</span>
      </span>
    `;

    this.promptElement.style.display = 'block';
    this.currentPrompt = propData;
  }

  /**
   * Hide interaction prompt
   */
  hidePrompt() {
    if (this.promptElement) {
      this.promptElement.style.display = 'none';
    }
    this.currentPrompt = null;
  }

  /**
   * Handle keyboard input
   */
  onKeyDown(event) {
    if (!this.enabled || !this.currentPrompt) return;

    if (event.key.toLowerCase() === this.interactionKey) {
      event.preventDefault();
      this.pickupProp(this.currentPrompt);
    }
  }

  /**
   * Pick up a prop from the ground
   */
  pickupProp(propData) {
    const inst = propData.instance;
    console.log('[GroundPickup] Picking up:', inst.id, inst.prefabId);

    // Mark as picked up (so it won't show in proximity again)
    inst.pickedUp = true;

    // Disable physics - this stops the collider from being simulated
    if (inst.physics) {
      inst.physics.disabled = true;
      inst.physics.vel = { x: 0, y: 0 };
    }

    // Hide the prop visually (we'll remove from render later)
    if (inst.position) {
      inst.position.y = -9999; // Move off-screen
    }

    // Add to player's held item
    const player = this.getPlayer();
    if (player) {
      if (!player.heldItems) player.heldItems = [];
      player.heldItems.push({
        prefabId: inst.prefabId,
        instanceId: inst.id,
        instance: inst,
        pickedUpAt: Date.now()
      });

      // Set current held item
      player.currentHeldItem = player.heldItems[player.heldItems.length - 1];

      console.log('[GroundPickup] ✓ Added to player held items:', player.currentHeldItem);
    }

    // Dispatch event for other systems
    window.dispatchEvent(new CustomEvent('propPickup', {
      detail: {
        instanceId: inst.id,
        prefabId: inst.prefabId,
        instance: inst
      }
    }));

    this.hidePrompt();
  }

  /**
   * Trigger pickup action (for touch/button controls)
   */
  triggerPickup() {
    if (this.currentPrompt) {
      this.pickupProp(this.currentPrompt);
    }
  }

  /**
   * Get current context state (for UI updates)
   */
  getContextState() {
    return {
      hasContext: !!this.currentPrompt,
      contextText: this.currentPrompt?.promptText || null,
      nearbyCount: this.nearbyProps.length
    };
  }

  /**
   * Enable/disable pickup system
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.hidePrompt();
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.promptElement && this.promptElement.parentNode) {
      this.promptElement.parentNode.removeChild(this.promptElement);
    }
    this.promptElement = null;
  }
}

/**
 * Initialize ground pickup system
 */
export function initGroundPickup() {
  const GAME = window.GAME || {};

  // Create getter functions that always return current values
  const getPlayer = () => GAME.FIGHTERS?.player;
  const getDynamicInstances = () => GAME.dynamicInstances || [];

  const manager = new GroundPickupManager(getPlayer, getDynamicInstances);

  // Store globally
  window.groundPickupManager = manager;
  GAME.groundPickupManager = manager;

  console.log('[GroundPickup] ✓ Ground pickup system ready');

  return manager;
}
