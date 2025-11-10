import { initFighters } from './fighter.js?v=6';
import { renderAll } from './render.js?v=4';
import { initSprites, renderSprites } from './sprites.js?v=8';
import { COSMETIC_SLOTS, getRegisteredCosmeticLibrary } from './cosmetics.js?v=1';

const CONFIG = window.CONFIG || {};
const GAME = (window.GAME ||= {});
const editorState = (GAME.editorState ||= {
  slotOverrides: {},
  overlayHistory: [],
  activeSlot: null
});

const canvas = document.getElementById('cosmeticCanvas');
const ctx = canvas?.getContext('2d');

const fighterSelect = document.getElementById('fighterSelect');
const slotContainer = document.getElementById('cosmeticSlotRows');
const styleInspector = document.getElementById('styleInspector');
const stylePartSelect = document.getElementById('stylePartSelect');
const styleFields = document.getElementById('styleFields');
const styleHeader = document.getElementById('styleActiveSlot');
const styleResetBtn = document.getElementById('resetPartOverrides');
const styleSlotResetBtn = document.getElementById('resetSlotOverrides');
const bucketToggle = document.getElementById('bucketToggle');
const bucketColorInput = document.getElementById('bucketColor');
const bucketHint = document.getElementById('bucketHint');
const bucketUndoBtn = document.getElementById('bucketUndo');
const bucketClearBtn = document.getElementById('bucketClear');
const statusEl = document.getElementById('editorStatus');

if (!canvas || !ctx){
  throw new Error('Cosmetic editor preview canvas is unavailable');
}

function deepClone(value){
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err){
    return value;
  }
}

function ensureOverlay(){
  if (!editorState.overlayCanvas){
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const overlayCtx = overlayCanvas.getContext('2d');
    editorState.overlayCanvas = overlayCanvas;
    editorState.overlayCtx = overlayCtx;
    editorState.overlayHistory = [];
    captureOverlaySnapshot();
  }
  return editorState.overlayCanvas;
}

function captureOverlaySnapshot(){
  const overlayCtx = editorState.overlayCtx;
  if (!overlayCtx) return;
  const data = overlayCtx.getImageData(0, 0, canvas.width, canvas.height);
  const clone = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  editorState.overlayHistory.push(clone);
  if (editorState.overlayHistory.length > 20){
    editorState.overlayHistory.shift();
  }
  updateUndoButtonState();
}

function restoreOverlayFromSnapshot(snapshot){
  const overlayCtx = editorState.overlayCtx;
  if (!overlayCtx || !snapshot) return;
  overlayCtx.putImageData(snapshot, 0, 0);
}

function undoOverlay(){
  const history = editorState.overlayHistory;
  if (!history || history.length <= 1) return;
  history.pop();
  const previous = history[history.length - 1];
  restoreOverlayFromSnapshot(previous);
  updateUndoButtonState();
}

function clearOverlay(){
  ensureOverlay();
  if (!editorState.overlayCtx) return;
  editorState.overlayCtx.clearRect(0, 0, canvas.width, canvas.height);
  editorState.overlayHistory = [];
  captureOverlaySnapshot();
}

function updateUndoButtonState(){
  if (!bucketUndoBtn) return;
  const hasUndo = (editorState.overlayHistory?.length || 0) > 1;
  bucketUndoBtn.disabled = !hasUndo;
}

function showStatus(message, { tone = 'info', timeout = 1800 } = {}){
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.tone = tone;
  if (timeout > 0){
    window.clearTimeout(editorState._statusTimer);
    editorState._statusTimer = window.setTimeout(()=>{
      if (statusEl.dataset.tone === tone){
        statusEl.textContent = '';
        delete statusEl.dataset.tone;
      }
    }, timeout);
  }
}

