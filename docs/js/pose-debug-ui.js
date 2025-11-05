// pose-debug-ui.js — Debug UI for runtime skeleton fixes
// Adds a floating panel with checkboxes to toggle runtime fixes and displays PASS/FAIL status

(function() {
  'use strict';

  // Wait for RUNTIME_FIXES to be available
  if (!window.RUNTIME_FIXES) {
    console.error('[pose-debug-ui] RUNTIME_FIXES not available. Ensure runtime-fixes.js loads first.');
    return;
  }

  // Prevent double-initialization
  if (window.__poseDebugUIInitialized) {
    console.warn('[pose-debug-ui] Already initialized');
    return;
  }

  const POLL_INTERVAL = 800; // ms
  let pollTimer = null;
  let currentState = {
    segPosStd: false,
    segPosAlt: false,
    withAXStd: false,
    negateLowers: false,
    globalRotate90: false
  };

  /**
   * Create the debug panel UI
   */
  function createDebugPanel() {
    // Check if a pose debug panel container already exists
    let container = document.getElementById('poseDebugPanel');
    
    if (!container) {
      // Create a new floating panel
      container = document.createElement('div');
      container.id = 'poseDebugPanel';
      container.style.cssText = `
        position: fixed;
        top: 120px;
        right: 16px;
        z-index: 1000;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 8px;
        padding: 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        color: #e2e8f0;
        min-width: 280px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      `;
      document.body.appendChild(container);
    }

    // Build the panel content
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.2);">
        <div style="font-weight: 600; font-size: 13px; color: #fbbf24;">⚙️ Runtime Fix Toggles</div>
        <button id="poseDebugRevertAll" style="
          padding: 4px 8px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
        ">Revert All</button>
      </div>
      
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">Basis & Mapping:</div>
        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
          <input type="checkbox" id="toggleSegPosStd" style="margin-right: 6px;">
          Use standard segPos (sin/-cos)
        </label>
        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
          <input type="checkbox" id="toggleSegPosAlt" style="margin-right: 6px;">
          Use alternate segPos (cos/sin)
        </label>
        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
          <input type="checkbox" id="toggleWithAXStd" style="margin-right: 6px;">
          Use standard withAX mapping
        </label>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">Joint Adjustments:</div>
        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
          <input type="checkbox" id="toggleNegateLowers" style="margin-right: 6px;">
          Negate lower joints (elbow/knee)
        </label>
        <label style="display: block; margin-bottom: 4px; cursor: pointer;">
          <input type="checkbox" id="toggleGlobalRotate90" style="margin-right: 6px;">
          +90° global joint rotation
        </label>
      </div>

      <div id="orderingStatus" style="
        padding: 8px;
        background: rgba(30, 41, 59, 0.5);
        border-radius: 4px;
        border-left: 3px solid #6b7280;
        margin-bottom: 8px;
      ">
        <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #94a3b8;">Y-Ordering Test:</div>
        <div id="orderingResult" style="font-size: 11px; color: #94a3b8;">Testing...</div>
        <div id="orderingPenalty" style="font-size: 10px; color: #6b7280; margin-top: 4px;"></div>
      </div>

      <div style="font-size: 10px; color: #6b7280; line-height: 1.4;">
        Expected: arm_L &lt; arm_R &lt; leg_L &lt; leg_R
      </div>
    `;

    return container;
  }

  /**
   * Update the ordering status display
   */
  function updateOrderingStatus() {
    const result = window.RUNTIME_FIXES.testOrdering();
    const statusEl = document.getElementById('orderingStatus');
    const resultEl = document.getElementById('orderingResult');
    const penaltyEl = document.getElementById('orderingPenalty');

    if (!statusEl || !resultEl || !penaltyEl) return;

    // Update border color based on pass/fail
    if (result.pass) {
      statusEl.style.borderLeftColor = '#10b981';
      resultEl.style.color = '#34d399';
      resultEl.textContent = '✓ PASS';
    } else {
      statusEl.style.borderLeftColor = '#ef4444';
      resultEl.style.color = '#f87171';
      resultEl.textContent = '✗ FAIL';
    }

    // Update penalty metric
    penaltyEl.textContent = `Penalty: ${result.penalty} | ${result.ordering}`;
    
    if (result.violations) {
      penaltyEl.title = result.violations.join(', ');
    }
  }

  /**
   * Wire up event handlers for the toggles
   */
  function wireUpToggles() {
    const revertBtn = document.getElementById('poseDebugRevertAll');
    if (revertBtn) {
      revertBtn.addEventListener('click', () => {
        // Uncheck all checkboxes
        currentState = {
          segPosStd: false,
          segPosAlt: false,
          withAXStd: false,
          negateLowers: false,
          globalRotate90: false
        };
        
        Object.keys(currentState).forEach(key => {
          const checkbox = document.getElementById('toggle' + key.charAt(0).toUpperCase() + key.slice(1));
          if (checkbox) checkbox.checked = false;
        });

        window.RUNTIME_FIXES.revertAll();
        updateOrderingStatus();
      });
    }

    // Helper to handle mutually exclusive segPos toggles
    const handleSegPosToggle = (activeKey) => {
      if (activeKey === 'segPosStd' && currentState.segPosStd) {
        currentState.segPosAlt = false;
        const altCheckbox = document.getElementById('toggleSegPosAlt');
        if (altCheckbox) altCheckbox.checked = false;
        window.RUNTIME_FIXES.toggleSegPosStd();
      } else if (activeKey === 'segPosAlt' && currentState.segPosAlt) {
        currentState.segPosStd = false;
        const stdCheckbox = document.getElementById('toggleSegPosStd');
        if (stdCheckbox) stdCheckbox.checked = false;
        window.RUNTIME_FIXES.toggleSegPosAlt();
      }
    };

    // Standard segPos toggle
    const segPosStdCheckbox = document.getElementById('toggleSegPosStd');
    if (segPosStdCheckbox) {
      segPosStdCheckbox.addEventListener('change', (e) => {
        currentState.segPosStd = e.target.checked;
        if (e.target.checked) {
          handleSegPosToggle('segPosStd');
        }
        updateOrderingStatus();
      });
    }

    // Alternate segPos toggle
    const segPosAltCheckbox = document.getElementById('toggleSegPosAlt');
    if (segPosAltCheckbox) {
      segPosAltCheckbox.addEventListener('change', (e) => {
        currentState.segPosAlt = e.target.checked;
        if (e.target.checked) {
          handleSegPosToggle('segPosAlt');
        }
        updateOrderingStatus();
      });
    }

    // Standard withAX toggle
    const withAXStdCheckbox = document.getElementById('toggleWithAXStd');
    if (withAXStdCheckbox) {
      withAXStdCheckbox.addEventListener('change', (e) => {
        currentState.withAXStd = e.target.checked;
        if (e.target.checked) {
          window.RUNTIME_FIXES.toggleWithAXStd();
        }
        updateOrderingStatus();
      });
    }

    // Negate lowers toggle
    const negateLowersCheckbox = document.getElementById('toggleNegateLowers');
    if (negateLowersCheckbox) {
      negateLowersCheckbox.addEventListener('change', (e) => {
        currentState.negateLowers = e.target.checked;
        if (e.target.checked) {
          window.RUNTIME_FIXES.toggleNegateLowers();
        } else {
          // If unchecking, we need to revert and reapply other toggles
          window.RUNTIME_FIXES.revertAll();
          reapplyToggles();
        }
        updateOrderingStatus();
      });
    }

    // Global rotate 90 toggle
    const globalRotate90Checkbox = document.getElementById('toggleGlobalRotate90');
    if (globalRotate90Checkbox) {
      globalRotate90Checkbox.addEventListener('change', (e) => {
        currentState.globalRotate90 = e.target.checked;
        if (e.target.checked) {
          window.RUNTIME_FIXES.toggleGlobalRotate90();
        } else {
          // If unchecking, we need to revert and reapply other toggles
          window.RUNTIME_FIXES.revertAll();
          reapplyToggles();
        }
        updateOrderingStatus();
      });
    }
  }

  /**
   * Reapply all currently enabled toggles (used after revert)
   */
  function reapplyToggles() {
    if (currentState.segPosStd) {
      window.RUNTIME_FIXES.toggleSegPosStd();
    }
    if (currentState.segPosAlt) {
      window.RUNTIME_FIXES.toggleSegPosAlt();
    }
    if (currentState.withAXStd) {
      window.RUNTIME_FIXES.toggleWithAXStd();
    }
    if (currentState.negateLowers) {
      window.RUNTIME_FIXES.toggleNegateLowers();
    }
    if (currentState.globalRotate90) {
      window.RUNTIME_FIXES.toggleGlobalRotate90();
    }
  }

  /**
   * Start polling for ordering test updates
   */
  function startPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
    }

    // Initial update
    updateOrderingStatus();

    // Poll every POLL_INTERVAL ms
    pollTimer = setInterval(() => {
      updateOrderingStatus();
    }, POLL_INTERVAL);
  }

  /**
   * Initialize the debug UI
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Wait a bit for the game to initialize
    setTimeout(() => {
      createDebugPanel();
      wireUpToggles();
      startPolling();
      window.__poseDebugUIInitialized = true;
      console.log('[pose-debug-ui] Runtime fix debug panel initialized');
    }, 100);
  }

  // Initialize
  init();
})();
