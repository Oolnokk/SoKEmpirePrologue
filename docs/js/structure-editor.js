// Debug overlay (non-blocking)
(function setupDebugOverlay() {
  const el = document.createElement('div');
  el.id = '__debug_overlay__';
  el.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:0',
    'right:0',
    'max-height:40vh',
    'overflow:auto',
    'font:12px ui-monospace,Menlo,Consolas',
    'background:rgba(10,12,16,.9)',
    'color:#cfe7ff',
    'border-top:1px solid #2a3442',
    'padding:6px',
    'z-index:99999',
    'pointer-events:none',
  ].join(';');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px;pointer-events:auto';
  const title = document.createElement('strong');
  title.textContent = 'Debug';
  const btnClear = document.createElement('button');
  btnClear.textContent = 'Clear';
  const btnHide = document.createElement('button');
  btnHide.textContent = 'Hide';
  [btnClear, btnHide].forEach((btn) => {
    btn.style.cssText = 'background:#1d2633;color:#e6edf3;border:1px solid #2a3442;border-radius:8px;padding:4px 8px;font-size:12px';
  });
  const feed = document.createElement('div');
  feed.id = '__debug_feed__';
  feed.style.whiteSpace = 'pre-wrap';
  bar.appendChild(title);
  bar.appendChild(btnClear);
  bar.appendChild(btnHide);
  el.appendChild(bar);
  el.appendChild(feed);
  btnClear.onclick = () => {
    feed.textContent = '';
  };
  btnHide.onclick = () => {
    el.style.display = 'none';
  };
  document.body.appendChild(el);
  function write(line) {
    try {
      const ts = new Date().toISOString().split('T')[1].replace('Z', '');
      feed.textContent += `[${ts}] ${line}\n`;
      feed.scrollTop = feed.scrollHeight;
    } catch (err) {
      console.warn('[structure-editor] Failed to log debug line', err);
    }
  }
  window.__DBG = write;
  window.addEventListener('error', (event) => {
    write('Error: ' + event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason && event.reason.message ? event.reason.message : event.reason;
    write('Promise rejection: ' + reason);
  });
})();

