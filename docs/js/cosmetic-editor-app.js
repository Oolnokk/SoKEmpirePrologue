import {
  COSMETIC_SLOTS,
  clearCosmeticLibrary,
  getRegisteredCosmeticLibrary,
  registerCosmeticLibrary,
  registerFighterAppearance
} from './cosmetics.js?v=1';
import { renderFighterPreview, renderPartPreview, getDefaultPoseAngles } from './cosmetic-render.js?v=1';
import { degToRad } from './math-utils.js?v=1';

const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT.CONFIG || {};

const SNAPSHOT_PARTS = ['head', 'torso', 'arm_L_upper', 'arm_R_upper', 'leg_L_upper', 'leg_R_upper'];
const POSE_MAP = {
  stance: 'Stance',
  draw: 'Windup',
  stow: 'Recoil'
};

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mergeSlotConfig(base = {}, extra = {}) {
  const merged = deepClone(base);
  for (const [slot, data] of Object.entries(extra || {})) {
    if (data == null) continue;
    merged[slot] = deepClone(data);
  }
  return merged;
}

function toRadiansPose(pose = {}) {
  const result = {};
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value === 'number') {
      result[key] = degToRad(value);
    }
  }
  return result;
}

class CosmeticWorkbench {
  constructor() {
    this.state = {
      fighter: null,
      characterKey: null,
      baseSlots: {},
      slotOverrides: {},
      slotFilter: '',
      poseKey: 'stance',
      slotIndex: new Map(),
      paletteCache: new Map()
    };

    this.dom = {
      canvas: document.getElementById('previewCanvas'),
      status: document.getElementById('previewStatus'),
      fighterSelect: document.getElementById('fighterSelect'),
      characterSelect: document.getElementById('characterSelect'),
      slotFilter: document.getElementById('slotFilter'),
      slotList: document.getElementById('slotList'),
      clearOverrides: document.getElementById('clearOverrides'),
      copyOverrides: document.getElementById('copyOverrides'),
      reloadLibrary: document.getElementById('reloadLibrary'),
      resetView: document.getElementById('resetView'),
      poseStance: document.getElementById('poseStance'),
      poseDraw: document.getElementById('poseDraw'),
      poseStow: document.getElementById('poseStow'),
      snapshotGrid: document.getElementById('partSnapshotGrid')
    };

    this.bindEvents();
    this.refreshLibrary();
    this.populateFighters();
    this.refreshCharacters();
    this.selectDefault();
  }

  bindEvents() {
    this.dom.fighterSelect.addEventListener('change', () => {
      this.state.fighter = this.dom.fighterSelect.value;
      this.refreshCharacters();
      this.loadBaseSlots();
      this.renderAll();
    });

    this.dom.characterSelect.addEventListener('change', () => {
      this.state.characterKey = this.dom.characterSelect.value || null;
      this.loadBaseSlots();
      this.renderAll();
    });

    this.dom.slotFilter.addEventListener('input', () => {
      this.state.slotFilter = this.dom.slotFilter.value.trim().toLowerCase();
      this.renderSlotList();
    });

    this.dom.clearOverrides.addEventListener('click', () => {
      this.state.slotOverrides = {};
      this.renderAll();
    });

    this.dom.copyOverrides.addEventListener('click', () => {
      const json = JSON.stringify(this.state.slotOverrides, null, 2);
      navigator.clipboard?.writeText(json);
      this.setStatus('Overrides copied to clipboard');
    });

    this.dom.reloadLibrary.addEventListener('click', () => {
      this.refreshLibrary(true);
      this.renderSlotList();
      this.renderAll();
    });

    this.dom.resetView.addEventListener('click', () => {
      this.state.slotOverrides = {};
      this.state.slotFilter = '';
      this.dom.slotFilter.value = '';
      this.setPose('stance');
      this.renderAll();
    });

    this.dom.poseStance.addEventListener('click', () => this.setPose('stance'));
    this.dom.poseDraw.addEventListener('click', () => this.setPose('draw'));
    this.dom.poseStow.addEventListener('click', () => this.setPose('stow'));
  }

