import {
  COSMETIC_SLOTS,
  getRegisteredCosmeticLibrary,
  registerCosmeticLibrary,
  registerFighterCosmeticProfile,
  getFighterCosmeticProfile,
  registerFighterAppearance,
  resolveCharacterAppearance,
  ensureCosmeticLayers
} from './cosmetics.js?v=1';
import { applyShade } from './cosmetic-palettes.js?v=1';

const CONFIG = window.CONFIG || {};
const GAME = (window.GAME ||= {});

const FIGHTER_SPRITE_SLOT_PREFIX = 'fighterSprite:';
const FIGHTER_SPRITE_ID_PREFIX = 'fighterSprite::';
const DEFAULT_APPEARANCE_SLOTS = [
  'appearance:head_hair',
  'appearance:facial_hair',
  'appearance:eyes',
  'appearance:other'
];

class CosmeticEditorApp {
  constructor(){
    this.state = this.createInitialState();
    this.dom = this.queryDom();
    this.slotRows = new Map();
    this.previewRenderScheduled = false;

    this.modeButtons = Array.from(document.querySelectorAll('#modePanel [data-mode]'));

    this.statusTimer = null;

    this.slotGrid = this.buildSlotGridApi();
    this.assetLibrary = this.buildAssetLibraryApi();
    this.overrideManager = this.buildOverrideManagerApi();
    this.styleInspector = this.buildStyleInspectorApi();
    this.modeManager = this.buildModeManagerApi();
    this.fighterManager = this.buildFighterManagerApi();

    this.renderPartPreview();
  }

  createInitialState(){
    return {
      slotOverrides: {},
      slotSelection: {},
      activePartKey: null,
      assetManifest: [],
      filteredAssets: [],
      selectedAsset: null,
      assetPinned: false,
      activeFighter: null,
      loadedProfile: {},
      profileBaseSnapshot: { cosmetics: {} },
      activeSlot: null,
      activeStyleKey: null,
      activeLayerPosition: null,
      appearanceSlotKeys: [],
      fighterSpriteSlots: [],
      fighterSpriteIndex: {},
      currentPalette: null,
      currentPaletteSource: { slot: null, partKey: null, layerPosition: null, cosmeticId: null },
      activeMode: 'clothing',
      activePreviewPart: null,
      previewPartKeys: []
    };
  }

  queryDom(){
    return {
      previewGrid: document.getElementById('partPreviewGrid'),
      fighterSelect: document.getElementById('fighterSelect'),
      slotContainer: document.getElementById('cosmeticSlotRows'),
      styleInspector: document.getElementById('styleInspector'),
      stylePartSelect: document.getElementById('stylePartSelect'),
      styleFields: document.getElementById('styleFields'),
      styleHeader: document.getElementById('styleActiveSlot'),
      styleResetBtn: document.getElementById('resetPartOverrides'),
      styleSlotResetBtn: document.getElementById('resetSlotOverrides'),
      tintPreview: document.getElementById('tintPreview'),
      statusEl: document.getElementById('editorStatus'),
      assetSearch: document.getElementById('assetSearch'),
      assetList: document.getElementById('assetList'),
      assetPreview: document.getElementById('assetPreview'),
      creatorIdInput: document.getElementById('creatorId'),
      creatorNameInput: document.getElementById('creatorName'),
      creatorSlotSelect: document.getElementById('creatorSlot'),
      creatorPartsInput: document.getElementById('creatorParts'),
      creatorAppearanceToggle: document.getElementById('creatorAppearance'),
      creatorBodyColorsInput: document.getElementById('creatorBodyColors'),
      creatorSpriteInput: document.getElementById('creatorSpriteKey'),
      creatorAddBtn: document.getElementById('creatorAdd'),
      creatorEquipBtn: document.getElementById('creatorEquip'),
      creatorApplyBtn: document.getElementById('creatorApplyPart'),
      clothingCreatorPanel: document.getElementById('clothingCreator'),
      overrideOutput: document.getElementById('overrideOutput'),
      overrideApplyBtn: document.getElementById('applyOverrides'),
      overrideCopyBtn: document.getElementById('copyOverrides'),
      overrideDownloadBtn: document.getElementById('downloadOverrides')
    };
  }

  buildModeManagerApi(){
    const MODE_DEFINITIONS = {
      appearance: {
        enableSpriteEditing: false,
        enableCreator: false
      },
      clothing: {
        enableSpriteEditing: true,
        enableCreator: true
      },
      fighterSprites: {
        enableSpriteEditing: true,
        enableCreator: false
      }
    };

    const resolveModeKey = (mode)=> MODE_DEFINITIONS[mode] ? mode : 'clothing';
    const getModeConfig = (mode)=> MODE_DEFINITIONS[resolveModeKey(mode)];

    const normalizeAppearanceSlotKey = (slot)=>{
      if (!slot) return null;
      const trimmed = String(slot).trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('appearance:')){
        return trimmed;
      }
      const lower = trimmed.toLowerCase();
      if (DEFAULT_APPEARANCE_SLOT_SET.has(`appearance:${lower}`)){
        return `appearance:${lower}`;
      }
      if (lower === 'default'){
        return 'appearance:other';
      }
      return null;
    };

    const DEFAULT_APPEARANCE_SLOT_SET = new Set(DEFAULT_APPEARANCE_SLOTS);

    const isAppearanceSlotName = (slot, appearanceKeys)=>{
      if (!slot) return false;
      const normalized = normalizeAppearanceSlotKey(slot);
      if (!normalized) return false;
      if (DEFAULT_APPEARANCE_SLOT_SET.has(normalized)) return true;
      return appearanceKeys?.has(normalized) || false;
    };

    const isFighterSpriteSlot = (slot)=>{
      return typeof slot === 'string' && slot.startsWith(FIGHTER_SPRITE_SLOT_PREFIX);
    };

    const slotMatchesMode = (slot, mode, appearanceKeys)=>{
      const resolved = resolveModeKey(mode);
      if (slot.startsWith('appearance:')){
        return resolved === 'appearance';
      }
      if (isFighterSpriteSlot(slot)){
        return resolved === 'fighterSprites';
      }
      const appearanceSlot = isAppearanceSlotName(slot, appearanceKeys);
      if (resolved === 'appearance'){
        return appearanceSlot;
      }
      if (resolved === 'fighterSprites'){
        return false;
      }
      if (appearanceSlot) return false;
      return true;
    };

    const getActiveSlotKeys = ()=>{
      const mode = resolveModeKey(this.state.activeMode);
      const appearanceKeys = Array.isArray(this.state.appearanceSlotKeys)
        ? new Set(this.state.appearanceSlotKeys)
        : new Set();
      if (mode === 'fighterSprites'){
        const fighterSlots = this.fighterManager.getFighterSpriteSlotKeys();
        return Array.isArray(fighterSlots) ? fighterSlots.slice() : [];
      }
      const slots = [];
      const seen = new Set();
      const addIfMatches = (slot)=>{
        if (!slotMatchesMode(slot, mode, appearanceKeys)) return;
        if (seen.has(slot)) return;
        seen.add(slot);
        slots.push(slot);
      };
      COSMETIC_SLOTS.forEach(addIfMatches);
      appearanceKeys.forEach((slot)=> addIfMatches(slot));
      if (mode === 'appearance'){
        DEFAULT_APPEARANCE_SLOTS.forEach((slot)=> addIfMatches(slot));
      }
      return slots;
    };

    const updateModeVisibility = ()=>{
      const mode = resolveModeKey(this.state.activeMode);
      this.modeButtons.forEach((button)=>{
        const isActive = button?.dataset?.mode === mode;
        button?.classList.toggle('is-active', isActive);
        if (button){
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
      });
      if (typeof document !== 'undefined' && document.body){
        document.body.dataset.editorMode = mode;
      }
      const creatorEnabled = !!getModeConfig(mode)?.enableCreator;
      if (this.dom.clothingCreatorPanel){
        this.dom.clothingCreatorPanel.hidden = !creatorEnabled;
      }
      this.dom.creatorAddBtn && (this.dom.creatorAddBtn.disabled = !creatorEnabled);
      this.dom.creatorEquipBtn && (this.dom.creatorEquipBtn.disabled = !creatorEnabled);
      this.dom.creatorApplyBtn && (this.dom.creatorApplyBtn.disabled = !creatorEnabled);
      if (this.dom.styleInspector){
        this.dom.styleInspector.dataset.spriteEnabled = getModeConfig(mode)?.enableSpriteEditing ? 'true' : 'false';
      }
    };

    const populateCreatorSlotOptions = ()=>{
      const select = this.dom.creatorSlotSelect;
      if (!select) return;
      select.innerHTML = '';
      if (!getModeConfig(this.state.activeMode)?.enableCreator){
        select.disabled = true;
        return;
      }
      select.disabled = false;
      const frag = document.createDocumentFragment();
      for (const slot of getActiveSlotKeys()){
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot.startsWith('appearance:')
          ? slot.replace('appearance:', 'appearance/')
          : slot;
        frag.appendChild(option);
      }
      select.appendChild(frag);
    };

    const setActiveMode = (mode)=>{
      const resolved = resolveModeKey(mode);
      if (this.state.activeMode !== resolved){
        this.state.activeMode = resolved;
      }
      updateModeVisibility();
      populateCreatorSlotOptions();
      const availableSlots = new Set(getActiveSlotKeys());
      this.slotGrid.rebuild();
      this.slotGrid.refreshFromSelection();
      if (!availableSlots.has(this.state.activeSlot)){
        this.state.activeSlot = null;
        this.state.activePartKey = null;
      }
      this.styleInspector.show(this.state.activeSlot);
      this.overrideManager.refreshOutputs();
    };

    const bootstrap = ()=>{
      updateModeVisibility();
      populateCreatorSlotOptions();
    };

    return {
      MODE_DEFINITIONS,
      resolveModeKey,
      getModeConfig,
      getActiveSlotKeys,
      updateModeVisibility,
      populateCreatorSlotOptions,
      setActiveMode,
      bootstrap,
      normalizeAppearanceSlotKey
    };
  }