const PREFAB_MANIFESTS = [
  './config/prefabs/structures/index.json',
  './config/prefabs/obstructions/index.json',
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rad(deg) {
  return (deg * Math.PI) / 180;
}

function ease01(mode, x) {
  const clamped = clamp(x, 0, 1);
  if (mode === 'smoothstep') {
    return clamped * clamped * (3 - 2 * clamped);
  }
  if (mode === 'quadInOut') {
    if (clamped < 0.5) return 2 * clamped * clamped;
    return 1 - Math.pow(-2 * clamped + 2, 2) / 2;
  }
  return clamped;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function zeroQuad() {
  return {
    tl: { x: 0, y: 0 },
    tr: { x: 0, y: 0 },
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
  };
}

function cloneQuad(source) {
  const quad = zeroQuad();
  if (!source || typeof source !== 'object') {
    return quad;
  }
  if (source.tl) {
    quad.tl.x = toNumber(source.tl.x, 0);
    quad.tl.y = toNumber(source.tl.y, 0);
  }
  if (source.tr) {
    quad.tr.x = toNumber(source.tr.x, 0);
    quad.tr.y = toNumber(source.tr.y, 0);
  }
  if (source.br) {
    quad.br.x = toNumber(source.br.x, 0);
    quad.br.y = toNumber(source.br.y, 0);
  }
  if (source.bl) {
    quad.bl.x = toNumber(source.bl.x, 0);
    quad.bl.y = toNumber(source.bl.y, 0);
  }
  return quad;
}

function lerpQuad(a, b, t) {
  return {
    tl: { x: lerp(a.tl.x, b.tl.x, t), y: lerp(a.tl.y, b.tl.y, t) },
    tr: { x: lerp(a.tr.x, b.tr.x, t), y: lerp(a.tr.y, b.tr.y, t) },
    br: { x: lerp(a.br.x, b.br.x, t), y: lerp(a.br.y, b.br.y, t) },
    bl: { x: lerp(a.bl.x, b.bl.x, t), y: lerp(a.bl.y, b.bl.y, t) },
  };
}

function normalizeKfState(state) {
  const s = state && typeof state === 'object' ? state : {};
  return {
    dx: toNumber(s.dx, 0),
    dy: toNumber(s.dy, 0),
    scaleX: Number.isFinite(s.scaleX) ? s.scaleX : 1,
    rotZdeg: toNumber(s.rotZdeg, 0),
  };
}

function ensureDeformConfig(kf, layer) {
  if (!kf.deform || typeof kf.deform !== 'object') {
    kf.deform = { enabled: false, left: zeroQuad(), center: zeroQuad(), right: zeroQuad() };
  } else {
    kf.deform.left = cloneQuad(kf.deform.left);
    kf.deform.center = cloneQuad(kf.deform.center);
    kf.deform.right = cloneQuad(kf.deform.right);
  }
  if (layer !== 'far') {
    kf.deform.enabled = false;
  } else {
    kf.deform.enabled = !!kf.deform.enabled;
  }
  return kf.deform;
}

function normalizeKf(kf, layer) {
  const base = kf && typeof kf === 'object' ? deepClone(kf) : {};
  base.radius = Math.max(1, toNumber(base.radius, 800));
  base.ease = typeof base.ease === 'string' ? base.ease : 'smoothstep';
  base.translateSpace = base.translateSpace === 'local' ? 'local' : 'screen';
  base.transformOrder = base.transformOrder === 'rotateThenScale' ? 'rotateThenScale' : 'scaleThenRotate';
  base.left = normalizeKfState(base.left);
  base.center = normalizeKfState(base.center);
  base.right = normalizeKfState(base.right);
  const deform = base.deform && typeof base.deform === 'object' ? base.deform : {};
  const normalizedDeform = {
    enabled: layer === 'far' && !!deform.enabled,
    left: cloneQuad(deform.left),
    center: cloneQuad(deform.center),
    right: cloneQuad(deform.right),
  };
  ['left', 'center', 'right'].forEach((key) => {
    if (base[key] && base[key].deform) {
      normalizedDeform[key] = cloneQuad(base[key].deform);
      delete base[key].deform;
    }
  });
  if (layer !== 'far') {
    normalizedDeform.enabled = false;
  }
  base.deform = normalizedDeform;
  return base;
}

function createDefaultPart(layer, index = 0) {
  const isNear = layer === 'near';
  const template = {
    id: `${layer}_part_${index + 1}`,
    url: isNear
      ? './assets/prefabs/structures/towers/tower_commercial_near.png'
      : './assets/prefabs/structures/towers/tower_general_far.png',
    w: 360,
    h: 480,
    pivot: 'bottom',
    anchorXPct: 50,
    anchorYPct: 100,
    parallaxX: isNear ? 1 : 0.85,
    parallaxClampPx: isNear ? 0 : 64,
    kf: {
      radius: 800,
      ease: 'smoothstep',
      translateSpace: 'screen',
      transformOrder: 'scaleThenRotate',
      left: isNear
        ? { dx: 0, dy: 0, scaleX: 1, rotZdeg: 0 }
        : { dx: -24, dy: 0, scaleX: 0.92, rotZdeg: -6 },
      center: { dx: 0, dy: 0, scaleX: 1, rotZdeg: 0 },
      right: isNear
        ? { dx: 0, dy: 0, scaleX: 1, rotZdeg: 0 }
        : { dx: 22, dy: 0, scaleX: 0.92, rotZdeg: 6 },
      deform: {
        enabled: false,
        left: zeroQuad(),
        center: zeroQuad(),
        right: zeroQuad(),
      },
    },
  };
  return {
    name: `${layer}_${index + 1}`,
    layer: isNear ? 'near' : 'far',
    relX: 0,
    relY: 0,
    z: isNear ? 10 : 0,
    propTemplate: template,
  };
}

function createDefaultPrefab(type = 'structure') {
  const prefab = {
    structureId: type === 'obstruction' ? 'New Obstruction' : 'Commercial Tower',
    type,
    tags: type === 'obstruction' ? ['obstruction'] : [],
    base: {},
    parts: [createDefaultPart('near', 0), createDefaultPart('far', 1)],
  };
  if (type === 'obstruction') {
    prefab.obstruction = {
      collision: { enabled: true, box: { width: 140, height: 110, offsetX: 0, offsetY: -60 } },
      physics: { enabled: true, dynamic: true, mass: 2.5, drag: 0.2 },
    };
  }
  return prefab;
}

function ensureObstruction(prefab) {
  if (!prefab.obstruction || typeof prefab.obstruction !== 'object') {
    prefab.obstruction = {};
  }
  const obstruction = prefab.obstruction;
  if (!obstruction.collision || typeof obstruction.collision !== 'object') {
    obstruction.collision = {};
  }
  if (!obstruction.collision.box || typeof obstruction.collision.box !== 'object') {
    obstruction.collision.box = { width: 140, height: 110, offsetX: 0, offsetY: -60 };
  }
  const box = obstruction.collision.box;
  obstruction.collision.enabled = !!obstruction.collision.enabled;
  box.width = Math.max(0, toNumber(box.width, 140));
  box.height = Math.max(0, toNumber(box.height, 110));
  box.offsetX = toNumber(box.offsetX, 0);
  box.offsetY = toNumber(box.offsetY, -60);
  if (!obstruction.physics || typeof obstruction.physics !== 'object') {
    obstruction.physics = {};
  }
  const physics = obstruction.physics;
  physics.enabled = !!physics.enabled;
  physics.dynamic = physics.enabled && !!physics.dynamic;
  physics.mass = physics.dynamic ? Math.max(0, toNumber(physics.mass, 2.5)) : null;
  physics.drag = physics.dynamic ? Math.max(0, toNumber(physics.drag, 0.2)) : null;
  return obstruction;
}

function normalizePart(part, index = 0) {
  const raw = part && typeof part === 'object' ? deepClone(part) : {};
  const layer = raw.layer === 'near' ? 'near' : 'far';
  const normalized = {
    name: typeof raw.name === 'string' ? raw.name : `${layer}_${index + 1}`,
    layer,
    relX: toNumber(raw.relX, 0),
    relY: toNumber(raw.relY, 0),
    z: toNumber(raw.z, layer === 'near' ? 10 : 0),
    propTemplate: {},
  };
  const template = raw.propTemplate && typeof raw.propTemplate === 'object' ? raw.propTemplate : {};
  normalized.propTemplate.id = typeof template.id === 'string' ? template.id : `${layer}_part_${index + 1}`;
  normalized.propTemplate.url = typeof template.url === 'string' ? template.url : '';
  normalized.propTemplate.w = toNumber(template.w, 360);
  normalized.propTemplate.h = toNumber(template.h, 480);
  normalized.propTemplate.pivot = typeof template.pivot === 'string' ? template.pivot : 'bottom';
  normalized.propTemplate.anchorXPct = Number.isFinite(template.anchorXPct) ? template.anchorXPct : 50;
  normalized.propTemplate.anchorYPct = Number.isFinite(template.anchorYPct) ? template.anchorYPct : 100;
  normalized.propTemplate.parallaxX = Number.isFinite(template.parallaxX)
    ? template.parallaxX
    : layer === 'near'
      ? 1
      : 0.85;
  normalized.propTemplate.parallaxClampPx = toNumber(
    template.parallaxClampPx,
    layer === 'near' ? 0 : 64,
  );
  normalized.propTemplate.kf = normalizeKf(template.kf, layer);
  return normalized;
}

function parseTags(raw) {
  if (Array.isArray(raw)) {
    return parseTags(raw.join(','));
  }
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  const parts = text.split(',').map((entry) => entry.trim()).filter(Boolean);
  const result = [];
  const seen = new Set();
  for (const tag of parts) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function normalizePrefab(prefab) {
  const base = prefab && typeof prefab === 'object' ? deepClone(prefab) : createDefaultPrefab('structure');
  base.structureId = typeof base.structureId === 'string' && base.structureId.trim()
    ? base.structureId.trim()
    : 'Untitled Prefab';
  const rawType = typeof base.type === 'string' ? base.type.trim().toLowerCase() : 'structure';
  base.type = rawType === 'obstruction' ? 'obstruction' : 'structure';
  base.tags = parseTags(base.tags);
  base.base = base.base && typeof base.base === 'object' ? base.base : {};
  base.parts = Array.isArray(base.parts)
    ? base.parts.map((part, index) => normalizePart(part, index))
    : [createDefaultPart('near', 0), createDefaultPart('far', 1)];
  if (!base.parts.length) {
    base.parts = [createDefaultPart('near', 0), createDefaultPart('far', 1)];
  }
  if (base.type === 'obstruction') {
    ensureObstruction(base);
    if (!base.tags.includes('obstruction')) {
      base.tags.push('obstruction');
    }
  } else if (base.obstruction) {
    ensureObstruction(base);
    base.obstruction.collision.enabled = !!base.obstruction.collision.enabled;
    base.obstruction.physics.enabled = !!base.obstruction.physics.enabled;
    if (!base.obstruction.physics.enabled) {
      base.obstruction.physics.dynamic = false;
      base.obstruction.physics.mass = null;
      base.obstruction.physics.drag = null;
    }
  }
  return base;
}

const els = {};
let cx = null;
let ro = null;
let tagInputInternal = false;
const deformInputIds = [
  'defLeftTlX', 'defLeftTlY', 'defLeftTrX', 'defLeftTrY',
  'defLeftBrX', 'defLeftBrY', 'defLeftBlX', 'defLeftBlY',
  'defRightTlX', 'defRightTlY', 'defRightTrX', 'defRightTrY',
  'defRightBrX', 'defRightBrY', 'defRightBlX', 'defRightBlY',
];

const state = {
  prefab: createDefaultPrefab('structure'),
  images: new Map(),
  ui: { preview: 'lock160', zoom: 1 },
  library: new Map(),
  libraryLoaded: false,
  libraryLoading: null,
};

function initRefs() {
  [
    'repoPrefabSelect', 'btnLoadFromRepo', 'btnRefreshRepo',
    'btnNew', 'btnLoadPrefab', 'btnSavePrefab', 'btnCopyFactory',
    'prefabId', 'prefabType', 'prefabTypeChip', 'prefabTags', 'prefabTagList',
    'obstructionCard', 'obsCollisionEnabled', 'obsPhysicsEnabled',
    'obsCollisionWidth', 'obsCollisionHeight', 'obsCollisionOffsetX', 'obsCollisionOffsetY',
    'obsPhysicsDynamic', 'obsPhysicsMass', 'obsPhysicsDrag',
    'partsCard', 'autoApply', 'btnApply', 'partIndex', 'p_layer', 'p_z', 'p_url', 'p_id',
    'p_w', 'p_h', 'p_relx', 'p_rely', 'p_pivot', 'p_anchorX', 'p_anchorY', 'p_order', 'p_space',
    'p_radius', 'p_ease', 'p_prx', 'p_clamp', 'Ldx', 'Lsx', 'Lrz', 'Cdx', 'Csx', 'Crz',
    'Rdx', 'Rsx', 'Rrz', 'deformEnabled', 'deformWarning', 'deformSection',
    'tSlider', 'tNum', 'z_mode', 'z_debug', 'previewSize', 'previewZoom', 'previewZoomNum',
    'cv', 'cvWrap', 'ctm',
  ]
    .concat(deformInputIds)
    .forEach((id) => {
      els[id] = document.getElementById(id);
    });
}

function setTagInputValue(tags) {
  if (!els.prefabTags) return;
  tagInputInternal = true;
  els.prefabTags.value = Array.isArray(tags) ? tags.join(', ') : '';
  tagInputInternal = false;
}

function renderTags() {
  if (!els.prefabTagList) return;
  els.prefabTagList.innerHTML = '';
  const tags = Array.isArray(state.prefab.tags) ? state.prefab.tags : [];
  setTagInputValue(tags);
  tags.forEach((tag) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    const text = document.createElement('span');
    text.textContent = tag;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.prefab.tags = state.prefab.tags.filter((entry) => entry !== tag);
      renderTags();
      if (els.autoApply && els.autoApply.checked) {
        applyPrefabFields();
      }
    });
    badge.appendChild(text);
    badge.appendChild(remove);
    els.prefabTagList.appendChild(badge);
  });
}

