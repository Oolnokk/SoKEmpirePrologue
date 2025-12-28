import initArchTouchInput from '../js/arch-touch-input.js?v=1';
import {
  createHudLayoutController,
  DEFAULT_BOTTOM_BUTTON_ACTIONS,
  DEFAULT_BOTTOM_HUD_CONFIG,
  computeBottomHudConfig,
  DEFAULT_RESOURCE_BARS,
} from '../js/hud-layout.js?v=1';
import {
  collectResourceKeysFromPlayer,
  createResourceBarLayer,
  getComputedResourceBars,
  resolveResourceReading,
} from '../js/resource-bars.js?v=1';

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
const textFields = document.getElementById('textFields');
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
const resourceBarContainer = document.getElementById('resourceBars');
const resourceBarLayer = createResourceBarLayer(resourceBarContainer);
const hudTextContainer = document.getElementById('hudTextContainer');

const barOverlays = {};
const textOverlays = {};
let archHandle = null;
let gridSize = Number(gridSizeInput?.value) || 24;
let originalHudConfig = null;
let currentResourceBars = [];

const DEFAULT_ARCH_ANCHORS = {
  start: { x: 0.98, y: 0.94 },
  end: { x: 0.78, y: 0.86 },
};

const DEFAULT_ARCH_CONTAINER = {
  rotation: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const DEFAULT_TEXT_ELEMENT = {
  id: 'text-1',
  text: 'Sample Text',
  font: 'Khymeryyan Roman',
  fontSize: 32,
  color: '#ffffff',
  left: 100,
  top: 50,
  rotation: 0,
  scale: 1,
  orientation: 'horizontal',
};

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
  const resourceSrc = window.CONFIG.hud.resourceBars || {};
  const normalizedBars = getComputedResourceBars(resourceSrc).map((bar) => ({ ...bar, colors: { ...bar.colors } }));
  window.CONFIG.hud.resourceBars = {
    defaults: { ...(resourceSrc.defaults || {}) },
    bars: normalizedBars.length ? normalizedBars : clone(DEFAULT_RESOURCE_BARS),
  };
  window.CONFIG.hud.arch = window.CONFIG.hud.arch || {};
  window.CONFIG.hud.arch.arch = window.CONFIG.hud.arch.arch || {};
  const archCfg = window.CONFIG.hud.arch.arch;
  archCfg.start = archCfg.start || { ...DEFAULT_ARCH_ANCHORS.start };
  archCfg.end = archCfg.end || { ...DEFAULT_ARCH_ANCHORS.end };
  if (!Number.isFinite(archCfg.gridSnapPx)) {
    archCfg.gridSnapPx = gridSize;
  }

  // Initialize container transform
  window.CONFIG.hud.arch.container = window.CONFIG.hud.arch.container || {};
  const containerCfg = window.CONFIG.hud.arch.container;
  containerCfg.rotation = containerCfg.rotation ?? DEFAULT_ARCH_CONTAINER.rotation;
  containerCfg.scale = containerCfg.scale ?? DEFAULT_ARCH_CONTAINER.scale;
  containerCfg.offsetX = containerCfg.offsetX ?? DEFAULT_ARCH_CONTAINER.offsetX;
  containerCfg.offsetY = containerCfg.offsetY ?? DEFAULT_ARCH_CONTAINER.offsetY;

  window.CONFIG.hud.arch.buttons = Array.isArray(window.CONFIG.hud.arch.buttons)
    ? window.CONFIG.hud.arch.buttons
    : [];
  window.CONFIG.hud.textElements = Array.isArray(window.CONFIG.hud.textElements)
    ? window.CONFIG.hud.textElements
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

function setupSamplePlayerState() {
  window.GAME = window.GAME || {};
  window.GAME.FIGHTERS = window.GAME.FIGHTERS || {};
  window.GAME.FIGHTERS.player = window.GAME.FIGHTERS.player || {
    health: { current: 96, max: 120 },
    stamina: { current: 62, max: 120 },
    footing: 82,
    focus: { current: 44, max: 60 },
  };
}

ensureHudConfig();
setupGameInputStub();
setupSamplePlayerState();
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

function getResourceBars() {
  const bars = window.CONFIG?.hud?.resourceBars?.bars;
  return Array.isArray(bars) ? bars : [];
}

function findResourceBar(barId) {
  return getResourceBars().find((bar) => bar.id === barId);
}

function updateGridVisuals() {
  if (gridOverlay?.style) {
    gridOverlay.style.setProperty('--grid-size', `${gridSize}px`);
  }
  if (previewStage) {
    const width = Number(previewWidthInput?.value) || 960;
    previewStage.style.width = `${width}px`;
  }
  if (window.CONFIG?.hud?.arch?.arch) {
    window.CONFIG.hud.arch.arch.gridSnapPx = gridSize;
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
  const container = window.CONFIG.hud.arch.container || {};
  const fields = [
    { label: 'Start X (0-1)', key: 'start.x', value: arch.start?.x ?? DEFAULT_ARCH_ANCHORS.start.x, step: 0.01 },
    { label: 'Start Y (0-1)', key: 'start.y', value: arch.start?.y ?? DEFAULT_ARCH_ANCHORS.start.y, step: 0.01 },
    { label: 'End X (0-1)', key: 'end.x', value: arch.end?.x ?? DEFAULT_ARCH_ANCHORS.end.x, step: 0.01 },
    { label: 'End Y (0-1)', key: 'end.y', value: arch.end?.y ?? DEFAULT_ARCH_ANCHORS.end.y, step: 0.01 },
    { label: '─── Container ───', key: 'separator', value: '', disabled: true },
    { label: 'Rotation (deg)', key: 'container.rotation', value: container.rotation ?? 0, step: 5, min: -180, max: 180 },
    { label: 'Scale', key: 'container.scale', value: container.scale ?? 1, step: 0.05, min: 0.1, max: 3 },
    { label: 'Offset X (px)', key: 'container.offsetX', value: container.offsetX ?? 0, step: 10 },
    { label: 'Offset Y (px)', key: 'container.offsetY', value: container.offsetY ?? 0, step: 10 },
    { label: '─── Arch ───', key: 'separator2', value: '', disabled: true },
    { label: 'Radius (px)', key: 'radiusPx', value: arch.radiusPx ?? 180 },
    { label: 'Scale', key: 'scale', value: arch.scale ?? 1, step: 0.05, min: 0.25, max: 3 },
    { label: 'Button Size (px)', key: 'buttonSizePx', value: arch.buttonSizePx ?? 90 },
    { label: 'Default Gap (px)', key: 'defaultGapPx', value: arch.defaultGapPx ?? 36 },
  ];
  archFields.innerHTML = fields.map((field) => {
    if (field.key.startsWith('separator')) {
      return `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:11px;margin:8px 0 4px;border-top:1px solid var(--line);padding-top:8px;">${field.label}</div>`;
    }
    return `
    <label class="field">${field.label}
      <input type="number" data-arch-key="${field.key}" value="${field.value}" step="${field.step ?? 1}" min="${field.min ?? ''}" max="${field.max ?? ''}" ${field.disabled ? 'disabled' : ''}>
    </label>`;
  }).join('');
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
  let target = window.CONFIG.hud.arch;

  // Navigate to the correct object (arch.arch or arch.container)
  if (parts[0] === 'container') {
    if (!target.container) target.container = {};
    target = target.container;
    parts.shift(); // Remove 'container' from path
  } else {
    if (!target.arch) target.arch = {};
    target = target.arch;
  }

  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  target[parts[0]] = value;

  // Apply container transform
  applyArchContainerTransform();
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

function getTextElements() {
  const texts = window.CONFIG?.hud?.textElements;
  return Array.isArray(texts) ? texts : [];
}

function findTextElement(textId) {
  return getTextElements().find((text) => text.id === textId);
}

function renderTextElements() {
  if (!hudTextContainer) return;
  hudTextContainer.innerHTML = '';
  const texts = getTextElements();
  texts.forEach((spec) => {
    const el = document.createElement('div');
    el.className = 'hud-text-element';
    el.dataset.textId = spec.id;
    el.textContent = spec.text || '';
    el.style.cssText = `
      position: absolute;
      left: ${spec.left}px;
      top: ${spec.top}px;
      font-family: ${spec.font || 'Khymeryyan Roman'}, serif;
      font-size: ${spec.fontSize || 32}px;
      color: ${spec.color || '#ffffff'};
      transform: rotate(${spec.rotation || 0}deg) scale(${spec.scale || 1});
      writing-mode: ${spec.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb'};
    `;
    hudTextContainer.appendChild(el);
  });
}

function renderTextFields() {
  const texts = getTextElements();
  textFields.innerHTML = '';
  texts.forEach((spec, idx) => {
    const block = document.createElement('div');
    block.className = 'field';
    block.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <strong style="font-size:13px">${spec.id || `Text ${idx + 1}`}</strong>
        <button type="button" class="secondary" data-remove-text="${spec.id}">Remove</button>
      </div>
      <div class="field-grid" style="margin-top:6px;">
        <label class="field">Id<input type="text" data-text-index="${idx}" data-text-field="id" value="${spec.id}"></label>
        <label class="field">Text<input type="text" data-text-index="${idx}" data-text-field="text" value="${spec.text || ''}"></label>
        <label class="field">Font
          <select data-text-index="${idx}" data-text-field="font">
            <option value="Khymeryyan Roman" ${spec.font === 'Khymeryyan Roman' ? 'selected' : ''}>Khymeryyan Roman</option>
            <option value="Tankanscript" ${spec.font === 'Tankanscript' ? 'selected' : ''}>Tankanscript</option>
            <option value="Arial" ${spec.font === 'Arial' ? 'selected' : ''}>Arial</option>
          </select>
        </label>
        <label class="field">Font Size (px)<input type="number" data-text-index="${idx}" data-text-field="fontSize" value="${spec.fontSize || 32}"></label>
        <label class="field">Color<input type="text" data-text-index="${idx}" data-text-field="color" value="${spec.color || '#ffffff'}"></label>
        <label class="field">Left (px)<input type="number" data-text-index="${idx}" data-text-field="left" value="${spec.left}"></label>
        <label class="field">Top (px)<input type="number" data-text-index="${idx}" data-text-field="top" value="${spec.top}"></label>
        <label class="field">Rotation (deg)<input type="number" data-text-index="${idx}" data-text-field="rotation" value="${spec.rotation || 0}" step="5" min="-180" max="180"></label>
        <label class="field">Scale<input type="number" data-text-index="${idx}" data-text-field="scale" value="${spec.scale || 1}" step="0.1" min="0.1" max="5"></label>
        <label class="field">Orientation
          <select data-text-index="${idx}" data-text-field="orientation">
            <option value="horizontal" ${spec.orientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
            <option value="vertical" ${spec.orientation === 'vertical' ? 'selected' : ''}>Vertical</option>
          </select>
        </label>
      </div>
    `;
    textFields.appendChild(block);
  });

  const addRow = document.createElement('div');
  addRow.className = 'button-row';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add Text';
  addRow.appendChild(addBtn);
  textFields.appendChild(addRow);

  textFields.querySelectorAll('input, select').forEach((input) => {
    input.addEventListener('input', (event) => {
      const { textIndex, textField } = event.target.dataset;
      const idx = Number(textIndex);
      const textsRef = getTextElements();
      const text = textsRef[idx];
      if (!text) return;
      if (['left', 'top', 'fontSize', 'rotation', 'scale'].includes(textField)) {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        text[textField] = value;
      } else {
        text[textField] = event.target.value;
      }
      refreshPreview();
    });
  });

  textFields.querySelectorAll('button[data-remove-text]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const id = event.target.dataset.removeText;
      window.CONFIG.hud.textElements = getTextElements().filter((text) => text.id !== id);
      refreshPreview();
    });
  });

  addBtn.addEventListener('click', () => {
    const template = clone(DEFAULT_TEXT_ELEMENT);
    const suffix = Date.now().toString(36).slice(-4);
    template.id = `text-${suffix}`;
    window.CONFIG.hud.textElements.push(template);
    refreshPreview();
  });
}

function updateTextOverlays(texts = getTextElements()) {
  const activeIds = new Set();
  texts.forEach((spec) => {
    if (!spec?.id) return;
    let overlay = textOverlays[spec.id];
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'text-overlay';
      overlay.dataset.text = spec.id;
      const resize = document.createElement('div');
      resize.className = 'resize';
      const rotateHandle = document.createElement('div');
      rotateHandle.className = 'rotate-handle';
      rotateHandle.title = 'Drag to rotate';
      overlay.appendChild(resize);
      overlay.appendChild(rotateHandle);
      previewStage.appendChild(overlay);
      textOverlays[spec.id] = overlay;
      bindTextOverlay(overlay);
    }
    const textEl = hudTextContainer?.querySelector(`[data-text-id="${spec.id}"]`);
    if (textEl) {
      const rect = textEl.getBoundingClientRect();
      const stageRect = previewStage.getBoundingClientRect();
      overlay.style.left = `${spec.left}px`;
      overlay.style.top = `${spec.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    }
    activeIds.add(spec.id);
  });

  Object.keys(textOverlays).forEach((key) => {
    if (!activeIds.has(key)) {
      const overlay = textOverlays[key];
      if (overlay?.remove) overlay.remove();
      delete textOverlays[key];
    }
  });
}

function bindTextOverlay(overlay) {
  const resize = overlay.querySelector('.resize');
  const rotateHandle = overlay.querySelector('.rotate-handle');
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === rotateHandle) {
      startTextRotation(event, overlay);
    } else if (event.target === resize) {
      startTextResize(event, overlay);
    } else {
      startTextMove(event, overlay);
    }
  });
}

function startTextMove(event, overlay) {
  event.preventDefault();
  const textId = overlay.dataset.text;
  const startX = event.clientX;
  const startY = event.clientY;
  const textCfg = findTextElement(textId);
  if (!textCfg) return;
  const startLeft = textCfg.left;
  const startTop = textCfg.top;
  const onMove = (moveEvt) => {
    const dx = snap(moveEvt.clientX - startX);
    const dy = snap(moveEvt.clientY - startY);
    textCfg.left = clamp(startLeft + dx, -400, 1200);
    textCfg.top = clamp(startTop + dy, -200, 800);
    refreshPreview();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function startTextResize(event, overlay) {
  event.preventDefault();
  const textId = overlay.dataset.text;
  const startX = event.clientX;
  const startY = event.clientY;
  const textCfg = findTextElement(textId);
  if (!textCfg) return;
  const startScale = textCfg.scale || 1;
  const onMove = (moveEvt) => {
    const dx = moveEvt.clientX - startX;
    const dy = moveEvt.clientY - startY;
    const delta = Math.max(dx, dy);
    const newScale = Math.max(0.1, startScale + delta / 100);
    textCfg.scale = Math.round(newScale * 100) / 100;
    refreshPreview();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function startTextRotation(event, overlay) {
  event.preventDefault();
  const textId = overlay.dataset.text;
  const textCfg = findTextElement(textId);
  if (!textCfg) return;
  const rect = overlay.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
  const startRotation = textCfg.rotation || 0;
  const onMove = (moveEvt) => {
    const currentAngle = Math.atan2(moveEvt.clientY - centerY, moveEvt.clientX - centerX) * (180 / Math.PI);
    const deltaAngle = currentAngle - startAngle;
    let newRotation = startRotation + deltaAngle;
    newRotation = snap(newRotation / 5) * 5;
    newRotation = ((newRotation % 360) + 360) % 360;
    if (newRotation > 180) newRotation -= 360;
    textCfg.rotation = Math.round(newRotation);
    refreshPreview();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

function renderResourceFields() {
  const bars = getResourceBars();
  const resourceKeys = new Set([
    ...collectResourceKeysFromPlayer(window.GAME?.FIGHTERS?.player),
    ...bars.map((bar) => bar.resourceKey || bar.id || 'resource'),
  ]);

  resourceFields.innerHTML = '';
  bars.forEach((spec, idx) => {
    const keyOptions = Array.from(resourceKeys).map((key) => `<option value="${key}"></option>`).join('');
    const block = document.createElement('div');
    block.className = 'field';
    block.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <strong style="font-size:13px">${spec.label || spec.id || `Bar ${idx + 1}`}</strong>
        <button type="button" class="secondary" data-remove-bar="${spec.id}">Remove</button>
      </div>
      <div class="field-grid" style="margin-top:6px;">
        <label class="field">Id<input type="text" data-bar-index="${idx}" data-bar-field="id" value="${spec.id}"></label>
        <label class="field">Label<input type="text" data-bar-index="${idx}" data-bar-field="label" value="${spec.label || ''}"></label>
        <label class="field">Resource Key
          <input type="text" list="resource-key-${idx}" data-bar-index="${idx}" data-bar-field="resourceKey" value="${spec.resourceKey || spec.id || ''}">
          <datalist id="resource-key-${idx}">${keyOptions}</datalist>
        </label>
        <label class="field">Left (px)<input type="number" data-bar-index="${idx}" data-bar-field="left" value="${spec.left}"></label>
        <label class="field">Top (px)<input type="number" data-bar-index="${idx}" data-bar-field="top" value="${spec.top}"></label>
        <label class="field">Width (px)<input type="number" data-bar-index="${idx}" data-bar-field="width" value="${spec.width}"></label>
        <label class="field">Height (px)<input type="number" data-bar-index="${idx}" data-bar-field="height" value="${spec.height}"></label>
        <label class="field">Padding (px)<input type="number" data-bar-index="${idx}" data-bar-field="padding" value="${spec.padding}"></label>
        <label class="field">Radius (px)<input type="number" data-bar-index="${idx}" data-bar-field="radius" value="${spec.radius}"></label>
        <label class="field">Low Threshold (0-1)<input type="number" step="0.05" min="0" max="1" data-bar-index="${idx}" data-bar-field="lowThreshold" value="${spec.lowThreshold ?? 0}"></label>
      </div>
      <div class="field-grid" style="margin-top:8px;">
        <label class="field">Fill<input type="text" data-bar-index="${idx}" data-bar-color="fill" value="${spec.colors?.fill || ''}"></label>
        <label class="field">Low Fill<input type="text" data-bar-index="${idx}" data-bar-color="fillLow" value="${spec.colors?.fillLow || ''}"></label>
        <label class="field">Background<input type="text" data-bar-index="${idx}" data-bar-color="background" value="${spec.colors?.background || ''}"></label>
        <label class="field">Border<input type="text" data-bar-index="${idx}" data-bar-color="border" value="${spec.colors?.border || ''}"></label>
        <label class="field">Label Color<input type="text" data-bar-index="${idx}" data-bar-color="label" value="${spec.colors?.label || ''}"></label>
      </div>
    `;
    resourceFields.appendChild(block);
  });

  const addRow = document.createElement('div');
  addRow.className = 'button-row';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add Bar';
  addRow.appendChild(addBtn);
  resourceFields.appendChild(addRow);

  resourceFields.querySelectorAll('input[data-bar-field]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const { barIndex, barField } = event.target.dataset;
      const idx = Number(barIndex);
      const barsRef = getResourceBars();
      const bar = barsRef[idx];
      if (!bar) return;
      if (['left', 'top', 'width', 'height', 'padding', 'radius'].includes(barField)) {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        bar[barField] = value;
      } else if (barField === 'lowThreshold') {
        bar.lowThreshold = clamp(Number(event.target.value) || 0, 0, 1);
      } else {
        bar[barField] = event.target.value;
      }
      refreshPreview();
    });
  });

  resourceFields.querySelectorAll('input[data-bar-color]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const { barIndex, barColor } = event.target.dataset;
      const idx = Number(barIndex);
      const barsRef = getResourceBars();
      const bar = barsRef[idx];
      if (!bar) return;
      bar.colors = bar.colors || {};
      bar.colors[barColor] = event.target.value;
      refreshPreview();
    });
  });

  resourceFields.querySelectorAll('button[data-remove-bar]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const id = event.target.dataset.removeBar;
      window.CONFIG.hud.resourceBars.bars = getResourceBars().filter((bar) => bar.id !== id);
      refreshPreview();
    });
  });

  addBtn.addEventListener('click', () => {
    const template = clone(DEFAULT_RESOURCE_BARS[0]);
    const suffix = Date.now().toString(36).slice(-4);
    template.id = `resource-${suffix}`;
    template.label = template.label || template.id;
    template.resourceKey = template.resourceKey || template.id;
    window.CONFIG.hud.resourceBars.bars.push(template);
    refreshPreview();
  });
}

function applyArchContainerTransform() {
  const container = document.getElementById('archContainer');
  if (!container) return;

  const cfg = window.CONFIG.hud.arch.container || {};
  const rotation = cfg.rotation || 0;
  const scale = cfg.scale || 1;
  const offsetX = cfg.offsetX || 0;
  const offsetY = cfg.offsetY || 0;

  container.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale})`;
}

function updateArchContainerBounds() {
  const container = document.getElementById('archContainer');
  if (!container) return;

  // Remove existing bounds
  const existingBounds = container.querySelector('.arch-container-bounds');
  if (existingBounds) existingBounds.remove();

  // Add visual bounds for editor
  const bounds = document.createElement('div');
  bounds.className = 'arch-container-bounds';

  const label = document.createElement('div');
  label.className = 'arch-container-label';
  const cfg = window.CONFIG.hud.arch.container || {};
  label.textContent = `Arch Container: ${cfg.rotation || 0}° • ${(cfg.scale || 1).toFixed(2)}x • (${cfg.offsetX || 0}, ${cfg.offsetY || 0})`;
  bounds.appendChild(label);

  container.appendChild(bounds);
}

function refreshArchPreview() {
  if (archHandle?.destroy) archHandle.destroy();
  archHandle = initArchTouchInput({
    input: window.GAME?.input,
    enabled: window.CONFIG?.hud?.arch?.enabled !== false,
    config: window.CONFIG?.hud?.arch,
  });

  // Move the created arch elements into the archContainer
  const archContainer = document.getElementById('archContainer');
  const archHud = document.querySelector('.arch-hud');
  if (archContainer && archHud && archHud.parentNode !== archContainer) {
    // Clear any existing arch elements in the container
    archContainer.querySelectorAll('.arch-hud').forEach(el => el.remove());
    // Move the new arch into the container
    archContainer.appendChild(archHud);
  }

  applyArchContainerTransform();
  updateArchContainerBounds();
}

function updateOverlays(bars = currentResourceBars) {
  const stageRect = previewStage.getBoundingClientRect();
  const activeIds = new Set();
  bars.forEach((spec) => {
    if (!spec?.id) return;
    let overlay = barOverlays[spec.id];
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'bar-overlay';
      overlay.dataset.bar = spec.id;
      const resize = document.createElement('div');
      resize.className = 'resize';
      overlay.appendChild(resize);
      previewStage.appendChild(overlay);
      barOverlays[spec.id] = overlay;
      bindBarOverlay(overlay);
    }
    overlay.style.left = `${spec.left}px`;
    overlay.style.top = `${spec.top}px`;
    overlay.style.width = `${spec.width}px`;
    overlay.style.height = `${spec.height}px`;
    activeIds.add(spec.id);
  });

  Object.keys(barOverlays).forEach((key) => {
    if (!activeIds.has(key)) {
      const overlay = barOverlays[key];
      if (overlay?.remove) overlay.remove();
      delete barOverlays[key];
    }
  });

  positionArchHandles(stageRect);
}

function positionArchHandles(stageRect) {
  const arch = window.CONFIG.hud.arch.arch || {};
  const start = arch.start || {};
  const end = arch.end || {};
  const rect = stageRect || previewStage.getBoundingClientRect();
  placeHandle('arch-start', start.x ?? 0, start.y ?? 0, rect, 'Arch start point');
  placeHandle('arch-end', end.x ?? 0, end.y ?? 0, rect, 'Arch end point');
}

function placeHandle(id, normX, normY, rect, title = '') {
  let el = document.querySelector(`[data-handle="${id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'overlay-handle';
    el.dataset.handle = id;
    el.title = title;
    previewStage.appendChild(el);
    bindArchHandle(el);
  }
  const x = (normX || 0) * rect.width;
  const y = (normY || 0) * rect.height;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function bindArchHandle(el) {
  el.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = previewStage.getBoundingClientRect();
    const handleId = el.dataset.handle;
    const target = handleId === 'arch-end' ? 'end' : 'start';

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
  const barCfg = findResourceBar(bar);
  if (!barCfg) return;
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

function refreshResourceValues(bars = currentResourceBars) {
  const readings = {};
  const player = window.GAME?.FIGHTERS?.player;
  bars.forEach((bar) => {
    readings[bar.id] = resolveResourceReading(player, bar) || { ratio: 0, current: 0, max: 100, asPercent: true };
  });
  resourceBarLayer.updateAll(readings);
}

function refreshPreview() {
  hudLayout.refreshBottomHudConfig();
  currentResourceBars = hudLayout.refreshResourceBars();
  window.CONFIG.hud.resourceBars.bars = currentResourceBars.map((bar) => ({ ...bar, colors: { ...bar.colors } }));
  resourceBarLayer.setBars(currentResourceBars);
  refreshResourceValues(currentResourceBars);
  hudLayout.syncHudScaleFactors({ force: true });
  refreshArchPreview();
  renderTextElements();
  updateOverlays(currentResourceBars);
  updateTextOverlays();
  renderOutput();
}

function refreshAllFields() {
  renderBottomFields();
  renderButtonFields();
  renderArchFields();
  renderArchButtons();
  renderResourceFields();
  renderTextFields();
}

function renderOutput() {
  const hud = {
    bottomButtons: computeBottomHudConfig(),
    arch: window.CONFIG.hud.arch,
    resourceBars: {
      defaults: window.CONFIG.hud.resourceBars.defaults || {},
      bars: getComputedResourceBars(window.CONFIG.hud.resourceBars),
    },
    textElements: getTextElements(),
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
    refreshAllFields();
    refreshPreview();
  });
}

function init() {
  updateGridVisuals();
  bindButtonDrags();
  bindGridInputs();
  bindExportButtons();
  refreshAllFields();
  refreshPreview();
}

init();
