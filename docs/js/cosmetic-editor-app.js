import { initFighters } from './fighter.js?v=6';
import { renderAll } from './render.js?v=4';
import { initSprites, renderSprites } from './sprites.js?v=9';
import {
  COSMETIC_SLOTS,
  getRegisteredCosmeticLibrary,
  registerCosmeticLibrary,
  registerFighterCosmeticProfile,
  getFighterCosmeticProfile,
  registerFighterAppearance,
  resolveCharacterAppearance
} from './cosmetics.js?v=1';
import { applyShade } from './cosmetic-palettes.js?v=1';

const CONFIG = window.CONFIG || {};
const GAME = (window.GAME ||= {});
const editorState = (GAME.editorState ||= {
  slotOverrides: {},
  activePartKey: null,
  slotSelection: {},
  assetManifest: [],
  filteredAssets: [],
  selectedAsset: null,
  assetPinned: false,
  activeFighter: null,
  loadedProfile: {},
  profileBaseSnapshot: { cosmetics: {} },
  activeSlot: null,
  activeStyleKey: null,
  appearanceSlotKeys: [],
  activeBucketKey: 'primary',
  currentPalette: null,
  currentPaletteSource: { slot: null, partKey: null, cosmeticId: null }
});

function resolveStaticUrl(path){
  if (!path || typeof path !== 'string') return path;
  const resolver = typeof CONFIG.resolveConfigUrl === 'function' ? CONFIG.resolveConfigUrl : null;
  if (resolver){
    try {
      return resolver(path);
    } catch (error){
      // fall through to location-based resolution
    }
  }
  if (typeof URL === 'function'){
    try {
      const base = CONFIG.__siteRoot || window.location?.href;
      if (base){
        return new URL(path, base).href;
      }
    } catch (_err){
      // ignore resolution failures
    }
  }
  return path;
}

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
const bucketTargetsContainer = document.getElementById('bucketTargets');
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
const creatorAppearanceToggle = document.getElementById('creatorAppearance');
const creatorBodyColorsInput = document.getElementById('creatorBodyColors');
const creatorSpriteInput = document.getElementById('creatorSpriteKey');
const creatorAddBtn = document.getElementById('creatorAdd');
const creatorEquipBtn = document.getElementById('creatorEquip');
const creatorApplyBtn = document.getElementById('creatorApplyPart');
const overrideOutput = document.getElementById('overrideOutput');
const overrideApplyBtn = document.getElementById('applyOverrides');
const overrideCopyBtn = document.getElementById('copyOverrides');
const overrideDownloadBtn = document.getElementById('downloadOverrides');

const BUCKET_DEFS = [
  { bucketKey: 'primary', label: 'Primary', type: 'color', colorKey: 'primary' },
  { bucketKey: 'secondary', label: 'Secondary', type: 'color', colorKey: 'secondary' },
  { bucketKey: 'tertiary', label: 'Tertiary', type: 'color', colorKey: 'tertiary' },
  { bucketKey: 'primaryShade', label: 'Shade 1', type: 'shade', colorKey: 'primary' },
  { bucketKey: 'secondaryShade', label: 'Shade 2', type: 'shade', colorKey: 'secondary' },
  { bucketKey: 'tertiaryShade', label: 'Shade 3', type: 'shade', colorKey: 'tertiary' }
];

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

function isPlainObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeProfileData(baseProfile = {}, overrides = {}){
  const baseClone = isPlainObject(baseProfile) || Array.isArray(baseProfile)
    ? deepClone(baseProfile)
    : {};

  function mergeInto(target, source){
    if (!isPlainObject(source)) return target;
    for (const [key, value] of Object.entries(source)){
      if (Array.isArray(value)){
        target[key] = value.map((item)=> deepClone(item));
        continue;
      }
      if (isPlainObject(value)){
        const current = target[key];
        target[key] = mergeInto(isPlainObject(current) ? current : {}, value);
        continue;
      }
      target[key] = value;
    }
    return target;
  }

  return mergeInto(baseClone, overrides);
}

function buildMergedProfilePayload(overridePayload){
  const baseProfile = editorState.profileBaseSnapshot || { cosmetics: {} };
  const overrides = overridePayload || buildOverridePayload();
  return mergeProfileData(baseProfile, overrides);
}

function prepareDownloadPayload(){
  const overridePayload = buildOverridePayload();
  const cosmetics = overridePayload.cosmetics || {};
  const hasOverrides = Object.keys(cosmetics).length > 0;
  const mergedProfile = hasOverrides ? buildMergedProfilePayload(overridePayload) : null;
  return { overridePayload, mergedProfile, hasOverrides };
}

