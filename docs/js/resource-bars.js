import { computeResourceBarConfig } from './hud-layout.js?v=1';

const clamp01 = (value) => Math.min(1, Math.max(0, value ?? 0));

function getByPath(source, path) {
  if (!source || !path) return undefined;
  const parts = `${path}`.split('.');
  let current = source;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function applyBarStyles(entry, spec) {
  const { el } = entry;
  if (!el || !spec) return;
  el.style.setProperty('--bar-left', `${spec.left}px`);
  el.style.setProperty('--bar-top', `${spec.top}px`);
  el.style.setProperty('--bar-width', `${spec.width}px`);
  el.style.setProperty('--bar-height', `${spec.height}px`);
  el.style.setProperty('--bar-padding', `${spec.padding}px`);
  el.style.setProperty('--bar-radius', `${spec.radius}px`);
  if (spec.colors?.fill) el.style.setProperty('--bar-fill', spec.colors.fill);
  if (spec.colors?.fillLow) el.style.setProperty('--bar-fill-low', spec.colors.fillLow);
  if (spec.colors?.background) el.style.setProperty('--bar-bg', spec.colors.background);
  if (spec.colors?.border) el.style.setProperty('--bar-border', spec.colors.border);
  if (spec.colors?.label) el.style.setProperty('--bar-label', spec.colors.label);
}

function createBarElement(spec) {
  const el = document.createElement('div');
  el.className = 'resource-bar';
  el.dataset.barId = spec.id;
  el.dataset.resourceKey = spec.resourceKey || spec.id || 'resource';
  const fill = document.createElement('div');
  fill.className = 'resource-bar__fill';
  const label = document.createElement('div');
  label.className = 'resource-bar__label';
  label.textContent = spec.label || spec.id || 'Resource';
  el.appendChild(fill);
  el.appendChild(label);
  applyBarStyles({ el }, spec);
  return { el, fill, label, spec };
}

export function createResourceBarLayer(container) {
  let entries = new Map();
  let bars = [];

  const rebuild = (nextBars = []) => {
    bars = nextBars.slice();
    entries = new Map();
    if (!container) return entries;
    container.innerHTML = '';
    bars.forEach((bar) => {
      const entry = createBarElement(bar);
      entries.set(bar.id, entry);
      container.appendChild(entry.el);
    });
    return entries;
  };

  const setBarValue = (barId, reading) => {
    const entry = entries.get(barId);
    if (!entry) return;
    const { fill, label, spec } = entry;
    const ratio = clamp01(reading?.ratio);
    fill.style.width = `${Math.round(ratio * 100)}%`;
    fill.classList.toggle('is-low', ratio <= (spec.lowThreshold ?? 0));
    if (label) label.textContent = formatResourceLabel(spec, reading);
  };

  return {
    setBars(nextBars = []) {
      rebuild(nextBars);
      return entries;
    },
    getEntries() {
      return entries;
    },
    applyBarStyles(barId, spec) {
      const entry = entries.get(barId);
      if (!entry) return;
      applyBarStyles(entry, spec);
    },
    updateBar(barId, reading) {
      setBarValue(barId, reading);
    },
    updateAll(readings = {}) {
      Object.entries(readings).forEach(([barId, reading]) => setBarValue(barId, reading));
    },
    getBars() {
      return bars;
    },
  };
}

export function formatResourceLabel(bar, reading) {
  const name = bar.label || bar.id || 'Resource';
  if (!reading) return name;
  const { current, max, asPercent } = reading;
  if (Number.isFinite(current) && Number.isFinite(max) && max > 0) {
    return `${name}: ${Math.round(current)}/${Math.round(max)}`;
  }
  if (Number.isFinite(current)) {
    const value = asPercent ? Math.round(current) : Math.round(current * 100) / 100;
    const suffix = asPercent ? '%' : '';
    return `${name} ${value}${suffix}`;
  }
  return name;
}

export function resolveResourceReading(player, bar) {
  if (!player || !bar) return null;
  const raw = getByPath(player, bar.resourceKey || bar.id);
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const current = Number.isFinite(raw.current) ? raw.current : Number.isFinite(raw.value) ? raw.value : null;
    const max = Number.isFinite(raw.max)
      ? raw.max
      : Number.isFinite(raw.current)
        ? Math.max(1, raw.current)
        : null;
    if (current == null && max == null) return null;
    const ratio = max ? clamp01(current / max) : clamp01(current);
    return { current: current ?? max, max: max ?? current ?? 100, ratio, asPercent: false };
  }
  if (Number.isFinite(raw)) {
    const value = raw;
    const asPercent = Math.abs(value) > 1 ? value <= 150 : true;
    const ratio = asPercent ? clamp01(value / 100) : clamp01(value);
    return { current: asPercent ? value : value * 100, max: 100, ratio, asPercent: true };
  }
  return null;
}

export function buildResourceReadings(player, bars = []) {
  const readings = {};
  bars.forEach((bar) => {
    readings[bar.id] = resolveResourceReading(player, bar);
  });
  return readings;
}

export function collectResourceKeysFromPlayer(player) {
  if (!player) return [];
  const keys = new Set();
  Object.entries(player).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === 'object') {
      if ('current' in value || 'max' in value || 'value' in value) keys.add(key);
    } else if (Number.isFinite(value)) {
      keys.add(key);
    }
  });
  return Array.from(keys);
}

export function getComputedResourceBars(rawConfig = null) {
  return computeResourceBarConfig(rawConfig);
}
