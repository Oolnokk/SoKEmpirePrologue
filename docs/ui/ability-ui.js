/**
 * Ability UI module for handling arch buttons and attack name display
 * Provides utilities for populating arch buttons with keyboard letters
 * and displaying attack/ability names vertically along the right edge
 */
(function() {
  'use strict';

  // Default keyboard mapping for arch buttons (used only if config is missing)
  const FALLBACK_KEY_MAPPING = {
    0: 'a', // First button
    1: 'b', // Second button
    2: 'c', // Third button
    3: 'j', // Fourth button
    4: 's', // Fifth button
  };

  const CONFIG_ARCH_LETTERS = (() => {
    const buttons = window.CONFIG?.ui?.hud?.arch?.buttons;
    if (!Array.isArray(buttons)) return {};
    return buttons.reduce((acc, btn) => {
      if (btn?.id && btn.letter) {
        acc[btn.id] = btn.letter;
      }
      return acc;
    }, {});
  })();

  function ensureButtonLabel(button) {
    let label = button.querySelector('.arch-hud__button-label') || button.querySelector('.arch-btn-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'arch-hud__button-label';
      button.textContent = '';
      button.appendChild(label);
    }
    label.style.pointerEvents = 'none';
    return label;
  }

  /**
   * Initialize arch buttons with letter labels
   * @param {HTMLElement} archElement - The container element for arch buttons
   * @param {Object} options - Configuration options
   * @param {Object} options.keyMapping - Custom key mapping (index -> letter)
   * @param {boolean} options.showLetters - Whether to show letter labels (default: true)
   */
  function initArchButtons(archElement, options = {}) {
    if (!archElement) {
      console.warn('UIAbility.initArchButtons: archElement is null or undefined');
      return;
    }

    const {
      keyMapping = null,
      showLetters = true,
    } = options;

    const resolvedKeyMapping = keyMapping || FALLBACK_KEY_MAPPING;

    // Find all arch buttons within the container
    const buttons = archElement.querySelectorAll('.arch-hud__button, .arch-btn');
    
    if (buttons.length === 0) {
      console.warn('UIAbility.initArchButtons: No arch buttons found');
      return;
    }

    buttons.forEach((button, index) => {
      const configId = button.id?.replace(/^arch-btn-/, '') || button.dataset.id;
      const key =
        button.dataset.letter ||
        CONFIG_ARCH_LETTERS[configId] ||
        resolvedKeyMapping[index];

      if (!key) {
        return; // Skip if no key mapping exists for this index
      }

      // Set data-key attribute
      button.setAttribute('data-key', key);

      // Set aria-label for accessibility
      const existingLabel = button.getAttribute('aria-label') || '';
      const keyLabel = `Button ${key.toUpperCase()}`;
      button.setAttribute('aria-label', existingLabel ? `${existingLabel} (${key.toUpperCase()})` : keyLabel);

      // Add or update text content with the key letter
      if (showLetters) {
        const label = ensureButtonLabel(button);
        label.textContent = key.toUpperCase();
        button.dataset.letter = key.toUpperCase();
      }
    });

    console.log(`UIAbility.initArchButtons: Initialized ${buttons.length} arch buttons`);
  }

  // Animation delay constant for staggered attack name display
  const ANIMATION_DELAY_INCREMENT = 0.1; // seconds between each entry

  /**
   * Display attack/ability names vertically on the right edge
   * @param {Array} abilities - Array of ability objects with name property
   * Each ability can have multiple attacks, which will be numbered
   */
  function showAttackNames(abilities) {
    if (!Array.isArray(abilities) || abilities.length === 0) {
      console.warn('UIAbility.showAttackNames: abilities must be a non-empty array');
      return;
    }

    // Remove existing attack names container if it exists
    let container = document.getElementById('attack-names');
    if (container) {
      container.remove();
    }

    // Create new container
    container = document.createElement('div');
    container.id = 'attack-names';
    container.style.cssText = `
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 100;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 24px;
      align-items: flex-end;
    `;

    let delayIndex = 0;

    abilities.forEach((ability) => {
      if (!ability || typeof ability !== 'object') {
        return;
      }

      const abilityName = ability.name || ability.id || 'Unknown';
      const attackCount = ability.attacks ? ability.attacks.length : (ability.attackCount || 1);

      // If ability has multiple attacks, create numbered entries
      if (attackCount > 1) {
        for (let i = 1; i <= attackCount; i++) {
          const nameElement = createAttackNameElement(`${abilityName} ${i}`, delayIndex);
          container.appendChild(nameElement);
          delayIndex++;
        }
      } else {
        // Single attack ability
        const nameElement = createAttackNameElement(abilityName, delayIndex);
        container.appendChild(nameElement);
        delayIndex++;
      }
    });

    // Append container to body
    document.body.appendChild(container);

    console.log(`UIAbility.showAttackNames: Displayed ${delayIndex} attack names`);
  }

  /**
   * Create an individual attack name element
   * @param {string} name - The attack name
   * @param {number} delayIndex - Index for staggered animation delay
   * @returns {HTMLElement} The created element
   */
  function createAttackNameElement(name, delayIndex) {
    const element = document.createElement('div');
    element.className = 'attack-name';
    element.textContent = name;
    
    // Set CSS variable for animation delay
    const delay = delayIndex * ANIMATION_DELAY_INCREMENT;
    element.style.setProperty('--animation-delay', `${delay}s`);
    
    return element;
  }

  /**
   * Clear all displayed attack names
   */
  function clearAttackNames() {
    const container = document.getElementById('attack-names');
    if (container) {
      container.remove();
    }
  }

  // Export to global scope as UIAbility namespace
  window.UIAbility = {
    initArchButtons,
    showAttackNames,
    clearAttackNames,
  };

  console.log('UIAbility module loaded');
})();
