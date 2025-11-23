import { initFighters, resetFighterStateForTesting } from './fighter.js?v=8';
import { renderAll } from './render.js?v=4';
import { initSprites, renderSprites } from './sprites.js?v=8';
import { pushPoseOverride, updatePoses, resolveStancePose, resolveStanceKey } from './animator.js?v=5';

function clone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_err) { /* ignore */ }
  }
  return JSON.parse(JSON.stringify(value || null));
}

function toNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function uniqueKeyedList(entries = []) {
  return Array.from(new Set(entries.filter(Boolean)));
}

function normalizeTagsInput(value) {
  if (!value) return [];
  return uniqueKeyedList(String(value).split(',').map((tag) => tag.trim()).filter(Boolean));
}

function formatTags(tags = []) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function normalizeAttackSequence(seq) {
  if (!Array.isArray(seq)) return [];
  return seq.map((step) => {
    if (typeof step === 'string') {
      return { move: step, startMs: 0, tags: [] };
    }
    const copy = clone(step);
    copy.move = String(copy.move ?? '');
    copy.startMs = toNumber(copy.startMs, 0);
    copy.tags = Array.isArray(copy.tags)
      ? uniqueKeyedList(copy.tags.map((tag) => tag.trim()))
      : [];
    return copy;
  });
}

function normalizeMoveSequence(seq) {
  if (!Array.isArray(seq)) return [];
  return seq.map((phase) => {
    const copy = clone(phase);
    copy.poseKey = String(copy.poseKey ?? '');
    copy.durMs = toNumber(copy.durMs, 0);
    if (copy.strike !== undefined) {
      copy.strike = typeof copy.strike === 'object'
        ? clone(copy.strike)
        : Boolean(copy.strike);
    }
    return copy;
  });
}

function formatDurationTimeline(phases = []) {
  const total = phases.reduce((sum, item) => sum + Math.max(0, item.value ?? 0), 0) || 1;
  return phases.map((phase) => {
    const value = Math.max(0, phase.value ?? 0);
    const widthPct = Math.max(4, (value / total) * 100);
    return { label: phase.label, value, widthPct, kind: phase.kind || 'phase' };
  });
}

class PosePreviewManager {
  constructor(canvas, placeholder, setStatus) {
    this.canvas = canvas;
    this.placeholder = placeholder;
    this.ctx = canvas?.getContext('2d') || null;
    this.setStatus = typeof setStatus === 'function' ? setStatus : null;
    this.ready = false;
    this.initPromise = null;
    this.frameHandle = null;
    this.currentPose = null;
    this.pendingPose = null;
    this.pendingFighter = null;
  }

  async initialize() {
    if (!this.canvas || !this.ctx) return null;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
        try {
          await initSprites();
          const stanceKey = resolveStanceKey(window.CONFIG);
          initFighters(this.canvas, this.ctx, { spawnNpc: false, poseKey: stanceKey });
        const GAME = (window.GAME ||= {});
        GAME.CAMERA = GAME.CAMERA || { x: 0, worldWidth: this.canvas.width };
        this.ready = true;
        this.toggleVisibility(true);
        this.startLoop();
        if (this.pendingFighter !== null) {
          const fighterKey = this.pendingFighter;
          this.pendingFighter = null;
          this.setFighter(fighterKey);
        }
        if (this.pendingPose) {
          const pose = this.pendingPose;
          this.pendingPose = null;
          this.applyPose(pose);
          } else {
            const fallback = resolveStancePose(window.CONFIG);
            if (fallback) {
              this.applyPose(fallback);
            }
          }
      } catch (error) {
        console.error('[animation-editor] Failed to initialize pose preview', error);
        this.setStatus?.('Pose preview failed to initialize');
      }
    })();
    return this.initPromise;
  }

  toggleVisibility(visible) {
    if (!this.canvas) return;
    if (visible) {
      this.canvas.classList.add('is-visible');
      this.placeholder?.classList.add('is-hidden');
    } else {
      this.canvas.classList.remove('is-visible');
      this.placeholder?.classList.remove('is-hidden');
    }
  }

  startLoop() {
    if (this.frameHandle) return;
    const draw = () => {
      this.configureCanvas();
      const ctx = this.ctx;
      if (ctx) {
        updatePoses();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
        const dpr = this.canvas.__dpr || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        renderAll(ctx);
        renderSprites(ctx);
        ctx.restore();
      }
      this.frameHandle = requestAnimationFrame(draw);
    };
    this.frameHandle = requestAnimationFrame(draw);
  }

  configureCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const logicalWidth = rect.width || this.canvas.__logicalWidth || this.canvas.width || 720;
    const logicalHeight = rect.height || this.canvas.__logicalHeight || this.canvas.height || 460;
    const scaledWidth = Math.round(logicalWidth * dpr);
    const scaledHeight = Math.round(logicalHeight * dpr);
    if (this.canvas.width !== scaledWidth || this.canvas.height !== scaledHeight) {
      this.canvas.width = scaledWidth;
      this.canvas.height = scaledHeight;
      this.canvas.__logicalWidth = logicalWidth;
      this.canvas.__logicalHeight = logicalHeight;
    }
    this.canvas.__dpr = dpr;
  }

  setFighter(fighterKey) {
    const normalized = fighterKey || null;
    if (!this.ready) {
      this.pendingFighter = normalized;
      return;
    }
    const GAME = (window.GAME ||= {});
    GAME.selectedFighter = normalized;
    const fighters = GAME.FIGHTERS || {};
    const player = fighters.player;
    if (player) {
      resetFighterStateForTesting(player, { id: 'player', facingSign: 1 });
      if (this.currentPose) {
        pushPoseOverride('player', this.currentPose, { durMs: 60000, suppressWalk: true, useAsBase: true });
      }
    }
  }

  applyPose(pose) {
      const copy = pose ? clone(pose) : null;
      this.currentPose = copy;
      if (!this.ready) {
        this.pendingPose = copy;
        return;
      }
      const payload = copy && Object.keys(copy).length
        ? copy
        : resolveStancePose(window.CONFIG);
      pushPoseOverride('player', payload, { durMs: 60000, suppressWalk: true, useAsBase: true });
    }
  }

class AnimationEditorApp {
  constructor(config) {
    this.config = config || {};
    this.state = {
      abilityKey: null,
      moveKey: null,
      attackKey: null,
      moveOriginal: null,
      attackOriginal: null,
      moveDraft: null,
      attackDraft: null,
      poseKey: null,
      poseSource: null,
      poseDraft: null,
      poseOriginal: null,
      poseDirty: false,
      poseFighter: null,
    };
    this.dom = this.queryDom();
    this.hierarchy = this.buildHierarchy();
    this.posePreview = new PosePreviewManager(
      this.dom.poseCanvas,
      this.dom.posePlaceholder,
      (message) => this.setStatus(message)
    );
    this.bindStaticListeners();
    this.populateSelects();
    this.populatePoseFighterSelect();
    this.posePreview.initialize();
    this.selectInitialEntries();
    this.statusTimer = null;
  }