  selectDefault() {
    const fighters = Object.keys(CONFIG.fighters || {});
    if (fighters.length) {
      this.state.fighter = fighters[0];
      this.dom.fighterSelect.value = fighters[0];
    }
    this.refreshCharacters();
    this.loadBaseSlots();
    this.renderAll();
  }

  refreshLibrary(force = false) {
    if (force && CONFIG.cosmetics?.librarySources) {
      clearCosmeticLibrary();
      registerCosmeticLibrary(CONFIG.cosmetics.librarySources);
    }

    const library = getRegisteredCosmeticLibrary();
    if (!Object.keys(library).length && CONFIG.cosmetics?.librarySources) {
      registerCosmeticLibrary(CONFIG.cosmetics.librarySources);
    }

    const slotIndex = new Map();
    const addSlotEntry = (slot, entry) => {
      if (!slot) return;
      const key = slot.toLowerCase();
      const list = slotIndex.get(key) || [];
      list.push(entry);
      slotIndex.set(key, list);
    };

    for (const [id, cosmetic] of Object.entries(library)) {
      const label = cosmetic.name || id;
      const entry = { id, label };
      const slotList = Array.isArray(cosmetic.slots) ? cosmetic.slots : (cosmetic.slot ? [cosmetic.slot] : []);
      slotList.forEach((slot) => addSlotEntry(slot, entry));
      if (cosmetic.appearance?.slot) {
        addSlotEntry(`appearance:${cosmetic.appearance.slot}`, entry);
      }
    }

    COSMETIC_SLOTS.forEach((slot) => {
      const key = slot.toLowerCase();
      if (!slotIndex.has(key)) slotIndex.set(key, []);
    });

    this.state.slotIndex = slotIndex;
    this.renderSlotList();
  }

  populateFighters() {
    const fighters = Object.keys(CONFIG.fighters || {});
    this.dom.fighterSelect.innerHTML = fighters.map((fighter) => `<option value="${fighter}">${fighter}</option>`).join('');
  }

  refreshCharacters() {
    const characters = CONFIG.characters || {};
    const available = Object.entries(characters)
      .filter(([, data]) => !this.state.fighter || data?.fighter === this.state.fighter)
      .map(([key, data]) => ({ key, name: data.name || key }));

    const options = ['<option value="">None (fighter defaults)</option>'];
    options.push(...available.map((c) => `<option value="${c.key}">${c.name}</option>`));
    this.dom.characterSelect.innerHTML = options.join('');

    if (available.length && !available.find((c) => c.key === this.state.characterKey)) {
      this.state.characterKey = available[0].key;
    } else if (!available.length) {
      this.state.characterKey = null;
    }
    this.dom.characterSelect.value = this.state.characterKey || '';
  }

  loadBaseSlots() {
    const fighterData = CONFIG.fighters?.[this.state.fighter] || {};
    const characterData = (this.state.characterKey && CONFIG.characters?.[this.state.characterKey]) || null;

    const baseSlots = mergeSlotConfig(
      fighterData.cosmetics?.slots || fighterData.cosmetics || {},
      characterData?.cosmetics?.slots || characterData?.cosmetics || {}
    );

    const appearance = registerFighterAppearance(
      this.state.fighter,
      fighterData.appearance || {},
      characterData?.appearance || {}
    );

    if (appearance?.slots) {
      Object.assign(baseSlots, appearance.slots);
    }

    this.state.baseSlots = baseSlots;
  }

  setPose(key) {
    this.state.poseKey = key;
    this.renderAll();
  }

  getPoseAngles() {
    const poseName = POSE_MAP[this.state.poseKey] || POSE_MAP.stance;
    const pose = CONFIG.poses?.[poseName];
    if (!pose) return getDefaultPoseAngles();
    return toRadiansPose(pose);
  }

  setStatus(message) {
    if (this.dom.status) {
      this.dom.status.textContent = message;
    }
  }

  getSlotOptions(slot) {
    const key = String(slot || '').toLowerCase();
    return this.state.slotIndex.get(key) || [];
  }

  handleSlotChange(slot, value) {
    if (!value) {
      delete this.state.slotOverrides[slot];
    } else {
      this.state.slotOverrides[slot] = { id: value };
    }
    this.renderAll();
  }

