// Shared HUD layout helpers for bottom buttons and resource bars

export const DEFAULT_BUTTON_LAYOUT = {
  jump: { left: '15%', top: '72%', rotate: '-12deg' },
  attackA: { left: '40%', top: '44%', rotate: '-6deg' },
  attackB: { left: '58%', top: '38%', rotate: '6deg' },
  attackC: { left: '82%', top: '68%', rotate: '12deg' },
};

export const DEFAULT_BOTTOM_BUTTON_ACTIONS = {
  jump: 'jump',
  attackA: 'buttonA',
  attackB: 'buttonB',
  attackC: 'buttonC',
};

export const DEFAULT_BOTTOM_HUD_CONFIG = {
  width: 360,
  height: 200,
  edgeHeight: 90,
  apexHeight: 140,
  offsetY: 0,
  scale: 1,
  scaleWithActor: true,
  buttons: DEFAULT_BUTTON_LAYOUT,
  actions: DEFAULT_BOTTOM_BUTTON_ACTIONS,
};

export const DEFAULT_RESOURCE_BARS = [
  {
    id: 'health',
    label: 'HP',
    resourceKey: 'health',
    left: 16,
    top: 26,
    width: 220,
    height: 12,
    padding: 3,
    radius: 12,
    lowThreshold: 0,
    colors: {
      fill: '#f87171',
      background: 'rgba(5,7,11,0.78)',
      border: 'rgba(148,163,184,0.28)',
      label: '#f8fafc',
      fillLow: '#f87171',
    },
  },
  {
    id: 'stamina',
    label: 'Stamina',
    resourceKey: 'stamina',
    left: 16,
    top: 44,
    width: 220,
    height: 11,
    padding: 3,
    radius: 12,
    lowThreshold: 0.25,
    colors: {
      fill: '#22c55e',
      background: 'rgba(5,7,11,0.78)',
      border: 'rgba(148,163,184,0.28)',
      label: '#f8fafc',
      fillLow: '#ef4444',
    },
  },
  {
    id: 'footing',
    label: 'Footing',
    resourceKey: 'footing',
    left: 16,
    top: 61,
    width: 220,
    height: 9,
    padding: 2,
    radius: 10,
    lowThreshold: 0,
    colors: {
      fill: '#e2e8f0',
      background: 'rgba(5,7,11,0.78)',
      border: 'rgba(148,163,184,0.28)',
      label: '#0f172a',
      fillLow: '#e2e8f0',
    },
  },
];

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    if (Number.isFinite(min)) return min;
    if (Number.isFinite(max)) return max;
    return value;
  }
  let result = value;
  if (Number.isFinite(min)) result = Math.max(min, result);
  if (Number.isFinite(max)) result = Math.min(max, result);
  return result;
}

function coerceNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatPercentValue(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Number.isFinite(value)) {
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return `${normalized}%`;
  }
  return fallback;
}

function formatDegreesValue(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Number.isFinite(value)) {
    return `${value}deg`;
  }
  return fallback;
}

export function normalizeButtonLayout(rawLayout = {}, defaults = DEFAULT_BUTTON_LAYOUT) {
  const layout = {};
  for (const key of Object.keys(defaults)) {
    const base = defaults[key];
    const spec = rawLayout[key] || {};
    layout[key] = {
      left: formatPercentValue(spec.left ?? spec.x ?? spec.xPercent, base.left),
      top: formatPercentValue(spec.top ?? spec.y ?? spec.yPercent, base.top),
      rotate: formatDegreesValue(spec.rotate ?? spec.rotateDeg ?? spec.rotation, base.rotate),
    };
  }
  return layout;
}

