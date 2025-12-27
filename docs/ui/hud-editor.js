import initArchTouchInput from '../js/arch-touch-input.js?v=1';
import {
  createHudLayoutController,
  DEFAULT_BOTTOM_BUTTON_ACTIONS,
  DEFAULT_BOTTOM_HUD_CONFIG,
  DEFAULT_RESOURCE_BAR_CONFIG,
  computeBottomHudConfig,
  computeResourceBarConfig,
} from '../js/hud-layout.js?v=1';

const clone = (value) => (typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)));

const previewStage = document.getElementById('previewStage');
const gridOverlay = document.getElementById('gridOverlay');
const bottomFields = document.getElementById('bottomFields');
const buttonFields = document.getElementById('buttonFields');
const archFields = document.getElementById('archFields');
const archButtons = document.getElementById('archButtons');
const resourceFields = document.getElementById('resourceFields');
const output = document.getElementById('configOutput');
const copyBtn = document.getElementById('copyConfig');
const resetBtn = document.getElementById('resetConfig');
const gridSizeInput = document.getElementById('gridSize');
const previewWidthInput = document.getElementById('previewWidth');

const actionButtonsContainer = document.querySelector('.action-buttons');
const actionHudPath = actionButtonsContainer?.querySelector('.action-hud-path');
const actionHudSvg = actionButtonsContainer?.querySelector('.action-hud-bg');
const actionButtonRefs = {
  jump: document.getElementById('btnJump'),
  attackA: document.getElementById('btnAttackA'),
  attackB: document.getElementById('btnAttackB'),
  attackC: document.getElementById('btnAttackC'),
};

const barOverlays = {};
let archHandle = null;
let gridSize = Number(gridSizeInput?.value) || 24;
let originalHudConfig = null;

function ensureHudConfig() {
  window.CONFIG = window.CONFIG || {};
  window.CONFIG.hud = window.CONFIG.hud || {};
  window.CONFIG.hud.bottomButtons = window.CONFIG.hud.bottomButtons || {};
  window.CONFIG.hud.bottomButtons.actions = {
    ...DEFAULT_BOTTOM_BUTTON_ACTIONS,
    ...(window.CONFIG.hud.bottomButtons.actions || {}),
  };
  window.CONFIG.hud.bottomButtons.buttons = {
    ...DEFAULT_BOTTOM_HUD_CONFIG.buttons,
    ...(window.CONFIG.hud.bottomButtons.buttons || {}),
  };
  window.CONFIG.hud.resourceBars = window.CONFIG.hud.resourceBars || {};
  ['health', 'stamina', 'footing'].forEach((key) => {
    window.CONFIG.hud.resourceBars[key] = {
      ...DEFAULT_RESOURCE_BAR_CONFIG[key],
      ...(window.CONFIG.hud.resourceBars[key] || {}),
    };
  });
  window.CONFIG.hud.arch = window.CONFIG.hud.arch || {};
  window.CONFIG.hud.arch.arch = window.CONFIG.hud.arch.arch || {};
  window.CONFIG.hud.arch.buttons = Array.isArray(window.CONFIG.hud.arch.buttons)
    ? window.CONFIG.hud.arch.buttons
    : [];
}

function setupGameInputStub() {
  window.GAME = window.GAME || {};
  window.GAME.input = window.GAME.input || {
    jump: false,
    buttonA: { down: false },
    buttonB: { down: false },
    buttonC: { down: false },
    context: { down: false },
  };
}

ensureHudConfig();
setupGameInputStub();
originalHudConfig = clone(window.CONFIG.hud);

const hudLayout = createHudLayoutController({
  actionButtonRefs,
  actionHudPath,
  actionHudSvg,
  resolveActorScale: () => 1,
});