function parseHexColor(value){
  if (!value) return null;
  const trimmed = value.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (hex.length !== 3 && hex.length !== 6) return null;
  const chars = hex.length === 3
    ? hex.split('').map((ch)=> ch + ch)
    : [hex.slice(0,2), hex.slice(2,4), hex.slice(4,6)];
  const nums = chars.map((pair)=> Number.parseInt(pair, 16));
  if (nums.some((n)=> Number.isNaN(n))) return null;
  return { r: nums[0], g: nums[1], b: nums[2], a: 255 };
}

function applyBucketFill(x, y, rgba){
  ensureOverlay();
  const overlayCtx = editorState.overlayCtx;
  if (!overlayCtx || !ctx) return;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  let baseData;
  let overlayData;
  try {
    baseData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    overlayData = overlayCtx.getImageData(0, 0, canvas.width, canvas.height);
  } catch (err){
    console.warn('[cosmetic-editor] Bucket fill failed to access pixel data', err);
    showStatus('Unable to bucket fill due to browser security (CORS) restrictions.', { tone: 'error', timeout: 4200 });
    return;
  }
  const offset = (y * canvas.width + x) * 4;
  const target = baseData.data.slice(offset, offset + 4);
  if (target[3] === 0){
    showStatus('Clicked transparent pixel – nothing to fill.', { tone: 'warn' });
    return;
  }

  captureOverlaySnapshot();

  const stack = [[x, y]];
  const visited = new Uint8Array(canvas.width * canvas.height);
  const tolerance = 48;
  let painted = false;

  function matches(ix){
    const dr = Math.abs(baseData.data[ix] - target[0]);
    const dg = Math.abs(baseData.data[ix + 1] - target[1]);
    const db = Math.abs(baseData.data[ix + 2] - target[2]);
    const da = Math.abs(baseData.data[ix + 3] - target[3]);
    return dr <= tolerance && dg <= tolerance && db <= tolerance && da <= 64;
  }

  while (stack.length){
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const idx = py * canvas.width + px;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const baseIdx = idx * 4;
    if (!matches(baseIdx)) continue;

    overlayData.data[baseIdx] = rgba.r;
    overlayData.data[baseIdx + 1] = rgba.g;
    overlayData.data[baseIdx + 2] = rgba.b;
    overlayData.data[baseIdx + 3] = rgba.a;
    painted = true;

    stack.push([px + 1, py]);
    stack.push([px - 1, py]);
    stack.push([px, py + 1]);
    stack.push([px, py - 1]);
  }

  if (!painted){
    editorState.overlayHistory.pop();
    updateUndoButtonState();
    showStatus('No similar pixels found to fill.', { tone: 'warn' });
    return;
  }

  try {
    overlayCtx.putImageData(overlayData, 0, 0);
  } catch (err){
    console.warn('[cosmetic-editor] Failed to apply bucket fill', err);
    editorState.overlayHistory.pop();
    updateUndoButtonState();
    showStatus('Failed to update paint layer.', { tone: 'error' });
    return;
  }
  updateUndoButtonState();
}

function normalizeSlotEntry(entry){
  if (!entry) return null;
  if (typeof entry === 'string') return { id: entry };
  if (entry && typeof entry === 'object'){
    const id = entry.id || entry.cosmeticId || entry.item || entry.name;
    if (!id) return null;
    return { ...entry, id };
  }
  return null;
}

function setSelectedCosmetics(slots){
  const slotMap = {};
  for (const slot of COSMETIC_SLOTS){
    const value = normalizeSlotEntry(slots?.[slot]);
    if (value){
      slotMap[slot] = deepClone(value);
    }
  }
  GAME.selectedCosmetics = { slots: slotMap };
}

function updateSlotSelectsFromState(){
  const slots = GAME.selectedCosmetics?.slots || {};
  for (const [slot, row] of slotRows){
    const entry = normalizeSlotEntry(slots[slot]);
    const id = entry?.id || '';
    row.select.value = id;
    row.element.dataset.active = editorState.activeSlot === slot ? 'true' : 'false';
  }
}