function clampNumber(value, min, max){
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
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
  for (const slot of getActiveSlotKeys()){
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot.startsWith('appearance:')
      ? slot.replace('appearance:', 'appearance/')
      : slot;
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
    const manifestUrl = resolveStaticUrl('./assets/asset-manifest.json');
    const response = await fetch(manifestUrl, { cache: 'no-cache' });
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

function parseBodyColorLetters(raw){
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry)=> entry.trim().toUpperCase())
    .filter((entry)=> entry.length > 0);
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
  const { mergedProfile, hasOverrides } = prepareDownloadPayload();
  overrideOutput.value = hasOverrides && mergedProfile
    ? JSON.stringify(mergedProfile, null, 2)
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
  const mergedProfile = registerFighterCosmeticProfile(editorState.activeFighter, payload);
  editorState.profileBaseSnapshot = deepClone(mergedProfile || { cosmetics: {} });
  editorState.loadedProfile = deepClone(mergedProfile?.cosmetics || {});
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
  const { mergedProfile, hasOverrides } = prepareDownloadPayload();
  if (!hasOverrides || !mergedProfile){
    showStatus('No override JSON to download.', { tone: 'warn' });
    return;
  }
  const text = JSON.stringify(mergedProfile, null, 2);
  if (overrideOutput){
    overrideOutput.value = text;
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
  const isAppearance = slot.startsWith('appearance:') || !!creatorAppearanceToggle?.checked;
  const partKeys = parsePartKeys(creatorPartsInput?.value || '');
  if (!partKeys.length){
    showStatus('Provide at least one part key (e.g., leg_L_upper).', { tone: 'warn' });
    creatorPartsInput?.focus();
    return;
  }
  const displayNameRaw = (creatorNameInput?.value || '').trim();
  const displayName = displayNameRaw || id.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (ch)=> ch.toUpperCase());
  const appearanceColors = isAppearance ? parseBodyColorLetters(creatorBodyColorsInput?.value || '') : [];
  const inheritSprite = isAppearance
    ? (creatorSpriteInput?.value || '').trim() || partKeys[0] || ''
    : '';
  const parts = {};
  for (const partKey of partKeys){
    parts[partKey] = {
      image: { url: asset }
    };
  }
  const newCosmetic = {
    slots: [slot],
    meta: { name: displayName },
    hsl: {
      defaults: { h: 0, s: 0, l: 0 },
      limits: { h: [-180, 180], s: [-1, 1], l: [-1, 1] }
    },
    parts
  };
  if (isAppearance){
    newCosmetic.type = 'appearance';
    newCosmetic.appearance = {
      inheritSprite: inheritSprite || undefined,
      bodyColors: appearanceColors
    };
  }
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
    const clone = deepClone(profileEntry);
    if (clone?.parts){
      for (const partOverride of Object.values(clone.parts)){
        const xform = partOverride?.spriteStyle?.xform;
        if (xform){
          if (xform[partOverride?.styleKey || '']){
            // keep existing styleKey reference if valid
          } else {
            const keys = Object.keys(xform);
            if (keys.length === 1){
              partOverride.styleKey = keys[0];
            }
          }
        }
      }
    }
    overrides[slot] = clone;
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

function formatHexColor(rgba){
  if (!rgba) return null;
  const clampChannel = (value)=>{
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 255) return 255;
    return Math.round(value);
  };
  const toHex = (value)=> clampChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`.toUpperCase();
}

function normalizeHexInputString(raw){
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str.length) return null;
  const parsed = parseHexColor(str);
  return parsed ? formatHexColor(parsed) : null;
}

function normalizeShadeInput(raw){
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)){
    let value = raw;
    if (Math.abs(value) > 1){
      value = value / 100;
    }
    return Math.max(-1, Math.min(1, value));
  }
  const parsed = Number.parseFloat(String(raw).trim());
  if (Number.isNaN(parsed)) return null;
  let value = parsed;
  if (Math.abs(value) > 1){
    value = value / 100;
  }
  if (value < -1) value = -1;
  if (value > 1) value = 1;
  return value;
}

function mergePaletteSection(target, source){
  if (!source || typeof source !== 'object') return;
  if (source.colors && typeof source.colors === 'object'){
    target.colors = { ...(target.colors || {}), ...deepClone(source.colors) };
  }
  if (source.shaded && typeof source.shaded === 'object'){
    target.shaded = { ...(target.shaded || {}), ...deepClone(source.shaded) };
  }
  if (source.shading && typeof source.shading === 'object'){
    target.shading = { ...(target.shading || {}), ...deepClone(source.shading) };
  }
  if (source.bucketMap && typeof source.bucketMap === 'object'){
    target.bucketMap = { ...(target.bucketMap || {}), ...deepClone(source.bucketMap) };
  }
  if (source.rows){
    const rows = Array.isArray(source.rows) ? source.rows : [source.rows];
    const next = Array.isArray(target.rows) ? target.rows.slice() : [];
    next.push(...rows);
    target.rows = next;
  }
  if (source.row && !target.row){
    target.row = source.row;
  }
  if (source.variant && !target.variant){
    target.variant = source.variant;
  }
  if (source.variantRowMap && typeof source.variantRowMap === 'object'){
    target.variantRowMap = {
      ...(target.variantRowMap || {}),
      ...deepClone(source.variantRowMap)
    };
  }
  if (source.useBodyColors != null){
    target.useBodyColors = !!source.useBodyColors;
  }
  if (source.bodyOrder){
    const order = Array.isArray(source.bodyOrder)
      ? source.bodyOrder.slice()
      : [source.bodyOrder];
    target.bodyOrder = order.filter((entry)=> entry != null && String(entry).trim().length > 0);
  }
  if (source.meta && typeof source.meta === 'object'){
    target.meta = { ...(target.meta || {}), ...deepClone(source.meta) };
  }
  if (source.defaultRow && !target.defaultRow){
    target.defaultRow = source.defaultRow;
  }
  if (source.fallbackRow && !target.fallbackRow){
    target.fallbackRow = source.fallbackRow;
  }
  if (source.inlineId && !target.inlineId){
    target.inlineId = source.inlineId;
  }
  if (source.inline != null){
    target.inline = !!source.inline;
  }
}

function computeEffectivePalette(slot, partKey, cosmetic){
  const palette = {
    colors: {},
    shaded: {},
    shading: {},
    bucketMap: {}
  };
  mergePaletteSection(palette, cosmetic?.parts?.[partKey]?.palette);
  const slotOverride = editorState.slotOverrides?.[slot];
  mergePaletteSection(palette, slotOverride?.palette);
  mergePaletteSection(palette, slotOverride?.parts?.[partKey]?.palette);
  return palette;
}

function cleanupPaletteObject(palette){
  if (!palette || typeof palette !== 'object') return;
  const cleanHexMap = (map)=>{
    if (!map || typeof map !== 'object') return false;
    for (const key of Object.keys(map)){
      const value = map[key];
      if (!value || (typeof value === 'string' && !value.trim())){
        delete map[key];
      }
    }
    return Object.keys(map).length > 0;
  };
  const cleanNumberMap = (map)=>{
    if (!map || typeof map !== 'object') return false;
    for (const key of Object.keys(map)){
      const value = map[key];
      if (value == null || Number.isNaN(value)){
        delete map[key];
      }
    }
    return Object.keys(map).length > 0;
  };
  const cleanGenericMap = (map)=>{
    if (!map || typeof map !== 'object') return false;
    for (const key of Object.keys(map)){
      const value = map[key];
      if (value == null || (typeof value === 'string' && !value.trim())){
        delete map[key];
      }
    }
    return Object.keys(map).length > 0;
  };

  if (!cleanHexMap(palette.colors)){
    delete palette.colors;
  }
  if (!cleanHexMap(palette.shaded)){
    delete palette.shaded;
  }
  if (!cleanNumberMap(palette.shading)){
    delete palette.shading;
  }
  if (!cleanGenericMap(palette.bucketMap)){
    delete palette.bucketMap;
  }
  if (Array.isArray(palette.rows)){
    palette.rows = palette.rows
      .map((entry)=> String(entry).trim())
      .filter((entry)=> entry.length > 0);
    if (!palette.rows.length){
      delete palette.rows;
    }
  }
  if (Array.isArray(palette.bodyOrder)){
    palette.bodyOrder = palette.bodyOrder
      .map((entry)=> String(entry).trim())
      .filter((entry)=> entry.length > 0);
    if (!palette.bodyOrder.length){
      delete palette.bodyOrder;
    }
  }
  if (palette.meta && typeof palette.meta === 'object'){
    for (const key of Object.keys(palette.meta)){
      const value = palette.meta[key];
      if (value == null || (typeof value === 'string' && !value.trim())){
        delete palette.meta[key];
      }
    }
    if (!Object.keys(palette.meta).length){
      delete palette.meta;
    }
  }
  if (palette.variantRowMap && typeof palette.variantRowMap === 'object'){
    for (const key of Object.keys(palette.variantRowMap)){
      const value = palette.variantRowMap[key];
      if (value == null || (typeof value === 'string' && !value.trim())){
        delete palette.variantRowMap[key];
      }
    }
    if (!Object.keys(palette.variantRowMap).length){
      delete palette.variantRowMap;
    }
  }
}

function hasPaletteContent(value){
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasPaletteContent);
  if (typeof value === 'object'){
    return Object.values(value).some(hasPaletteContent);
  }
  return false;
}

function mutatePartPalette(slot, partKey, mutate){
  if (!slot || !partKey || typeof mutate !== 'function') return;
  editorState.slotOverrides ||= {};
  const slotOverride = (editorState.slotOverrides[slot] ||= {});
  slotOverride.parts ||= {};
  const partOverride = (slotOverride.parts[partKey] ||= {});
  partOverride.palette = partOverride.palette || {};
  mutate(partOverride.palette);
  cleanupPaletteObject(partOverride.palette);
  if (!hasPaletteContent(partOverride.palette)){
    delete partOverride.palette;
  }
  cleanupEmptyOverrides(slot);
  updateOverrideOutputs();
  refreshPaletteEditor();
}

function setPaletteColor(slot, partKey, colorKey, rawValue){
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  const hex = trimmed ? normalizeHexInputString(trimmed) : null;
  if (trimmed && !hex){
    showStatus('Enter a valid hex colour (e.g., #ff9933).', { tone: 'warn' });
    refreshPaletteEditor();
    return false;
  }
  mutatePartPalette(slot, partKey, (palette)=>{
    if (hex){
      palette.colors = palette.colors || {};
      palette.colors[colorKey] = hex;
    } else if (palette.colors){
      delete palette.colors[colorKey];
    }
  });
  return true;
}

function setPaletteShadeAmount(slot, partKey, colorKey, rawValue){
  const hasValue = !(rawValue == null || rawValue === '');
  const normalized = hasValue ? normalizeShadeInput(rawValue) : null;
  if (hasValue && normalized == null){
    showStatus('Enter a shade amount between -1 and 1 (or -100 to 100%).', { tone: 'warn' });
    refreshPaletteEditor();
    return false;
  }
  mutatePartPalette(slot, partKey, (palette)=>{
    if (!hasValue){
      if (palette.shading){
        delete palette.shading[colorKey];
      }
      return;
    }
    palette.shading = palette.shading || {};
    palette.shading[colorKey] = normalized;
  });
  return true;
}

function setPaletteShadeHex(slot, partKey, colorKey, rawValue){
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  const hex = trimmed ? normalizeHexInputString(trimmed) : null;
  if (trimmed && !hex){
    showStatus('Enter a valid hex colour (e.g., #1f1f1f).', { tone: 'warn' });
    refreshPaletteEditor();
    return false;
  }
  mutatePartPalette(slot, partKey, (palette)=>{
    if (hex){
      palette.shaded = palette.shaded || {};
      palette.shaded[colorKey] = hex;
    } else if (palette.shaded){
      delete palette.shaded[colorKey];
    }
  });
  return true;
}

function getBucketDisplayHex(palette, meta){
  if (!palette || !meta) return '';
  if (meta.type === 'color'){
    return palette.colors?.[meta.colorKey] || '';
  }
  if (meta.type === 'shade'){
    if (palette.shaded?.[meta.colorKey]){
      return palette.shaded[meta.colorKey];
    }
    const baseHex = palette.colors?.[meta.colorKey];
    const amount = palette.shading?.[meta.colorKey];
    if (baseHex && amount != null){
      return applyShade(baseHex, amount);
    }
    return '';
  }
  return '';
}

function updateBucketTargetSelection(){
  if (!bucketTargetsContainer) return;
  const buttons = bucketTargetsContainer.querySelectorAll('[data-bucket]');
  buttons.forEach((btn)=>{
    const isActive = btn.dataset.bucket === editorState.activeBucketKey;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function syncActiveBucketColor(){
  if (!bucketColorInput) return;
  const palette = editorState.currentPalette;
  const activeMeta = BUCKET_DEFS.find((entry)=> entry.bucketKey === editorState.activeBucketKey)
    || BUCKET_DEFS[0];
  if (!palette || !activeMeta){
    return;
  }
  const hex = getBucketDisplayHex(palette, activeMeta);
  bucketColorInput.value = hex || '';
}

function updateBucketTargets(palette){
  if (!bucketTargetsContainer) return;
  bucketTargetsContainer.innerHTML = '';
  if (!palette){
    const empty = document.createElement('p');
    empty.className = 'bucket-targets__empty';
    empty.textContent = 'Select a cosmetic part to configure palette buckets.';
    bucketTargetsContainer.appendChild(empty);
    updateBucketTargetSelection();
    return;
  }
  BUCKET_DEFS.forEach((meta)=>{
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bucket-target';
    button.dataset.bucket = meta.bucketKey;
    const label = document.createElement('span');
    label.className = 'bucket-target__label';
    label.textContent = meta.label;
    const hexSpan = document.createElement('span');
    hexSpan.className = 'bucket-target__hex';
    const displayHex = getBucketDisplayHex(palette, meta);
    hexSpan.textContent = displayHex || '—';
    if (displayHex){
      button.style.setProperty('--bucket-color', displayHex);
    } else {
      button.style.removeProperty('--bucket-color');
    }
    button.addEventListener('click', ()=>{
      setActiveBucket(meta.bucketKey, { focusInput: true });
    });
    button.appendChild(label);
    button.appendChild(hexSpan);
    bucketTargetsContainer.appendChild(button);
  });
  if (!BUCKET_DEFS.some((entry)=> entry.bucketKey === editorState.activeBucketKey)){
    editorState.activeBucketKey = BUCKET_DEFS[0]?.bucketKey || null;
  }
  updateBucketTargetSelection();
  syncActiveBucketColor();
}

function setActiveBucket(bucketKey, { focusInput = false } = {}){
  const meta = BUCKET_DEFS.find((entry)=> entry.bucketKey === bucketKey);
  if (!meta && !editorState.activeBucketKey){
    editorState.activeBucketKey = BUCKET_DEFS[0]?.bucketKey || null;
  } else if (meta){
    editorState.activeBucketKey = meta.bucketKey;
  }
  updateBucketTargetSelection();
  syncActiveBucketColor();
  if (focusInput && bucketColorInput){
    bucketColorInput.focus();
    bucketColorInput.select();
  }
}

function refreshPaletteEditor(){
  const container = document.getElementById('paletteEditor');
  if (!container) return;
  const slot = editorState.activeSlot;
  const partKey = editorState.activePartKey;
  const library = getRegisteredCosmeticLibrary();
  const row = slot ? slotRows.get(slot) : null;
  const cosmeticId = row?.select?.value;
  const cosmetic = cosmeticId ? library[cosmeticId] : null;
  if (!slot || !partKey || !cosmetic){
    container.innerHTML = '<p class="palette-hint">Select a cosmetic part to configure palette buckets.</p>';
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot: null, partKey: null, cosmeticId: null };
    updateBucketTargets(null);
    return;
  }
  renderPaletteEditor(container, slot, cosmetic, partKey);
}

function renderPaletteEditor(container, slot, cosmetic, partKey){
  if (!container) return;
  container.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Palette Buckets';
  container.appendChild(heading);

  if (!cosmetic?.parts?.[partKey]){
    const message = document.createElement('p');
    message.className = 'palette-hint';
    message.textContent = 'This cosmetic part has no editable palette data yet.';
    container.appendChild(message);
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot: null, partKey: null, cosmeticId: null };
    updateBucketTargets(null);
    return;
  }

  const palette = computeEffectivePalette(slot, partKey, cosmetic);
  editorState.currentPalette = palette;
  editorState.currentPaletteSource = { slot, partKey, cosmeticId: cosmetic.id };

  const baseGrid = document.createElement('div');
  baseGrid.className = 'palette-grid';
  BUCKET_DEFS.filter((meta)=> meta.type === 'color').forEach((meta)=>{
    const row = document.createElement('div');
    row.className = 'palette-row';
    const label = document.createElement('span');
    label.className = 'palette-row__label';
    label.textContent = meta.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = palette.colors?.[meta.colorKey] || '';
    input.placeholder = '#336699';
    input.spellcheck = false;
    input.addEventListener('change', (event)=>{
      setPaletteColor(slot, partKey, meta.colorKey, event.target.value);
    });
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'palette-select';
    const colorHex = palette.colors?.[meta.colorKey] || '';
    if (!colorHex){
      selectBtn.dataset.empty = 'true';
    }
    selectBtn.textContent = '🎯 Use bucket';
    selectBtn.title = `Select ${meta.label} bucket`;
    selectBtn.addEventListener('click', ()=>{
      setActiveBucket(meta.bucketKey, { focusInput: true });
    });
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(selectBtn);
    baseGrid.appendChild(row);
  });
  container.appendChild(baseGrid);

  const shadeGrid = document.createElement('div');
  shadeGrid.className = 'palette-grid';
  BUCKET_DEFS.filter((meta)=> meta.type === 'shade').forEach((meta)=>{
    const row = document.createElement('div');
    row.className = 'palette-row palette-row--shade';
    const label = document.createElement('span');
    label.className = 'palette-row__label';
    label.textContent = `${meta.label}`;
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.05';
    amountInput.min = '-1';
    amountInput.max = '1';
    amountInput.value = palette.shading?.[meta.colorKey] != null ? palette.shading[meta.colorKey] : '';
    amountInput.placeholder = '-0.35';
    amountInput.addEventListener('change', (event)=>{
      setPaletteShadeAmount(slot, partKey, meta.colorKey, event.target.value);
    });
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = palette.shaded?.[meta.colorKey] || '';
    const derivedShade = getBucketDisplayHex(palette, meta);
    hexInput.placeholder = derivedShade || '#1f1f1f';
    hexInput.spellcheck = false;
    hexInput.addEventListener('change', (event)=>{
      setPaletteShadeHex(slot, partKey, meta.colorKey, event.target.value);
    });
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'palette-select';
    selectBtn.textContent = '🎯 Use bucket';
    if (!derivedShade){
      selectBtn.dataset.empty = 'true';
    }
    selectBtn.title = `Select ${meta.label} bucket`;
    selectBtn.addEventListener('click', ()=>{
      setActiveBucket(meta.bucketKey, { focusInput: true });
    });
    row.appendChild(label);
    row.appendChild(amountInput);
    row.appendChild(hexInput);
    row.appendChild(selectBtn);
    shadeGrid.appendChild(row);
  });
  container.appendChild(shadeGrid);

  const hint = document.createElement('p');
  hint.className = 'palette-hint';
  hint.textContent = 'Use the bucket buttons to paint preview regions with these colours.';
  container.appendChild(hint);

  updateBucketTargets(palette);
}

function handleBucketColorChange(){
  if (!bucketColorInput) return;
  const slot = editorState.activeSlot;
  const partKey = editorState.activePartKey;
  if (!slot || !partKey){
    return;
  }
  const activeMeta = BUCKET_DEFS.find((entry)=> entry.bucketKey === editorState.activeBucketKey)
    || BUCKET_DEFS[0];
  if (!activeMeta) return;
  const value = bucketColorInput.value;
  let success = false;
  if (activeMeta.type === 'color'){
    success = setPaletteColor(slot, partKey, activeMeta.colorKey, value);
  } else {
    success = setPaletteShadeHex(slot, partKey, activeMeta.colorKey, value);
  }
  if (success){
    syncActiveBucketColor();
  }
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

function getActiveSlotKeys(){
  const appearanceKeys = Array.isArray(editorState.appearanceSlotKeys)
    ? editorState.appearanceSlotKeys
    : [];
  const merged = new Set([...COSMETIC_SLOTS, ...appearanceKeys]);
  return Array.from(merged);
}

function setSelectedCosmetics(slots){
  const slotMap = {};
  for (const slot of getActiveSlotKeys()){
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
  if (slotOverride.palette){
    cleanupPaletteObject(slotOverride.palette);
    if (!hasPaletteContent(slotOverride.palette)){
      delete slotOverride.palette;
    }
  }
  if (slotOverride.parts){
    for (const [partKey, partOverride] of Object.entries(slotOverride.parts)){
      if (partOverride?.image && !partOverride.image.url){
        delete partOverride.image;
      }
      const spriteStyle = partOverride?.spriteStyle;
      if (spriteStyle?.xform){
        for (const [styleKey, values] of Object.entries(spriteStyle.xform)){
          if (!values || Object.keys(values).length === 0){
            delete spriteStyle.xform[styleKey];
          }
        }
        if (Object.keys(spriteStyle.xform).length === 0){
          delete spriteStyle.xform;
        }
      }
      if (spriteStyle && Object.keys(spriteStyle).length === 0){
        delete partOverride.spriteStyle;
      }
      if (partOverride?.styleKey && !partOverride?.spriteStyle?.xform?.[partOverride.styleKey]){
        delete partOverride.styleKey;
      }
      if (partOverride?.palette){
        cleanupPaletteObject(partOverride.palette);
        if (!hasPaletteContent(partOverride.palette)){
          delete partOverride.palette;
        }
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
  if (slotOverride.hsl && Object.keys(slotOverride.hsl).length === 0){
    delete slotOverride.hsl;
  }
  if (slotOverride.image && !slotOverride.image.url){
    delete slotOverride.image;
  }
  if (slotOverride.palette && !hasPaletteContent(slotOverride.palette)){
    delete slotOverride.palette;
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

function getPartOverride(slot, partKey){
  return editorState.slotOverrides?.[slot]?.parts?.[partKey] || null;
}

function resolvePartStyleKey(cosmetic, slot, partKey){
  const part = cosmetic?.parts?.[partKey];
  const partOverride = getPartOverride(slot, partKey);
  if (partOverride?.styleKey){
    return partOverride.styleKey;
  }
  const overrideXform = partOverride?.spriteStyle?.xform;
  if (overrideXform){
    if (overrideXform[partKey]){
      return partKey;
    }
    const keys = Object.keys(overrideXform);
    if (keys.length === 1){
      return keys[0];
    }
  }
  const explicit = part?.styleKey
    || part?.spriteStyle?.styleKey
    || part?.style
    || part?.spriteStyle?.style
    || part?.spriteStyle?.styleName;
  if (explicit){
    return explicit;
  }
  const baseXform = part?.spriteStyle?.base?.xform;
  if (baseXform){
    if (baseXform[partKey]){
      return partKey;
    }
    const keys = Object.keys(baseXform);
    if (keys.length === 1){
      return keys[0];
    }
  }
  switch (partKey){
    case 'arm_L_upper':
    case 'arm_R_upper':
      return 'armUpper';
    case 'arm_L_lower':
    case 'arm_R_lower':
      return 'armLower';
    case 'leg_L_upper':
    case 'leg_R_upper':
      return 'legUpper';
    case 'leg_L_lower':
    case 'leg_R_lower':
      return 'legLower';
    default:
      return partKey;
  }
}

function ensurePartOverride(slot, partKey, styleKey){
  editorState.slotOverrides ||= {};
  const slotOverride = (editorState.slotOverrides[slot] ||= { parts: {} });
  slotOverride.parts ||= {};
  const partOverride = (slotOverride.parts[partKey] ||= {});
  partOverride.spriteStyle ||= {};
  partOverride.spriteStyle.xform ||= {};
  const key = styleKey || partOverride.styleKey || partKey;
  const prevKey = partOverride.styleKey;
  if (prevKey && prevKey !== key && partOverride.spriteStyle.xform[prevKey] && !partOverride.spriteStyle.xform[key]){
    partOverride.spriteStyle.xform[key] = partOverride.spriteStyle.xform[prevKey];
    delete partOverride.spriteStyle.xform[prevKey];
  }
  partOverride.styleKey = key;
  partOverride.spriteStyle.xform[key] ||= {};
  return partOverride.spriteStyle.xform[key];
}

function applyStyleValue(slot, partKey, styleKey, field, rawValue){
  const xform = ensurePartOverride(slot, partKey, styleKey);
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

function getBaseSpriteStyle(cosmetic, partKey, styleKey){
  const part = cosmetic?.parts?.[partKey];
  if (!part) return {};
  const style = part.spriteStyle || {};
  const base = style.base || {};
  const xform = base.xform || {};
  if (styleKey && xform[styleKey]){
    return xform[styleKey];
  }
  if (xform[partKey]){
    return xform[partKey];
  }
  const keys = Object.keys(xform);
  if (keys.length === 1){
    return xform[keys[0]];
  }
  return {};
}

function buildStyleFields(slot, cosmetic, partKey){
  styleFields.innerHTML = '';
  const paletteContainer = document.createElement('div');
  paletteContainer.className = 'palette-editor';
  paletteContainer.id = 'paletteEditor';

  if (!slot || !cosmetic || !partKey){
    const p = document.createElement('p');
    p.textContent = 'Select a cosmetic part to edit sprite style.';
    styleFields.appendChild(p);
    paletteContainer.innerHTML = '<p class="palette-hint">Select a cosmetic part to configure palette buckets.</p>';
    styleFields.appendChild(paletteContainer);
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot: null, partKey: null, cosmeticId: null };
    updateBucketTargets(null);
    return;
  }
  const styleKey = resolvePartStyleKey(cosmetic, slot, partKey);
  const baseXform = getBaseSpriteStyle(cosmetic, partKey, styleKey);
  const current = getPartOverride(slot, partKey)?.spriteStyle?.xform?.[styleKey] || {};
  editorState.activeStyleKey = styleKey;
  const fields = [
    { key: 'ax', label: 'Offset X (ax)', step: 0.01 },
    { key: 'ay', label: 'Offset Y (ay)', step: 0.01 },
    { key: 'scaleX', label: 'Scale X', step: 0.01 },
    { key: 'scaleY', label: 'Scale Y', step: 0.01 },
    { key: 'rotDeg', label: 'Rotation (deg)', step: 0.1 }
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
      applyStyleValue(slot, partKey, styleKey, field.key, event.target.value);
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
  styleFields.appendChild(paletteContainer);
  renderPaletteEditor(paletteContainer, slot, cosmetic, partKey);
}

function showStyleInspector(slot){
  editorState.activeSlot = slot;
  if (!slot){
    editorState.activeStyleKey = null;
  }
  updateSlotSelectsFromState();
  if (!slot){
    styleInspector.dataset.active = 'false';
    styleFields.innerHTML = '<p>Select a cosmetic slot to edit sprite style overrides.</p>';
    stylePartSelect.innerHTML = '';
    styleHeader.textContent = 'No slot selected';
    editorState.activePartKey = null;
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot: null, partKey: null, cosmeticId: null };
    updateBucketTargets(null);
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
    editorState.activeStyleKey = null;
    editorState.activePartKey = null;
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot, partKey: null, cosmeticId: null };
    updateBucketTargets(null);
    return;
  }
  const cosmetic = library[cosmeticId];
  if (!cosmetic){
    styleInspector.dataset.active = 'true';
    stylePartSelect.innerHTML = '';
    styleFields.innerHTML = `<p>Cosmetic \"${cosmeticId}\" is not available in the library.</p>`;
    editorState.activeStyleKey = null;
    editorState.activePartKey = null;
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot, partKey: null, cosmeticId };
    updateBucketTargets(null);
    return;
  }
  const parts = Object.keys(cosmetic.parts || {});
  styleInspector.dataset.active = 'true';
  stylePartSelect.innerHTML = '';
  if (!parts.length){
    styleFields.innerHTML = '';
    const message = document.createElement('p');
    message.textContent = 'This cosmetic has no editable sprite parts.';
    styleFields.appendChild(message);
    const paletteContainer = document.createElement('div');
    paletteContainer.className = 'palette-editor';
    paletteContainer.id = 'paletteEditor';
    paletteContainer.innerHTML = '<p class="palette-hint">This cosmetic has no palette-configurable parts.</p>';
    styleFields.appendChild(paletteContainer);
    editorState.activeStyleKey = null;
    editorState.activePartKey = null;
    editorState.currentPalette = null;
    editorState.currentPaletteSource = { slot, partKey: null, cosmeticId };
    updateBucketTargets(null);
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
  for (const slot of getActiveSlotKeys()){
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.dataset.slot = slot;
    const label = document.createElement('span');
    label.className = 'slot-row__label';
    label.textContent = slot.startsWith('appearance:')
      ? slot.replace('appearance:', 'appearance/')
      : slot;
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
  const { appearance: characterAppearance } = resolveCharacterAppearance(CONFIG, fighterName);
  const appearance = registerFighterAppearance(
    fighterName,
    fighter.appearance || {},
    characterAppearance
  );
  editorState.appearanceSlotKeys = Object.keys(appearance.slots || {});
  populateCreatorSlotOptions();
  const slots = fighter.cosmetics?.slots || fighter.cosmetics || {};
  const combinedSlots = { ...(appearance.slots || {}), ...(slots || {}) };
  const slotMap = setSelectedCosmetics(combinedSlots);
  editorState.assetPinned = false;
  setSelectedAsset(null);
  const profile = getFighterCosmeticProfile(fighterName) || null;
  editorState.profileBaseSnapshot = deepClone(profile || { cosmetics: {} });
  editorState.loadedProfile = deepClone(profile?.cosmetics || {});
  editorState.slotOverrides = mapProfileToSlotOverrides(slotMap, profile);
  editorState.activeSlot = null;
  editorState.activePartKey = null;
  buildSlotRows();
  updateSlotSelectsFromState();
  showStyleInspector(null);
  updateOverrideOutputs();
  showStatus(`Loaded fighter ${fighterName}`, { tone: 'info' });
}

function draw(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderAll(ctx);
  renderSprites(ctx);
  requestAnimationFrame(draw);
}

function attachEventListeners(){
  canvas.addEventListener('click', handleCanvasClick);
  bucketToggle.addEventListener('click', ()=>{
    updateBucketMode(!editorState.bucketActive);
  });
  bucketColorInput?.addEventListener('change', handleBucketColorChange);
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
  updateBucketTargets(null);
  updateBucketMode(false);
  requestAnimationFrame(draw);
})();

