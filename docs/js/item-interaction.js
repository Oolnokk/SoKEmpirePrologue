/**
 * Item Interaction System
 * Handles player proximity detection and interaction with SpriteHolsters
 * to pick up props and activate NPCs
 */

export class ItemInteractionManager {
  constructor(holsterManager, playerState) {
    this.holsterManager = holsterManager;
    this.playerState = playerState;
    this.nearbyHolsters = [];
    this.currentPrompt = null;
    this.interactionKey = 'e'; // Default interaction key
    this.interactionRange = 80; // Default range in pixels
    this.enabled = true;

    // UI elements for interaction prompts
    this.promptElement = null;
    this.createPromptUI();

    // Bind keyboard handler
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /**
   * Create the interaction prompt UI element
   */
  createPromptUI() {
    this.promptElement = document.createElement('div');
    this.promptElement.id = 'interactionPrompt';
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
   * Update interaction state based on player position
   * Called every frame by the game loop
   */
  update() {
    if (!this.enabled || !this.holsterManager || !this.playerState) {
      this.hidePrompt();
      return;
    }

    const playerX = this.playerState.x || 0;
    const playerY = this.playerState.y || 0;

    // Check proximity to holsters
    this.nearbyHolsters = this.holsterManager.checkProximity(
      playerX,
      playerY,
      this.interactionRange
    );

    if (this.nearbyHolsters.length > 0) {
      const closest = this.nearbyHolsters[0];
      this.showPrompt(closest);
    } else {
      this.hidePrompt();
    }
  }

  /**
   * Show interaction prompt for a holster
   */
  showPrompt(holster) {
    if (!this.promptElement) return;

    const promptText = holster.interactionPrompt || 'Pick up';
    const keyText = this.interactionKey.toUpperCase();

    this.promptElement.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <kbd style="background: rgba(106, 167, 255, 0.2); padding: 4px 8px; border-radius: 6px; font-weight: bold;">${keyText}</kbd>
        <span>${promptText}</span>
      </span>
    `;

    this.promptElement.style.display = 'block';
    this.currentPrompt = holster;
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
   * Handle keyboard input for interactions
   */
  onKeyDown(event) {
    if (!this.enabled || !this.currentPrompt) return;

    if (event.key.toLowerCase() === this.interactionKey) {
      event.preventDefault();
      this.interact(this.currentPrompt);
    }
  }

  /**
   * Perform interaction with a holster
   */
  interact(holster) {
    if (!holster) return;

    console.log('[ItemInteraction] Interacting with holster:', holster.id);

    if (holster.type === 'prop') {
      this.pickupProp(holster);
    } else if (holster.type === 'npc') {
      this.activateNPC(holster);
    }
  }

  /**
   * Pick up a prop from a holster
   */
  pickupProp(holster) {
    console.log('[ItemInteraction] Picking up prop:', holster.linkedEntityId);

    // Remove the 3D holster visualization
    this.holsterManager.removeHolster(holster.id);

    // Find the corresponding 2D prop spawn
    const propSpawn = this.findPropSpawn(holster.linkedEntityId);
    if (propSpawn) {
      // For now, just log - we'll integrate with the held item system next
      console.log('[ItemInteraction] Found prop spawn:', propSpawn);

      // TODO: Add prop to player's hand
      // this.addToPlayerHand(propSpawn);

      // Dispatch custom event for prop pickup
      window.dispatchEvent(new CustomEvent('propPickup', {
        detail: {
          holsterId: holster.id,
          propId: holster.linkedEntityId,
          propSpawn: propSpawn
        }
      }));
    } else {
      console.warn('[ItemInteraction] Could not find prop spawn for:', holster.linkedEntityId);
    }

    this.hidePrompt();
  }

  /**
   * Activate an NPC from a holster
   */
  activateNPC(holster) {
    console.log('[ItemInteraction] Activating NPC:', holster.linkedEntityId);

    // Remove the 3D holster visualization
    this.holsterManager.removeHolster(holster.id);

    // Find the corresponding 2D NPC
    const npc = this.findNPC(holster.linkedEntityId);
    if (npc) {
      // Make NPC visible and active
      console.log('[ItemInteraction] Found NPC:', npc);

      // TODO: Activate 2D NPC
      // - Set opacity to 1
      // - Enable AI/combat system
      // npc.setOpacity(1);
      // npc.setActive(true);

      // Dispatch custom event for NPC activation
      window.dispatchEvent(new CustomEvent('npcActivation', {
        detail: {
          holsterId: holster.id,
          npcId: holster.linkedEntityId,
          npc: npc
        }
      }));
    } else {
      console.warn('[ItemInteraction] Could not find NPC for:', holster.linkedEntityId);
    }

    this.hidePrompt();
  }

  /**
   * Find a prop spawn by ID
   * TODO: This needs to be connected to the actual prop spawn system
   */
  findPropSpawn(propId) {
    // Try to find prop spawn from game state
    if (window.GAME?.currentArea?.propSpawns) {
      return window.GAME.currentArea.propSpawns.find(p => p.id === propId);
    }

    // Fallback: search entities
    if (window.GAME?.currentArea?.entities) {
      return window.GAME.currentArea.entities.find(e =>
        e.type === 'propspawn' && e.id === propId
      );
    }

    return null;
  }

  /**
   * Find an NPC by ID
   * TODO: This needs to be connected to the actual NPC system
   */
  findNPC(npcId) {
    // Try to find NPC from game state
    if (window.GAME?.npcs) {
      return window.GAME.npcs.find(n => n.id === npcId);
    }

    return null;
  }

  /**
   * Set the interaction key
   */
  setInteractionKey(key) {
    this.interactionKey = key.toLowerCase();
  }

  /**
   * Set the interaction range
   */
  setInteractionRange(range) {
    this.interactionRange = range;
  }

  /**
   * Enable/disable the interaction system
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
    this.nearbyHolsters = [];
    this.currentPrompt = null;
  }
}

/**
 * Create and initialize the item interaction manager
 * Should be called after holsterManager is created
 */
export function initItemInteraction(holsterManager, playerState) {
  const interactionManager = new ItemInteractionManager(holsterManager, playerState);

  // Store reference for global access
  if (typeof window !== 'undefined') {
    window.itemInteractionManager = interactionManager;
    console.log('[ItemInteraction] ✓ Item interaction manager available via window.itemInteractionManager');
  }

  return interactionManager;
}