function snap(value) {
  if (!gridSize || !Number.isFinite(gridSize)) return value;
  return Math.round(value / gridSize) * gridSize;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateGridVisuals() {
  if (gridOverlay?.style) {
    gridOverlay.style.setProperty('--grid-size', `${gridSize}px`);
  }
  if (previewStage) {
    const width = Number(previewWidthInput?.value) || 960;
    previewStage.style.width = `${width}px`;
  }
}

function renderBottomFields() {
  const cfg = window.CONFIG.hud.bottomButtons;
  const fields = [
    { label: 'Width (px)', key: 'width', value: cfg.width ?? DEFAULT_BOTTOM_HUD_CONFIG.width, min: 120, max: 900 },
    { label: 'Height (px)', key: 'height', value: cfg.height ?? DEFAULT_BOTTOM_HUD_CONFIG.height, min: 60, max: 400 },
    { label: 'Edge Height', key: 'edgeHeight', value: cfg.edgeHeight ?? DEFAULT_BOTTOM_HUD_CONFIG.edgeHeight, min: 10, max: 400 },
    { label: 'Apex Height', key: 'apexHeight', value: cfg.apexHeight ?? DEFAULT_BOTTOM_HUD_CONFIG.apexHeight, min: 10, max: 600 },
    { label: 'Offset Y', key: 'offsetY', value: cfg.offsetY ?? 0, min: -200, max: 320 },
    { label: 'Scale', key: 'scale', value: cfg.scale ?? 1, step: 0.05, min: 0.3, max: 2.5 },
  ];
  bottomFields.innerHTML = fields.map((field) => `
    <label class="field">${field.label}
      <input type="number" data-bottom-key="${field.key}" value="${field.value}" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}">
    </label>
  `).join('');

  const scaleWithActorField = document.createElement('label');
  scaleWithActorField.className = 'field';
  scaleWithActorField.innerHTML = `Scale with Actor
    <input type="checkbox" data-bottom-key="scaleWithActor" ${cfg.scaleWithActor !== false ? 'checked' : ''}>`;
  bottomFields.appendChild(scaleWithActorField);

  bottomFields.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const key = event.target.dataset.bottomKey;
      const raw = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
      if (key === 'scaleWithActor') {
        window.CONFIG.hud.bottomButtons.scaleWithActor = !!raw;
      } else if (Number.isFinite(raw)) {
        window.CONFIG.hud.bottomButtons[key] = raw;
      }
      refreshPreview();
    });
  });
}

function buildActionOptions() {
  const fromInput = window.GAME?.input ? Object.keys(window.GAME.input) : [];
  const fromArch = (window.CONFIG.hud.arch.buttons || []).map((btn) => btn.action).filter(Boolean);
  const seed = ['jump', 'buttonA', 'buttonB', 'buttonC', 'context'];
  return Array.from(new Set([...seed, ...fromInput, ...fromArch]));
}