  buildSlotGridApi(){
    const buildSlotRows = ()=>{
      const library = getRegisteredCosmeticLibrary();
      const mode = this.modeManager.resolveModeKey(this.state.activeMode);
      this.dom.slotContainer.innerHTML = '';
      this.slotRows.clear();
      for (const slot of this.modeManager.getActiveSlotKeys()){
        const row = document.createElement('div');
        row.className = 'slot-row';
        row.dataset.slot = slot;
        const label = document.createElement('span');
        label.className = 'slot-row__label';
        if (slot.startsWith('appearance:')){
          label.textContent = slot.replace('appearance:', 'appearance/');
        } else if (slot.startsWith(FIGHTER_SPRITE_SLOT_PREFIX)){
          const parsed = this.fighterManager.parseFighterSpriteSlot(slot);
          label.textContent = parsed?.partKey ? `fighter/${parsed.partKey}` : slot;
        } else {
          label.textContent = slot;
        }
        const select = document.createElement('select');
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'None';
        if (slot.startsWith(FIGHTER_SPRITE_SLOT_PREFIX)){
          noneOption.disabled = true;
        }
        select.appendChild(noneOption);
        const options = Object.entries(library)
          .filter(([_, cosmetic]) => {
            if (Array.isArray(cosmetic?.slots)){
              return cosmetic.slots.includes(slot);
            }
            return mode !== 'fighterSprites';
          })
          .sort(([a, cosmeticA], [b, cosmeticB])=>{
            const aIsBase = cosmeticA?.type === 'fighterSprite';
            const bIsBase = cosmeticB?.type === 'fighterSprite';
            if (aIsBase && !bIsBase) return -1;
            if (!aIsBase && bIsBase) return 1;
            return a.localeCompare(b);
          });
        for (const [id, cosmetic] of options){
          const option = document.createElement('option');
          option.value = id;
          option.textContent = cosmetic?.meta?.name || id;
          select.appendChild(option);
        }
        select.addEventListener('change', (event)=>{
          this.setSlotSelection(slot, event.target.value);
        });
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'slot-row__edit';
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', ()=>{
          this.styleInspector.show(slot);
        });
        row.appendChild(label);
        row.appendChild(select);
        row.appendChild(editButton);
        this.dom.slotContainer.appendChild(row);
        this.slotRows.set(slot, { element: row, select, editButton, mode });
      }
    };

    const refreshFromSelection = ()=>{
      const slots = GAME.selectedCosmetics?.slots || {};
      for (const [slot, row] of this.slotRows){
        const entry = this.normalizeSlotEntry(slots[slot]);
        const id = entry?.id || '';
        row.select.value = id;
        row.element.dataset.active = this.state.activeSlot === slot ? 'true' : 'false';
      }
    };

    return {
      rebuild: buildSlotRows,
      refreshFromSelection
    };
  }

  buildAssetLibraryApi(){
    const PALETTE_BUCKETS = [
      { key: 'primary', label: 'Primary', type: 'color' },
      { key: 'secondary', label: 'Secondary', type: 'color' },
      { key: 'tertiary', label: 'Tertiary', type: 'color' },
      { key: 'primary', label: 'Shade 1', type: 'shade' },
      { key: 'secondary', label: 'Shade 2', type: 'shade' },
      { key: 'tertiary', label: 'Shade 3', type: 'shade' }
    ];

    const highlightAssetSelection = ()=>{
      const selected = this.state.selectedAsset;
      const items = this.dom.assetList?.querySelectorAll('.asset-item') || [];
      items.forEach((item)=>{
        item.classList.toggle('asset-item--selected', item.dataset.assetPath === selected);
      });
    };

    const setSelectedAsset = (path, { pinned = false } = {})=>{
      this.state.selectedAsset = path || null;
      if (pinned){
        this.state.assetPinned = true;
      } else if (!path){
        this.state.assetPinned = false;
      }
      if (this.dom.assetPreview){
        this.dom.assetPreview.innerHTML = '';
        if (path){
          const img = document.createElement('img');
          img.src = path;
          img.alt = 'Selected asset preview';
          this.dom.assetPreview.appendChild(img);
        } else {
          const span = document.createElement('span');
          span.textContent = 'Select an asset to preview it here.';
          this.dom.assetPreview.appendChild(span);
        }
      }
      highlightAssetSelection();
    };

    const renderAssetList = ()=>{
      if (!this.dom.assetList) return;
      this.dom.assetList.innerHTML = '';
      const assets = this.state.filteredAssets || [];
      if (!assets.length){
        const empty = document.createElement('p');
        empty.textContent = 'No assets match the current search.';
        this.dom.assetList.appendChild(empty);
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
      this.dom.assetList.appendChild(frag);
      highlightAssetSelection();
    };

    const filterAssetList = (query)=>{
      const manifest = this.state.assetManifest || [];
      if (!Array.isArray(manifest)){
        this.state.filteredAssets = [];
        renderAssetList();
        return;
      }
      const norm = (query || '').trim().toLowerCase();
      if (!norm){
        this.state.filteredAssets = manifest.slice();
        renderAssetList();
        return;
      }
      this.state.filteredAssets = manifest.filter((path)=> path.toLowerCase().includes(norm));
      renderAssetList();
    };

    const parsePartKeys = (raw)=>{
      if (!raw) return [];
      return raw
        .split(',')
        .map((part)=> part.trim())
        .filter((part)=> part.length > 0);
    };

    const parseBodyColorLetters = (raw)=>{
      if (!raw) return [];
      return raw
        .split(',')
        .map((entry)=> entry.trim().toUpperCase())
        .filter((entry)=> entry.length > 0);
    };

    const createCustomCosmetic = ()=>{
      const asset = this.state.selectedAsset;
      if (!asset){
        this.showStatus('Select a PNG asset first.', { tone: 'warn' });
        return;
      }
      const id = (this.dom.creatorIdInput?.value || '').trim();
      if (!id){
        this.showStatus('Enter a cosmetic ID to register.', { tone: 'warn' });
        this.dom.creatorIdInput?.focus();
        return;
      }
      const slot = this.dom.creatorSlotSelect?.value;
      if (!slot){
        this.showStatus('Choose a slot for the new cosmetic.', { tone: 'warn' });
        return;
      }
      const isAppearance = slot.startsWith('appearance:') || !!this.dom.creatorAppearanceToggle?.checked;
      const partKeys = parsePartKeys(this.dom.creatorPartsInput?.value || '');
      if (!partKeys.length){
        this.showStatus('Provide at least one part key (e.g., leg_L_upper).', { tone: 'warn' });
        this.dom.creatorPartsInput?.focus();
        return;
      }
      const displayNameRaw = (this.dom.creatorNameInput?.value || '').trim();
      const displayName = displayNameRaw || id.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (ch)=> ch.toUpperCase());
      const appearanceColors = isAppearance ? parseBodyColorLetters(this.dom.creatorBodyColorsInput?.value || '') : [];
      const inheritSprite = isAppearance
        ? (this.dom.creatorSpriteInput?.value || '').trim() || partKeys[0] || ''
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
      this.slotGrid.rebuild();
      this.slotGrid.refreshFromSelection();
      this.showStatus(`Registered cosmetic "${displayName}" in slot ${slot}.`, { tone: 'info' });
    };

    const equipCustomCosmetic = ()=>{
      const slot = this.dom.creatorSlotSelect?.value;
      const id = (this.dom.creatorIdInput?.value || '').trim();
      if (!slot || !id){
        this.showStatus('Choose a slot and cosmetic ID first.', { tone: 'warn' });
        return;
      }
      this.setSlotSelection(slot, id);
      this.slotGrid.refreshFromSelection();
      this.styleInspector.show(slot);
      this.showStatus(`Equipped ${id} in slot ${slot}.`, { tone: 'info' });
    };

    const applyAssetToActivePart = ()=>{
      const slot = this.state.activeSlot;
      const partKey = this.state.activePartKey;
      const asset = this.state.selectedAsset;
      if (!slot || !partKey){
        this.showStatus('Select a slot and part before applying.', { tone: 'warn' });
        return;
      }
      if (!asset){
        this.showStatus('Choose an asset to apply.', { tone: 'warn' });
        return;
      }
      this.state.slotOverrides ||= {};
      const slotOverride = (this.state.slotOverrides[slot] ||= {});
      slotOverride.parts ||= {};
      const partOverride = (slotOverride.parts[partKey] ||= {});
      partOverride.image = partOverride.image || {};
      partOverride.image.url = asset;
      this.overrideManager.refreshOutputs();
      this.styleInspector.refreshPalette();
      this.showStatus('Applied asset to active part.', { tone: 'info' });
    };

    return {
      PALETTE_BUCKETS,
      highlightAssetSelection,
      setSelectedAsset,
      renderAssetList,
      filterAssetList,
      parsePartKeys,
      parseBodyColorLetters,
      createCustomCosmetic,
      equipCustomCosmetic,
      applyAssetToActivePart
    };
  }

  buildOverrideManagerApi(){
    const buildOverridePayload = ()=>{
      const slotSelection = this.state.slotSelection || {};
      const payload = { cosmetics: {} };
      for (const [slot, entry] of Object.entries(slotSelection)){
        const id = entry?.id;
        if (!id) continue;
        const overrides = this.state.slotOverrides?.[slot];
        if (!overrides || Object.keys(overrides).length === 0) continue;
        payload.cosmetics[id] = this.deepClone(overrides);
      }
      return payload;
    };

    const mergeProfileData = (baseProfile = {}, overrides = {})=>{
      const baseClone = this.isPlainObject(baseProfile) || Array.isArray(baseProfile)
        ? this.deepClone(baseProfile)
        : {};

      const mergeInto = (target, source)=>{
        if (!this.isPlainObject(source)) return target;
        for (const [key, value] of Object.entries(source)){
          if (Array.isArray(value)){
            target[key] = value.map((item)=> this.deepClone(item));
            continue;
          }
          if (this.isPlainObject(value)){
            const current = target[key];
            target[key] = mergeInto(this.isPlainObject(current) ? current : {}, value);
            continue;
          }
          target[key] = value;
        }
        return target;
      };

      return mergeInto(baseClone, overrides);
    };

    const buildMergedProfilePayload = (overridePayload)=>{
      const baseProfile = this.state.profileBaseSnapshot || { cosmetics: {} };
      const overrides = overridePayload || buildOverridePayload();
      return mergeProfileData(baseProfile, overrides);
    };

    const buildFighterSpriteExport = ()=>{
      if (this.modeManager.resolveModeKey(this.state.activeMode) !== 'fighterSprites'){
        return null;
      }
      const fighter = this.state.activeFighter;
      if (fighter == null || fighter === ''){
        return null;
      }
      const exportSlots = {};
      for (const slot of this.fighterManager.getFighterSpriteSlotKeys()){
        const parsed = this.fighterManager.parseFighterSpriteSlot(slot);
        if (!parsed || parsed.fighter !== fighter) continue;
        const overrides = this.state.slotOverrides?.[slot];
        if (overrides && Object.keys(overrides).length > 0){
          exportSlots[parsed.partKey] = this.deepClone(overrides);
        }
      }
      if (Object.keys(exportSlots).length === 0){
        return null;
      }
      return {
        fighters: {
          [fighter]: {
            sprites: { slots: exportSlots }
          }
        }
      };
    };

    const prepareDownloadPayload = ()=>{
      const overridePayload = buildOverridePayload();
      const cosmetics = overridePayload.cosmetics || {};
      const hasOverrides = Object.keys(cosmetics).length > 0;
      const mergedProfile = hasOverrides ? buildMergedProfilePayload(overridePayload) : null;
      return { overridePayload, mergedProfile, hasOverrides };
    };

    const refreshOutputs = ()=>{
      if (this.dom.overrideOutput == null) return;
      const { mergedProfile, hasOverrides } = prepareDownloadPayload();
      const fighterEntry = buildFighterSpriteExport();
      const sections = [];
      if (fighterEntry){
        sections.push('// Fighter sprite entry', JSON.stringify(fighterEntry, null, 2));
      }
      if (hasOverrides && mergedProfile){
        sections.push(fighterEntry ? '// Cosmetic overrides' : '', JSON.stringify(mergedProfile, null, 2));
      }
      const hasAny = sections.length > 0;
      this.dom.overrideOutput.value = hasAny ? sections.filter((section)=> section !== '').join('\n\n') : '// No overrides defined for this fighter.';
      const canApply = hasOverrides && mergedProfile;
      if (this.dom.overrideApplyBtn) this.dom.overrideApplyBtn.disabled = canApply ? false : true;
      if (this.dom.overrideCopyBtn) this.dom.overrideCopyBtn.disabled = hasAny ? false : true;
      if (this.dom.overrideDownloadBtn) this.dom.overrideDownloadBtn.disabled = hasAny ? false : true;
      this.queuePreviewRender();
    };

    const applyOverridesToProfile = ()=>{
      if (!this.state.activeFighter){
        this.showStatus('Load a fighter before applying overrides.', { tone: 'warn' });
        return;
      }
      const payload = buildOverridePayload();
      const mergedProfile = registerFighterCosmeticProfile(this.state.activeFighter, payload);
      this.state.profileBaseSnapshot = this.deepClone(mergedProfile || { cosmetics: {} });
      this.state.loadedProfile = this.deepClone(mergedProfile?.cosmetics || {});
      this.showStatus('Applied overrides to fighter preview.', { tone: 'info' });
      refreshOutputs();
    };

    const copyOverridesToClipboard = async ()=>{
      if (!this.dom.overrideOutput) return;
      const text = this.dom.overrideOutput.value || '';
      if (!text || text.startsWith('// ')){
        this.showStatus('No override JSON to copy yet.', { tone: 'warn' });
        return;
      }
      if (!navigator?.clipboard){
        this.showStatus('Clipboard API unavailable in this browser.', { tone: 'warn' });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        this.showStatus('Override JSON copied to clipboard.', { tone: 'info' });
      } catch (err){
        console.warn('[cosmetic-editor] Copy failed', err);
        this.showStatus('Unable to copy overrides to clipboard.', { tone: 'error' });
      }
    };

    const downloadOverridesJson = ()=>{
      const { mergedProfile, hasOverrides } = prepareDownloadPayload();
      const fighterEntry = buildFighterSpriteExport();
      const hasCosmetics = hasOverrides && mergedProfile;
      if (!fighterEntry && !hasCosmetics){
        this.showStatus('No override JSON to download.', { tone: 'warn' });
        return;
      }
      const fighter = this.state.activeFighter || 'fighter';
      let text;
      let filename;
      if (fighterEntry && hasCosmetics){
        text = JSON.stringify({ fighterSprites: fighterEntry.fighters, profile: mergedProfile }, null, 2);
        filename = `${fighter}-sprites-and-cosmetics.json`;
      } else if (fighterEntry){
        text = JSON.stringify(fighterEntry, null, 2);
        filename = `${fighter}-fighter-sprites.json`;
      } else {
        text = JSON.stringify(mergedProfile, null, 2);
        filename = `${fighter}-cosmetics.json`;
      }
      if (this.dom.overrideOutput){
        this.dom.overrideOutput.value = text;
      }
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(()=> URL.revokeObjectURL(url), 1000);
      this.showStatus('Downloaded fighter data.', { tone: 'info' });
    };

    return {
      buildOverridePayload,
      refreshOutputs,
      applyOverridesToProfile,
      copyOverridesToClipboard,
      downloadOverridesJson,
      prepareDownloadPayload,
      buildMergedProfilePayload
    };
  }

  buildStyleInspectorApi(){
    const normalizeHexInputString = (value)=>{
      const trimmed = (value || '').trim();
      if (!trimmed) return null;
      const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
      if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)){
        return null;
      }
      const hex = normalized.length === 3
        ? normalized.split('').map((ch)=> ch + ch).join('')
        : normalized;
      return `#${hex.toLowerCase()}`;
    };

    const normalizeShadeInput = (rawValue)=>{
      if (rawValue == null || rawValue === '') return null;
      if (typeof rawValue === 'number'){ return this.clampNumber(rawValue, -1, 1); }
      const trimmed = String(rawValue).trim();
      if (!trimmed) return null;
      const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
      if (percentMatch){
        const parsed = Number(percentMatch[1]) / 100;
        if (Number.isFinite(parsed)){
          return this.clampNumber(parsed, -1, 1);
        }
        return null;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return null;
      return this.clampNumber(parsed, -1, 1);
    };

    const cleanupPaletteObject = (palette)=>{
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
    };

    const hasPaletteContent = (value)=>{
      if (value == null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number') return !Number.isNaN(value);
      if (typeof value === 'boolean') return true;
      if (Array.isArray(value)) return value.some(hasPaletteContent);
      if (typeof value === 'object'){
        return Object.values(value).some(hasPaletteContent);
      }
      return false;
    };

    const mutatePartPalette = (slot, partKey, layerPosition, mutate)=>{
      if (!slot || !partKey || typeof mutate !== 'function') return;
      const normalizedLayer = this.normalizeLayerPosition(layerPosition);
      const layerOverride = this.getLayerOverride(slot, partKey, normalizedLayer, { create: true });
      layerOverride.palette = layerOverride.palette || {};
      mutate(layerOverride.palette);
      cleanupPaletteObject(layerOverride.palette);
      if (!hasPaletteContent(layerOverride.palette)){
        delete layerOverride.palette;
      }
      this.cleanupEmptyOverrides(slot);
      this.overrideManager.refreshOutputs();
      renderTintPreview();
    };

    const mutateSlotHsl = (slot, mutate)=>{
      if (!slot || typeof mutate !== 'function') return;
      this.state.slotOverrides ||= {};
      const slotOverride = (this.state.slotOverrides[slot] ||= {});
      slotOverride.hsl = slotOverride.hsl || {};
      mutate(slotOverride.hsl);
      if (!Object.keys(slotOverride.hsl).length){
        delete slotOverride.hsl;
      }
      this.cleanupEmptyOverrides(slot);
      this.overrideManager.refreshOutputs();
      renderTintPreview();
    };

    const mutatePartHsl = (slot, partKey, layerPosition, mutate)=>{
      if (!slot || !partKey || typeof mutate !== 'function') return;
      const normalizedLayer = this.normalizeLayerPosition(layerPosition);
      const layerOverride = this.getLayerOverride(slot, partKey, normalizedLayer, { create: true });
      layerOverride.hsl = layerOverride.hsl || {};
      mutate(layerOverride.hsl);
      if (!Object.keys(layerOverride.hsl).length){
        delete layerOverride.hsl;
      }
      this.cleanupEmptyOverrides(slot);
      this.overrideManager.refreshOutputs();
      renderTintPreview();
    };

    const resolveHslBounds = (cosmetic, channel)=>{
      const fallback = channel === 'h' ? [-180, 180] : [-1, 1];
      if (!cosmetic || typeof cosmetic !== 'object'){ return fallback; }
      const limits = cosmetic?.hsl?.limits || {};
      const pair = channel === 'l'
        ? (Array.isArray(limits?.l) ? limits.l : limits?.v)
        : limits?.[channel];
      const min = Number.isFinite(pair?.[0]) ? pair[0] : fallback[0];
      const max = Number.isFinite(pair?.[1]) ? pair[1] : fallback[1];
      return [min, max];
    };

    const normalizeHslInput = (channel, rawValue, cosmetic)=>{
      const [min, max] = resolveHslBounds(cosmetic, channel);
      if (rawValue == null || rawValue === ''){
        return { remove: true, min, max };
      }
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue);
      if (!trimmed){
        return { remove: true, min, max };
      }
      let value;
      if (channel === 's' || channel === 'l'){
        if (/^-?\d+(?:\.\d+)?%$/.test(trimmed)){
          value = Number(trimmed.slice(0, -1)) / 100;
        } else {
          const parsed = Number(trimmed);
          if (!Number.isFinite(parsed)){
            return { error: true, min, max };
          }
          value = Math.abs(parsed) > 2 ? parsed / 100 : parsed;
        }
      } else {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)){
          return { error: true, min, max };
        }
        value = parsed;
      }
      const clamped = this.clampNumber(value, min, max);
      return { value: clamped, remove: false, min, max };
    };

    const formatHslRange = (channel, min, max)=>{
      if (channel === 'h'){
        return `${Math.round(min)}° to ${Math.round(max)}°`;
      }
      const low = Math.round(min * 100);
      const high = Math.round(max * 100);
      return `${low}% to ${high}%`;
    };

    const setSlotHslValue = (slot, channel, rawValue, cosmetic)=>{
      if (!slot) return false;
      const result = normalizeHslInput(channel, rawValue, cosmetic);
      if (result.error){
        const label = channel === 'h' ? 'Hue' : channel === 's' ? 'Saturation' : 'Lightness';
        this.showStatus(`Enter a ${label.toLowerCase()} between ${formatHslRange(channel, result.min, result.max)}.`, { tone: 'warn' });
        renderTintPreview();
        return false;
      }
      mutateSlotHsl(slot, (hsl)=>{
        if (result.remove){
          delete hsl[channel];
        } else {
          hsl[channel] = result.value;
        }
      });
      return true;
    };

    const setPartHslValue = (slot, partKey, layerPosition, channel, rawValue, cosmetic)=>{
      if (!slot || !partKey) return false;
      const result = normalizeHslInput(channel, rawValue, cosmetic);
      if (result.error){
        const label = channel === 'h' ? 'Hue' : channel === 's' ? 'Saturation' : 'Lightness';
        this.showStatus(`Enter a ${label.toLowerCase()} between ${formatHslRange(channel, result.min, result.max)}.`, { tone: 'warn' });
        renderTintPreview();
        return false;
      }
      mutatePartHsl(slot, partKey, layerPosition, (hsl)=>{
        if (result.remove){
          delete hsl[channel];
        } else {
          hsl[channel] = result.value;
        }
      });
      return true;
    };

    const setPaletteColor = (slot, partKey, layerPosition, colorKey, rawValue)=>{
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
      const hex = trimmed ? normalizeHexInputString(trimmed) : null;
      if (trimmed && !hex){
        this.showStatus('Enter a valid hex colour (e.g., #ff9933).', { tone: 'warn' });
        renderPaletteEditor();
        return false;
      }
      mutatePartPalette(slot, partKey, layerPosition, (palette)=>{
        if (hex){
          palette.colors = palette.colors || {};
          palette.colors[colorKey] = hex;
        } else if (palette.colors){
          delete palette.colors[colorKey];
        }
      });
      return true;
    };

    const setPaletteShadeAmount = (slot, partKey, layerPosition, colorKey, rawValue)=>{
      const hasValue = !(rawValue == null || rawValue === '');
      const normalized = hasValue ? normalizeShadeInput(rawValue) : null;
      if (hasValue && normalized == null){
        this.showStatus('Enter a shade amount between -1 and 1 (or -100 to 100%).', { tone: 'warn' });
        renderPaletteEditor();
        return false;
      }
      mutatePartPalette(slot, partKey, layerPosition, (palette)=>{
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
    };

    const setPaletteShadeHex = (slot, partKey, layerPosition, colorKey, rawValue)=>{
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
      const hex = trimmed ? normalizeHexInputString(trimmed) : null;
      if (trimmed && !hex){
        this.showStatus('Enter a valid hex colour (e.g., #1f1f1f).', { tone: 'warn' });
        renderPaletteEditor();
        return false;
      }
      mutatePartPalette(slot, partKey, layerPosition, (palette)=>{
        if (hex){
          palette.shaded = palette.shaded || {};
          palette.shaded[colorKey] = hex;
        } else if (palette.shaded){
          delete palette.shaded[colorKey];
        }
      });
      return true;
    };

    const mergePaletteSection = (palette, source)=>{
      if (!palette || !source) return;
      if (source.colors){
        palette.colors ||= {};
        Object.assign(palette.colors, this.deepClone(source.colors));
      }
      if (source.shaded){
        palette.shaded ||= {};
        Object.assign(palette.shaded, this.deepClone(source.shaded));
      }
      if (source.shading){
        palette.shading ||= {};
        Object.assign(palette.shading, this.deepClone(source.shading));
      }
      if (source.bucketMap){
        palette.bucketMap ||= {};
        Object.assign(palette.bucketMap, this.deepClone(source.bucketMap));
      }
      if (source.rows){
        palette.rows ||= [];
        for (const row of source.rows){
          if (row != null && String(row).trim().length > 0){
            palette.rows.push(String(row).trim());
          }
        }
      }
      if (source.variantRowMap){
        palette.variantRowMap ||= {};
        Object.assign(palette.variantRowMap, this.deepClone(source.variantRowMap));
      }
      if (source.bodyOrder){
        palette.bodyOrder ||= [];
        const order = Array.isArray(source.bodyOrder)
          ? source.bodyOrder
          : [source.bodyOrder];
        for (const entry of order){
          if (entry != null && String(entry).trim().length > 0){
            palette.bodyOrder.push(String(entry).trim());
          }
        }
      }
      if (source.meta){
        palette.meta ||= {};
        Object.assign(palette.meta, this.deepClone(source.meta));
      }
    };

    const computeEffectivePalette = (slot, partKey, layerPosition, cosmetic)=>{
      const palette = {
        colors: {},
        shaded: {},
        shading: {},
        bucketMap: {}
      };
      const normalizedLayer = this.normalizeLayerPosition(layerPosition);
      const partLayer = this.getCosmeticPartLayerConfig(cosmetic, partKey, normalizedLayer);
      mergePaletteSection(palette, cosmetic?.parts?.[partKey]?.palette);
      mergePaletteSection(palette, partLayer?.palette);
      const slotOverride = this.state.slotOverrides?.[slot];
      mergePaletteSection(palette, slotOverride?.palette);
      mergePaletteSection(palette, slotOverride?.layers?.[normalizedLayer]?.palette);
      mergePaletteSection(palette, slotOverride?.parts?.[partKey]?.palette);
      mergePaletteSection(palette, slotOverride?.parts?.[partKey]?.layers?.[normalizedLayer]?.palette);
      return palette;
    };

    const getTintHex = (palette, colorKey)=>{
      if (!palette || !colorKey) return '';
      if (palette.shaded?.[colorKey]){
        return palette.shaded[colorKey];
      }
      const baseHex = palette.colors?.[colorKey];
      const amount = palette.shading?.[colorKey];
      if (baseHex && amount != null){
        return applyShade(baseHex, amount);
      }
      return baseHex || '';
    };

    const formatHueDelta = (value)=>{
      if (!Number.isFinite(value) || value === 0){
        return '0°';
      }
      const rounded = Math.round(value);
      const sign = rounded > 0 ? '+' : '';
      return `${sign}${rounded}°`;
    };

    const formatPercentDelta = (value)=>{
      if (!Number.isFinite(value) || value === 0){
        return '0%';
      }
      const pct = Math.round(value * 100);
      const sign = pct > 0 ? '+' : '';
      return `${sign}${pct}%`;
    };

    const createFigure = (label, url, filter)=>{
      const figure = document.createElement('figure');
      figure.className = 'tint-preview__figure';
      const img = document.createElement('img');
      img.className = 'tint-preview__image';
      img.src = url;
      img.alt = label;
      img.decoding = 'async';
      if (filter && filter !== 'none'){
        img.style.filter = filter;
      }
      const caption = document.createElement('figcaption');
      caption.className = 'tint-preview__caption';
      caption.textContent = label;
      figure.appendChild(img);
      figure.appendChild(caption);
      return figure;
    };

    const appendDetail = (list, label, value)=>{
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.appendChild(dt);
      list.appendChild(dd);
    };

    const computeEffectiveHsl = (slot, partKey, layerPosition, cosmetic)=>{
      if (!slot || !partKey || !cosmetic || !this.state.activeFighter){
        return null;
      }
      const fighterName = this.state.activeFighter;
      const fighterConfig = CONFIG.fighters?.[fighterName] || {};
      const baseStyle = fighterConfig.spriteStyle || fighterConfig.sprites?.style || {};
      const previousEditorState = GAME.editorState;
      const overridesClone = this.deepClone(this.state.slotOverrides || {});
      GAME.editorState = {
        ...(previousEditorState && typeof previousEditorState === 'object' ? previousEditorState : {}),
        slotOverrides: overridesClone
      };
      try {
        const layers = ensureCosmeticLayers(CONFIG, fighterName, baseStyle) || [];
        const normalizedLayer = this.normalizeLayerPosition(layerPosition);
        const match = layers.find((layer)=> layer.slot === slot && layer.partKey === partKey && layer.cosmeticId === cosmetic.id && this.normalizeLayerPosition(layer.position) === normalizedLayer);
        return match?.hsl || { h: 0, s: 0, l: 0 };
      } catch (err){
        console.warn('[cosmetic-editor] Unable to resolve tint preview HSL', err);
        return null;
      } finally {
        if (previousEditorState !== undefined){
          GAME.editorState = previousEditorState;
        } else {
          delete GAME.editorState;
        }
      }
    };

    const renderPaletteEditor = (container = document.getElementById('paletteEditor'))=>{
      if (!container) return;
      const slot = this.state.activeSlot;
      const partKey = this.state.activePartKey;
      const layerPosition = this.state.activeLayerPosition;
      const library = getRegisteredCosmeticLibrary();
      const row = slot ? this.slotRows.get(slot) : null;
      const cosmeticId = row?.select?.value || '';
      const cosmetic = cosmeticId ? library[cosmeticId] : null;
      const palette = slot && partKey ? computeEffectivePalette(slot, partKey, layerPosition, cosmetic) : null;
      container.innerHTML = '';
      if (!slot || !partKey || !palette){
        const hint = document.createElement('p');
        hint.className = 'palette-hint';
        hint.textContent = 'Select a cosmetic part to edit tint overrides.';
        container.appendChild(hint);
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'palette-grid';
      for (const bucket of this.assetLibrary.PALETTE_BUCKETS){
        const rowEl = document.createElement('div');
        rowEl.className = 'palette-row';
        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = bucket.label;
        const baseInput = document.createElement('input');
        baseInput.type = 'text';
        baseInput.placeholder = '#ffffff';
        baseInput.value = palette.colors?.[bucket.key] || '';
        baseInput.addEventListener('change', (event)=>{
          setPaletteColor(slot, partKey, layerPosition, bucket.key, event.target.value);
        });
        const shadeInput = document.createElement('input');
        shadeInput.type = 'text';
        shadeInput.placeholder = bucket.type === 'shade' ? 'Shade amount' : 'Tint shade';
        if (bucket.type === 'shade'){
          shadeInput.value = palette.shading?.[bucket.key] != null ? palette.shading[bucket.key] : '';
          shadeInput.addEventListener('change', (event)=>{
            setPaletteShadeAmount(slot, partKey, layerPosition, bucket.key, event.target.value);
          });
        } else {
          shadeInput.value = palette.shaded?.[bucket.key] || '';
          shadeInput.addEventListener('change', (event)=>{
            setPaletteShadeHex(slot, partKey, layerPosition, bucket.key, event.target.value);
          });
        }
        const tinted = document.createElement('div');
        tinted.className = 'palette-tinted-value';
        tinted.textContent = getTintHex(palette, bucket.key) || '—';
        const swatch = document.createElement('span');
        swatch.className = 'palette-swatch';
        const hex = getTintHex(palette, bucket.key);
        swatch.style.background = hex || 'transparent';
        swatch.title = hex || 'No tint';
        rowEl.appendChild(label);
        rowEl.appendChild(baseInput);
        rowEl.appendChild(shadeInput);
        rowEl.appendChild(tinted);
        rowEl.appendChild(swatch);
        grid.appendChild(rowEl);
      }
      container.appendChild(grid);
    };

    const renderTintPreview = ()=>{
      const container = this.dom.tintPreview;
      if (!container) return;
      container.innerHTML = '';
      const { slot, partKey, layerPosition, cosmeticId } = this.state.currentPaletteSource;
      if (!slot || !partKey || !cosmeticId){
        const note = document.createElement('p');
        note.className = 'tint-preview__context';
        note.textContent = 'Pick a slot and part to preview tint results.';
        container.appendChild(note);
        return;
      }
      const library = getRegisteredCosmeticLibrary();
      const cosmetic = library[cosmeticId];
      if (!cosmetic){
        const note = document.createElement('p');
        note.className = 'tint-preview__context';
        note.textContent = `Cosmetic "${cosmeticId}" is unavailable in the current library.`;
        container.appendChild(note);
        return;
      }
      const palette = computeEffectivePalette(slot, partKey, layerPosition, cosmetic) || { colors: {}, shaded: {}, shading: {}, bucketMap: {} };
      this.state.currentPalette = palette;
      const assetUrl = this.getEffectivePartImage(slot, cosmetic, partKey, layerPosition);
      const hsl = computeEffectiveHsl(slot, partKey, layerPosition, cosmetic);
      const slotOverride = this.state.slotOverrides?.[slot] || {};
      const partOverride = slotOverride?.parts?.[partKey] || {};
      const slotHslOverride = slotOverride?.hsl || {};
      const partLayerOverride = partOverride?.layers?.[this.normalizeLayerPosition(layerPosition)] || {};
      const partHslOverride = partLayerOverride?.hsl || {};

      const header = document.createElement('h3');
      const layerLabel = this.normalizeLayerPosition(layerPosition) === 'back' ? 'back' : 'front';
      header.textContent = `Tint preview – ${partKey} (${layerLabel})`;
      container.appendChild(header);

      const context = document.createElement('p');
      context.className = 'tint-preview__context';
      context.textContent = assetUrl
        ? 'Preview applies the current HSL offsets to the source sprite colours.'
        : 'No sprite image available for this part. Current HSL settings are listed below.';
      container.appendChild(context);

      if (assetUrl){
        const figures = document.createElement('div');
        figures.className = 'tint-preview__images';
        figures.appendChild(createFigure('Original sprite', assetUrl, 'none'));
        figures.appendChild(createFigure('Tinted preview', assetUrl, this.buildTintFilter(hsl)));
        container.appendChild(figures);
      }

      const details = document.createElement('dl');
      details.className = 'tint-preview__details';
      appendDetail(details, 'Hue Δ', formatHueDelta(hsl?.h));
      appendDetail(details, 'Saturation Δ', formatPercentDelta(hsl?.s));
      appendDetail(details, 'Lightness Δ', formatPercentDelta(hsl?.l ?? hsl?.v));
      container.appendChild(details);

      const controls = document.createElement('div');
      controls.className = 'tint-preview__controls';
      const defaults = cosmetic?.hsl?.defaults || {};
      const fields = [
        { key: 'h', label: 'Hue (°)', placeholder: Number.isFinite(defaults.h) ? defaults.h : 0 },
        { key: 's', label: 'Saturation', placeholder: Number.isFinite(defaults.s) ? defaults.s : 0 },
        { key: 'l', label: 'Lightness', placeholder: Number.isFinite(defaults.l ?? defaults.v) ? (defaults.l ?? defaults.v) : 0 }
      ];

      const createHslFieldset = (title, overrides, onCommit)=>{
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'tint-preview__fieldset';
        const legend = document.createElement('legend');
        legend.textContent = title;
        fieldset.appendChild(legend);
        for (const field of fields){
          const [min, max] = resolveHslBounds(cosmetic, field.key);
          const wrapper = document.createElement('label');
          wrapper.className = 'tint-preview__hsl-field';
          const span = document.createElement('span');
          span.className = 'tint-preview__hsl-label';
          span.textContent = field.label;
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.placeholder = String(field.placeholder ?? 0);
          if (Number.isFinite(overrides?.[field.key])){
            const value = overrides[field.key];
            input.value = field.key === 'h'
              ? String(value)
              : String(Math.round(value * 1000) / 1000);
          }
          input.title = field.key === 'h'
            ? `Range ${Math.round(min)}° to ${Math.round(max)}°`
            : `Range ${Math.round(min * 100)}% to ${Math.round(max * 100)}%`;
          input.addEventListener('change', (event)=>{
            onCommit(field.key, event.target.value);
          });
          const hint = document.createElement('span');
          hint.className = 'tint-preview__hsl-hint';
          hint.textContent = field.key === 'h'
            ? `Range: ${Math.round(min)}° – ${Math.round(max)}°`
            : `Range: ${Math.round(min * 100)}% – ${Math.round(max * 100)}%`;
          wrapper.appendChild(span);
          wrapper.appendChild(input);
          wrapper.appendChild(hint);
          fieldset.appendChild(wrapper);
        }
        return fieldset;
      };

      controls.appendChild(createHslFieldset('Slot tint overrides', slotHslOverride, (channel, value)=>{
        setSlotHslValue(slot, channel, value, cosmetic);
      }));
      controls.appendChild(createHslFieldset('Part tint overrides', partHslOverride, (channel, value)=>{
        setPartHslValue(slot, partKey, layerPosition, channel, value, cosmetic);
      }));
      const hint = document.createElement('p');
      hint.className = 'tint-preview__context';
      hint.textContent = 'Leave a field blank to remove an override. Use percentages for saturation and lightness if preferred (e.g., 20%).';
      controls.appendChild(hint);
      container.appendChild(controls);

      const paletteRows = [];
      for (const bucket of this.assetLibrary.PALETTE_BUCKETS){
        const isShade = bucket.type === 'shade';
        const hex = isShade ? (palette.shaded?.[bucket.key] || '') : (palette.colors?.[bucket.key] || '');
        const shadeAmount = palette.shading?.[bucket.key];
        const hasValue = (hex && hex.trim().length > 0) || (isShade && shadeAmount != null);
        if (!hasValue) continue;
        const rowEl = document.createElement('div');
        rowEl.className = 'tint-preview__palette-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'tint-preview__palette-label';
        labelEl.textContent = bucket.label;
        rowEl.appendChild(labelEl);
        if (!isShade){
          const swatch = document.createElement('span');
          swatch.className = 'tint-preview__palette-swatch';
          swatch.style.background = hex;
          rowEl.appendChild(swatch);
          const valueEl = document.createElement('code');
          valueEl.className = 'tint-preview__palette-value';
          valueEl.textContent = hex;
          rowEl.appendChild(valueEl);
        } else {
          const valueEl = document.createElement('code');
          valueEl.className = 'tint-preview__palette-value';
          if (hex){
            valueEl.textContent = hex;
          } else {
            const amt = Number(shadeAmount);
            valueEl.textContent = Number.isFinite(amt) ? amt.toString() : '—';
          }
          rowEl.appendChild(valueEl);
        }
        paletteRows.push(rowEl);
      }
      if (paletteRows.length){
        const paletteSection = document.createElement('div');
        paletteSection.className = 'tint-preview__palette';
        paletteRows.forEach((row)=> paletteSection.appendChild(row));
        container.appendChild(paletteSection);
      }

      const mapEntries = Object.entries(palette.bucketMap || {});
      if (mapEntries.length){
        const note = document.createElement('p');
        note.className = 'tint-preview__context';
        note.textContent = `Body colour map: ${mapEntries.map(([key, value])=> `${key} → ${value}`).join(', ')}`;
        container.appendChild(note);
      }
    };

    const listPartLayerOptions = (cosmetic)=>{
      const options = [];
      for (const [partKey, part] of Object.entries(cosmetic?.parts || {})){
        const layerMap = part?.layers && typeof part.layers === 'object' ? part.layers : null;
        if (layerMap && Object.keys(layerMap).length){
          for (const [layerKey, layerDef] of Object.entries(layerMap)){
            const position = this.normalizeLayerPosition(layerDef?.position || layerKey);
            const label = position === 'back' ? 'back' : 'front';
            options.push({ partKey, position, value: `${partKey}::${position}`, label: `${partKey} (${label})` });
          }
        } else {
          options.push({ partKey, position: 'front', value: `${partKey}::front`, label: `${partKey} (front)` });
        }
      }
      return options;
    };

    const highlightActivePartAsset = (slot, partKey, layerPosition, cosmetic)=>{
      if (!slot || !partKey){
        if (!this.state.assetPinned){
          this.assetLibrary.setSelectedAsset(null);
        }
        return;
      }
      const assetUrl = this.getEffectivePartImage(slot, cosmetic, partKey, layerPosition);
      if (assetUrl && !this.state.assetPinned){
        this.assetLibrary.setSelectedAsset(assetUrl);
      }
    };

    const renderStyleFields = (slot, cosmeticId, cosmetic, partKey, layerPosition)=>{
      this.dom.styleFields.innerHTML = '';
      const isSpriteMode = !!this.modeManager.getModeConfig(this.state.activeMode)?.enableSpriteEditing;
      const paletteContainer = document.createElement('div');
      paletteContainer.className = 'palette-editor';
      paletteContainer.id = 'paletteEditor';
      if (isSpriteMode){
        const styleKeyWrapper = document.createElement('label');
        styleKeyWrapper.className = 'style-field';
        const span = document.createElement('span');
        span.textContent = 'Sprite style key';
        const input = document.createElement('input');
        input.type = 'text';
        const basePartConfig = cosmetic?.parts?.[partKey] || {};
        const partLayerConfig = this.getCosmeticPartLayerConfig(cosmetic, partKey, layerPosition) || {};
        const partOverride = this.state.slotOverrides?.[slot]?.parts?.[partKey] || {};
        const baseStyleKey = basePartConfig.styleKey || partLayerConfig.styleKey || '';
        const currentStyleKey = partOverride.styleKey || baseStyleKey;
        input.placeholder = baseStyleKey;
        input.value = currentStyleKey;
        input.addEventListener('change', (event)=>{
          this.applyStyleValue(slot, partKey, layerPosition, null, 'styleKey', event.target.value);
        });
        styleKeyWrapper.appendChild(span);
        styleKeyWrapper.appendChild(input);
        this.dom.styleFields.appendChild(styleKeyWrapper);
        const styleKey = currentStyleKey || baseStyleKey;
        this.state.activeStyleKey = styleKey || null;
        const baseSpriteStyle = partLayerConfig?.spriteStyle || basePartConfig.spriteStyle || {};
        const baseXform = baseSpriteStyle?.xform?.[styleKey] || {};
        const overrideLayer = partOverride?.layers?.[this.normalizeLayerPosition(layerPosition)] || {};
        const currentXform = overrideLayer?.spriteStyle?.xform?.[styleKey]
          || partOverride?.spriteStyle?.xform?.[styleKey]
          || {};
        const fields = [
          { key: 'x', label: 'Offset X', step: 1 },
          { key: 'y', label: 'Offset Y', step: 1 },
          { key: 'scaleX', label: 'Scale X', step: 0.01 },
          { key: 'scaleY', label: 'Scale Y', step: 0.01 },
          { key: 'rotDeg', label: 'Rotation (deg)', step: 0.1 }
        ];
        for (const field of fields){
          const wrapper = document.createElement('label');
          wrapper.className = 'style-field';
          const label = document.createElement('span');
          label.textContent = field.label;
          const inputEl = document.createElement('input');
          inputEl.type = 'number';
          inputEl.step = String(field.step);
          inputEl.value = currentXform[field.key] != null ? currentXform[field.key] : '';
          if (baseXform[field.key] != null){
            inputEl.placeholder = String(baseXform[field.key]);
          }
          inputEl.addEventListener('input', (event)=>{
            this.applyStyleValue(slot, partKey, layerPosition, styleKey, field.key, event.target.value);
          });
          wrapper.appendChild(label);
          wrapper.appendChild(inputEl);
          if (baseXform[field.key] != null){
            const hint = document.createElement('span');
            hint.className = 'style-field__hint';
            hint.textContent = `Base: ${baseXform[field.key]}`;
            wrapper.appendChild(hint);
          }
          this.dom.styleFields.appendChild(wrapper);
        }
        const currentImageUrl = this.getEffectivePartImage(slot, cosmetic, partKey, layerPosition);
        if (currentImageUrl){
          const info = document.createElement('p');
          info.className = 'style-asset-info';
          info.innerHTML = `Current image: <code>${currentImageUrl}</code>`;
          this.dom.styleFields.appendChild(info);
        }
      } else {
        this.state.activeStyleKey = null;
        const info = document.createElement('p');
        info.className = 'style-asset-info';
        info.textContent = 'Sprite transforms are unavailable in appearance mode. Use tint tools below to preview colours.';
        this.dom.styleFields.appendChild(info);
      }
      this.dom.styleFields.appendChild(paletteContainer);
      renderPaletteEditor(paletteContainer);
    };

    const show = (slot)=>{
      this.state.activeSlot = slot;
      if (!slot){
        this.state.activeStyleKey = null;
      }
      this.slotGrid.refreshFromSelection();
      if (!slot){
        this.dom.styleInspector.dataset.active = 'false';
        this.dom.styleFields.innerHTML = '<p>Select a cosmetic slot to edit sprite style overrides.</p>';
        this.dom.stylePartSelect.innerHTML = '';
        this.dom.styleHeader.textContent = 'No slot selected';
        this.state.activePartKey = null;
        this.state.currentPalette = null;
        this.state.currentPaletteSource = { slot: null, partKey: null, layerPosition: null, cosmeticId: null };
        renderTintPreview();
        return;
      }
      const library = getRegisteredCosmeticLibrary();
      const row = this.slotRows.get(slot);
      const cosmeticId = row?.select?.value || '';
      this.dom.styleHeader.textContent = `Slot: ${slot}`;
      if (!cosmeticId){
        this.dom.styleInspector.dataset.active = 'true';
        this.dom.stylePartSelect.innerHTML = '';
        this.dom.styleFields.innerHTML = '<p>Select a cosmetic for this slot to enable style editing.</p>';
        this.state.activeStyleKey = null;
        this.state.activePartKey = null;
        this.state.activeLayerPosition = null;
        this.state.currentPalette = null;
        this.state.currentPaletteSource = { slot, partKey: null, layerPosition: null, cosmeticId: null };
        renderTintPreview();
        return;
      }
      const cosmetic = library[cosmeticId];
      if (!cosmetic){
        this.dom.styleInspector.dataset.active = 'true';
        this.dom.stylePartSelect.innerHTML = '';
        this.dom.styleFields.innerHTML = `<p>Cosmetic "${cosmeticId}" is not available in the library.</p>`;
        this.state.activeStyleKey = null;
        this.state.activePartKey = null;
        this.state.activeLayerPosition = null;
        this.state.currentPalette = null;
        this.state.currentPaletteSource = { slot, partKey: null, layerPosition: null, cosmeticId };
        renderTintPreview();
        return;
      }
      const partOptions = listPartLayerOptions(cosmetic);
      this.dom.styleInspector.dataset.active = 'true';
      this.dom.stylePartSelect.innerHTML = '';
      if (!partOptions.length){
        this.dom.styleFields.innerHTML = '';
        const message = document.createElement('p');
        message.textContent = 'This cosmetic has no editable sprite parts.';
        this.dom.styleFields.appendChild(message);
        const paletteContainer = document.createElement('div');
        paletteContainer.className = 'palette-editor';
        paletteContainer.id = 'paletteEditor';
        paletteContainer.innerHTML = '<p class="palette-hint">This cosmetic has no palette-configurable parts.</p>';
        this.dom.styleFields.appendChild(paletteContainer);
        this.state.activeStyleKey = null;
        this.state.activePartKey = null;
        this.state.activeLayerPosition = null;
        this.state.currentPalette = null;
        this.state.currentPaletteSource = { slot, partKey: null, layerPosition: null, cosmeticId };
        renderTintPreview();
        return;
      }
      for (const entry of partOptions){
        const optionEl = document.createElement('option');
        optionEl.value = `${entry.partKey}::${entry.position}`;
        optionEl.textContent = entry.label;
        this.dom.stylePartSelect.appendChild(optionEl);
      }
      const preferredOption = partOptions.find((entry)=>
        entry.partKey === this.state.activePartKey
        && entry.position === this.normalizeLayerPosition(this.state.activeLayerPosition)
      ) || partOptions[0];
      this.dom.stylePartSelect.value = preferredOption.value;
      this.state.activePartKey = preferredOption.partKey;
      this.state.activeLayerPosition = preferredOption.position;
      renderStyleFields(slot, cosmeticId, cosmetic, preferredOption.partKey, preferredOption.position);
      highlightActivePartAsset(slot, preferredOption.partKey, preferredOption.position, cosmetic);
      this.state.currentPaletteSource = { slot, partKey: preferredOption.partKey, layerPosition: preferredOption.position, cosmeticId };
      renderTintPreview();
    };

    const handlePartChange = ()=>{
      const slot = this.state.activeSlot;
      const library = getRegisteredCosmeticLibrary();
      const row = this.slotRows.get(slot);
      if (!slot || !row) return;
      const cosmeticId = row.select.value;
      const cosmetic = library[cosmeticId];
      const selected = this.dom.stylePartSelect.value;
      const [partKey, rawPosition] = selected.split('::');
      const layerPosition = this.normalizeLayerPosition(rawPosition);
      this.state.activePartKey = partKey;
      this.state.activeLayerPosition = layerPosition;
      renderStyleFields(slot, cosmeticId, cosmetic, partKey, layerPosition);
      highlightActivePartAsset(slot, partKey, layerPosition, cosmetic);
      this.state.currentPaletteSource = { slot, partKey, layerPosition, cosmeticId };
      renderTintPreview();
    };

    const refreshPalette = ()=>{
      renderTintPreview();
      renderPaletteEditor();
    };

    return {
      renderPaletteEditor,
      renderTintPreview,
      highlightActivePartAsset,
      show,
      handlePartChange,
      refreshPalette,
      setPaletteColor,
      setPaletteShadeAmount,
      setPaletteShadeHex,
      setSlotHslValue,
      setPartHslValue,
      mutatePartPalette,
      cleanupPaletteObject
    };
  }

  buildFighterManagerApi(){
    const normalizeSlotEntry = (entry)=>{
      if (!entry) return null;
      if (typeof entry === 'string') return { id: entry };
      if (entry && typeof entry === 'object'){
        const id = entry.id || entry.cosmeticId || entry.item || entry.name;
        if (!id) return null;
        return { ...entry, id };
      }
      return null;
    };

    const resolveSlotKey = (slot)=>{
      if (!slot) return slot;
      if (slot.startsWith('appearance:')) return slot;
      if (slot.startsWith(FIGHTER_SPRITE_SLOT_PREFIX)) return slot;
      const potentialAppearance = `appearance:${slot}`;
      if (Array.isArray(this.state.appearanceSlotKeys) && this.state.appearanceSlotKeys.includes(potentialAppearance)){
        return potentialAppearance;
      }
      return slot;
    };

    const setSelectedCosmetics = (slots, { merge = false } = {})=>{
      const base = merge && GAME.selectedCosmetics?.slots
        ? this.deepClone(GAME.selectedCosmetics.slots)
        : {};
      for (const [rawSlot, rawEntry] of Object.entries(slots || {})){
        const slot = resolveSlotKey(rawSlot);
        const value = normalizeSlotEntry(rawEntry);
        if (slot){
          base[slot] = value ? this.deepClone(value) : null;
        }
      }
      GAME.selectedCosmetics = { slots: base };
      this.state.slotSelection = this.deepClone(base);
      return base;
    };

    const styleKeyFromPart = (partKey)=>{
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
        case 'head':
          return 'head';
        case 'torso':
          return 'torso';
        default:
          return partKey;
      }
    };

    const buildFighterSpriteLibrary = (fighterName, fighter = {})=>{
      const sprites = fighter?.sprites || {};
      const spriteStyle = fighter?.spriteStyle || fighter?.sprites?.style || {};
      const xform = spriteStyle?.xform || {};
      const libraryPayload = {};
      const slotMap = {};
      const slotKeys = [];
      for (const [partKey, spriteDef] of Object.entries(sprites)){
        const slot = `${FIGHTER_SPRITE_SLOT_PREFIX}${fighterName}:${partKey}`;
        const id = `${FIGHTER_SPRITE_ID_PREFIX}${fighterName}::${partKey}`;
        const styleKey = styleKeyFromPart(partKey);
        const partConfig = {
          image: this.deepClone(spriteDef || {}),
          styleKey
        };
        const baseXform = xform?.[styleKey];
        if (baseXform && typeof baseXform === 'object'){
          partConfig.spriteStyle = { xform: { [styleKey]: this.deepClone(baseXform) } };
        }
        libraryPayload[id] = {
          type: 'fighterSprite',
          slots: [slot],
          meta: { name: `Base ${partKey}` },
          parts: { [partKey]: partConfig }
        };
        slotMap[slot] = { id, fighter: fighterName, partKey };
        slotKeys.push(slot);
      }
      if (Object.keys(libraryPayload).length){
        registerCosmeticLibrary(libraryPayload);
      }
      this.state.fighterSpriteSlots = slotKeys;
      this.state.fighterSpriteIndex = slotMap;
      return slotMap;
    };

    const getFighterSpriteSlotKeys = ()=>{
      return Array.isArray(this.state.fighterSpriteSlots)
        ? this.state.fighterSpriteSlots.slice()
        : [];
    };

    const parseFighterSpriteSlot = (slot)=>{
      if (typeof slot !== 'string' || !slot.startsWith(FIGHTER_SPRITE_SLOT_PREFIX)){
        return null;
      }
      const remainder = slot.slice(FIGHTER_SPRITE_SLOT_PREFIX.length);
      const [fighter, ...rest] = remainder.split(':');
      if (!fighter || rest.length === 0){
        return this.state.fighterSpriteIndex?.[slot] || null;
      }
      const partKey = rest.join(':');
      return { fighter, partKey };
    };

    const mapProfileToSlotOverrides = (slotMap, profile)=>{
      const overrides = {};
      const cosmetics = profile?.cosmetics || {};
      for (const [slot, entry] of Object.entries(slotMap)){
        const cosmeticId = entry?.id;
        if (!cosmeticId) continue;
        const override = cosmetics[cosmeticId];
        if (!override) continue;
        overrides[slot] = this.deepClone(override);
      }
      return overrides;
    };

    const populateFighterSelect = ()=>{
      const select = this.dom.fighterSelect;
      if (!select) return;
      select.innerHTML = '';
      const fighters = CONFIG.fighters || {};
      const keys = Object.keys(fighters);
      if (!keys.length){
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No fighters found';
        select.appendChild(opt);
        select.disabled = true;
        return;
      }
      for (const key of keys){
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        select.appendChild(opt);
      }
      select.addEventListener('change', (event)=>{
        loadFighter(event.target.value);
      });
      select.value = keys[0];
      loadFighter(keys[0]);
    };

    const loadFighter = (fighterName)=>{
      if (!fighterName) return;
      GAME.selectedFighter = fighterName;
      this.state.activeFighter = fighterName;
      const fighter = CONFIG.fighters?.[fighterName] || {};
      const { appearance: characterAppearance, characterKey } = resolveCharacterAppearance(CONFIG, fighterName);
      const characterData = characterKey ? CONFIG.characters?.[characterKey] || null : null;
      const appearance = registerFighterAppearance(
        fighterName,
        fighter.appearance || {},
        characterAppearance
      );
      const appearanceSlots = Object.keys(appearance.slots || {});
      const normalizedAppearance = new Set(
        appearanceSlots
          .map((slot)=> this.modeManager.normalizeAppearanceSlotKey(slot) || slot)
      );
      DEFAULT_APPEARANCE_SLOTS.forEach((slot)=> normalizedAppearance.add(slot));
      this.state.appearanceSlotKeys = Array.from(normalizedAppearance);
      this.modeManager.populateCreatorSlotOptions();
      const slots = fighter.cosmetics?.slots || fighter.cosmetics || {};
      const combinedSlots = { ...(appearance.slots || {}), ...(slots || {}) };
      this.state.fighterSpriteSlots = [];
      this.state.fighterSpriteIndex = {};
      let slotMap = setSelectedCosmetics(combinedSlots);
      const fighterSpriteSlots = buildFighterSpriteLibrary(fighterName, fighter);
      if (Object.keys(fighterSpriteSlots).length){
        slotMap = setSelectedCosmetics(fighterSpriteSlots, { merge: true });
      }
      this.state.assetPinned = false;
      this.assetLibrary.setSelectedAsset(null);
      const profile = getFighterCosmeticProfile(fighterName) || null;
      this.state.profileBaseSnapshot = this.deepClone(profile || { cosmetics: {} });
      this.state.loadedProfile = this.deepClone(profile?.cosmetics || {});
      this.state.slotOverrides = mapProfileToSlotOverrides(slotMap, profile);
      GAME.selectedCharacter = characterKey || null;
      this.state.activeSlot = null;
      this.state.activePartKey = null;
      this.slotGrid.rebuild();
      this.slotGrid.refreshFromSelection();
      this.styleInspector.show(null);
      this.overrideManager.refreshOutputs();
      this.showStatus(`Loaded fighter ${fighterName}`, { tone: 'info' });
    };

    return {
      populateFighterSelect,
      loadFighter,
      setSelectedCosmetics,
      mapProfileToSlotOverrides,
      normalizeSlotEntry,
      getFighterSpriteSlotKeys,
      parseFighterSpriteSlot
    };
  }

  deepClone(value){
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err){
      return value;
    }
  }

  isPlainObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  clampNumber(value, min, max){
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  showStatus(message, { tone = 'info', timeout = 1800 } = {}){
    const statusEl = this.dom.statusEl;
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.tone = tone;
    if (timeout > 0){
      window.clearTimeout(this.statusTimer);
      this.statusTimer = window.setTimeout(()=>{
        if (statusEl.dataset.tone === tone){
          statusEl.textContent = '';
          delete statusEl.dataset.tone;
        }
      }, timeout);
    }
  }

  normalizeSlotEntry(entry){
    return this.fighterManager.normalizeSlotEntry(entry);
  }

  setSlotSelection(slot, cosmeticId){
    const selection = (GAME.selectedCosmetics ||= { slots: {} });
    if (!selection.slots) selection.slots = {};
    this.state.slotSelection ||= {};
    if (!cosmeticId){
      selection.slots[slot] = null;
      delete this.state.slotSelection[slot];
      delete this.state.slotOverrides[slot];
    } else {
      const existing = this.normalizeSlotEntry(selection.slots[slot]) || {};
      const next = { ...existing, id: cosmeticId };
      selection.slots[slot] = next;
      this.state.slotSelection[slot] = this.deepClone(next);
      delete this.state.slotOverrides[slot];
    }
    this.cleanupEmptyOverrides(slot);
    this.overrideManager.refreshOutputs();
    if (this.state.activeSlot === slot){
      this.styleInspector.show(slot);
    }
  }

  normalizeLayerPosition(position){
    if (!position) return 'front';
    const normalized = String(position).trim().toLowerCase();
    if (!normalized) return 'front';
    if (normalized === 'back' || normalized === 'behind' || normalized === 'rear'){
      return 'back';
    }
    return 'front';
  }

  buildTintFilter(hsl){
    if (!hsl) return 'none';
    const filters = [];
    if (Number.isFinite(hsl.h) && hsl.h !== 0){
      filters.push(`hue-rotate(${hsl.h}deg)`);
    }
    if (Number.isFinite(hsl.s) && hsl.s !== 0){
      const saturation = Math.max(0, 1 + hsl.s);
      filters.push(`saturate(${saturation})`);
    }
    const lightness = Number.isFinite(hsl.l) ? hsl.l : null;
    if (lightness != null && lightness !== 0){
      const brightness = Math.max(0, 1 + lightness);
      filters.push(`brightness(${brightness})`);
    }
    return filters.length ? filters.join(' ') : 'none';
  }

  queuePreviewRender(){
    if (this.previewRenderScheduled){
      return;
    }
    this.previewRenderScheduled = true;
    requestAnimationFrame(()=>{
      this.previewRenderScheduled = false;
      this.renderPartPreview();
    });
  }

  setActivePreviewPart(partKey){
    const keys = Array.isArray(this.state.previewPartKeys) ? this.state.previewPartKeys : [];
    if (!keys.length) return;
    if (!keys.includes(partKey)) return;
    if (this.state.activePreviewPart === partKey) return;
    this.state.activePreviewPart = partKey;
    this.queuePreviewRender();
  }

  cyclePreviewPart(offset){
    const keys = Array.isArray(this.state.previewPartKeys) ? this.state.previewPartKeys : [];
    if (!keys.length || !Number.isInteger(offset)) return;
    const currentIndex = keys.indexOf(this.state.activePreviewPart);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + offset + keys.length) % keys.length;
    const nextPart = keys[nextIndex];
    if (!nextPart) return;
    if (nextPart !== this.state.activePreviewPart){
      this.state.activePreviewPart = nextPart;
    }
    this.queuePreviewRender();
  }

  renderPartPreview(){
    const container = this.dom.previewGrid;
    if (!container){
      return;
    }
    container.classList.remove('is-empty');
    container.innerHTML = '';

    const renderMessage = (message)=>{
      container.innerHTML = '';
      container.classList.add('is-empty');
      const note = document.createElement('p');
      note.className = 'part-preview__empty-note';
      note.textContent = message;
      container.appendChild(note);
    };

    const fighterName = this.state.activeFighter;
    if (!fighterName){
      renderMessage('Load a fighter to preview individual parts and their equipped cosmetics.');
      return;
    }

    const fighterConfig = CONFIG.fighters?.[fighterName] || {};
    const baseStyle = fighterConfig.spriteStyle || fighterConfig.sprites?.style || {};
    const previousEditorState = GAME.editorState;
    const overridesClone = this.deepClone(this.state.slotOverrides || {});
    GAME.editorState = {
      ...(previousEditorState && typeof previousEditorState === 'object' ? previousEditorState : {}),
      slotOverrides: overridesClone
    };

    let layers = [];
    try {
      layers = ensureCosmeticLayers(CONFIG, fighterName, baseStyle) || [];
    } catch (err){
      console.warn('[cosmetic-editor] Failed to render part preview', err);
      renderMessage('Unable to render part preview for this fighter. Check the console for details.');
      return;
    } finally {
      if (previousEditorState !== undefined){
        GAME.editorState = previousEditorState;
      } else {
        delete GAME.editorState;
      }
    }

    const entries = layers.filter((layer)=> layer?.asset?.url);
    if (!entries.length){
      renderMessage('No sprite layers available for the current fighter and cosmetic selection.');
      return;
    }

    const library = getRegisteredCosmeticLibrary();
    const partMap = new Map();
    for (const layer of entries){
      const partKey = layer.partKey || 'unknown';
      if (!partMap.has(partKey)){
        partMap.set(partKey, { partKey, front: [], back: [] });
      }
      const entry = partMap.get(partKey);
      const position = this.normalizeLayerPosition(layer.position);
      if (position === 'back'){
        entry.back.push(layer);
      } else {
        entry.front.push(layer);
      }
    }

    const sortedParts = Array.from(partMap.values()).sort((a, b)=> a.partKey.localeCompare(b.partKey));
    const partKeys = sortedParts.map((entry)=> entry.partKey);
    this.state.previewPartKeys = partKeys;

    if (!partKeys.length){
      renderMessage('No sprite layers available for the current fighter and cosmetic selection.');
      return;
    }

    let activePart = this.state.activePreviewPart;
    if (!activePart || !partMap.has(activePart)){
      activePart = partKeys[0];
      this.state.activePreviewPart = activePart;
    }

    const activeEntry = partMap.get(activePart);
    if (!activeEntry){
      renderMessage('No sprite data available for the selected part.');
      return;
    }

    const card = document.createElement('article');
    card.className = 'part-preview__card';

    const header = document.createElement('header');
    header.className = 'part-preview__card-header part-preview__card-header--single';
    const partLabel = document.createElement('span');
    partLabel.className = 'part-preview__part';
    partLabel.textContent = activeEntry.partKey;
    header.appendChild(partLabel);

    const progress = document.createElement('span');
    progress.className = 'part-preview__progress';
    const activeIndex = partKeys.indexOf(activeEntry.partKey);
    progress.textContent = `Part ${activeIndex + 1} of ${partKeys.length}`;
    header.appendChild(progress);

    const controls = document.createElement('div');
    controls.className = 'part-preview__nav-controls';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'part-preview__nav-btn';
    prevBtn.setAttribute('aria-label', 'Show previous part');
    prevBtn.textContent = '◀';
    prevBtn.addEventListener('click', ()=> this.cyclePreviewPart(-1));
    controls.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'part-preview__nav-btn';
    nextBtn.setAttribute('aria-label', 'Show next part');
    nextBtn.textContent = '▶';
    nextBtn.addEventListener('click', ()=> this.cyclePreviewPart(1));
    controls.appendChild(nextBtn);

    header.appendChild(controls);
    card.appendChild(header);

    const selector = document.createElement('select');
    selector.className = 'part-preview__selector';
    selector.setAttribute('aria-label', 'Select part to preview');
    partKeys.forEach((partKey)=>{
      const option = document.createElement('option');
      option.value = partKey;
      option.textContent = partKey;
      if (partKey === activeEntry.partKey){
        option.selected = true;
      }
      selector.appendChild(option);
    });
    selector.addEventListener('change', (event)=>{
      const nextPart = event?.target?.value;
      if (nextPart){
        this.setActivePreviewPart(nextPart);
      }
    });
    card.appendChild(selector);

    const stageGroup = document.createElement('div');
    stageGroup.className = 'part-preview__stage-group';
    stageGroup.appendChild(this.buildPartPose('front', activeEntry.front, library, activeEntry.partKey));
    stageGroup.appendChild(this.buildPartPose('back', activeEntry.back, library, activeEntry.partKey));
    card.appendChild(stageGroup);

    container.appendChild(card);
  }

  buildPartPose(position, layers = [], library, partKey){
    const section = document.createElement('section');
    section.className = 'part-preview__pose';
    section.dataset.position = position;

    const resolvedLayers = Array.isArray(layers) ? layers : [];
    if (!resolvedLayers.length){
      section.dataset.empty = 'true';
    }

    const header = document.createElement('div');
    header.className = 'part-preview__pose-header';
    const title = document.createElement('span');
    title.textContent = position === 'back' ? 'Back' : 'Front';
    header.appendChild(title);

    const countBadge = document.createElement('span');
    countBadge.className = 'part-preview__pose-badge';
    countBadge.textContent = `${resolvedLayers.length} layer${resolvedLayers.length === 1 ? '' : 's'}`;
    header.appendChild(countBadge);

    section.appendChild(header);

    const stage = document.createElement('div');
    stage.className = 'part-preview__stage';
    const stack = document.createElement('div');
    stack.className = 'part-preview__stack';
    stage.appendChild(stack);

    let hasImage = false;
    resolvedLayers.forEach((layer, index)=>{
      const url = layer?.asset?.url;
      if (!url) return;
      hasImage = true;
      const img = document.createElement('img');
      img.className = 'part-preview__layer';
      if (index === 0){
        img.classList.add('part-preview__layer--base');
      }
      img.src = url;
      const slot = layer.slot || '';
      const cosmeticId = layer.cosmeticId || '';
      const displayName = library?.[cosmeticId]?.name
        || library?.[cosmeticId]?.displayName
        || library?.[cosmeticId]?.label
        || cosmeticId;
      img.alt = cosmeticId
        ? `${displayName} applied to ${partKey}`
        : `${partKey} sprite`;
      const filter = this.buildTintFilter(layer.hsl);
      if (filter && filter !== 'none'){
        img.style.filter = filter;
      }
      stack.appendChild(img);
    });

    if (!hasImage){
      section.dataset.empty = 'true';
    }

    section.appendChild(stage);

    if (resolvedLayers.length){
      const list = document.createElement('ul');
      list.className = 'part-preview__layers';
      resolvedLayers.forEach((layer, index)=>{
        const item = document.createElement('li');
        item.className = 'part-preview__layer-meta';
        const slotLabel = document.createElement('span');
        slotLabel.className = 'part-preview__layer-slot';
        slotLabel.textContent = layer.slot || '—';
        const id = document.createElement('code');
        id.className = 'part-preview__layer-id';
        id.textContent = layer.cosmeticId || '—';
        item.appendChild(slotLabel);
        item.appendChild(id);

        const badges = document.createElement('span');
        badges.className = 'part-preview__layer-badges';

        const positionBadge = document.createElement('span');
        positionBadge.className = 'part-preview__layer-badge part-preview__layer-badge--position';
        positionBadge.textContent = position === 'back' ? 'back' : 'front';
        badges.appendChild(positionBadge);

        const appearance = (layer.slot || '').startsWith('appearance:');
        if (index === 0){
          const badge = document.createElement('span');
          badge.className = 'part-preview__layer-badge';
          badge.textContent = 'base';
          if (appearance){
            badge.classList.add('part-preview__layer-badge--appearance');
          }
          badges.appendChild(badge);
        } else if (appearance){
          const badge = document.createElement('span');
          badge.className = 'part-preview__layer-badge part-preview__layer-badge--appearance';
          badge.textContent = 'appearance';
          badges.appendChild(badge);
        }

        item.appendChild(badges);
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    return section;
  }

  mergeLayerConfig(base = {}, override = {}){
    const result = Array.isArray(base) ? base.slice() : { ...base };
    for (const [key, value] of Object.entries(override || {})){
      if (value && typeof value === 'object' && !Array.isArray(value)){
        result[key] = this.mergeLayerConfig(base?.[key] || {}, value);
      } else if (Array.isArray(value)){
        result[key] = value.slice();
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  getCosmeticPartLayerConfig(cosmetic, partKey, layerPosition){
    if (!cosmetic || !partKey) return null;
    const part = cosmetic.parts?.[partKey];
    if (!part) return null;
    const normalized = this.normalizeLayerPosition(layerPosition);
    const base = this.deepClone({ ...part });
    delete base.layers;
    const layerMap = part.layers && typeof part.layers === 'object' ? part.layers : null;
    if (!layerMap || Object.keys(layerMap).length === 0){
      return base;
    }
    for (const [key, layerDef] of Object.entries(layerMap)){
      const candidate = this.normalizeLayerPosition(layerDef?.position || key);
      if (candidate === normalized){
        return this.mergeLayerConfig(base, layerDef || {});
      }
    }
    const fallbackKey = Object.keys(layerMap)[0];
    if (fallbackKey){
      return this.mergeLayerConfig(base, layerMap[fallbackKey] || {});
    }
    return base;
  }

  getLayerOverride(slot, partKey, layerPosition, { create = false } = {}){
    if (!slot || !partKey) return null;
    this.state.slotOverrides ||= {};
    let slotOverride = this.state.slotOverrides[slot];
    if (!slotOverride){
      if (!create) return null;
      slotOverride = this.state.slotOverrides[slot] = {};
    }
    if (create){
      slotOverride.parts ||= {};
    }
    const partOverride = slotOverride.parts?.[partKey];
    if (!partOverride){
      if (!create) return null;
      slotOverride.parts[partKey] = {};
    }
    const resolvedPartOverride = slotOverride.parts?.[partKey];
    if (!layerPosition){
      return resolvedPartOverride || null;
    }
    if (!resolvedPartOverride){
      return null;
    }
    if (create){
      resolvedPartOverride.layers ||= {};
      resolvedPartOverride.layers[layerPosition] ||= {};
      return resolvedPartOverride.layers[layerPosition];
    }
    return resolvedPartOverride.layers?.[layerPosition] || null;
  }

  cleanupEmptyOverrides(slot){
    const slotOverride = this.state.slotOverrides?.[slot];
    if (!slotOverride) return;
    if (slotOverride.palette){
      this.styleInspector.cleanupPaletteObject(slotOverride.palette);
      if (!this.hasPaletteContent(slotOverride.palette)){
        delete slotOverride.palette;
      }
    }
    if (slotOverride.parts){
      for (const [partKey, partOverride] of Object.entries(slotOverride.parts)){
        if (partOverride?.image && !partOverride.image.url){
          delete partOverride.image;
        }
        if (partOverride?.layers){
          for (const [layerKey, layerOverride] of Object.entries(partOverride.layers)){
            if (layerOverride?.image && !layerOverride.image.url){
              delete layerOverride.image;
            }
            const layerSpriteStyle = layerOverride?.spriteStyle;
            if (layerSpriteStyle?.xform){
              for (const [styleKey, values] of Object.entries(layerSpriteStyle.xform)){
                if (!values || Object.keys(values).length === 0){
                  delete layerSpriteStyle.xform[styleKey];
                }
              }
              if (Object.keys(layerSpriteStyle.xform).length === 0){
                delete layerSpriteStyle.xform;
              }
            }
            if (layerSpriteStyle && Object.keys(layerSpriteStyle).length === 0){
              delete layerOverride.spriteStyle;
            }
            if (layerOverride?.palette){
              this.styleInspector.cleanupPaletteObject(layerOverride.palette);
              if (!this.hasPaletteContent(layerOverride.palette)){
                delete layerOverride.palette;
              }
            }
            if (layerOverride?.hsl && Object.keys(layerOverride.hsl).length === 0){
              delete layerOverride.hsl;
            }
            if (layerOverride && Object.keys(layerOverride).length === 0){
              delete partOverride.layers[layerKey];
            }
          }
          if (Object.keys(partOverride.layers).length === 0){
            delete partOverride.layers;
          }
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
          this.styleInspector.cleanupPaletteObject(partOverride.palette);
          if (!this.hasPaletteContent(partOverride.palette)){
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
    if (slotOverride.palette && !this.hasPaletteContent(slotOverride.palette)){
      delete slotOverride.palette;
    }
    if (Object.keys(slotOverride).length === 0){
      delete this.state.slotOverrides[slot];
    }
  }

  hasPaletteContent(value){
    if (value == null) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.some((entry)=> this.hasPaletteContent(entry));
    if (typeof value === 'object'){
      return Object.values(value).some((entry)=> this.hasPaletteContent(entry));
    }
    return false;
  }

  resetSlotOverrides(slot){
    if (!slot) return;
    delete this.state.slotOverrides?.[slot];
    this.overrideManager.refreshOutputs();
    if (this.state.activeSlot === slot){
      this.styleInspector.show(slot);
    }
  }

  resetPartOverrides(slot, partKey){
    if (!slot || !partKey) return;
    const slotOverride = this.state.slotOverrides?.[slot];
    if (slotOverride?.parts?.[partKey]){
      delete slotOverride.parts[partKey];
      if (Object.keys(slotOverride.parts).length === 0){
        delete slotOverride.parts;
      }
    }
    this.cleanupEmptyOverrides(slot);
    this.overrideManager.refreshOutputs();
    if (this.state.activeSlot === slot){
      this.styleInspector.show(slot);
    }
  }

  applyStyleValue(slot, partKey, layerPosition, styleKey, fieldKey, rawValue){
    if (!slot || !partKey) return;
    const normalizedLayer = layerPosition ? this.normalizeLayerPosition(layerPosition) : null;
    const partOverride = this.getLayerOverride(slot, partKey, null, { create: true });
    if (fieldKey === 'styleKey'){
      if (!rawValue){
        delete partOverride.styleKey;
      } else {
        partOverride.styleKey = rawValue;
      }
      this.cleanupEmptyOverrides(slot);
      this.overrideManager.refreshOutputs();
      return;
    }
    if (!styleKey){
      return;
    }
    const layerOverride = this.getLayerOverride(slot, partKey, normalizedLayer || null, { create: true });
    layerOverride.spriteStyle ||= {};
    layerOverride.spriteStyle.xform ||= {};
    const xform = (layerOverride.spriteStyle.xform[styleKey] ||= {});
    const numeric = Number(rawValue);
    if (rawValue === '' || Number.isNaN(numeric)){
      delete xform[fieldKey];
    } else {
      xform[fieldKey] = numeric;
    }
    if (Object.keys(xform).length === 0){
      delete layerOverride.spriteStyle.xform[styleKey];
    }
    if (Object.keys(layerOverride.spriteStyle.xform).length === 0){
      delete layerOverride.spriteStyle.xform;
    }
    if (layerOverride.spriteStyle && Object.keys(layerOverride.spriteStyle).length === 0){
      delete layerOverride.spriteStyle;
    }
    this.cleanupEmptyOverrides(slot);
    this.overrideManager.refreshOutputs();
  }

  getEffectivePartImage(slot, cosmetic, partKey, layerPosition){
    const normalizedLayer = this.normalizeLayerPosition(layerPosition);
    const override = this.state.slotOverrides?.[slot]?.parts?.[partKey];
    const layerOverride = override?.layers?.[normalizedLayer];
    if (layerOverride?.image?.url){
      return layerOverride.image.url;
    }
    if (override?.image?.url){
      return override.image.url;
    }
    const partLayer = this.getCosmeticPartLayerConfig(cosmetic, partKey, normalizedLayer);
    if (partLayer?.image?.url){
      return partLayer.image.url;
    }
    return cosmetic?.parts?.[partKey]?.image?.url || '';
  }

  attachEventListeners(){
    this.modeButtons.forEach((button)=>{
      button?.addEventListener('click', ()=>{
        this.modeManager.setActiveMode(button.dataset.mode);
      });
    });
    this.dom.stylePartSelect.addEventListener('change', ()=>{
      this.styleInspector.handlePartChange();
    });
    this.dom.styleResetBtn.addEventListener('click', ()=>{
      if (this.state.activeSlot && this.state.activePartKey){
        this.resetPartOverrides(this.state.activeSlot, this.state.activePartKey);
      }
    });
    this.dom.styleSlotResetBtn.addEventListener('click', ()=>{
      if (this.state.activeSlot){
        this.resetSlotOverrides(this.state.activeSlot);
      }
    });
    this.dom.assetSearch?.addEventListener('input', (event)=>{
      this.assetLibrary.filterAssetList(event.target.value);
    });
    this.dom.assetList?.addEventListener('click', (event)=>{
      const target = event.target.closest('.asset-item');
      if (!target) return;
      const path = target.dataset.assetPath;
      if (path){
        this.assetLibrary.setSelectedAsset(path, { pinned: true });
      }
    });
    this.dom.assetList?.addEventListener('keydown', (event)=>{
      if (event.key !== 'Enter' && event.key !== ' '){
        return;
      }
      const target = event.target.closest('.asset-item');
      if (!target) return;
      event.preventDefault();
      const path = target.dataset.assetPath;
      if (path){
        this.assetLibrary.setSelectedAsset(path, { pinned: true });
      }
    });
    this.dom.creatorAddBtn?.addEventListener('click', ()=> this.assetLibrary.createCustomCosmetic());
    this.dom.creatorEquipBtn?.addEventListener('click', ()=> this.assetLibrary.equipCustomCosmetic());
    this.dom.creatorApplyBtn?.addEventListener('click', ()=> this.assetLibrary.applyAssetToActivePart());
    this.dom.overrideApplyBtn?.addEventListener('click', ()=> this.overrideManager.applyOverridesToProfile());
    this.dom.overrideCopyBtn?.addEventListener('click', ()=> this.overrideManager.copyOverridesToClipboard());
    this.dom.overrideDownloadBtn?.addEventListener('click', ()=> this.overrideManager.downloadOverridesJson());
  }

  async loadAssetManifest(){
    if (typeof fetch !== 'function'){
      this.showStatus('Asset manifest unavailable in this environment.', { tone: 'warn' });
      return;
    }

    const isFallbackAsset = (path) => {
      if (!path || typeof path !== 'string') return false;
      const lower = path.toLowerCase();
      return /(\(old[0-9]*\)|\(delete\))/i.test(lower);
    };

    try {
      const response = await fetch('./assets/asset-manifest.json', { cache: 'no-cache' });
      if (!response.ok){
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)){
        const sanitized = data.filter((entry) => {
          if (typeof entry !== 'string') return false;
          const normalized = entry.trim();
          if (!normalized) return false;
          return !isFallbackAsset(normalized);
        });
        const removed = data.filter((entry) => isFallbackAsset(entry));
        if (removed.length){
          console.warn('[cosmetic-editor] Ignoring fallback-tagged assets from manifest', removed);
        }
        this.state.assetManifest = sanitized;
        this.state.filteredAssets = sanitized.slice();
        this.assetLibrary.renderAssetList();
        this.assetLibrary.setSelectedAsset(this.state.selectedAsset);
      }
    } catch (err){
      console.warn('[cosmetic-editor] Failed to load asset manifest', err);
      this.showStatus('Could not load asset manifest.', { tone: 'warn', timeout: 4000 });
      this.assetLibrary.renderAssetList();
    }
  }

  async bootstrap(){
    this.assetLibrary.setSelectedAsset(null);
    this.modeManager.bootstrap();
    await this.loadAssetManifest();
    this.slotGrid.rebuild();
    this.fighterManager.populateFighterSelect();
    this.attachEventListeners();
    this.slotGrid.refreshFromSelection();
    this.styleInspector.renderTintPreview();
    this.queuePreviewRender();
  }
}

new CosmeticEditorApp().bootstrap();