function cleanupEmptyOverrides(slot){
  const slotOverride = editorState.slotOverrides?.[slot];
  if (!slotOverride) return;
  if (slotOverride.parts){
    for (const [partKey, partOverride] of Object.entries(slotOverride.parts)){
      const spriteStyle = partOverride?.spriteStyle;
      const xform = spriteStyle?.xform?.[partKey];
      if (xform && Object.keys(xform).length === 0){
        delete spriteStyle.xform[partKey];
      }
      if (spriteStyle?.xform && Object.keys(spriteStyle.xform).length === 0){
        delete spriteStyle.xform;
      }
      if (spriteStyle && Object.keys(spriteStyle).length === 0){
        delete partOverride.spriteStyle;
      }
      if (partOverride && Object.keys(partOverride).length === 0){
        delete slotOverride.parts[partKey];
      }
    }
    if (Object.keys(slotOverride.parts).length === 0){
      delete slotOverride.parts;
    }
  }
  if (slotOverride.spriteStyle && Object.keys(slotOverride.spriteStyle).length === 0){
    delete slotOverride.spriteStyle;
  }
  if (slotOverride.anchor && Object.keys(slotOverride.anchor).length === 0){
    delete slotOverride.anchor;
  }
  if (slotOverride.warp && Object.keys(slotOverride.warp).length === 0){
    delete slotOverride.warp;
  }
  if (slotOverride.hsv && Object.keys(slotOverride.hsv).length === 0){
    delete slotOverride.hsv;
  }
  if (Object.keys(slotOverride).length === 0){
    delete editorState.slotOverrides[slot];
  }
}

function setSlotSelection(slot, cosmeticId){
  const selection = (GAME.selectedCosmetics ||= { slots: {} });
  if (!selection.slots) selection.slots = {};
  if (!cosmeticId){
    selection.slots[slot] = null;
    delete editorState.slotOverrides[slot];
  } else {
    const existing = normalizeSlotEntry(selection.slots[slot]) || {};
    selection.slots[slot] = { ...existing, id: cosmeticId };
    delete editorState.slotOverrides[slot];
  }
  cleanupEmptyOverrides(slot);
  if (editorState.activeSlot === slot){
    showStyleInspector(slot);
  }
}

function resetSlotOverrides(slot){
  if (!slot) return;
  delete editorState.slotOverrides[slot];
  if (editorState.activeSlot === slot){
    showStyleInspector(slot);
  }
}

function resetPartOverrides(slot, partKey){
  if (!slot || !partKey) return;
  const slotOverride = editorState.slotOverrides?.[slot];
  if (!slotOverride?.parts) return;
  delete slotOverride.parts[partKey];
  cleanupEmptyOverrides(slot);
  if (editorState.activeSlot === slot){
    showStyleInspector(slot);
  }
}

function ensurePartOverride(slot, partKey){
  const slotOverride = (editorState.slotOverrides[slot] ||= { parts: {} });
  slotOverride.parts ||= {};
  const partOverride = (slotOverride.parts[partKey] ||= {});
  partOverride.spriteStyle ||= {};
  partOverride.spriteStyle.xform ||= {};
  partOverride.spriteStyle.xform[partKey] ||= {};
  return partOverride.spriteStyle.xform[partKey];
}

function applyStyleValue(slot, partKey, field, rawValue){
  const xform = ensurePartOverride(slot, partKey);
  if (rawValue === '' || rawValue == null){
    delete xform[field];
  } else {
    const num = Number(rawValue);
    if (Number.isFinite(num)){
      xform[field] = num;
    } else {
      delete xform[field];
    }
  }
  cleanupEmptyOverrides(slot);
}

function getBaseSpriteStyle(cosmetic, partKey){
  const part = cosmetic?.parts?.[partKey];
  if (!part) return {};
  const style = part.spriteStyle || {};
  const base = style.base || {};
  const xform = base.xform || {};
  return xform[partKey] || {};
}

