import { initFighters } from './fighter.js?v=6';
import { renderAll } from './render.js?v=4';
import { initSprites, renderSprites } from './sprites.js?v=8';
import {
  COSMETIC_SLOTS,
  getRegisteredCosmeticLibrary,
  registerCosmeticLibrary,
  registerFighterCosmeticProfile,
  getFighterCosmeticProfile
} from './cosmetics.js?v=1';

const CONFIG = window.CONFIG || {};
const GAME = (window.GAME ||= {});
const editorState = (GAME.editorState ||= {
  slotOverrides: {},
  overlayHistory: [],
  activePartKey: null,
  slotSelection: {},
  assetManifest: [],
  filteredAssets: [],
  selectedAsset: null,
  assetPinned: false,
  activeFighter: null,
  loadedProfile: {},
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
const bucketToleranceInput = document.getElementById('bucketTolerance');
const bucketExpandInput = document.getElementById('bucketExpand');
const bucketHint = document.getElementById('bucketHint');
const bucketUndoBtn = document.getElementById('bucketUndo');
const bucketClearBtn = document.getElementById('bucketClear');
const statusEl = document.getElementById('editorStatus');
const assetSearch = document.getElementById('assetSearch');
const assetList = document.getElementById('assetList');
const assetPreview = document.getElementById('assetPreview');
const creatorIdInput = document.getElementById('creatorId');
const creatorNameInput = document.getElementById('creatorName');
const creatorSlotSelect = document.getElementById('creatorSlot');
const creatorPartsInput = document.getElementById('creatorParts');
const creatorAddBtn = document.getElementById('creatorAdd');
const creatorEquipBtn = document.getElementById('creatorEquip');
const creatorApplyBtn = document.getElementById('creatorApplyPart');
const overrideOutput = document.getElementById('overrideOutput');
const overrideApplyBtn = document.getElementById('applyOverrides');
const overrideCopyBtn = document.getElementById('copyOverrides');
const overrideDownloadBtn = document.getElementById('downloadOverrides');

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

function clampNumber(value, min, max){
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function readBucketTolerance(){
  const fallback = 24;
  if (!bucketToleranceInput) return fallback;
  const parsed = Number.parseFloat(bucketToleranceInput.value);
  if (Number.isNaN(parsed)) return fallback;
  return clampNumber(Math.round(parsed), 0, 255);
}

function readBucketExpansion(){
  const fallback = 1;
  if (!bucketExpandInput) return fallback;
  const parsed = Number.parseFloat(bucketExpandInput.value);
  if (Number.isNaN(parsed)) return fallback;
  return clampNumber(Math.round(parsed), 0, 24);
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

function populateCreatorSlotOptions(){
  if (!creatorSlotSelect) return;
  creatorSlotSelect.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const slot of COSMETIC_SLOTS){
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    frag.appendChild(option);
  }
  creatorSlotSelect.appendChild(frag);
}

function highlightAssetSelection(){
  if (!assetList) return;
  const selected = editorState.selectedAsset;
  const items = assetList.querySelectorAll('.asset-item');
  items.forEach((item)=>{
    item.classList.toggle('asset-item--selected', item.dataset.assetPath === selected);
  });
}

function setSelectedAsset(path, { pinned = false } = {}){
  editorState.selectedAsset = path || null;
  if (pinned){
    editorState.assetPinned = true;
  } else if (!path){
    editorState.assetPinned = false;
  }
  if (assetPreview){
    assetPreview.innerHTML = '';
    if (path){
      const img = document.createElement('img');
      img.src = path;
      img.alt = 'Selected asset preview';
      assetPreview.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.textContent = 'Select an asset to preview it here.';
      assetPreview.appendChild(span);
    }
  }
  highlightAssetSelection();
}

function renderAssetList(){
  if (!assetList) return;
  assetList.innerHTML = '';
  const assets = editorState.filteredAssets || [];
  if (!assets.length){
    const empty = document.createElement('p');
    empty.textContent = 'No assets match the current search.';
    assetList.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const path of assets){
    const item = document.createElement('div');
    item.className = 'asset-item';
    item.tabIndex = 0;
    item.dataset.assetPath = path;
    item.setAttribute('role', 'option');
    const name = document.createElement('div');
    name.className = 'asset-item__name';
    const last = path.split('/').pop();
    name.textContent = last || path;
    const hint = document.createElement('div');
    hint.className = 'asset-item__path';
    hint.textContent = path;
    item.appendChild(name);
    item.appendChild(hint);
    frag.appendChild(item);
  }
  assetList.appendChild(frag);
  highlightAssetSelection();
}

function filterAssetList(query){
  const manifest = editorState.assetManifest || [];
  if (!Array.isArray(manifest)){
    editorState.filteredAssets = [];
    renderAssetList();
    return;
  }
  const norm = (query || '').trim().toLowerCase();
  if (!norm){
    editorState.filteredAssets = manifest.slice();
    renderAssetList();
    return;
  }
  editorState.filteredAssets = manifest.filter((path)=> path.toLowerCase().includes(norm));
  renderAssetList();
}

async function loadAssetManifest(){
  if (typeof fetch !== 'function'){
    showStatus('Asset manifest unavailable in this environment.', { tone: 'warn' });
    return;
  }
  try {
    const response = await fetch('./assets/asset-manifest.json', { cache: 'no-cache' });
    if (!response.ok){
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)){
      editorState.assetManifest = data;
      editorState.filteredAssets = data.slice();
      renderAssetList();
      setSelectedAsset(editorState.selectedAsset);
    }
  } catch (err){
    console.warn('[cosmetic-editor] Failed to load asset manifest', err);
    showStatus('Could not load asset manifest.', { tone: 'warn', timeout: 4000 });
    renderAssetList();
  }
}

function parsePartKeys(raw){
  if (!raw) return [];
  return raw
    .split(',')
    .map((part)=> part.trim())
    .filter((part)=> part.length > 0);
}

function buildOverridePayload(){
  const slotSelection = editorState.slotSelection || {};
  const payload = { cosmetics: {} };
  for (const [slot, entry] of Object.entries(slotSelection)){
    const id = entry?.id;
    if (!id) continue;
    const overrides = editorState.slotOverrides?.[slot];
    if (!overrides || Object.keys(overrides).length === 0) continue;
    payload.cosmetics[id] = deepClone(overrides);
  }
  return payload;
}

function updateOverrideOutputs(){
  if (!overrideOutput) return;
  const payload = buildOverridePayload();
  const cosmetics = payload.cosmetics || {};
  const hasOverrides = Object.keys(cosmetics).length > 0;
  overrideOutput.value = hasOverrides
    ? JSON.stringify(payload, null, 2)
    : '// No overrides defined for this fighter.';
  if (overrideApplyBtn) overrideApplyBtn.disabled = !hasOverrides;
  if (overrideCopyBtn) overrideCopyBtn.disabled = !hasOverrides;
  if (overrideDownloadBtn) overrideDownloadBtn.disabled = !hasOverrides;
}

function applyOverridesToProfile(){
  if (!editorState.activeFighter){
    showStatus('Load a fighter before applying overrides.', { tone: 'warn' });
    return;
  }
  const payload = buildOverridePayload();
  registerFighterCosmeticProfile(editorState.activeFighter, payload);
  editorState.loadedProfile = deepClone(payload.cosmetics || {});
  showStatus('Applied overrides to fighter preview.', { tone: 'info' });
  updateOverrideOutputs();
}

async function copyOverridesToClipboard(){
  if (!overrideOutput) return;
  const text = overrideOutput.value || '';
  if (!text || text.startsWith('// ')){
    showStatus('No override JSON to copy yet.', { tone: 'warn' });
    return;
  }
  if (!navigator?.clipboard){
    showStatus('Clipboard API unavailable in this browser.', { tone: 'warn' });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Override JSON copied to clipboard.', { tone: 'info' });
  } catch (err){
    console.warn('[cosmetic-editor] Copy failed', err);
    showStatus('Unable to copy overrides to clipboard.', { tone: 'error' });
  }
}

function downloadOverridesJson(){
  if (!overrideOutput) return;
  const text = overrideOutput.value || '';
  if (!text || text.startsWith('// ')){
    showStatus('No override JSON to download.', { tone: 'warn' });
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fighter = editorState.activeFighter || 'fighter';
  link.href = url;
  link.download = `${fighter}-cosmetics.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(()=> URL.revokeObjectURL(url), 1000);
  showStatus('Downloaded fighter override JSON.', { tone: 'info' });
}

function createCustomCosmetic(){
  const asset = editorState.selectedAsset;
  if (!asset){
    showStatus('Select a PNG asset first.', { tone: 'warn' });
    return;
  }
  const id = (creatorIdInput?.value || '').trim();
  if (!id){
    showStatus('Enter a cosmetic ID to register.', { tone: 'warn' });
    creatorIdInput?.focus();
    return;
  }
  const slot = creatorSlotSelect?.value;
  if (!slot){
    showStatus('Choose a slot for the new cosmetic.', { tone: 'warn' });
    return;
  }
  const partKeys = parsePartKeys(creatorPartsInput?.value || '');
  if (!partKeys.length){
    showStatus('Provide at least one part key (e.g., leg_L_upper).', { tone: 'warn' });
    creatorPartsInput?.focus();
    return;
  }
  const displayNameRaw = (creatorNameInput?.value || '').trim();
  const displayName = displayNameRaw || id.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (ch)=> ch.toUpperCase());
  const parts = {};
  for (const partKey of partKeys){
    parts[partKey] = {
      image: { url: asset }
    };
  }
  const newCosmetic = {
    slots: [slot],
    meta: { name: displayName },
    hsv: {
      defaults: { h: 0, s: 0, v: 0 },
      limits: { h: [-180, 180], s: [-1, 1], v: [-1, 1] }
    },
    parts
  };
  registerCosmeticLibrary({ [id]: newCosmetic });
  buildSlotRows();
  updateSlotSelectsFromState();
  showStatus(`Registered cosmetic "${displayName}" in slot ${slot}.`, { tone: 'info' });
}

function equipCustomCosmetic(){
  const slot = creatorSlotSelect?.value;
  const id = (creatorIdInput?.value || '').trim();
  if (!slot || !id){
    showStatus('Enter both cosmetic ID and slot to equip.', { tone: 'warn' });
    return;
  }
  const library = getRegisteredCosmeticLibrary();
  if (!library[id]){
    showStatus(`Cosmetic "${id}" is not in the library yet.`, { tone: 'warn' });
    return;
  }
  setSlotSelection(slot, id);
  updateSlotSelectsFromState();
  showStyleInspector(slot);
  showStatus(`Equipped ${library[id].meta?.name || id} to ${slot}.`, { tone: 'info' });
}

function applyAssetToActivePart(){
  const asset = editorState.selectedAsset;
  if (!asset){
    showStatus('Select an asset before applying it.', { tone: 'warn' });
    return;
  }
  const slot = editorState.activeSlot;
  const partKey = editorState.activePartKey;
  if (!slot || !partKey){
    showStatus('Choose a slot and part in the style inspector first.', { tone: 'warn' });
    return;
  }
  const slotOverride = (editorState.slotOverrides[slot] ||= {});
  slotOverride.parts ||= {};
  const partOverride = (slotOverride.parts[partKey] ||= {});
  partOverride.image = { ...(partOverride.image || {}), url: asset };
  cleanupEmptyOverrides(slot);
  showStyleInspector(slot);
  updateOverrideOutputs();
  showStatus(`Applied ${asset} to ${slot} → ${partKey}.`, { tone: 'info' });
}

function getEffectivePartImage(slot, cosmetic, partKey){
  const slotOverride = editorState.slotOverrides?.[slot];
  const partOverride = slotOverride?.parts?.[partKey];
  return partOverride?.image?.url
    || slotOverride?.image?.url
    || cosmetic?.parts?.[partKey]?.image?.url
    || '';
}

function highlightActivePartAsset(slot, partKey, cosmetic){
  if (!slot || !partKey) return;
  if (editorState.assetPinned) return;
  const current = getEffectivePartImage(slot, cosmetic, partKey);
  if (current){
    setSelectedAsset(current);
  }
}

function mapProfileToSlotOverrides(slotMap, profile){
  const overrides = {};
  const cosmetics = profile?.cosmetics || {};
  for (const [slot, entry] of Object.entries(slotMap || {})){
    const id = entry?.id;
    if (!id) continue;
    const profileEntry = cosmetics[id];
    if (!profileEntry) continue;
    overrides[slot] = deepClone(profileEntry);
  }
  return overrides;
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

function applyBucketFill(x, y, rgba, { tolerance: toleranceValue, expand: expandValue } = {}){
  ensureOverlay();
  const overlayCtx = editorState.overlayCtx;
  if (!overlayCtx || !ctx) return;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  const tolerance = clampNumber(Number.isFinite(toleranceValue) ? Math.round(toleranceValue) : readBucketTolerance(), 0, 255);
  const expandPixels = clampNumber(Number.isFinite(expandValue) ? Math.round(expandValue) : readBucketExpansion(), 0, 24);
  const alphaTolerance = clampNumber(tolerance + 16, 0, 255);

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
  let painted = false;
  const filledPixels = [];

  function matches(ix){
    const dr = Math.abs(baseData.data[ix] - target[0]);
    const dg = Math.abs(baseData.data[ix + 1] - target[1]);
    const db = Math.abs(baseData.data[ix + 2] - target[2]);
    const da = Math.abs(baseData.data[ix + 3] - target[3]);
    return dr <= tolerance && dg <= tolerance && db <= tolerance && da <= alphaTolerance;
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
    filledPixels.push(idx);

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

  if (expandPixels > 0 && filledPixels.length){
    const width = canvas.width;
    const height = canvas.height;
    const expanded = new Set(filledPixels);
    let frontier = new Set(filledPixels);
    for (let step = 0; step < expandPixels; step += 1){
      const next = new Set();
      for (const idx of frontier){
        const px = idx % width;
        const py = Math.floor(idx / width);
        for (let dy = -1; dy <= 1; dy += 1){
          for (let dx = -1; dx <= 1; dx += 1){
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighborIdx = ny * width + nx;
            if (expanded.has(neighborIdx)) continue;
            expanded.add(neighborIdx);
            next.add(neighborIdx);
          }
        }
      }
      if (!next.size) break;
      frontier = next;
    }
    for (const idx of expanded){
      const baseIdx = idx * 4;
      overlayData.data[baseIdx] = rgba.r;
      overlayData.data[baseIdx + 1] = rgba.g;
      overlayData.data[baseIdx + 2] = rgba.b;
      overlayData.data[baseIdx + 3] = rgba.a;
    }
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
  editorState.slotSelection = deepClone(slotMap);
  return slotMap;
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
      if (partOverride?.image && !partOverride.image.url){
        delete partOverride.image;
      }
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
  if (slotOverride.image && !slotOverride.image.url){
    delete slotOverride.image;
  }
  if (Object.keys(slotOverride).length === 0){
    delete editorState.slotOverrides[slot];
  }
}

function setSlotSelection(slot, cosmeticId){
  const selection = (GAME.selectedCosmetics ||= { slots: {} });
  if (!selection.slots) selection.slots = {};
  editorState.slotSelection ||= {};
  if (!cosmeticId){
    selection.slots[slot] = null;
    delete editorState.slotSelection[slot];
    delete editorState.slotOverrides[slot];
  } else {
    const existing = normalizeSlotEntry(selection.slots[slot]) || {};
    const next = { ...existing, id: cosmeticId };
    selection.slots[slot] = next;
    editorState.slotSelection[slot] = deepClone(next);
    delete editorState.slotOverrides[slot];
  }
  cleanupEmptyOverrides(slot);
  updateOverrideOutputs();
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
  updateOverrideOutputs();
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
  updateOverrideOutputs();
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
  updateOverrideOutputs();
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
  const currentImageUrl = getEffectivePartImage(slot, cosmetic, partKey);
  if (currentImageUrl){
    const info = document.createElement('p');
    info.className = 'style-asset-info';
    info.innerHTML = `Current image: <code>${currentImageUrl}</code>`;
    styleFields.appendChild(info);
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
  highlightActivePartAsset(slot, preferred, cosmetic);
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
  highlightActivePartAsset(slot, partKey, cosmetic);
}

const slotRows = new Map();

function buildSlotRows(){
  const library = getRegisteredCosmeticLibrary();
  slotContainer.innerHTML = '';
  slotRows.clear();
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
  editorState.activeFighter = fighterName;
  const fighter = CONFIG.fighters?.[fighterName] || {};
  const slots = fighter.cosmetics?.slots || fighter.cosmetics || {};
  const slotMap = setSelectedCosmetics(slots);
  clearOverlay();
  editorState.assetPinned = false;
  setSelectedAsset(null);
  const profile = getFighterCosmeticProfile(fighterName) || null;
  editorState.loadedProfile = deepClone(profile?.cosmetics || {});
  editorState.slotOverrides = mapProfileToSlotOverrides(slotMap, profile);
  editorState.activeSlot = null;
  editorState.activePartKey = null;
  updateSlotSelectsFromState();
  showStyleInspector(null);
  updateOverrideOutputs();
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
  applyBucketFill(x, y, color, {
    tolerance: readBucketTolerance(),
    expand: readBucketExpansion()
  });
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
  assetSearch?.addEventListener('input', (event)=>{
    filterAssetList(event.target.value);
  });
  assetList?.addEventListener('click', (event)=>{
    const target = event.target.closest('.asset-item');
    if (!target) return;
    const path = target.dataset.assetPath;
    if (path){
      setSelectedAsset(path, { pinned: true });
    }
  });
  assetList?.addEventListener('keydown', (event)=>{
    if (event.key !== 'Enter' && event.key !== ' '){
      return;
    }
    const target = event.target.closest('.asset-item');
    if (!target) return;
    event.preventDefault();
    const path = target.dataset.assetPath;
    if (path){
      setSelectedAsset(path, { pinned: true });
    }
  });
  creatorAddBtn?.addEventListener('click', createCustomCosmetic);
  creatorEquipBtn?.addEventListener('click', equipCustomCosmetic);
  creatorApplyBtn?.addEventListener('click', applyAssetToActivePart);
  overrideApplyBtn?.addEventListener('click', applyOverridesToProfile);
  overrideCopyBtn?.addEventListener('click', ()=>{ copyOverridesToClipboard(); });
  overrideDownloadBtn?.addEventListener('click', downloadOverridesJson);
}

(async function bootstrap(){
  ensureOverlay();
  setSelectedAsset(null);
  await initSprites();
  initFighters(canvas, ctx);
  GAME.CAMERA = GAME.CAMERA || { x: 0, worldWidth: canvas.width };
  populateCreatorSlotOptions();
  await loadAssetManifest();
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

