/**
 * Context Button for HUD Arch
 * Adds a dynamic button that changes based on game context (e.g., "take" near props)
 */

/**
 * Add context button to HUD arch configuration
 */
export function addContextButtonToArch() {
  const config = window.CONFIG || {};
  const hudConfig = config.hud || {};

  if (!hudConfig.arch) {
    console.warn('[ArchContext] HUD arch config not found');
    return;
  }

  const archButtons = hudConfig.arch.buttons || [];

  // Check if context button already exists
  const hasContextButton = archButtons.some(btn => btn.id === 'context');
  if (hasContextButton) {
    console.log('[ArchContext] Context button already configured');
    return;
  }

  // Add context button to arch (order 4, after jump)
  archButtons.push({
    id: 'context',
    action: 'context',
    order: 4,
    lengthPct: 0.20,
    gapPx: 12,
    letter: 'take',
    contextual: true // Mark as contextual so we can handle it specially
  });

  console.log('[ArchContext] ✓ Context button added to arch configuration');
}

/**
 * Update context button visibility and text based on game state
 */
export function updateContextButton() {
  const contextBtn = document.getElementById('arch-btn-context');
  if (!contextBtn) return;

  const pickupManager = window.GAME?.groundPickupManager;
  if (!pickupManager) {
    // Hide if pickup system not available
    contextBtn.classList.remove('is-visible');
    return;
  }

  const state = pickupManager.getContextState();

  if (state.hasContext && state.contextText) {
    // Show button with context text
    contextBtn.classList.add('is-visible');

    const label = contextBtn.querySelector('.arch-hud__button-label');
    if (label) {
      label.textContent = 'take'; // Always "take" for now, could be dynamic later
    }
  } else {
    // Hide button when no context
    contextBtn.classList.remove('is-visible');
  }
}

/**
 * Initialize context button system
 */
export function initContextButton() {
  // Add button to arch config
  addContextButtonToArch();

  // Set up periodic update (will be called from game loop)
  console.log('[ArchContext] ✓ Context button system initialized');
  console.log('[ArchContext] Button will use Khymeryyan font with fallback to TankanScript');
}

/**
 * Handle context button press
 */
export function handleContextButtonPress() {
  const pickupManager = window.GAME?.groundPickupManager;
  if (!pickupManager) {
    console.warn('[ArchContext] Pickup manager not available');
    return;
  }

  pickupManager.triggerPickup();
}