function buildStyleFields(slot, cosmetic, partKey){
  styleFields.innerHTML = '';
  if (!slot || !cosmetic || !partKey){
    const p = document.createElement('p');
    p.textContent = 'Select a cosmetic part to edit sprite style.';
    styleFields.appendChild(p);
    return;
  }
  const baseXform = getBaseSpriteStyle(cosmetic, partKey);
  const current = editorState.slotOverrides?.[slot]?.parts?.[partKey]?.spriteStyle?.xform?.[partKey] || {};
  const fields = [
    { key: 'ax', label: 'Offset X (ax)', step: 0.01 },
    { key: 'ay', label: 'Offset Y (ay)', step: 0.01 },
    { key: 'scaleX', label: 'Scale X', step: 0.01 },
    { key: 'scaleY', label: 'Scale Y', step: 0.01 }
  ];
  for (const field of fields){
    const wrapper = document.createElement('label');
    wrapper.className = 'style-field';
    const span = document.createElement('span');
    span.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(field.step);
    input.value = current[field.key] != null ? current[field.key] : '';
    if (baseXform[field.key] != null){
      input.placeholder = String(baseXform[field.key]);
    }
    input.addEventListener('input', (event)=>{
      applyStyleValue(slot, partKey, field.key, event.target.value);
    });
    wrapper.appendChild(span);
    wrapper.appendChild(input);
    if (baseXform[field.key] != null){
      const hint = document.createElement('span');
      hint.className = 'style-field__hint';
      hint.textContent = `Base: ${baseXform[field.key]}`;
      wrapper.appendChild(hint);
    }
    styleFields.appendChild(wrapper);
  }
}

function showStyleInspector(slot){
  editorState.activeSlot = slot;
  updateSlotSelectsFromState();
  if (!slot){
    styleInspector.dataset.active = 'false';
    styleFields.innerHTML = '<p>Select a cosmetic slot to edit sprite style overrides.</p>';
    stylePartSelect.innerHTML = '';
    styleHeader.textContent = 'No slot selected';
    return;
  }
  const library = getRegisteredCosmeticLibrary();
  const row = slotRows.get(slot);
  const cosmeticId = row?.select?.value || '';
  styleHeader.textContent = `Slot: ${slot}`;
  if (!cosmeticId){
    styleInspector.dataset.active = 'true';
    stylePartSelect.innerHTML = '';
    styleFields.innerHTML = '<p>Select a cosmetic for this slot to enable style editing.</p>';
    return;
  }
  const cosmetic = library[cosmeticId];
  if (!cosmetic){
    styleInspector.dataset.active = 'true';
    stylePartSelect.innerHTML = '';
    styleFields.innerHTML = `<p>Cosmetic \"${cosmeticId}\" is not available in the library.</p>`;
    return;
  }
  const parts = Object.keys(cosmetic.parts || {});
  styleInspector.dataset.active = 'true';
  stylePartSelect.innerHTML = '';
  if (!parts.length){
    styleFields.innerHTML = '<p>This cosmetic has no editable sprite parts.</p>';
    return;
  }
  for (const partKey of parts){
    const option = document.createElement('option');
    option.value = partKey;
    option.textContent = partKey;
    stylePartSelect.appendChild(option);
  }
  const preferred = editorState.activePartKey && parts.includes(editorState.activePartKey)
    ? editorState.activePartKey
    : parts[0];
  stylePartSelect.value = preferred;
  editorState.activePartKey = preferred;
  buildStyleFields(slot, cosmetic, preferred);
}

function handlePartChange(){
  const slot = editorState.activeSlot;
  const library = getRegisteredCosmeticLibrary();
  const row = slotRows.get(slot);
  if (!slot || !row) return;
  const cosmeticId = row.select.value;
  const cosmetic = library[cosmeticId];
  const partKey = stylePartSelect.value;
  editorState.activePartKey = partKey;
  buildStyleFields(slot, cosmetic, partKey);
}

const slotRows = new Map();