function renderButtonFields() {
  const cfg = window.CONFIG.hud.bottomButtons.buttons;
  const actions = window.CONFIG.hud.bottomButtons.actions;
  const options = buildActionOptions();
  buttonFields.innerHTML = '';
  Object.entries(cfg).forEach(([key, spec]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    wrapper.innerHTML = `
      <strong style="font-size:13px">${key}</strong>
      <div class="field-grid" style="margin-top:6px;">
        <label class="field">Left (%)<input type="number" data-button-key="${key}" data-field="left" value="${spec.left ?? ''}"></label>
        <label class="field">Top (%)<input type="number" data-button-key="${key}" data-field="top" value="${spec.top ?? ''}"></label>
        <label class="field">Rotate (deg)<input type="number" data-button-key="${key}" data-field="rotateDeg" value="${spec.rotateDeg ?? spec.rotate ?? 0}"></label>
        <label class="field">Action
          <select data-action-key="${key}">
            ${options.map((opt) => `<option value="${opt}" ${actions[key] === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        </label>
      </div>
    `;
    buttonFields.appendChild(wrapper);
  });

  buttonFields.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const { buttonKey, field } = event.target.dataset;
      const value = Number(event.target.value);
      if (!window.CONFIG.hud.bottomButtons.buttons[buttonKey]) return;
      if (field === 'rotateDeg') {
        window.CONFIG.hud.bottomButtons.buttons[buttonKey].rotateDeg = value;
      } else if (Number.isFinite(value)) {
        window.CONFIG.hud.bottomButtons.buttons[buttonKey][field] = value;
      }
      refreshPreview();
    });
  });

  buttonFields.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', (event) => {
      const key = event.target.dataset.actionKey;
      window.CONFIG.hud.bottomButtons.actions[key] = event.target.value;
    });
  });
}

function renderArchFields() {
  const arch = window.CONFIG.hud.arch.arch || {};
  const fields = [
    { label: 'Start X (0-1)', key: 'start.x', value: arch.start?.x ?? 0.1 },
    { label: 'Start Y (0-1)', key: 'start.y', value: arch.start?.y ?? 0.75 },
    { label: 'End X (0-1)', key: 'end.x', value: arch.end?.x ?? 0.25 },
    { label: 'End Y (0-1)', key: 'end.y', value: arch.end?.y ?? 0.9 },
    { label: 'Radius (px)', key: 'radiusPx', value: arch.radiusPx ?? 180 },
    { label: 'Scale', key: 'scale', value: arch.scale ?? 1, step: 0.05, min: 0.25, max: 3 },
    { label: 'Button Size (px)', key: 'buttonSizePx', value: arch.buttonSizePx ?? 90 },
    { label: 'Default Gap (px)', key: 'defaultGapPx', value: arch.defaultGapPx ?? 36 },
  ];
  archFields.innerHTML = fields.map((field) => `
    <label class="field">${field.label}
      <input type="number" data-arch-key="${field.key}" value="${field.value}" step="${field.step ?? 1}" min="${field.min ?? ''}" max="${field.max ?? ''}">
    </label>
  `).join('');
  const rotateField = document.createElement('label');
  rotateField.className = 'field';
  rotateField.innerHTML = `Rotate with Arch <input type="checkbox" data-arch-toggle="rotateWithArch" ${arch.rotateWithArch !== false ? 'checked' : ''}>`;
  const flipField = document.createElement('label');
  flipField.className = 'field';
  flipField.innerHTML = `Flip Vertical <input type="checkbox" data-arch-toggle="flipVertical" ${arch.flipVertical !== false ? 'checked' : ''}>`;
  archFields.appendChild(rotateField);
  archFields.appendChild(flipField);

  archFields.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const key = event.target.dataset.archKey;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      setArchValue(key, value);
      refreshPreview();
    });
  });

  archFields.querySelectorAll('input[type="checkbox"]').forEach((toggle) => {
    toggle.addEventListener('change', (event) => {
      const key = event.target.dataset.archToggle;
      window.CONFIG.hud.arch.arch[key] = event.target.checked;
      refreshPreview();
    });
  });
}

function setArchValue(path, value) {
  const parts = path.split('.');
  let target = window.CONFIG.hud.arch.arch;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  target[parts[0]] = value;
}

function renderArchButtons() {
  const buttons = window.CONFIG.hud.arch.buttons || [];
  const options = buildActionOptions();
  archButtons.innerHTML = buttons.map((btn, idx) => `
    <label class="field">${btn.id || `Button ${idx + 1}`}
      <select data-arch-button="${idx}">
        ${options.map((opt) => `<option value="${opt}" ${btn.action === opt ? 'selected' : ''}>${opt}</option>`).join('')}
      </select>
    </label>
  `).join('');

  archButtons.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', (event) => {
      const idx = Number(event.target.dataset.archButton);
      if (!Number.isInteger(idx) || !buttons[idx]) return;
      buttons[idx].action = event.target.value;
    });
  });
}

function renderResourceFields() {
  const cfg = window.CONFIG.hud.resourceBars;
  resourceFields.innerHTML = '';
  Object.entries(cfg).forEach(([key, spec]) => {
    const block = document.createElement('div');
    block.className = 'field';
    block.innerHTML = `
      <strong style="font-size:13px">${key}</strong>
      <div class="field-grid" style="margin-top:6px;">
        <label class="field">Left (px)<input type="number" data-bar="${key}" data-bar-field="left" value="${spec.left}"></label>
        <label class="field">Top (px)<input type="number" data-bar="${key}" data-bar-field="top" value="${spec.top}"></label>
        <label class="field">Width (px)<input type="number" data-bar="${key}" data-bar-field="width" value="${spec.width}"></label>
        <label class="field">Height (px)<input type="number" data-bar="${key}" data-bar-field="height" value="${spec.height}"></label>
        <label class="field">Padding (px)<input type="number" data-bar="${key}" data-bar-field="padding" value="${spec.padding}"></label>
        <label class="field">Radius (px)<input type="number" data-bar="${key}" data-bar-field="radius" value="${spec.radius}"></label>
      </div>
    `;
    resourceFields.appendChild(block);
  });

  resourceFields.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const { bar, barField } = event.target.dataset;
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || !window.CONFIG.hud.resourceBars[bar]) return;
      window.CONFIG.hud.resourceBars[bar][barField] = value;
      refreshPreview();
    });
  });
}

function refreshArchPreview() {
  if (archHandle?.destroy) archHandle.destroy();
  archHandle = initArchTouchInput({
    input: window.GAME?.input,
    enabled: window.CONFIG?.hud?.arch?.enabled !== false,
    config: window.CONFIG?.hud?.arch,
  });
}

function updateOverlays() {
  const bars = computeResourceBarConfig();
  const stageRect = previewStage.getBoundingClientRect();
  Object.entries(bars).forEach(([key, spec]) => {
    let overlay = barOverlays[key];
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bar-overlay';
      overlay.dataset.bar = key;
      const resize = document.createElement('div');
      resize.className = 'resize';
      overlay.appendChild(resize);
      previewStage.appendChild(overlay);
      barOverlays[key] = overlay;
      bindBarOverlay(overlay);
    }
    overlay.style.left = `${spec.left}px`;
    overlay.style.top = `${spec.top}px`;
    overlay.style.width = `${spec.width}px`;
    overlay.style.height = `${spec.height}px`;
  });

  positionArchHandles(stageRect);
}

function positionArchHandles(stageRect) {
  const arch = window.CONFIG.hud.arch.arch || {};
  const start = arch.start || {};
  const end = arch.end || {};
  const rect = stageRect || previewStage.getBoundingClientRect();
  placeHandle('arch-start', start.x ?? 0, start.y ?? 0, rect);
  placeHandle('arch-end', end.x ?? 0, end.y ?? 0, rect);
}

function placeHandle(id, normX, normY, rect) {
  let el = document.querySelector(`[data-handle="${id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay-handle';
    el.dataset.handle = id;
    previewStage.appendChild(el);
    bindArchHandle(el);
  }
  const x = (normX || 0) * rect.width;
  const y = (normY || 0) * rect.height;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function bindButtonDrags() {
  Object.entries(actionButtonRefs).forEach(([key, el]) => {
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const rect = actionButtonsContainer.getBoundingClientRect();
      const onMove = (moveEvt) => {
        const relX = snap(moveEvt.clientX - rect.left);
        const relY = snap(moveEvt.clientY - rect.top);
        const pctX = clamp((relX / rect.width) * 100, 0, 100);
        const pctY = clamp((relY / rect.height) * 100, 0, 100);
        window.CONFIG.hud.bottomButtons.buttons[key].left = pctX;
        window.CONFIG.hud.bottomButtons.buttons[key].top = pctY;
        refreshPreview();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    });
  });
}

function bindArchHandle(el) {
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const rect = previewStage.getBoundingClientRect();
    const target = el.dataset.handle === 'arch-start' ? 'start' : 'end';
    const onMove = (moveEvt) => {
      const normX = clamp(snap(moveEvt.clientX - rect.left) / rect.width, 0, 1);
      const normY = clamp(snap(moveEvt.clientY - rect.top) / rect.height, 0, 1);
      window.CONFIG.hud.arch.arch[target] = window.CONFIG.hud.arch.arch[target] || {};
      window.CONFIG.hud.arch.arch[target].x = normX;
      window.CONFIG.hud.arch.arch[target].y = normY;
      refreshPreview();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });
}

function bindBarOverlay(overlay) {
  const resize = overlay.querySelector('.resize');
  let mode = 'move';
  overlay.addEventListener('pointerdown', (event) => {
    mode = event.target === resize ? 'resize' : 'move';
    startBarInteraction(event, overlay, mode);
  });
}

function startBarInteraction(event, overlay, mode) {
  event.preventDefault();
  const bar = overlay.dataset.bar;
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = overlay.getBoundingClientRect();
  const barCfg = window.CONFIG.hud.resourceBars[bar];
  const onMove = (moveEvt) => {
    const dx = snap(moveEvt.clientX - startX);
    const dy = snap(moveEvt.clientY - startY);
    if (mode === 'move') {
      barCfg.left = clamp((startRect.left - previewStage.getBoundingClientRect().left) + dx, -400, 1200);
      barCfg.top = clamp((startRect.top - previewStage.getBoundingClientRect().top) + dy, -200, 800);
    } else {
      barCfg.width = Math.max(20, startRect.width + dx);
      barCfg.height = Math.max(6, startRect.height + dy);
    }
    refreshPreview();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function refreshPreview() {
  hudLayout.refreshBottomHudConfig();
  hudLayout.refreshResourceBars();
  hudLayout.syncHudScaleFactors({ force: true });
  refreshArchPreview();
  updateOverlays();
  renderBottomFields();
  renderButtonFields();
  renderArchFields();
  renderArchButtons();
  renderResourceFields();
  renderOutput();
}

function renderOutput() {
  const hud = {
    bottomButtons: computeBottomHudConfig(),
    arch: window.CONFIG.hud.arch,
    resourceBars: computeResourceBarConfig(),
    enemyIndicators: window.CONFIG.hud.enemyIndicators,
  };
  output.value = JSON.stringify(hud, null, 2);
}

function bindGridInputs() {
  gridSizeInput?.addEventListener('input', () => {
    gridSize = Math.max(2, Number(gridSizeInput.value) || gridSize);
    updateGridVisuals();
    updateOverlays();
  });
  previewWidthInput?.addEventListener('input', () => {
    updateGridVisuals();
    refreshPreview();
  });
}

function bindExportButtons() {
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1500);
    } catch (err) {
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1500);
      console.error(err);
    }
  });

  resetBtn?.addEventListener('click', () => {
    window.CONFIG.hud = clone(originalHudConfig || window.CONFIG.hud);
    ensureHudConfig();
    refreshPreview();
  });
}

function init() {
  updateGridVisuals();
  hudLayout.refreshResourceBars();
  hudLayout.refreshBottomHudConfig();
  bindButtonDrags();
  bindGridInputs();
  bindExportButtons();
  refreshPreview();
}

init();