export function computeBottomHudConfig(raw = null, defaults = DEFAULT_BOTTOM_HUD_CONFIG) {
  const src = raw || window.CONFIG?.hud?.bottomButtons || {};
  const width = clampNumber(coerceNumber(src.width, defaults.width), 220, 720);
  const height = clampNumber(coerceNumber(src.height, defaults.height), 140, 320);
  const edgeHeight = clampNumber(coerceNumber(src.edgeHeight, defaults.edgeHeight), 24, height);
  const apexHeight = clampNumber(coerceNumber(src.apexHeight, defaults.apexHeight), edgeHeight + 8, height + 220);
  const offsetY = coerceNumber(src.offsetY, defaults.offsetY) || 0;
  const scale = Number.isFinite(src.scale) ? Math.max(0.3, src.scale) : defaults.scale;
  const scaleWithActor = src.scaleWithActor !== false;
  const buttons = normalizeButtonLayout(src.buttons || src.buttonLayout || {}, defaults.buttons);
  const actions = { ...defaults.actions, ...(src.actions || {}) };
  return { width, height, edgeHeight, apexHeight, offsetY, scale, scaleWithActor, buttons, actions };
}

export function applyBottomHudCss(config, rootElement = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!config || !rootElement?.style) return;
  const root = rootElement.style;
  root.setProperty('--hud-panel-width', `${config.width}px`);
  root.setProperty('--hud-panel-height', `${config.height}px`);
  root.setProperty('--hud-panel-offset-y', `${config.offsetY}px`);
  const buttonSize = Math.max(54, config.height * 0.45);
  root.setProperty('--hud-button-diameter', `${buttonSize}px`);
  root.setProperty('--action-size', `${config.height}px`);
}

export function applyButtonLayout(layout, actionButtonRefs = {}) {
  if (!layout) return;
  for (const [key, el] of Object.entries(actionButtonRefs)) {
    if (!el) continue;
    const spec = layout[key];
    applyButtonVar(el, '--btn-left', spec?.left);
    applyButtonVar(el, '--btn-top', spec?.top);
    applyButtonVar(el, '--btn-rotate', spec?.rotate);
  }
}

function applyButtonVar(el, varName, value) {
  if (!el || !varName) return;
  if (typeof value === 'string' && value.trim()) {
    el.style.setProperty(varName, value.trim());
  } else {
    el.style.removeProperty(varName);
  }
}

export function updateHudBackgroundPath(config, actionHudPath, actionHudSvg) {
  if (!actionHudPath || !actionHudSvg || !config) return;
  const startY = Math.max(0, config.height - config.edgeHeight);
  const apexY = Math.max(0, config.height - config.apexHeight);
  const path = `M 0 ${startY} Q ${config.width / 2} ${apexY} ${config.width} ${startY} L ${config.width} ${config.height} L 0 ${config.height} Z`;
  actionHudPath.setAttribute('d', path);
  actionHudSvg.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
}

function normalizeBarColors(barColors = {}, defaultColors = {}) {
  const colors = { ...defaultColors, ...(barColors || {}) };
  colors.fillLow = colors.fillLow || colors.fill;
  return colors;
}

function normalizeResourceEntry(spec = {}, fallback = {}, defaults = {}) {
  const { colors: defaultColors = {} } = fallback;
  const normalized = {
    id: spec.id || fallback.id || spec.resourceKey || 'bar',
    label: spec.label || fallback.label || spec.id || 'Resource',
    resourceKey: spec.resourceKey || spec.key || fallback.resourceKey || fallback.id,
    left: coerceNumber(spec.left, fallback.left ?? defaults.left ?? 0),
    top: coerceNumber(spec.top, fallback.top ?? defaults.top ?? 0),
    width: Math.max(20, coerceNumber(spec.width, fallback.width ?? defaults.width ?? 160)),
    height: Math.max(4, coerceNumber(spec.height, fallback.height ?? defaults.height ?? 10)),
    padding: coerceNumber(spec.padding, fallback.padding ?? defaults.padding ?? 2),
    radius: coerceNumber(spec.radius, fallback.radius ?? defaults.radius ?? 8),
    lowThreshold: Number.isFinite(spec.lowThreshold)
      ? clampNumber(spec.lowThreshold, 0, 1)
      : clampNumber(fallback.lowThreshold ?? defaults.lowThreshold ?? 0, 0, 1),
  };
  normalized.colors = normalizeBarColors(spec.colors, normalizeBarColors(defaultColors, defaults.colors));
  return normalized;
}

function convertLegacyBars(src = {}, defaults = DEFAULT_RESOURCE_BARS, themeDefaults = {}) {
  return Object.entries(src)
    .filter(([key]) => key !== 'defaults' && key !== 'bars')
    .map(([key, spec]) => normalizeResourceEntry({ id: key, ...spec }, defaults.find((d) => d.id === key) || {}, themeDefaults));
}