  queryDom() {
    const q = (id) => document.getElementById(id);
    return {
      previewCanvas: q('animationCanvas'),
      previewPlaceholder: q('previewPlaceholder'),
      poseCanvas: q('poseCanvas'),
      posePlaceholder: q('posePlaceholder'),
      abilitySelect: q('abilitySelect'),
      moveSelect: q('moveSelect'),
      attackSelect: q('attackSelect'),
      resetMove: q('resetMove'),
      resetAttack: q('resetAttack'),
      statusBanner: q('statusBanner'),
      moveName: q('moveName'),
      moveTags: q('moveTags'),
      durationRows: q('durationRows'),
      knockbackBase: q('knockbackBase'),
      cancelWindow: q('cancelWindow'),
      normalizeDurations: q('normalizeDurations'),
      moveSequence: q('moveSequence'),
      addMovePhase: q('addMovePhase'),
      moveTimeline: q('moveTimeline'),
      attackTimeline: q('attackTimeline'),
      moveSequencePanel: q('moveSequencePanel'),
      moveDetails: q('moveDetails'),
      attackDetails: q('attackDetails'),
      attackName: q('attackName'),
      attackTags: q('attackTags'),
      attackSequence: q('attackSequence'),
      addAttackStep: q('addAttackStep'),
      addAttackTag: q('addAttackTag'),
      attackDamageHealth: q('attackDamageHealth'),
      attackStamina: q('attackStamina'),
      attackColliders: q('attackColliders'),
      attackUseWeaponColliders: q('attackUseWeaponColliders'),
      poseEditor: q('poseEditor'),
      poseFighterSelect: q('poseFighterSelect'),
      poseKeySelect: q('poseKeySelect'),
      poseJson: q('poseJson'),
      applyPoseChanges: q('applyPoseChanges'),
      resetPoseChanges: q('resetPoseChanges'),
      moveJson: q('moveJson'),
      attackJson: q('attackJson'),
      copyMoveJson: q('copyMoveJson'),
      copyAttackJson: q('copyAttackJson'),
      downloadJson: q('downloadJson'),
    };
  }