  renderSlotList() {
    const container = this.dom.slotList;
    if (!container) return;

    const filter = this.state.slotFilter;
    const slotKeys = new Set([
      ...Object.keys(this.state.baseSlots || {}),
      ...Array.from(this.state.slotIndex.keys())
    ]);

    const sorted = Array.from(slotKeys).sort();
    const fragments = [];
    for (const slot of sorted) {
      if (filter && !slot.toLowerCase().includes(filter)) continue;
      const active = this.state.slotOverrides[slot] || this.state.baseSlots[slot] || {};
      const options = this.getSlotOptions(slot);
      const label = slot.startsWith('appearance:') ? slot.replace('appearance:', 'appearance · ') : slot;
      const selectOptions = ['<option value="">Use default</option>'];
      selectOptions.push(...options.map((opt) => `<option value="${opt.id}">${opt.label}</option>`));
      const currentId = this.state.slotOverrides[slot]?.id || '';

      fragments.push(`
        <div class="slot-row" data-slot="${slot}">
          <header>
            <div>
              <h3>${label}</h3>
              <div class="override-meta">
                <small>Base: ${this.state.baseSlots[slot]?.id || 'none'}</small>
              </div>
            </div>
            <span class="hint">Override: ${currentId || 'none'}</span>
          </header>
          <select data-slot-select="${slot}">${selectOptions.join('')}</select>
          <div class="tones">
            <small>Palette</small>
            <span class="tone-swatch" style="background:${this.resolveSlotTint(slot, active)}"></span>
          </div>
        </div>
      `);
    }

    container.innerHTML = fragments.join('');

    container.querySelectorAll('[data-slot-select]').forEach((select) => {
      const slot = select.getAttribute('data-slot-select');
      select.value = this.state.slotOverrides[slot]?.id || '';
      select.addEventListener('change', (evt) => this.handleSlotChange(slot, evt.target.value));
    });
  }

  resolveSlotTint(slot, active = {}) {
    const colors = active?.colors || active?.palette;
    if (!colors || !colors.length) return 'linear-gradient(45deg, #1e293b, #0f172a)';
    const palette = Array.isArray(colors) ? colors : [colors];
    const hue = palette[0];
    const map = CONFIG.materials || {};
    const tint = map[hue] || map.A || { h: 210, s: -0.2, v: 0 };
    const h = Math.round(tint.h || 210);
    const s = Math.round((tint.s || 0) * 100);
    const l = Math.round(((tint.l ?? tint.v) || 0) * 50 + 50);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  renderPreview() {
    const fighter = this.state.fighter;
    if (!fighter) return;
    const overrides = deepClone(this.state.slotOverrides);
    const pose = this.getPoseAngles();
    this.setStatus(`Rendering ${fighter} (${Object.keys(overrides).length} override${Object.keys(overrides).length === 1 ? '' : 's'})`);
    renderFighterPreview(this.dom.canvas, fighter, overrides, { jointAngles: pose, view: 'portrait' });
  }

  renderSnapshots() {
    const grid = this.dom.snapshotGrid;
    if (!grid) return;
    const fighter = this.state.fighter;
    if (!fighter) {
      grid.innerHTML = '';
      return;
    }

    const overrides = deepClone(this.state.slotOverrides);
    const pose = this.getPoseAngles();
    const fragments = [];
    for (const part of SNAPSHOT_PARTS) {
      fragments.push(`
        <article class="snapshot-card" data-part="${part}">
          <h4>${part}</h4>
          <canvas aria-label="${part} preview"></canvas>
        </article>
      `);
    }
    grid.innerHTML = fragments.join('');

    grid.querySelectorAll('.snapshot-card').forEach((card) => {
      const canvas = card.querySelector('canvas');
      const partKey = card.getAttribute('data-part');
      renderPartPreview(canvas, fighter, partKey, overrides, { jointAngles: pose });
    });
  }

  renderAll() {
    this.renderSlotList();
    this.renderPreview();
    this.renderSnapshots();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CosmeticWorkbench();
});