function buildSlotRows(){
  const library = getRegisteredCosmeticLibrary();
  slotContainer.innerHTML = '';
  for (const slot of COSMETIC_SLOTS){
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.dataset.slot = slot;
    const label = document.createElement('span');
    label.className = 'slot-row__label';
    label.textContent = slot;
    const select = document.createElement('select');
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.appendChild(noneOption);
    const options = Object.entries(library)
      .filter(([_, cosmetic]) => Array.isArray(cosmetic?.slots) ? cosmetic.slots.includes(slot) : true)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [id, cosmetic] of options){
      const option = document.createElement('option');
      option.value = id;
      option.textContent = cosmetic?.meta?.name || id;
      select.appendChild(option);
    }
    select.addEventListener('change', (event)=>{
      setSlotSelection(slot, event.target.value);
    });
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'slot-row__edit';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', ()=>{
      showStyleInspector(slot);
    });
    row.appendChild(label);
    row.appendChild(select);
    row.appendChild(editButton);
    slotContainer.appendChild(row);
    slotRows.set(slot, { element: row, select, editButton });
  }
}

function populateFighterSelect(){
  fighterSelect.innerHTML = '';
  const fighters = CONFIG.fighters || {};
  const keys = Object.keys(fighters);
  if (!keys.length){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No fighters found';
    fighterSelect.appendChild(opt);
    fighterSelect.disabled = true;
    return;
  }
  for (const key of keys){
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key;
    fighterSelect.appendChild(opt);
  }
  fighterSelect.addEventListener('change', (event)=>{
    loadFighter(event.target.value);
  });
  fighterSelect.value = keys[0];
  loadFighter(keys[0]);
}

function loadFighter(fighterName){
  if (!fighterName) return;
  GAME.selectedFighter = fighterName;
  const fighter = CONFIG.fighters?.[fighterName] || {};
  const slots = fighter.cosmetics?.slots || fighter.cosmetics || {};
  setSelectedCosmetics(slots);
  clearOverlay();
  editorState.slotOverrides = {};
  editorState.activeSlot = null;
  editorState.activePartKey = null;
  updateSlotSelectsFromState();
  showStyleInspector(null);
  showStatus(`Loaded fighter ${fighterName}`, { tone: 'info' });
}

function updateBucketMode(isActive){
  editorState.bucketActive = isActive;
  bucketToggle.classList.toggle('is-active', !!isActive);
  canvas.classList.toggle('is-bucket', !!isActive);
  if (bucketHint){
    bucketHint.hidden = !isActive;
  }
}

function handleCanvasClick(event){
  if (!editorState.bucketActive) return;
  const color = parseHexColor(bucketColorInput.value);
  if (!color){
    showStatus('Enter a valid hex color (e.g., #ff9933).', { tone: 'warn' });
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  applyBucketFill(x, y, color);
}

function draw(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderAll(ctx);
  renderSprites(ctx);
  const overlayCanvas = ensureOverlay();
  if (overlayCanvas){
    ctx.drawImage(overlayCanvas, 0, 0);
  }
  requestAnimationFrame(draw);
}

function attachEventListeners(){
  canvas.addEventListener('click', handleCanvasClick);
  bucketToggle.addEventListener('click', ()=>{
    updateBucketMode(!editorState.bucketActive);
  });
  bucketUndoBtn.addEventListener('click', ()=>{
    undoOverlay();
  });
  bucketClearBtn.addEventListener('click', ()=>{
    clearOverlay();
  });
  stylePartSelect.addEventListener('change', handlePartChange);
  styleResetBtn.addEventListener('click', ()=>{
    if (editorState.activeSlot && editorState.activePartKey){
      resetPartOverrides(editorState.activeSlot, editorState.activePartKey);
    }
  });
  styleSlotResetBtn.addEventListener('click', ()=>{
    if (editorState.activeSlot){
      resetSlotOverrides(editorState.activeSlot);
    }
  });
}

(async function bootstrap(){
  ensureOverlay();
  await initSprites();
  initFighters(canvas, ctx);
  GAME.CAMERA = GAME.CAMERA || { x: 0, worldWidth: canvas.width };
  buildSlotRows();
  populateFighterSelect();
  attachEventListeners();
  updateSlotSelectsFromState();
  updateBucketMode(false);
  requestAnimationFrame(draw);
})();