  bindStaticListeners() {
    const { abilitySelect, moveSelect, attackSelect, resetMove, resetAttack, normalizeDurations, addMovePhase, addAttackStep,
      addAttackTag, copyMoveJson, copyAttackJson, downloadJson, moveJson, attackJson, moveName, moveTags,
      knockbackBase, cancelWindow, attackName, attackTags, attackDamageHealth, attackStamina, attackColliders,
      attackUseWeaponColliders, poseFighterSelect, poseKeySelect, poseJson, applyPoseChanges, resetPoseChanges } = this.dom;

    abilitySelect?.addEventListener('change', (event) => {
      this.selectAbility(event.target.value || null);
    });

    moveSelect?.addEventListener('change', (event) => {
      this.selectMove(event.target.value || null);
    });
    attackSelect?.addEventListener('change', (event) => {
      this.selectAttack(event.target.value || null);
    });
    resetMove?.addEventListener('click', () => this.resetMove());
    resetAttack?.addEventListener('click', () => this.resetAttack());
    normalizeDurations?.addEventListener('click', () => this.normalizeMoveDurations());
    addMovePhase?.addEventListener('click', () => this.addMovePhase());
    addAttackStep?.addEventListener('click', () => this.addAttackStep());
    addAttackTag?.addEventListener('click', () => this.addAttackTag());
    copyMoveJson?.addEventListener('click', () => this.copyJson(this.dom.moveJson?.value, 'Move JSON copied')); 
    copyAttackJson?.addEventListener('click', () => this.copyJson(this.dom.attackJson?.value, 'Attack JSON copied'));
    downloadJson?.addEventListener('click', () => this.downloadJson());

    moveJson?.addEventListener('change', () => this.applyJsonEdits('move'));
    attackJson?.addEventListener('change', () => this.applyJsonEdits('attack'));

    moveName?.addEventListener('change', (event) => {
      if (!this.state.moveDraft) return;
      this.state.moveDraft.name = event.target.value;
      this.updateJsonOutputs();
      this.renderPreview();
    });

    moveTags?.addEventListener('change', (event) => {
      if (!this.state.moveDraft) return;
      this.state.moveDraft.tags = normalizeTagsInput(event.target.value);
      this.updateJsonOutputs();
    });

    knockbackBase?.addEventListener('change', (event) => {
      if (!this.state.moveDraft) return;
      const value = toNumber(event.target.value, null);
      this.state.moveDraft.knockbackBase = value;
      this.updateMoveTimeline();
      this.updateJsonOutputs();
    });

    cancelWindow?.addEventListener('change', (event) => {
      if (!this.state.moveDraft) return;
      const value = Number(event.target.value);
      this.state.moveDraft.cancelWindow = Number.isFinite(value) ? value : null;
      this.updateJsonOutputs();
    });

    attackName?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.state.attackDraft.name = event.target.value;
      this.updateJsonOutputs();
      this.renderPreview();
    });

    attackTags?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.state.attackDraft.tags = normalizeTagsInput(event.target.value);
      this.updateJsonOutputs();
      this.renderPreview();
    });

    attackDamageHealth?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.ensureAttackData();
      const value = toNumber(event.target.value, null);
      if (value === null) {
        delete this.state.attackDraft.attackData.damage.health;
      } else {
        this.state.attackDraft.attackData.damage.health = value;
      }
      this.updateJsonOutputs();
    });

    attackStamina?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.ensureAttackData();
      const value = toNumber(event.target.value, null);
      if (value === null) {
        delete this.state.attackDraft.attackData.staminaCost;
      } else {
        this.state.attackDraft.attackData.staminaCost = value;
      }
      this.updateJsonOutputs();
    });

    attackColliders?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.ensureAttackData();
      const tags = normalizeTagsInput(event.target.value);
      this.state.attackDraft.attackData.colliders = tags;
      this.updateJsonOutputs();
    });

    attackUseWeaponColliders?.addEventListener('change', (event) => {
      if (!this.state.attackDraft) return;
      this.ensureAttackData();
      const value = event.target.value;
      if (value === 'auto') {
        delete this.state.attackDraft.attackData.useWeaponColliders;
      } else {
        this.state.attackDraft.attackData.useWeaponColliders = value === 'true';
      }
      this.updateJsonOutputs();
    });

    poseFighterSelect?.addEventListener('change', (event) => {
      this.changePoseFighter(event.target.value || null);
    });

    poseKeySelect?.addEventListener('change', (event) => {
      const [source, key] = this.parsePoseOptionValue(event.target.value);
      this.loadPoseSelection(source, key);
    });

    poseJson?.addEventListener('change', () => this.handlePoseJsonChange());
    applyPoseChanges?.addEventListener('click', () => this.applyPoseChanges());
    resetPoseChanges?.addEventListener('click', () => this.resetPoseChanges());
  }

  populateSelects() {
    this.populateAbilitySelect();
    this.updateAttackOptions();
  }

  populateSelect(select, entries, options = {}) {
    if (!select) return [];
    const { placeholderText = 'Select…', includePlaceholder = true } = options;
    const normalized = Array.isArray(entries)
      ? entries
          .map((entry) => (typeof entry === 'string' ? { value: entry, label: entry } : entry))
          .filter((entry) => entry && entry.value)
      : [];
    select.innerHTML = '';
    if (includePlaceholder) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = placeholderText;
      select.appendChild(placeholder);
    }
    normalized.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label ?? entry.value;
      if (entry.dataset) {
        Object.entries(entry.dataset).forEach(([key, value]) => {
          option.dataset[key] = value;
        });
      }
      select.appendChild(option);
    });
    select.disabled = normalized.length === 0;
    return normalized;
  }

  buildHierarchy() {
    const abilityDefs = this.config.abilitySystem?.abilities || {};
    const attackDefs = this.config.abilitySystem?.attacks || {};
    const abilities = {};
    const abilityOrder = [];
    const attackMoves = {};

    const collectAttackMoves = (attackId, def) => {
      if (!attackId || !def) return;
      if (attackMoves[attackId]) return;
      const rawSequence = def.sequence ?? def.sequenceSteps ?? def.sequencePhases ?? null;
      const normalizedSequence = normalizeAttackSequence(
        Array.isArray(rawSequence) ? rawSequence : rawSequence ? [rawSequence] : []
      );
      const moveSet = new Set();
      normalizedSequence.forEach((step) => {
        if (step?.move) moveSet.add(String(step.move));
      });
      if (!moveSet.size && def.preset) {
        moveSet.add(String(def.preset));
      }
      attackMoves[attackId] = Array.from(moveSet).sort((a, b) => a.localeCompare(b));
    };

    Object.entries(attackDefs).forEach(([attackId, attackDef]) => {
      collectAttackMoves(attackId, attackDef);
    });

    Object.entries(abilityDefs).forEach(([abilityId, abilityDef]) => {
      const attackSet = new Set();
      const pushAttack = (attackId) => {
        if (!attackId) return;
        const normalized = String(attackId);
        if (attackDefs[normalized]) {
          attackSet.add(normalized);
        }
      };

      if (Array.isArray(abilityDef.sequence)) {
        abilityDef.sequence.forEach((attackId) => pushAttack(attackId));
      }
      if (abilityDef.attack) pushAttack(abilityDef.attack);
      if (abilityDef.defaultAttack) pushAttack(abilityDef.defaultAttack);
      if (Array.isArray(abilityDef.variants)) {
        abilityDef.variants.forEach((variant) => pushAttack(variant?.attack));
      }

      const attacks = Array.from(attackSet).sort((a, b) => a.localeCompare(b));
      const preferred = abilityDef.defaultAttack || abilityDef.attack || attacks[0] || null;
      const defaultAttack = preferred && attacks.includes(preferred) ? preferred : attacks[0] || null;
      abilities[abilityId] = {
        id: abilityId,
        label: abilityDef.name || abilityId,
        attacks,
        defaultAttack,
      };
      abilityOrder.push(abilityId);
    });

    abilityOrder.sort((a, b) => {
      const labelA = abilities[a]?.label || a;
      const labelB = abilities[b]?.label || b;
      return labelA.localeCompare(labelB);
    });

    return { abilities, abilityOrder, attackMoves };
  }

  populateAbilitySelect() {
    const select = this.dom.abilitySelect;
    if (!select) return [];
    const abilityMap = this.hierarchy?.abilities || {};
    const order = this.hierarchy?.abilityOrder || Object.keys(abilityMap);
    const entries = order
      .map((abilityId) => {
        const ability = abilityMap[abilityId];
        if (!ability) return null;
        const label = ability.label && ability.label !== abilityId
          ? `${ability.label} (${abilityId})`
          : abilityId;
        return { value: abilityId, label };
      })
      .filter(Boolean);
    const normalized = this.populateSelect(select, entries, { placeholderText: 'Select ability…' });
    if (!normalized.length) {
      select.value = '';
      this.state.abilityKey = null;
      return normalized;
    }
    const current = this.state.abilityKey;
    const initial = current && normalized.some((entry) => entry.value === current)
      ? current
      : normalized[0].value;
    this.state.abilityKey = initial;
    select.value = initial;
    return normalized;
  }

  selectAbility(abilityKey) {
    const normalized = abilityKey || null;
    if (this.dom.abilitySelect) {
      this.dom.abilitySelect.value = normalized || '';
    }
    if (this.state.abilityKey === normalized) {
      this.updateAttackOptions({ preserveSelection: true });
      return;
    }
    this.state.abilityKey = normalized;
    this.updateAttackOptions({ preserveSelection: false });
  }

  updateAttackOptions(options = {}) {
    const select = this.dom.attackSelect;
    if (!select) return;
    const { preserveSelection = false } = options;
    const abilityKey = this.state.abilityKey;
    const ability = abilityKey ? this.hierarchy?.abilities?.[abilityKey] : null;
    const entries = ability
      ? ability.attacks.map((attackId) => ({ value: attackId, label: attackId }))
      : [];
    const normalized = this.populateSelect(select, entries, { placeholderText: ability ? 'Select attack…' : 'No attacks available' });
    if (!normalized.length) {
      select.value = '';
      this.selectAttack(null);
      return;
    }

    let target = null;
    if (preserveSelection && this.state.attackKey && normalized.some((entry) => entry.value === this.state.attackKey)) {
      target = this.state.attackKey;
    } else if (ability?.defaultAttack && normalized.some((entry) => entry.value === ability.defaultAttack)) {
      target = ability.defaultAttack;
    } else {
      target = normalized[0].value;
    }

    if (target) {
      select.value = target;
      this.selectAttack(target);
    } else {
      select.value = '';
      this.selectAttack(null);
    }
  }

  getMovesForAttack(attackKey) {
    if (!attackKey) return [];
    const attackMoves = this.hierarchy?.attackMoves?.[attackKey];
    if (Array.isArray(attackMoves)) return attackMoves;
    return [];
  }

  updateMoveOptionsForAttack(options = {}) {
    const select = this.dom.moveSelect;
    if (!select) return;
    const { preserveSelection = false } = options;
    const attackKey = this.state.attackKey;
    const entries = this.getMovesForAttack(attackKey).map((moveId) => ({ value: moveId, label: moveId }));
    const normalized = this.populateSelect(select, entries, { placeholderText: attackKey ? 'Select move…' : 'No moves available' });
    if (!normalized.length) {
      select.value = '';
      if (this.state.moveKey) {
        this.selectMove(null);
      } else {
        this.updateMoveState(null, null);
      }
      return;
    }

    let target = null;
    if (preserveSelection && this.state.moveKey && normalized.some((entry) => entry.value === this.state.moveKey)) {
      target = this.state.moveKey;
    } else {
      target = normalized[0].value;
    }

    if (target) {
      select.value = target;
      if (target !== this.state.moveKey) {
        this.selectMove(target);
      }
    } else {
      select.value = '';
      this.selectMove(null);
    }
  }

  populatePoseFighterSelect() {
    const select = this.dom.poseFighterSelect;
    if (!select) return;
    const fighters = Object.keys(this.config.fighters || {}).sort();
    select.innerHTML = '';
    if (!fighters.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No fighters available';
      select.appendChild(option);
      select.value = '';
      select.disabled = true;
      this.state.poseFighter = null;
      return;
    }
    fighters.forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      select.appendChild(option);
    });
    const defaultKey = (this.state.poseFighter && fighters.includes(this.state.poseFighter))
      ? this.state.poseFighter
      : fighters[0];
    select.value = defaultKey;
    this.state.poseFighter = defaultKey;
    this.posePreview.setFighter(defaultKey);
  }

  changePoseFighter(fighterKey) {
    const normalized = fighterKey || null;
    this.state.poseFighter = normalized;
    this.posePreview.setFighter(normalized);
  }

  parsePoseOptionValue(value) {
    if (!value) return [null, null];
    const parts = String(value).split('::');
    if (parts.length === 2) return parts;
    return [parts[0] || null, parts[1] || null];
  }

  updatePoseOptions(options = {}) {
    const select = this.dom.poseKeySelect;
    if (!select) return;
    const {
      preserveSelection = false,
      preferredPoseKey = null,
      preferredSource = null,
      preserveJson = false,
    } = options;
    const draft = this.state.moveDraft;
    if (!draft) {
      select.innerHTML = '';
      select.disabled = true;
      this.clearPoseEditor(true);
      return;
    }

    const keys = new Set();
    if (draft.poses && typeof draft.poses === 'object') {
      Object.keys(draft.poses).forEach((key) => keys.add(key));
    }
    if (Array.isArray(draft.sequence)) {
      draft.sequence.forEach((phase) => {
        if (phase?.poseKey) keys.add(String(phase.poseKey));
      });
    }
    if (!keys.size) {
      Object.keys(this.config.poses || {}).forEach((key) => keys.add(key));
    }

    const sortedKeys = Array.from(keys).filter(Boolean).sort((a, b) => a.localeCompare(b));
    select.innerHTML = '';
    sortedKeys.forEach((poseKey) => {
      const source = this.defaultPoseSourceForKey(poseKey);
      const option = document.createElement('option');
      option.value = `${source}::${poseKey}`;
      option.dataset.source = source;
      option.dataset.poseKey = poseKey;
      option.textContent = this.formatPoseOptionLabel(poseKey, source);
      select.appendChild(option);
    });
    select.disabled = !sortedKeys.length;

    if (!sortedKeys.length) {
      this.clearPoseEditor(true);
      return;
    }

    let targetKey = preferredPoseKey;
    if (!targetKey) {
      if (preserveSelection && this.state.poseKey && sortedKeys.includes(this.state.poseKey)) {
        targetKey = this.state.poseKey;
      } else {
        targetKey = sortedKeys[0];
      }
    }

    const targetSource = preferredSource || this.defaultPoseSourceForKey(targetKey);
    const desiredValue = `${targetSource}::${targetKey}`;
    const match = Array.from(select.options).find((opt) => opt.value === desiredValue)
      || Array.from(select.options).find((opt) => opt.dataset.poseKey === targetKey);
    if (match) {
      select.value = match.value;
    } else if (select.options.length) {
      select.selectedIndex = 0;
    }

    const [selectedSource, selectedKey] = this.parsePoseOptionValue(select.value);
    this.loadPoseSelection(selectedSource, selectedKey, { preserveJson });
  }

  formatPoseOptionLabel(poseKey, source) {
    if (source === 'move') return `${poseKey} (Move)`;
    if (source === 'base') return `${poseKey} (Base)`;
    return `${poseKey} (New)`;
  }

  defaultPoseSourceForKey(poseKey) {
    if (this.state.moveDraft?.poses?.[poseKey]) return 'move';
    if (this.config.poses?.[poseKey]) return 'base';
    return 'empty';
  }

  normalizePoseSource(source, poseKey) {
    if (source === 'move' && this.state.moveDraft?.poses?.[poseKey]) return 'move';
    if (source === 'base' && this.config.poses?.[poseKey]) return 'base';
    if (this.state.moveDraft?.poses?.[poseKey]) return 'move';
    if (this.config.poses?.[poseKey]) return 'base';
    return 'empty';
  }

  clonePoseData(source, poseKey) {
    if (source === 'move') {
      return clone(this.state.moveDraft?.poses?.[poseKey]) || {};
    }
    if (source === 'base') {
      return clone(this.config.poses?.[poseKey]) || {};
    }
    return {};
  }

  resolvePoseOriginal(source, poseKey) {
    if (source === 'move') {
      return this.state.moveOriginal?.poses?.[poseKey]
        ? clone(this.state.moveOriginal.poses[poseKey])
        : null;
    }
    if (source === 'base') {
      return this.config.poses?.[poseKey]
        ? clone(this.config.poses[poseKey])
        : null;
    }
    return null;
  }

  loadPoseSelection(source, poseKey, options = {}) {
    if (!poseKey) {
      this.clearPoseEditor(true);
      return;
    }
    const normalizedSource = this.normalizePoseSource(source, poseKey);
    const poseData = this.clonePoseData(normalizedSource, poseKey);
    this.state.poseKey = poseKey;
    this.state.poseSource = normalizedSource;
    this.state.poseDraft = clone(poseData);
    this.state.poseOriginal = this.resolvePoseOriginal(normalizedSource, poseKey);
    this.state.poseDirty = false;
    if (!options.preserveJson && this.dom.poseJson) {
      this.dom.poseJson.value = JSON.stringify(this.state.poseDraft || {}, null, 2);
    }
    this.posePreview.initialize();
    this.posePreview.applyPose(this.state.poseDraft);
  }

  clearPoseEditor(resetPreview = false) {
    this.state.poseKey = null;
    this.state.poseSource = null;
    this.state.poseDraft = null;
    this.state.poseOriginal = null;
    this.state.poseDirty = false;
      if (this.dom.poseJson) {
        this.dom.poseJson.value = '';
      }
      if (resetPreview) {
        const fallback = resolveStancePose(this.config);
        this.posePreview.initialize();
        this.posePreview.applyPose(fallback);
      }
    }

  handlePoseJsonChange() {
    if (!this.state.poseKey || !this.dom.poseJson) return;
    const raw = this.dom.poseJson.value.trim();
    if (!raw) {
      this.state.poseDraft = {};
      this.state.poseDirty = true;
      this.posePreview.applyPose({});
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.state.poseDraft = parsed;
        this.state.poseDirty = true;
        this.posePreview.applyPose(parsed);
      } else {
        throw new Error('Pose must be an object');
      }
    } catch (error) {
      this.setStatus(`Pose JSON parse failed: ${error.message}`);
    }
  }

  applyPoseChanges() {
    if (!this.state.moveDraft) {
      this.setStatus('Select a move first');
      return;
    }
    const poseKey = this.state.poseKey;
    if (!poseKey) {
      this.setStatus('Select a pose to apply');
      return;
    }
    const poseDraft = this.state.poseDraft || {};
    const container = this.ensureMovePoseContainer();
    if (!container) return;
    container[poseKey] = clone(poseDraft);
    this.state.poseSource = 'move';
    this.state.poseDirty = false;
    this.updateJsonOutputs();
    this.updatePoseOptions({
      preserveSelection: true,
      preferredPoseKey: poseKey,
      preferredSource: 'move',
      preserveJson: true,
    });
    this.setStatus(`Pose ${poseKey} applied to move`);
  }

  resetPoseChanges() {
    if (!this.state.moveDraft) return;
    const poseKey = this.state.poseKey;
    if (!poseKey) return;
    const movePoses = this.state.moveDraft.poses || {};
    const original = this.state.moveOriginal?.poses?.[poseKey] || null;
    if (original) {
      const container = this.ensureMovePoseContainer();
      if (container) {
        container[poseKey] = clone(original);
      }
      this.setStatus(`Pose ${poseKey} reset to config`);
    } else if (movePoses[poseKey]) {
      delete movePoses[poseKey];
      if (Object.keys(movePoses).length === 0) {
        delete this.state.moveDraft.poses;
      }
      this.setStatus(`Pose ${poseKey} removed from move`);
    } else {
      this.setStatus('No move override to reset');
    }
    this.state.poseDirty = false;
    this.updateJsonOutputs();
    const nextSource = this.state.moveDraft?.poses?.[poseKey] ? 'move'
      : (this.config.poses?.[poseKey] ? 'base' : 'empty');
    this.updatePoseOptions({
      preserveSelection: false,
      preferredPoseKey: poseKey,
      preferredSource: nextSource,
    });
  }

  ensureMovePoseContainer() {
    if (!this.state.moveDraft) return null;
    if (!this.state.moveDraft.poses || typeof this.state.moveDraft.poses !== 'object') {
      this.state.moveDraft.poses = {};
    }
    return this.state.moveDraft.poses;
  }

  selectInitialEntries() {
    const firstAbility = this.getFirstOptionValue(this.dom.abilitySelect);
    if (firstAbility) {
      this.dom.abilitySelect.value = firstAbility;
      this.selectAbility(firstAbility);
    } else {
      this.selectAbility(null);
    }
  }

  getFirstOptionValue(select) {
    if (!select) return null;
    const options = Array.from(select.options || []);
    const match = options.find((option) => option.value);
    return match ? match.value : null;
  }

  selectMove(moveKey) {
    if (!moveKey || !this.config.moves?.[moveKey]) {
      this.updateMoveState(moveKey, null);
      return;
    }
    const original = this.config.moves[moveKey];
    const draft = clone(original);
    draft.sequence = normalizeMoveSequence(draft.sequence);
    this.updateMoveState(moveKey, draft, original);
  }

  selectAttack(attackKey) {
    const attacks = this.config.abilitySystem?.attacks || {};
    if (!attackKey || !attacks[attackKey]) {
      this.updateAttackState(attackKey, null);
      this.updateMoveOptionsForAttack({ preserveSelection: false });
      return;
    }
    const original = attacks[attackKey];
    const draft = clone(original);
    draft.sequence = normalizeAttackSequence(draft.sequence ?? draft.sequenceSteps ?? draft.sequencePhases);
    draft.tags = Array.isArray(draft.tags) ? uniqueKeyedList(draft.tags) : [];
    if (!draft.attackData) draft.attackData = {};
    this.updateAttackState(attackKey, draft, original);
    this.updateMoveOptionsForAttack({ preserveSelection: false });
  }

  updateMoveState(moveKey, draft, original) {
    const previousKey = this.state.moveKey;
    this.state.moveKey = moveKey;
    this.state.moveDraft = draft ? draft : null;
    this.state.moveOriginal = original ? clone(original) : null;
    if (moveKey !== previousKey) {
      this.state.poseKey = null;
      this.state.poseSource = null;
      this.state.poseDraft = null;
      this.state.poseOriginal = null;
      this.state.poseDirty = false;
    }
    this.renderMove();
    this.updateMoveTimeline();
    this.updateJsonOutputs();
  }

  updateAttackState(attackKey, draft, original) {
    this.state.attackKey = attackKey;
    this.state.attackDraft = draft ? draft : null;
    this.state.attackOriginal = original ? clone(original) : null;
    this.renderAttack();
    this.updateAttackTimeline();
    this.updateJsonOutputs();
  }

  renderMove() {
    const draft = this.state.moveDraft;
    const { moveDetails, moveSequencePanel, poseEditor } = this.dom;
    const disabled = !draft;
    moveDetails?.setAttribute('aria-disabled', disabled);
    moveSequencePanel?.setAttribute('aria-disabled', disabled);
    poseEditor?.setAttribute('aria-disabled', disabled);
    if (!draft) {
      this.renderDurationRows([]);
      this.renderMoveSequence([]);
      this.dom.moveName.value = '';
      this.dom.moveTags.value = '';
      this.dom.knockbackBase.value = '';
      this.dom.cancelWindow.value = '';
      this.updatePoseOptions({ preserveSelection: false });
      return;
    }
    this.dom.moveName.value = draft.name ?? '';
    this.dom.moveTags.value = formatTags(draft.tags);
    this.renderDurationRows([
      { key: 'toWindup', label: 'Windup', value: draft?.durations?.toWindup ?? '' },
      { key: 'toStrike', label: 'Strike', value: draft?.durations?.toStrike ?? '' },
      { key: 'toRecoil', label: 'Recoil', value: draft?.durations?.toRecoil ?? '' },
      { key: 'toStance', label: 'Return', value: draft?.durations?.toStance ?? '' },
    ]);
    this.dom.knockbackBase.value = draft.knockbackBase ?? '';
    this.dom.cancelWindow.value = draft.cancelWindow ?? '';
    this.renderMoveSequence(draft.sequence || []);
    this.updatePoseOptions({ preserveSelection: true, preserveJson: this.state.poseDirty });
  }

  renderDurationRows(rows) {
    const container = this.dom.durationRows;
    if (!container) return;
    container.innerHTML = '';
    rows.forEach(({ key, label, value }) => {
      const tr = document.createElement('tr');
      const labelCell = document.createElement('td');
      labelCell.textContent = label;
      const inputCell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = value ?? '';
      input.addEventListener('change', (event) => {
        this.updateMoveDuration(key, event.target.value);
      });
      inputCell.appendChild(input);
      tr.appendChild(labelCell);
      tr.appendChild(inputCell);
      container.appendChild(tr);
    });

  }

  updateMoveDuration(key, value) {
    if (!this.state.moveDraft) return;
    const duration = this.state.moveDraft.durations || (this.state.moveDraft.durations = {});
    const parsed = Math.max(0, toNumber(value, 0));
    duration[key] = parsed;
    this.updateMoveTimeline();
    this.updateJsonOutputs();
  }

  renderMoveSequence(sequence) {
    const container = this.dom.moveSequence;
    if (!container) return;
    container.innerHTML = '';
    sequence.forEach((phase, index) => {
      const tr = document.createElement('tr');
      const poseCell = document.createElement('td');
      const poseInput = document.createElement('input');
      poseInput.type = 'text';
      poseInput.value = phase.poseKey || '';
      poseInput.addEventListener('change', (event) => {
        this.updateMoveSequenceEntry(index, { poseKey: event.target.value });
      });
      poseCell.appendChild(poseInput);

      const durationCell = document.createElement('td');
      const durationInput = document.createElement('input');
      durationInput.type = 'number';
      durationInput.step = '1';
      durationInput.min = '0';
      durationInput.value = phase.durMs ?? '';
      durationInput.addEventListener('change', (event) => {
        this.updateMoveSequenceEntry(index, { durMs: toNumber(event.target.value, 0) });
      });
      durationCell.appendChild(durationInput);

      const strikeCell = document.createElement('td');
      const strikeInput = document.createElement('input');
      strikeInput.type = 'checkbox';
      strikeInput.checked = Boolean(phase.strike);
      strikeInput.addEventListener('change', (event) => {
        this.updateMoveSequenceEntry(index, { strike: event.target.checked });
      });
      strikeCell.appendChild(strikeInput);

      const removeCell = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => this.removeMovePhase(index));
      removeCell.appendChild(removeBtn);

      tr.appendChild(poseCell);
      tr.appendChild(durationCell);
      tr.appendChild(strikeCell);
      tr.appendChild(removeCell);
      container.appendChild(tr);
    });
  }

  updateMoveSequenceEntry(index, changes) {
    const draft = this.state.moveDraft;
    if (!draft || !Array.isArray(draft.sequence) || !draft.sequence[index]) return;
    Object.assign(draft.sequence[index], changes);
    this.updateMoveTimeline();
    this.updateJsonOutputs();
    if (Object.prototype.hasOwnProperty.call(changes, 'poseKey')) {
      this.updatePoseOptions({ preserveSelection: true });
    }
  }

  addMovePhase() {
    const draft = this.state.moveDraft;
    if (!draft) return;
    draft.sequence ||= [];
    draft.sequence.push({ poseKey: 'NewPose', durMs: 120, strike: false });
    this.renderMoveSequence(draft.sequence);
    this.updateMoveTimeline();
    this.updateJsonOutputs();
    this.updatePoseOptions({ preserveSelection: true, preferredPoseKey: 'NewPose', preferredSource: 'empty' });
  }

  removeMovePhase(index) {
    const draft = this.state.moveDraft;
    if (!draft || !Array.isArray(draft.sequence)) return;
    draft.sequence.splice(index, 1);
    this.renderMoveSequence(draft.sequence);
    this.updateMoveTimeline();
    this.updateJsonOutputs();
    this.updatePoseOptions({ preserveSelection: true });
  }

  normalizeMoveDurations() {
    const draft = this.state.moveDraft;
    if (!draft) return;
    if (draft.durations) {
      Object.entries(draft.durations).forEach(([key, value]) => {
        draft.durations[key] = Math.max(0, toNumber(value, 0));
      });
    }
    draft.sequence = normalizeMoveSequence(draft.sequence);
    this.renderMove();
    this.updateMoveTimeline();
    this.updateJsonOutputs();
    this.setStatus('Move phases normalized');
  }

  renderAttack() {
    const draft = this.state.attackDraft;
    const { attackDetails } = this.dom;
    const disabled = !draft;
    attackDetails?.setAttribute('aria-disabled', disabled);
    if (!draft) {
      this.dom.attackName.value = '';
      this.dom.attackTags.value = '';
      this.dom.attackSequence.innerHTML = '';
      this.dom.attackDamageHealth.value = '';
      this.dom.attackStamina.value = '';
      this.dom.attackColliders.value = '';
      this.dom.attackUseWeaponColliders.value = 'auto';
      return;
    }
    this.dom.attackName.value = draft.name ?? '';
    this.dom.attackTags.value = formatTags(draft.tags);
    this.renderAttackSequence(draft.sequence || []);
    const damageHealth = draft.attackData?.damage?.health ?? '';
    this.dom.attackDamageHealth.value = damageHealth;
    this.dom.attackStamina.value = draft.attackData?.staminaCost ?? '';
    this.dom.attackColliders.value = Array.isArray(draft.attackData?.colliders)
      ? draft.attackData.colliders.join(', ')
      : '';
    this.dom.attackUseWeaponColliders.value =
      draft.attackData?.useWeaponColliders === true ? 'true'
        : draft.attackData?.useWeaponColliders === false ? 'false'
          : 'auto';
  }

  renderAttackSequence(sequence) {
    const container = this.dom.attackSequence;
    if (!container) return;
    container.innerHTML = '';
    sequence.forEach((step, index) => {
      const tr = document.createElement('tr');
      const moveCell = document.createElement('td');
      const moveInput = document.createElement('input');
      moveInput.type = 'text';
      moveInput.value = step.move || '';
      moveInput.addEventListener('change', (event) => {
        this.updateAttackSequenceEntry(index, { move: event.target.value });
      });
      moveCell.appendChild(moveInput);

      const startCell = document.createElement('td');
      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.step = '1';
      startInput.min = '0';
      startInput.value = step.startMs ?? 0;
      startInput.addEventListener('change', (event) => {
        this.updateAttackSequenceEntry(index, { startMs: toNumber(event.target.value, 0) });
      });
      startCell.appendChild(startInput);

      const tagCell = document.createElement('td');
      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.value = formatTags(step.tags);
      tagInput.addEventListener('change', (event) => {
        this.updateAttackSequenceEntry(index, { tags: normalizeTagsInput(event.target.value) });
      });
      tagCell.appendChild(tagInput);

      const removeCell = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => this.removeAttackStep(index));
      removeCell.appendChild(removeBtn);

      tr.appendChild(moveCell);
      tr.appendChild(startCell);
      tr.appendChild(tagCell);
      tr.appendChild(removeCell);
      container.appendChild(tr);
    });

  }

  ensureAttackData() {
    const draft = this.state.attackDraft;
    if (!draft) return;
    draft.attackData ||= {};
    draft.attackData.damage ||= {};
  }

  updateAttackSequenceEntry(index, changes) {
    const draft = this.state.attackDraft;
    if (!draft || !Array.isArray(draft.sequence) || !draft.sequence[index]) return;
    Object.assign(draft.sequence[index], changes);
    this.updateAttackTimeline();
    this.updateJsonOutputs();
  }

  addAttackStep() {
    const draft = this.state.attackDraft;
    if (!draft) return;
    draft.sequence ||= [];
    draft.sequence.push({ move: this.state.moveKey || 'NewMove', startMs: 0, tags: [] });
    this.renderAttackSequence(draft.sequence);
    this.updateAttackTimeline();
    this.updateJsonOutputs();
  }

  removeAttackStep(index) {
    const draft = this.state.attackDraft;
    if (!draft || !Array.isArray(draft.sequence)) return;
    draft.sequence.splice(index, 1);
    this.renderAttackSequence(draft.sequence);
    this.updateAttackTimeline();
    this.updateJsonOutputs();
  }

  addAttackTag() {
    if (!this.state.attackDraft) return;
    const tags = new Set(this.state.attackDraft.tags || []);
    let suffix = 1;
    let tag = `tag-${suffix}`;
    while (tags.has(tag)) {
      suffix += 1;
      tag = `tag-${suffix}`;
    }
    tags.add(tag);
    this.state.attackDraft.tags = Array.from(tags);
    this.dom.attackTags.value = formatTags(this.state.attackDraft.tags);
    this.updateJsonOutputs();
    this.setStatus(`Added tag "${tag}"`);
    this.renderPreview();
  }

  updateMoveTimeline() {
    const draft = this.state.moveDraft;
    const container = this.dom.moveTimeline;
    if (!container) return;
    container.innerHTML = '';
    if (!draft) {
      this.renderPreview();
      return;
    }
    const phases = this.getMoveTimelinePhases();
    phases.forEach((phase) => container.appendChild(this.buildTimelineRow(phase)));
    this.renderPreview();
  }

  updateAttackTimeline() {
    const draft = this.state.attackDraft;
    const container = this.dom.attackTimeline;
    if (!container) return;
    container.innerHTML = '';
    if (!draft || !Array.isArray(draft.sequence)) {
      this.renderPreview();
      return;
    }
    const steps = this.getAttackTimelineSteps();
    const maxStart = steps.reduce((max, step) => Math.max(max, step.startMs || 0), 0);
    steps.forEach((step) => {
      const startMs = step.startMs;
      const widthPct = maxStart > 0
        ? Math.min(100, Math.max(6, (startMs / maxStart) * 100))
        : 100;
      const row = document.createElement('div');
      row.className = 'timeline-row';
      const label = document.createElement('span');
      const tagsLabel = step.tags?.length ? ` (${step.tags.join(', ')})` : '';
      label.textContent = `${step.move || 'Move'}${tagsLabel}`;
      row.appendChild(label);
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      const fill = document.createElement('div');
      fill.className = 'timeline-bar-fill';
      fill.style.width = `${widthPct}%`;
      bar.appendChild(fill);
      const text = document.createElement('div');
      text.className = 'timeline-label';
      text.textContent = `${startMs}ms`;
      bar.appendChild(text);
      row.appendChild(bar);
      container.appendChild(row);
    });
    this.renderPreview();
  }

  buildTimelineRow(phase) {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    const label = document.createElement('span');
    label.textContent = phase.label;
    row.appendChild(label);
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    bar.dataset.kind = phase.kind;
    const fill = document.createElement('div');
    fill.className = 'timeline-bar-fill';
    fill.style.width = `${Math.min(100, phase.widthPct)}%`;
    bar.appendChild(fill);
    const text = document.createElement('div');
    text.className = 'timeline-label';
    text.textContent = `${phase.value}ms`;
    bar.appendChild(text);
    row.appendChild(bar);
    return row;
  }

  getMoveTimelinePhases() {
    const draft = this.state.moveDraft;
    if (!draft) return [];
    const durations = draft.durations || {};
    return formatDurationTimeline([
      { label: 'Windup', value: durations.toWindup, kind: 'windup' },
      { label: 'Strike', value: durations.toStrike, kind: 'strike' },
      { label: 'Recoil', value: durations.toRecoil, kind: 'recoil' },
      { label: 'Return', value: durations.toStance, kind: 'return' }
    ]);
  }

  getAttackTimelineSteps() {
    const draft = this.state.attackDraft;
    if (!draft || !Array.isArray(draft.sequence)) return [];
    return draft.sequence
      .map((step, index) => ({
        move: step.move || `Step ${index + 1}`,
        startMs: Math.max(0, toNumber(step.startMs, 0)),
        tags: Array.isArray(step.tags) ? step.tags : [],
        index
      }))
      .sort((a, b) => a.startMs - b.startMs);
  }

  renderPreview() {
    const { previewCanvas, previewPlaceholder } = this.dom;
    if (!previewCanvas) return;
    const phases = this.getMoveTimelinePhases();
    const steps = this.getAttackTimelineSteps();
    const hasMove = phases.length > 0;
    const hasAttack = steps.length > 0;
    const hasData = hasMove || hasAttack;

    if (!hasData) {
      previewCanvas.classList.remove('is-visible');
      previewPlaceholder?.classList.remove('is-hidden');
      const ctx = previewCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      return;
    }

    previewCanvas.classList.add('is-visible');
    previewPlaceholder?.classList.add('is-hidden');

    const { ctx, width, height, dpr } = this.configurePreviewCanvas(previewCanvas);
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.restore();

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, width, height);

    const margin = 24;
    const availableHeight = Math.max(0, height - margin * 2);
    const rows = (hasMove ? 1 : 0) + (hasAttack ? 1 : 0);
    const rowGap = rows > 1 ? 40 : 0;
    const rowHeight = rows ? (availableHeight - rowGap * (rows - 1)) / rows : 0;
    let currentY = margin;

    if (hasMove) {
      this.drawMovePreview(ctx, phases, width, currentY, rowHeight);
      currentY += rowHeight + rowGap;
    }

    if (hasAttack) {
      const attackY = hasMove ? currentY - rowGap : currentY;
      this.drawAttackPreview(ctx, steps, width, attackY, rowHeight || availableHeight);
    }

    ctx.restore();
  }

  configurePreviewCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    let logicalWidth = rect.width || canvas.__logicalWidth || canvas.width || 720;
    let logicalHeight = rect.height || canvas.__logicalHeight || canvas.height || 460;
    if (!logicalWidth) logicalWidth = 720;
    if (!logicalHeight) logicalHeight = 460;
    const scaledWidth = Math.round(logicalWidth * dpr);
    const scaledHeight = Math.round(logicalHeight * dpr);
    if (canvas.__width !== scaledWidth || canvas.__height !== scaledHeight) {
      canvas.__width = scaledWidth;
      canvas.__height = scaledHeight;
      canvas.__logicalWidth = logicalWidth;
      canvas.__logicalHeight = logicalHeight;
      canvas.__dpr = dpr;
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }
    return { ctx: canvas.getContext('2d'), width: logicalWidth, height: logicalHeight, dpr };
  }

  drawMovePreview(ctx, phases, width, top, height) {
    const margin = 24;
    const title = this.state.moveDraft?.name || this.state.moveKey || 'Move Timeline';
    ctx.fillStyle = '#7f8ea3';
    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`Move Timeline • ${title}`, margin, top);

    const barTop = top + 28;
    const barHeight = Math.max(28, height - 54);
    const totalWidth = width - margin * 2;
    const totalValue = phases.reduce((sum, item) => sum + Math.max(0, item.value || 0), 0) || 1;
    let offsetX = margin;

    phases.forEach((phase, index) => {
      const rawWidth = totalWidth * Math.max(0, phase.value || 0) / totalValue;
      const blockWidth = Math.max(16, rawWidth);
      const color = this.getMovePhaseColor(phase, index);
      this.drawRoundedRect(ctx, offsetX, barTop, blockWidth, barHeight, 10, color);

      const centerX = offsetX + blockWidth / 2;
      const label = `${phase.label}`;
      const durationLabel = `${Math.round(phase.value || 0)}ms`;
      ctx.textAlign = 'center';
      if (blockWidth >= 68) {
        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, centerX, barTop + barHeight / 2 - 8);
        ctx.fillStyle = 'rgba(230, 237, 243, 0.75)';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(durationLabel, centerX, barTop + barHeight / 2 + 10);
      } else {
        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, centerX, barTop - 6);
        ctx.fillStyle = 'rgba(230, 237, 243, 0.75)';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(durationLabel, centerX, barTop + barHeight + 6);
      }
      offsetX += blockWidth;
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawAttackPreview(ctx, steps, width, top, height) {
    const margin = 24;
    const title = this.state.attackDraft?.name || this.state.attackKey || 'Attack Sequence';
    ctx.fillStyle = '#7f8ea3';
    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`Attack Sequence • ${title}`, margin, top);

    const baselineY = top + Math.max(36, height * 0.45);
    const markerHeight = Math.max(28, height * 0.4);
    const trackWidth = width - margin * 2;

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, baselineY);
    ctx.lineTo(width - margin, baselineY);
    ctx.stroke();

    const maxStart = steps.reduce((max, step) => Math.max(max, step.startMs || 0), 0);
    const denominator = maxStart > 0
      ? maxStart
      : (steps.length > 1 ? steps.length - 1 : 1);

    if (maxStart > 0) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('0ms', margin, baselineY + 8);
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(maxStart)}ms`, width - margin, baselineY + 8);
      ctx.textAlign = 'left';
    }

    steps.forEach((step, index) => {
      const ratio = denominator > 0
        ? (maxStart > 0 ? step.startMs / denominator : index / denominator)
        : 0;
      const xPos = margin + ratio * trackWidth;
      const color = this.getAttackStepColor(index);
      const markerTop = baselineY - markerHeight + 16;

      this.drawRoundedRect(ctx, xPos - 5, markerTop, 10, markerHeight - 16, 4, color);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xPos, baselineY);
      ctx.lineTo(xPos, baselineY + 18);
      ctx.stroke();

      ctx.fillStyle = '#e6edf3';
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(step.move, xPos, markerTop - 6);

      if (step.tags.length) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(step.tags.join(', '), xPos, markerTop - 2);
      }

      ctx.fillStyle = '#e6edf3';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`${Math.round(step.startMs)}ms`, xPos, baselineY + 24);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawRoundedRect(ctx, x, y, width, height, radius, color) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  getMovePhaseColor(phase, index) {
    const label = String(phase.label || '').toLowerCase();
    if (phase.kind === 'strike' || label.includes('strike')) return '#f87171';
    if (label.includes('wind')) return '#38bdf8';
    if (label.includes('recoil')) return '#22d3ee';
    if (label.includes('return') || label.includes('stance')) return '#0ea5e9';
    const fallback = ['#38bdf8', '#0ea5e9', '#22d3ee', '#38bdf8'];
    return fallback[index % fallback.length];
  }

  getAttackStepColor(index) {
    const palette = ['#fbbf24', '#c084fc', '#38bdf8', '#f472b6', '#22d3ee'];
    return palette[index % palette.length];
  }

  updateJsonOutputs() {
    if (this.dom.moveJson) {
      this.dom.moveJson.value = this.state.moveDraft
        ? JSON.stringify(this.state.moveDraft, null, 2)
        : '';
    }
    if (this.dom.attackJson) {
      this.dom.attackJson.value = this.state.attackDraft
        ? JSON.stringify(this.exportAttackDraft(), null, 2)
        : '';
    }
  }

  exportAttackDraft() {
    if (!this.state.attackDraft) return null;
    return clone(this.state.attackDraft);
  }

  copyJson(value, successMessage) {
    if (!value) {
      this.setStatus('Nothing to copy');
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value)
        .then(() => this.setStatus(successMessage))
        .catch(() => this.setStatus('Copy failed'));
    } else {
      const temp = document.createElement('textarea');
      temp.value = value;
      document.body.appendChild(temp);
      temp.select();
      try {
        document.execCommand('copy');
        this.setStatus(successMessage);
      } catch (_err) {
        this.setStatus('Copy failed');
      }
      document.body.removeChild(temp);
    }
  }

  downloadJson() {
    const payload = {
      moveKey: this.state.moveKey,
      move: this.state.moveDraft ? clone(this.state.moveDraft) : null,
      attackKey: this.state.attackKey,
      attack: this.exportAttackDraft(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'animation-editor-export.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.setStatus('Downloaded export');
  }

  applyJsonEdits(kind) {
    const textArea = kind === 'move' ? this.dom.moveJson : this.dom.attackJson;
    if (!textArea) return;
    const raw = textArea.value;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (kind === 'move') {
        parsed.sequence = normalizeMoveSequence(parsed.sequence);
        this.state.moveDraft = parsed;
        this.renderMove();
        this.updateMoveTimeline();
      } else {
        parsed.sequence = normalizeAttackSequence(parsed.sequence);
        parsed.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
        this.state.attackDraft = parsed;
        this.renderAttack();
        this.updateAttackTimeline();
      }
      this.updateJsonOutputs();
      this.setStatus('Applied JSON edits');
      this.renderPreview();
    } catch (error) {
      this.setStatus(`JSON parse failed: ${error.message}`);
    }
  }

  resetMove() {
    if (!this.state.moveKey || !this.state.moveOriginal) return;
    const draft = clone(this.state.moveOriginal);
    draft.sequence = normalizeMoveSequence(draft.sequence);
    this.state.moveDraft = draft;
    this.renderMove();
    this.updateMoveTimeline();
    this.updateJsonOutputs();
    this.setStatus('Move reset to config value');
  }

  resetAttack() {
    if (!this.state.attackKey || !this.state.attackOriginal) return;
    const draft = clone(this.state.attackOriginal);
    draft.sequence = normalizeAttackSequence(draft.sequence ?? draft.sequenceSteps ?? draft.sequencePhases);
    draft.tags = Array.isArray(draft.tags) ? draft.tags : [];
    this.state.attackDraft = draft;
    this.renderAttack();
    this.updateAttackTimeline();
    this.updateJsonOutputs();
    this.setStatus('Attack reset to config value');
  }

  setStatus(message) {
    if (!this.dom.statusBanner) return;
    this.dom.statusBanner.textContent = message || '';
    if (!message) return;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.dom.statusBanner.textContent === message) {
        this.dom.statusBanner.textContent = '';
      }
    }, 4000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new AnimationEditorApp(window.CONFIG || {}));
} else {
  new AnimationEditorApp(window.CONFIG || {});
}