function updateTagsFromInput() {
  if (!els.prefabTags || tagInputInternal) return;
  state.prefab.tags = parseTags(els.prefabTags.value);
  renderTags();
}

function updatePrefabTypeChip() {
  if (!els.prefabTypeChip) return;
  const type = state.prefab.type || 'structure';
  const formatted = type.charAt(0).toUpperCase() + type.slice(1);
  els.prefabTypeChip.textContent = formatted;
  if (type === 'obstruction') {
    els.prefabTypeChip.classList.add('layer-chip--far');
  } else {
    els.prefabTypeChip.classList.remove('layer-chip--far');
  }
}

function updateObstructionVisibility() {
  if (!els.obstructionCard) return;
  els.obstructionCard.hidden = state.prefab.type !== 'obstruction';
}

function updateObstructionFieldDisabled() {
  if (!els.obsPhysicsEnabled) return;
  const physicsEnabled = !!els.obsPhysicsEnabled.checked;
  if (els.obsPhysicsDynamic) {
    els.obsPhysicsDynamic.disabled = !physicsEnabled;
    if (!physicsEnabled) {
      els.obsPhysicsDynamic.checked = false;
    }
  }
  const dynamic = physicsEnabled && !!(els.obsPhysicsDynamic && els.obsPhysicsDynamic.checked);
  if (els.obsPhysicsMass) {
    els.obsPhysicsMass.disabled = !dynamic;
  }
  if (els.obsPhysicsDrag) {
    els.obsPhysicsDrag.disabled = !dynamic;
  }
}

function loadObstructionFields() {
  if (!els.obstructionCard) return;
  const obstruction = ensureObstruction(state.prefab);
  const box = obstruction.collision.box;
  if (els.obsCollisionEnabled) els.obsCollisionEnabled.checked = !!obstruction.collision.enabled;
  if (els.obsCollisionWidth) els.obsCollisionWidth.value = box.width;
  if (els.obsCollisionHeight) els.obsCollisionHeight.value = box.height;
  if (els.obsCollisionOffsetX) els.obsCollisionOffsetX.value = box.offsetX;
  if (els.obsCollisionOffsetY) els.obsCollisionOffsetY.value = box.offsetY;
  if (els.obsPhysicsEnabled) els.obsPhysicsEnabled.checked = !!obstruction.physics.enabled;
  if (els.obsPhysicsDynamic) {
    els.obsPhysicsDynamic.checked = obstruction.physics.enabled && !!obstruction.physics.dynamic;
  }
  if (els.obsPhysicsMass) {
    els.obsPhysicsMass.value = obstruction.physics.dynamic && obstruction.physics.mass != null
      ? obstruction.physics.mass
      : 0;
  }
  if (els.obsPhysicsDrag) {
    els.obsPhysicsDrag.value = obstruction.physics.dynamic && obstruction.physics.drag != null
      ? obstruction.physics.drag
      : 0;
  }
  updateObstructionFieldDisabled();
}

function applyObstructionFields() {
  if (!els.obstructionCard) return;
  const obstruction = ensureObstruction(state.prefab);
  if (els.obsCollisionEnabled) obstruction.collision.enabled = !!els.obsCollisionEnabled.checked;
  const box = obstruction.collision.box;
  if (els.obsCollisionWidth) box.width = Math.max(0, toNumber(els.obsCollisionWidth.value, box.width));
  if (els.obsCollisionHeight) box.height = Math.max(0, toNumber(els.obsCollisionHeight.value, box.height));
  if (els.obsCollisionOffsetX) box.offsetX = toNumber(els.obsCollisionOffsetX.value, box.offsetX);
  if (els.obsCollisionOffsetY) box.offsetY = toNumber(els.obsCollisionOffsetY.value, box.offsetY);
  if (els.obsPhysicsEnabled) obstruction.physics.enabled = !!els.obsPhysicsEnabled.checked;
  if (els.obsPhysicsDynamic) {
    obstruction.physics.dynamic = obstruction.physics.enabled && !!els.obsPhysicsDynamic.checked;
  }
  if (obstruction.physics.dynamic) {
    if (els.obsPhysicsMass) obstruction.physics.mass = Math.max(0, toNumber(els.obsPhysicsMass.value, obstruction.physics.mass ?? 1));
    if (els.obsPhysicsDrag) obstruction.physics.drag = Math.max(0, toNumber(els.obsPhysicsDrag.value, obstruction.physics.drag ?? 0));
  } else {
    obstruction.physics.mass = null;
    obstruction.physics.drag = null;
  }
  updateObstructionFieldDisabled();
}

function applyPrefabFields() {
  if (!state.prefab) return;
  if (els.prefabId) {
    const id = (els.prefabId.value || '').trim();
    state.prefab.structureId = id || 'Untitled Prefab';
  }
  if (els.prefabType) {
    state.prefab.type = els.prefabType.value === 'obstruction' ? 'obstruction' : 'structure';
  }
  updateTagsFromInput();
  if (state.prefab.type === 'obstruction') {
    ensureObstruction(state.prefab);
    applyObstructionFields();
  } else if (state.prefab.obstruction) {
    ensureObstruction(state.prefab);
    state.prefab.obstruction.collision.enabled = !!state.prefab.obstruction.collision.enabled;
    state.prefab.obstruction.physics.enabled = !!state.prefab.obstruction.physics.enabled;
    if (!state.prefab.obstruction.physics.enabled) {
      state.prefab.obstruction.physics.dynamic = false;
      state.prefab.obstruction.physics.mass = null;
      state.prefab.obstruction.physics.drag = null;
    }
  }
  updateObstructionVisibility();
  updatePrefabTypeChip();
  renderTags();
}

function loadPrefabFields() {
  if (!state.prefab) return;
  if (els.prefabId) els.prefabId.value = state.prefab.structureId || '';
  if (els.prefabType) els.prefabType.value = state.prefab.type || 'structure';
  renderTags();
  loadObstructionFields();
  updateObstructionVisibility();
  updatePrefabTypeChip();
}