export function computeResourceBarConfig(raw = null, defaults = DEFAULT_RESOURCE_BARS) {
  const src = raw || window.CONFIG?.hud?.resourceBars || {};
  const themeDefaults = { colors: src.defaults || {} };
  const bars = Array.isArray(src.bars)
    ? src.bars
    : (!src.bars && Object.keys(src).length ? convertLegacyBars(src, defaults, themeDefaults) : null);
  const base = bars || defaults;
  return base.map((spec, idx) => normalizeResourceEntry(spec, defaults[idx] || {}, themeDefaults));
}

export function applyResourceBarLayout(config, rootElement = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!config || !rootElement?.style) return;
  const root = rootElement.style;
  config.forEach((spec) => {
    const key = spec.id;
    if (!key) return;
    root.setProperty(`--${key}-bar-left`, `${spec.left}px`);
    root.setProperty(`--${key}-bar-top`, `${spec.top}px`);
    root.setProperty(`--${key}-bar-width`, `${spec.width}px`);
    root.setProperty(`--${key}-bar-height`, `${spec.height}px`);
    root.setProperty(`--${key}-bar-padding`, `${spec.padding}px`);
    root.setProperty(`--${key}-bar-radius`, `${spec.radius}px`);
    if (spec.colors?.fill) root.setProperty(`--${key}-bar-fill`, spec.colors.fill);
    if (spec.colors?.fillLow) root.setProperty(`--${key}-bar-fill-low`, spec.colors.fillLow);
    if (spec.colors?.background) root.setProperty(`--${key}-bar-bg`, spec.colors.background);
    if (spec.colors?.border) root.setProperty(`--${key}-bar-border`, spec.colors.border);
    if (spec.colors?.label) root.setProperty(`--${key}-bar-label`, spec.colors.label);
  });
  root.setProperty('--hud-resource-bar-count', `${config.length}`);
}

export function createHudLayoutController({
  actionButtonRefs = {},
  actionHudPath = null,
  actionHudSvg = null,
  rootElement = typeof document !== 'undefined' ? document.documentElement : null,
  resolveActorScale = () => 1,
} = {}) {
  let bottomHudConfigCache = null;
  let resourceBarConfigCache = null;
  let hudScaleSignature = null;

  const computeBottom = () => computeBottomHudConfig();
  const computeResources = () => computeResourceBarConfig();

  const applyBottomLayout = (config) => {
    applyBottomHudCss(config, rootElement);
    applyButtonLayout(config.buttons, actionButtonRefs);
    updateHudBackgroundPath(config, actionHudPath, actionHudSvg);
  };

  const applyResources = (config) => applyResourceBarLayout(config, rootElement);

  return {
    getBottomHudConfig() {
      if (!bottomHudConfigCache) {
        bottomHudConfigCache = computeBottom();
      }
      return bottomHudConfigCache;
    },
    refreshBottomHudConfig() {
      bottomHudConfigCache = computeBottom();
      applyBottomLayout(bottomHudConfigCache);
      return bottomHudConfigCache;
    },
    getResourceBarConfig() {
      if (!resourceBarConfigCache) {
        resourceBarConfigCache = computeResources();
      }
      return resourceBarConfigCache;
    },
    refreshResourceBars() {
      resourceBarConfigCache = computeResources();
      applyResources(resourceBarConfigCache);
      return resourceBarConfigCache;
    },
    applyBottomLayout,
    applyResources,
    syncHudScaleFactors({ force } = {}) {
      const config = this.getBottomHudConfig();
      const actorScale = resolveActorScale() || 1;
      const hudScale = Number.isFinite(config.scale) ? config.scale : 1;
      const signature = `${actorScale.toFixed(4)}|${hudScale.toFixed(4)}`;
      if (!force && hudScaleSignature === signature) return;
      hudScaleSignature = signature;
      if (!rootElement?.style) return;
      const root = rootElement.style;
      root.setProperty('--actor-scale', actorScale.toFixed(4));
      root.setProperty('--hud-panel-scale', hudScale.toFixed(4));
    },
  };
}