function refreshPartList() {
  if (!els.partIndex) return;
  els.partIndex.innerHTML = '';
  state.prefab.parts.forEach((part, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index}: ${part.name || `part_${index + 1}`} (${part.layer})`;
    els.partIndex.appendChild(option);
  });
}

function setInputValue(id, value) {
  const node = els[id];
  if (node) node.value = value;
}

function updateDeformInputsState(part) {
  const isFar = part && part.layer === 'far';
  if (els.deformEnabled) {
    els.deformEnabled.disabled = !isFar;
    if (!isFar) {
      els.deformEnabled.checked = false;
    }
  }
  if (els.deformWarning) {
    els.deformWarning.hidden = !!isFar;
  }
  deformInputIds.forEach((id) => {
    const node = els[id];
    if (node) node.disabled = !isFar;
  });
}

function loadPartFields(index) {
  const part = state.prefab.parts[index];
  if (!part) return;
  const t = part.propTemplate || {};
  if (els.p_layer) els.p_layer.value = part.layer;
  if (els.p_z) els.p_z.value = part.z ?? 0;
  if (els.p_url) els.p_url.value = t.url || '';
  if (els.p_id) els.p_id.value = t.id || `part_${index + 1}`;
  if (els.p_w) els.p_w.value = t.w ?? 100;
  if (els.p_h) els.p_h.value = t.h ?? 100;
  if (els.p_relx) els.p_relx.value = part.relX ?? 0;
  if (els.p_rely) els.p_rely.value = part.relY ?? 0;
  if (els.p_pivot) els.p_pivot.value = t.pivot || 'bottom';
  if (els.p_anchorX) els.p_anchorX.value = Number.isFinite(t.anchorXPct) ? t.anchorXPct : 50;
  if (els.p_anchorY) els.p_anchorY.value = Number.isFinite(t.anchorYPct) ? t.anchorYPct : 100;
  if (els.p_order) els.p_order.value = t.kf?.transformOrder || 'scaleThenRotate';
  if (els.p_space) els.p_space.value = t.kf?.translateSpace || 'screen';
  if (els.p_radius) els.p_radius.value = t.kf?.radius ?? 800;
  if (els.p_ease) els.p_ease.value = t.kf?.ease || 'smoothstep';
  if (els.p_prx) els.p_prx.value = t.parallaxX ?? (part.layer === 'near' ? 1 : 0.85);
  if (els.p_clamp) els.p_clamp.value = t.parallaxClampPx ?? (part.layer === 'near' ? 0 : 64);
  if (els.Ldx) els.Ldx.value = t.kf?.left?.dx ?? 0;
  if (els.Lsx) els.Lsx.value = t.kf?.left?.scaleX ?? 1;
  if (els.Lrz) els.Lrz.value = t.kf?.left?.rotZdeg ?? 0;
  if (els.Cdx) els.Cdx.value = t.kf?.center?.dx ?? 0;
  if (els.Csx) els.Csx.value = t.kf?.center?.scaleX ?? 1;
  if (els.Crz) els.Crz.value = t.kf?.center?.rotZdeg ?? 0;
  if (els.Rdx) els.Rdx.value = t.kf?.right?.dx ?? 0;
  if (els.Rsx) els.Rsx.value = t.kf?.right?.scaleX ?? 1;
  if (els.Rrz) els.Rrz.value = t.kf?.right?.rotZdeg ?? 0;
  const kf = t.kf || (t.kf = normalizeKf({}, part.layer));
  ensureDeformConfig(kf, part.layer);
  if (els.deformEnabled) {
    els.deformEnabled.checked = part.layer === 'far' && !!kf.deform.enabled;
  }
  const left = kf.deform.left;
  const right = kf.deform.right;
  setInputValue('defLeftTlX', left.tl.x);
  setInputValue('defLeftTlY', left.tl.y);
  setInputValue('defLeftTrX', left.tr.x);
  setInputValue('defLeftTrY', left.tr.y);
  setInputValue('defLeftBrX', left.br.x);
  setInputValue('defLeftBrY', left.br.y);
  setInputValue('defLeftBlX', left.bl.x);
  setInputValue('defLeftBlY', left.bl.y);
  setInputValue('defRightTlX', right.tl.x);
  setInputValue('defRightTlY', right.tl.y);
  setInputValue('defRightTrX', right.tr.x);
  setInputValue('defRightTrY', right.tr.y);
  setInputValue('defRightBrX', right.br.x);
  setInputValue('defRightBrY', right.br.y);
  setInputValue('defRightBlX', right.bl.x);
  setInputValue('defRightBlY', right.bl.y);
  updateDeformInputsState(part);
}

function applyPartFields(index) {
  const part = state.prefab.parts[index];
  if (!part) return;
  const t = part.propTemplate || (part.propTemplate = {});
  const oldUrl = t.url || '';
  if (els.p_layer) part.layer = els.p_layer.value === 'near' ? 'near' : 'far';
  if (els.p_z) part.z = toNumber(els.p_z.value, part.z ?? 0);
  if (els.p_relx) part.relX = toNumber(els.p_relx.value, part.relX ?? 0);
  if (els.p_rely) part.relY = toNumber(els.p_rely.value, part.relY ?? 0);
  if (els.p_id) t.id = els.p_id.value || `part_${index + 1}`;
  if (els.p_url) t.url = els.p_url.value || '';
  if (els.p_w) t.w = Math.max(1, toNumber(els.p_w.value, t.w ?? 100));
  if (els.p_h) t.h = Math.max(1, toNumber(els.p_h.value, t.h ?? 100));
  if (els.p_pivot) t.pivot = els.p_pivot.value || 'bottom';
  if (els.p_anchorX) t.anchorXPct = toNumber(els.p_anchorX.value, t.anchorXPct ?? 50);
  if (els.p_anchorY) t.anchorYPct = toNumber(els.p_anchorY.value, t.anchorYPct ?? 100);
  if (els.p_prx) t.parallaxX = toNumber(els.p_prx.value, t.parallaxX ?? (part.layer === 'near' ? 1 : 0.85));
  if (els.p_clamp) t.parallaxClampPx = toNumber(els.p_clamp.value, t.parallaxClampPx ?? (part.layer === 'near' ? 0 : 64));
  t.kf = t.kf || normalizeKf({}, part.layer);
  const kf = t.kf;
  if (els.p_radius) kf.radius = Math.max(1, toNumber(els.p_radius.value, kf.radius ?? 800));
  if (els.p_ease) kf.ease = els.p_ease.value || 'smoothstep';
  if (els.p_space) kf.translateSpace = els.p_space.value || 'screen';
  if (els.p_order) kf.transformOrder = els.p_order.value || 'scaleThenRotate';
  if (els.Ldx) kf.left.dx = toNumber(els.Ldx.value, kf.left.dx ?? 0);
  if (els.Lsx) kf.left.scaleX = toNumber(els.Lsx.value, kf.left.scaleX ?? 1);
  if (els.Lrz) kf.left.rotZdeg = toNumber(els.Lrz.value, kf.left.rotZdeg ?? 0);
  if (els.Cdx) kf.center.dx = toNumber(els.Cdx.value, kf.center.dx ?? 0);
  if (els.Csx) kf.center.scaleX = toNumber(els.Csx.value, kf.center.scaleX ?? 1);
  if (els.Crz) kf.center.rotZdeg = toNumber(els.Crz.value, kf.center.rotZdeg ?? 0);
  if (els.Rdx) kf.right.dx = toNumber(els.Rdx.value, kf.right.dx ?? 0);
  if (els.Rsx) kf.right.scaleX = toNumber(els.Rsx.value, kf.right.scaleX ?? 1);
  if (els.Rrz) kf.right.rotZdeg = toNumber(els.Rrz.value, kf.right.rotZdeg ?? 0);
  const deform = ensureDeformConfig(kf, part.layer);
  deform.enabled = part.layer === 'far' && !!(els.deformEnabled && els.deformEnabled.checked);
  const readCorner = (xId, yId) => ({
    x: toNumber(els[xId] && els[xId].value, 0),
    y: toNumber(els[yId] && els[yId].value, 0),
  });
  deform.left = {
    tl: readCorner('defLeftTlX', 'defLeftTlY'),
    tr: readCorner('defLeftTrX', 'defLeftTrY'),
    br: readCorner('defLeftBrX', 'defLeftBrY'),
    bl: readCorner('defLeftBlX', 'defLeftBlY'),
  };
  deform.right = {
    tl: readCorner('defRightTlX', 'defRightTlY'),
    tr: readCorner('defRightTrX', 'defRightTrY'),
    br: readCorner('defRightBrX', 'defRightBrY'),
    bl: readCorner('defRightBlX', 'defRightBlY'),
  };
  if (!deform.center) deform.center = zeroQuad();
  updateDeformInputsState(part);
  if (t.url && t.url !== oldUrl) {
    ensureImages().then(draw);
  } else {
    draw();
  }
}

function computeAnchor(t) {
  const w = t.w || 100;
  const h = t.h || 100;
  const pivot = t.pivot || 'bottom';
  if (pivot === 'bottom') return { ax: w * 0.5, ay: h };
  if (pivot === 'center') return { ax: w * 0.5, ay: h * 0.5 };
  if (pivot === 'top') return { ax: w * 0.5, ay: 0 };
  const ax = (Number.isFinite(t.anchorXPct) ? t.anchorXPct : 50) * 0.01 * w;
  const ay = (Number.isFinite(t.anchorYPct) ? t.anchorYPct : 100) * 0.01 * h;
  return { ax, ay };
}

function blendKf(kf, layer, cameraX, worldX) {
  const radius = Math.max(1, kf?.radius || 800);
  const t = clamp((cameraX - worldX) / radius, -1, 1);
  const left = normalizeKfState(kf?.left);
  const center = normalizeKfState(kf?.center);
  const right = normalizeKfState(kf?.right);
  const ease = kf?.ease || 'smoothstep';
  let alpha = 0;
  let from = center;
  let to = center;
  const deform = ensureDeformConfig(kf, layer);
  let fromQuad = deform.center;
  let toQuad = deform.center;
  if (t <= 0) {
    alpha = ease01(ease, t + 1);
    from = left;
    to = center;
    fromQuad = deform.left;
    toQuad = deform.center;
  } else {
    alpha = ease01(ease, t);
    from = center;
    to = right;
    fromQuad = deform.center;
    toQuad = deform.right;
  }
  return {
    t,
    dx: lerp(from.dx, to.dx, alpha),
    dy: lerp(from.dy, to.dy, alpha),
    scaleX: lerp(from.scaleX, to.scaleX, alpha),
    rotZdeg: lerp(from.rotZdeg, to.rotZdeg, alpha),
    translateSpace: kf?.translateSpace || 'screen',
    order: kf?.transformOrder || 'scaleThenRotate',
    deformEnabled: deform.enabled,
    deform: deform.enabled ? lerpQuad(fromQuad, toQuad, alpha) : null,
  };
}

function computeDeformedQuad(template, deform, anchor) {
  const w = template.w || 100;
  const h = template.h || 100;
  const base = [
    { x: -anchor.ax, y: -anchor.ay },
    { x: -anchor.ax + w, y: -anchor.ay },
    { x: -anchor.ax + w, y: -anchor.ay + h },
    { x: -anchor.ax, y: -anchor.ay + h },
  ];
  return [
    { x: base[0].x + deform.tl.x, y: base[0].y + deform.tl.y },
    { x: base[1].x + deform.tr.x, y: base[1].y + deform.tr.y },
    { x: base[2].x + deform.br.x, y: base[2].y + deform.br.y },
    { x: base[3].x + deform.bl.x, y: base[3].y + deform.bl.y },
  ];
}

function mapPoint(matrix, point) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function bilerpQuadPoint(quad, u, v) {
  const top = { x: lerp(quad[0].x, quad[1].x, u), y: lerp(quad[0].y, quad[1].y, u) };
  const bottom = { x: lerp(quad[3].x, quad[2].x, u), y: lerp(quad[3].y, quad[2].y, u) };
  return { x: lerp(top.x, bottom.x, v), y: lerp(top.y, bottom.y, v) };
}

function drawImageTriangle(ctx, img, srcTri, destTri) {
  const denom = srcTri[0].x * (srcTri[1].y - srcTri[2].y)
    + srcTri[1].x * (srcTri[2].y - srcTri[0].y)
    + srcTri[2].x * (srcTri[0].y - srcTri[1].y);
  if (!denom) return;
  const m11 = (destTri[0].x * (srcTri[1].y - srcTri[2].y)
    + destTri[1].x * (srcTri[2].y - srcTri[0].y)
    + destTri[2].x * (srcTri[0].y - srcTri[1].y)) / denom;
  const m12 = (destTri[0].y * (srcTri[1].y - srcTri[2].y)
    + destTri[1].y * (srcTri[2].y - srcTri[0].y)
    + destTri[2].y * (srcTri[0].y - srcTri[1].y)) / denom;
  const m21 = (destTri[0].x * (srcTri[2].x - srcTri[1].x)
    + destTri[1].x * (srcTri[0].x - srcTri[2].x)
    + destTri[2].x * (srcTri[1].x - srcTri[0].x)) / denom;
  const m22 = (destTri[0].y * (srcTri[2].x - srcTri[1].x)
    + destTri[1].y * (srcTri[0].x - srcTri[2].x)
    + destTri[2].y * (srcTri[1].x - srcTri[0].x)) / denom;
  const dx = (destTri[0].x * (srcTri[1].x * srcTri[2].y - srcTri[2].x * srcTri[1].y)
    + destTri[1].x * (srcTri[2].x * srcTri[0].y - srcTri[0].x * srcTri[2].y)
    + destTri[2].x * (srcTri[0].x * srcTri[1].y - srcTri[1].x * srcTri[0].y)) / denom;
  const dy = (destTri[0].y * (srcTri[1].x * srcTri[2].y - srcTri[2].x * srcTri[1].y)
    + destTri[1].y * (srcTri[2].x * srcTri[0].y - srcTri[0].x * srcTri[2].y)
    + destTri[2].y * (srcTri[0].x * srcTri[1].y - srcTri[1].x * srcTri[0].y)) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(destTri[0].x, destTri[0].y);
  ctx.lineTo(destTri[1].x, destTri[1].y);
  ctx.lineTo(destTri[2].x, destTri[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawWarpedImage(ctx, img, quad, sourceW, sourceH) {
  const baseMatrix = ctx.getTransform();
  const destQuad = quad.map((point) => mapPoint(baseMatrix, point));
  const w = Math.max(1, sourceW || img?.width || 1);
  const h = Math.max(1, sourceH || img?.height || 1);
  const cols = clamp(Math.ceil(w / 80), 1, 48);
  const rows = clamp(Math.ceil(h / 80), 1, 48);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let y = 0; y < rows; y += 1) {
    const v0 = y / rows;
    const v1 = (y + 1) / rows;
    const sy0 = h * v0;
    const sy1 = h * v1;
    for (let x = 0; x < cols; x += 1) {
      const u0 = x / cols;
      const u1 = (x + 1) / cols;
      const sx0 = w * u0;
      const sx1 = w * u1;
      const tl = bilerpQuadPoint(destQuad, u0, v0);
      const tr = bilerpQuadPoint(destQuad, u1, v0);
      const br = bilerpQuadPoint(destQuad, u1, v1);
      const bl = bilerpQuadPoint(destQuad, u0, v1);
      drawImageTriangle(
        ctx,
        img,
        [{ x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 }],
        [tl, tr, br],
      );
      drawImageTriangle(
        ctx,
        img,
        [{ x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 }],
        [tl, br, bl],
      );
    }
  }
  ctx.restore();
}

function drawWarpedPlaceholder(ctx, quad, fill, stroke) {
  const baseMatrix = ctx.getTransform();
  const destQuad = quad.map((point) => mapPoint(baseMatrix, point));
  const cols = 6;
  const rows = 6;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let y = 0; y < rows; y += 1) {
    const v0 = y / rows;
    const v1 = (y + 1) / rows;
    for (let x = 0; x < cols; x += 1) {
      const u0 = x / cols;
      const u1 = (x + 1) / cols;
      const tl = bilerpQuadPoint(destQuad, u0, v0);
      const tr = bilerpQuadPoint(destQuad, u1, v0);
      const br = bilerpQuadPoint(destQuad, u1, v1);
      const bl = bilerpQuadPoint(destQuad, u0, v1);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDeformOverlay(ctx, quad) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < quad.length; i += 1) {
    ctx.lineTo(quad[i].x, quad[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(14,165,233,0.18)';
  ctx.strokeStyle = 'rgba(14,165,233,0.85)';
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(14,165,233,0.9)';
  quad.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function sizeCanvasToWrapper() {
  if (!els.cv || !els.cvWrap) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = els.cvWrap.getBoundingClientRect();
  const wantW = Math.max(1, Math.floor(rect.width * dpr));
  const wantH = Math.max(1, Math.floor(rect.height * dpr));
  if (els.cv.width !== wantW || els.cv.height !== wantH) {
    els.cv.width = wantW;
    els.cv.height = wantH;
  }
}

function setBaseline() {
  if (!cx) return 1;
  const dpr = window.devicePixelRatio || 1;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

function applyPreviewSize() {
  if (!els.previewSize || !els.cvWrap) return;
  const mode = els.previewSize.value || 'lock160';
  state.ui.preview = mode;
  let height = 160;
  if (mode === 'lock160') height = 160;
  else if (mode === 'lock180') height = 180;
  else if (mode === 'lock200') height = 200;
  else if (mode === 'lock220') height = 220;
  else if (mode === 'lock260') height = 260;
  else if (mode === 'lock300') height = 300;
  else if (mode === 'fit40') height = Math.round(clamp(window.innerHeight * 0.4, 160, 600));
  else if (mode === 'fit50') height = Math.round(clamp(window.innerHeight * 0.5, 180, 640));
  els.cvWrap.style.height = `${height}px`;
  sizeCanvasToWrapper();
}

function setZoom(value) {
  const zoom = clamp(Number(value) || 1, 0.25, 2);
  state.ui.zoom = zoom;
  if (els.previewZoom) els.previewZoom.value = String(zoom);
  if (els.previewZoomNum) els.previewZoomNum.value = zoom.toFixed(2);
  draw();
}

function ensureResizeObserver() {
  if (!window.ResizeObserver || !els.cvWrap) return;
  if (ro) ro.disconnect();
  let pending = false;
  ro = new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      sizeCanvasToWrapper();
      draw();
    });
  });
  ro.observe(els.cvWrap);
}

function draw() {
  if (!cx || !els.cv || !state.prefab) return;
  sizeCanvasToWrapper();
  const dpr = setBaseline();
  cx.clearRect(0, 0, els.cv.width, els.cv.height);
  const width = els.cv.width / dpr;
  const height = els.cv.height / dpr;
  const groundY = height * 0.82;
  const zoom = clamp(state.ui.zoom, 0.25, 2);
  cx.save();
  cx.scale(zoom, zoom);
  const viewWidth = width / zoom;
  cx.strokeStyle = 'rgba(255,255,255,0.1)';
  cx.beginPath();
  cx.moveTo(0, groundY);
  cx.lineTo(viewWidth, groundY);
  cx.stroke();
  const camX = Number(els.tNum && els.tNum.value) || 0;
  const mode = els.z_mode ? els.z_mode.value : 'nearTop';
  const parts = state.prefab.parts.slice().map((part) => {
    let weight = 0;
    if (mode === 'nearTop') {
      weight = (part.layer === 'far' ? 0 : 100000) + (Number(part.z) || 0);
    } else if (mode === 'layerOnly') {
      weight = part.layer === 'far' ? 0 : 100000;
    } else {
      weight = Number(part.z) || 0;
    }
    return { part, weight };
  }).sort((a, b) => a.weight - b.weight);
  parts.forEach(({ part }, index) => {
    const template = part.propTemplate || {};
    const imgEntry = state.images.get(template.url);
    const anchor = computeAnchor(template);
    const blend = blendKf(template.kf || {}, part.layer, camX, 0);
    const quad = blend.deformEnabled && blend.deform
      ? computeDeformedQuad(template, blend.deform, anchor)
      : null;
    cx.save();
    const baseX = viewWidth / 2 + (part.relX || 0);
    const baseY = groundY - (part.relY || 0);
    cx.translate(baseX, baseY);
    if (blend.translateSpace === 'screen') {
      cx.translate(blend.dx || 0, blend.dy || 0);
    }
    if (blend.order === 'scaleThenRotate') {
      if (Number.isFinite(blend.scaleX)) cx.scale(blend.scaleX, 1);
      if (blend.rotZdeg) cx.rotate(rad(blend.rotZdeg));
    } else {
      if (blend.rotZdeg) cx.rotate(rad(blend.rotZdeg));
      if (Number.isFinite(blend.scaleX)) cx.scale(blend.scaleX, 1);
    }
    if (blend.translateSpace === 'local') {
      cx.translate(blend.dx || 0, blend.dy || 0);
    }
    if (quad) {
      if (imgEntry && imgEntry.ok && imgEntry.img) {
        drawWarpedImage(cx, imgEntry.img, quad, template.w || 100, template.h || 100);
      } else {
        const fill = part.layer === 'near' ? 'rgba(167,139,250,0.12)' : 'rgba(96,165,250,0.12)';
        const stroke = part.layer === 'near' ? 'rgba(167,139,250,0.6)' : 'rgba(96,165,250,0.6)';
        drawWarpedPlaceholder(cx, quad, fill, stroke);
      }
    } else if (imgEntry && imgEntry.ok && imgEntry.img) {
      cx.drawImage(imgEntry.img, -anchor.ax, -anchor.ay, template.w || 100, template.h || 100);
    } else {
      cx.fillStyle = part.layer === 'near' ? 'rgba(167,139,250,0.12)' : 'rgba(96,165,250,0.12)';
      cx.strokeStyle = part.layer === 'near' ? 'rgba(167,139,250,0.6)' : 'rgba(96,165,250,0.6)';
      cx.fillRect(-anchor.ax, -anchor.ay, template.w || 100, template.h || 100);
      cx.strokeRect(-anchor.ax, -anchor.ay, template.w || 100, template.h || 100);
    }
    if (quad) {
      drawDeformOverlay(cx, quad);
    }
    if (els.z_debug && els.z_debug.value === 'canvas') {
      cx.fillStyle = '#cbd5e1';
      cx.font = '11px ui-monospace, Menlo, Consolas';
      cx.fillText(`${index}: ${part.name || 'part'} (${part.layer}) z=${part.z ?? 0}`, -anchor.ax, -anchor.ay - 4);
    }
    cx.restore();
  });
  cx.restore();
  const matrix = cx.getTransform();
  if (els.ctm) {
    els.ctm.textContent = `CTM a:${matrix.a.toFixed(2)} b:${matrix.b.toFixed(2)} c:${matrix.c.toFixed(2)} d:${matrix.d.toFixed(2)} zoom:${zoom.toFixed(2)}`;
  }
  if (els.tNum) {
    const value = Number(els.tNum.value) || 0;
    cx.fillStyle = '#9fb4ce';
    cx.font = '12px ui-monospace, Menlo, Consolas';
    cx.fillText(`t=${value.toFixed(3)}`, 10, 18);
  }
}

const ABS_URL_RE = /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i;

function resolveAssetCandidates(url) {
  if (typeof url !== 'string') return [];
  const trimmed = url.trim();
  if (!trimmed) return [];
  if (ABS_URL_RE.test(trimmed) || trimmed.startsWith('data:')) {
    return [trimmed];
  }
  const base = typeof document !== 'undefined' && typeof document.baseURI === 'string'
    ? document.baseURI
    : window.location.href;
  const candidates = [];
  try {
    candidates.push(new URL(trimmed, base).href);
  } catch (err) {
    // ignore
  }
  try {
    const docsBase = new URL('../docs/', base);
    const normalized = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
    candidates.push(new URL(normalized, docsBase).href);
  } catch (err) {
    // ignore
  }
  candidates.push(trimmed);
  return candidates.filter((value, index, self) => value && self.indexOf(value) === index);
}

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, img: null });
      return;
    }
    if (state.images.has(url)) {
      resolve({ ok: true, img: state.images.get(url) });
      return;
    }
    const candidates = resolveAssetCandidates(url);
    if (!candidates.length) {
      resolve({ ok: false, img: null });
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let index = 0;
    img.onload = () => {
      state.images.set(url, img);
      resolve({ ok: true, img });
    };
    img.onerror = () => {
      index += 1;
      if (index >= candidates.length) {
        window.__DBG?.(`[structure-editor] Image load failed: ${url}`);
        resolve({ ok: false, img: null });
        return;
      }
      img.src = candidates[index];
    };
    img.src = candidates[index];
  });
}

async function ensureImages() {
  for (const part of state.prefab.parts) {
    if (part.propTemplate && part.propTemplate.url) {
      await loadImage(part.propTemplate.url);
    }
  }
}

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function ensureLibraryOptions(force = false) {
  if (!force && state.libraryLoaded) return;
  if (state.libraryLoading) {
    await state.libraryLoading;
    return;
  }
  if (els.repoPrefabSelect) {
    els.repoPrefabSelect.disabled = true;
  }
  state.libraryLoading = (async () => {
    state.library.clear();
    const entries = [];
    for (const manifestPath of PREFAB_MANIFESTS) {
      const manifestUrl = new URL(manifestPath, window.location.href).href;
      try {
        const manifest = await fetchManifest(manifestUrl);
        const label = manifest.label || 'Prefabs';
        const list = Array.isArray(manifest.entries) ? manifest.entries : [];
        for (const entry of list) {
          const entryUrl = new URL(entry.path, manifestUrl).href;
          try {
            const response = await fetch(entryUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const prefab = await response.json();
            const id = prefab.structureId || entry.id || entryUrl;
            const key = `${manifestUrl}::${id}`;
            state.library.set(key, {
              key,
              id,
              label,
              prefab,
            });
            entries.push({ key, id, label, prefab });
          } catch (err) {
            window.__DBG?.(`[repository] Failed to load prefab ${entry.path}: ${err.message}`);
          }
        }
      } catch (err) {
        window.__DBG?.(`[repository] Failed to load manifest ${manifestUrl}: ${err.message}`);
      }
    }
    populateRepoSelect(entries);
    state.libraryLoaded = true;
  })();
  try {
    await state.libraryLoading;
  } finally {
    state.libraryLoading = null;
    if (els.repoPrefabSelect) {
      els.repoPrefabSelect.disabled = false;
    }
  }
}

function populateRepoSelect(entries) {
  if (!els.repoPrefabSelect) return;
  els.repoPrefabSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Browse repository…';
  els.repoPrefabSelect.appendChild(placeholder);
  const groups = new Map();
  entries.forEach((entry) => {
    if (!groups.has(entry.label)) {
      groups.set(entry.label, []);
    }
    groups.get(entry.label).push(entry);
  });
  for (const [label, list] of groups.entries()) {
    const group = document.createElement('optgroup');
    group.label = label;
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    list.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.key;
      const typeLabel = entry.prefab.type || 'structure';
      option.textContent = `${entry.prefab.structureId || entry.id} (${typeLabel})`;
      group.appendChild(option);
    });
    els.repoPrefabSelect.appendChild(group);
  }
}

async function handleLoadFromRepo() {
  await ensureLibraryOptions();
  const key = els.repoPrefabSelect ? els.repoPrefabSelect.value : '';
  if (!key) {
    alert('Select a prefab from the repository list first.');
    return;
  }
  const entry = state.library.get(key);
  if (!entry) {
    alert('The selected prefab is no longer available.');
    return;
  }
  setPrefab(entry.prefab);
}

function setPrefab(prefab) {
  state.prefab = normalizePrefab(prefab);
  refreshPartList();
  if (els.partIndex && state.prefab.parts.length) {
    els.partIndex.value = '0';
  }
  loadPrefabFields();
  loadPartFields(0);
  ensureImages().then(draw);
  draw();
}

function wireAutoApply() {
  const applyPart = () => {
    if (!els.autoApply || !els.autoApply.checked) return;
    const index = Number(els.partIndex && els.partIndex.value) || 0;
    applyPartFields(index);
  };
  const partIds = [
    'p_z', 'p_url', 'p_id', 'p_w', 'p_h', 'p_relx', 'p_rely',
    'p_pivot', 'p_anchorX', 'p_anchorY', 'p_order', 'p_space',
    'p_radius', 'p_ease', 'p_prx', 'p_clamp',
    'Ldx', 'Lsx', 'Lrz', 'Cdx', 'Csx', 'Crz', 'Rdx', 'Rsx', 'Rrz',
  ];
  partIds.forEach((id) => {
    const node = els[id];
    if (!node) return;
    node.addEventListener('input', applyPart);
    node.addEventListener('change', applyPart);
  });
  deformInputIds.forEach((id) => {
    const node = els[id];
    if (!node) return;
    node.addEventListener('input', applyPart);
    node.addEventListener('change', applyPart);
  });
  const applyPrefab = () => {
    if (!els.autoApply || !els.autoApply.checked) return;
    applyPrefabFields();
  };
  ['prefabId', 'prefabType'].forEach((id) => {
    const node = els[id];
    if (!node) return;
    node.addEventListener('change', applyPrefab);
  });
  if (els.prefabTags) {
    els.prefabTags.addEventListener('input', () => {
      updateTagsFromInput();
      applyPrefab();
    });
  }
  [
    'obsCollisionWidth', 'obsCollisionHeight', 'obsCollisionOffsetX', 'obsCollisionOffsetY',
    'obsPhysicsMass', 'obsPhysicsDrag',
  ].forEach((id) => {
    const node = els[id];
    if (!node) return;
    node.addEventListener('change', applyPrefab);
  });
}

function wireAll() {
  if (els.partIndex) {
    els.partIndex.addEventListener('change', () => {
      const index = Number(els.partIndex.value) || 0;
      loadPartFields(index);
      if (els.autoApply && els.autoApply.checked) {
        applyPartFields(index);
      }
    });
  }
  if (els.btnApply) {
    els.btnApply.addEventListener('click', () => {
      applyPrefabFields();
      const index = Number(els.partIndex && els.partIndex.value) || 0;
      applyPartFields(index);
    });
  }
  if (els.btnAddPart) {
    els.btnAddPart.addEventListener('click', () => {
      const part = createDefaultPart('far', state.prefab.parts.length);
      state.prefab.parts.push(part);
      refreshPartList();
      if (els.partIndex) {
        const index = state.prefab.parts.length - 1;
        els.partIndex.value = String(index);
        loadPartFields(index);
      }
      ensureImages().then(draw);
    });
  }
  if (els.btnDelPart) {
    els.btnDelPart.addEventListener('click', () => {
      if (state.prefab.parts.length <= 1) return;
      const index = Number(els.partIndex && els.partIndex.value) || 0;
      state.prefab.parts.splice(index, 1);
      refreshPartList();
      const nextIndex = Math.max(0, Math.min(state.prefab.parts.length - 1, index));
      if (els.partIndex) els.partIndex.value = String(nextIndex);
      loadPartFields(nextIndex);
      draw();
    });
  }
  if (els.p_layer) {
    els.p_layer.addEventListener('change', () => {
      const index = Number(els.partIndex && els.partIndex.value) || 0;
      if (els.autoApply && els.autoApply.checked) {
        applyPartFields(index);
      } else if (state.prefab.parts[index]) {
        state.prefab.parts[index].layer = els.p_layer.value === 'near' ? 'near' : 'far';
        updateDeformInputsState(state.prefab.parts[index]);
      }
      loadPartFields(index);
    });
  }
  if (els.deformEnabled) {
    els.deformEnabled.addEventListener('change', () => {
      const index = Number(els.partIndex && els.partIndex.value) || 0;
      if (els.autoApply && els.autoApply.checked) {
        applyPartFields(index);
      } else {
        updateDeformInputsState(state.prefab.parts[index]);
      }
    });
  }
  if (els.prefabType) {
    els.prefabType.addEventListener('change', () => {
      applyPrefabFields();
      loadObstructionFields();
      draw();
    });
  }
  if (els.prefabTags) {
    els.prefabTags.addEventListener('input', () => {
      updateTagsFromInput();
      if (els.autoApply && els.autoApply.checked) {
        applyPrefabFields();
      }
    });
  }
  if (els.obsCollisionEnabled) {
    els.obsCollisionEnabled.addEventListener('change', () => {
      applyObstructionFields();
      if (els.autoApply && els.autoApply.checked) applyPrefabFields();
    });
  }
  if (els.obsPhysicsEnabled) {
    els.obsPhysicsEnabled.addEventListener('change', () => {
      applyObstructionFields();
      if (els.autoApply && els.autoApply.checked) applyPrefabFields();
    });
  }
  if (els.obsPhysicsDynamic) {
    els.obsPhysicsDynamic.addEventListener('change', () => {
      applyObstructionFields();
      if (els.autoApply && els.autoApply.checked) applyPrefabFields();
    });
  }
  if (els.btnNew) {
    els.btnNew.addEventListener('click', () => {
      const type = els.prefabType ? els.prefabType.value : 'structure';
      setPrefab(createDefaultPrefab(type));
    });
  }
  if (els.btnLoadPrefab) {
    els.btnLoadPrefab.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            setPrefab(data);
          } catch (err) {
            alert('Invalid prefab JSON');
            window.__DBG?.(`[structure-editor] Failed to parse prefab: ${err.message}`);
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }
  if (els.btnSavePrefab) {
    els.btnSavePrefab.addEventListener('click', () => {
      applyPrefabFields();
      const index = Number(els.partIndex && els.partIndex.value) || 0;
      applyPartFields(index);
      const data = JSON.stringify(state.prefab, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${state.prefab.structureId || 'structure'}.prefab.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
  if (els.btnCopyFactory) {
    els.btnCopyFactory.addEventListener('click', () => {
      const stub = "import { appendInstanceToSegment } from './structure_factory_v2.js';\nappendInstanceToSegment(map.segments, 0, prefab, { x: 620, y: 380, idSuffix: 'A' });";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(stub).then(() => {
          alert('Factory call copied to clipboard.');
        });
      }
    });
  }
  if (els.btnLoadFromRepo) {
    els.btnLoadFromRepo.addEventListener('click', () => {
      handleLoadFromRepo().catch((err) => {
        alert(`Failed to load prefab: ${err.message}`);
      });
    });
  }
  if (els.btnRefreshRepo) {
    els.btnRefreshRepo.addEventListener('click', () => {
      ensureLibraryOptions(true).catch((err) => {
        alert(`Failed to refresh repository: ${err.message}`);
      });
    });
  }
  if (els.repoPrefabSelect) {
    ['focus', 'mousedown'].forEach((event) => {
      els.repoPrefabSelect.addEventListener(event, () => {
        ensureLibraryOptions().catch((err) => {
          window.__DBG?.(`[repository] ${err.message}`);
        });
      }, { once: true });
    });
  }
  if (els.tSlider) {
    els.tSlider.addEventListener('input', (event) => {
      if (els.tNum) els.tNum.value = event.target.value;
      draw();
    });
  }
  if (els.tNum) {
    els.tNum.addEventListener('input', (event) => {
      const value = clamp(Number(event.target.value) || 0, -1, 1);
      event.target.value = String(value);
      if (els.tSlider) els.tSlider.value = String(value);
      draw();
    });
  }
  if (els.z_mode) els.z_mode.addEventListener('change', draw);
  if (els.z_debug) els.z_debug.addEventListener('change', draw);
  if (els.previewSize) {
    els.previewSize.addEventListener('change', () => {
      applyPreviewSize();
      draw();
    });
  }
  window.addEventListener('resize', () => {
    if (!els.previewSize) return;
    const mode = els.previewSize.value;
    if (mode === 'fit40' || mode === 'fit50') {
      applyPreviewSize();
      draw();
    }
  });
  if (els.previewZoom) {
    els.previewZoom.addEventListener('input', (event) => setZoom(event.target.value));
  }
  if (els.previewZoomNum) {
    els.previewZoomNum.addEventListener('input', (event) => setZoom(event.target.value));
  }
}

function normalizePrefabAndSet(prefab) {
  setPrefab(prefab);
}

document.addEventListener('DOMContentLoaded', () => {
  initRefs();
  if (els.cv) {
    cx = els.cv.getContext('2d', { alpha: true, desynchronized: true });
  }
  wireAutoApply();
  wireAll();
  applyPreviewSize();
  ensureResizeObserver();
  setZoom(1);
  normalizePrefabAndSet(state.prefab);
});
