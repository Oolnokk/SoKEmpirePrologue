const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const cleanTags = (value) => Array.from(new Set(String(value || '').split(',').map((t) => t.trim()).filter(Boolean)));
const numberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatList = (values) => (values && values.length ? values.join(', ') : '—');
const setText = (el, value) => { if (el) el.textContent = value ?? '—'; };
const clearChildren = (el) => { while (el?.firstChild) el.removeChild(el.firstChild); };

const timelineWidth = (value, total) => {
  if (!total || total <= 0) return '0%';
  const pct = Math.max(4, (value / total) * 100);
  return `${pct}%`;
};

class AnimationEditor {
  constructor() {
    this.dom = this.queryDom();
    this.data = this.buildData();
    this.state = {
      abilityId: null,
      attackId: null,
      moveId: null,
      moveDraft: null,
      attackDraft: null,
    };
    this.init();
  }

  queryDom() {
    const q = (id) => document.getElementById(id);
    return {
      abilitySelect: q('abilitySelect'),
      attackSelect: q('attackSelect'),
      moveSelect: q('moveSelect'),
      statusBadge: q('statusBadge'),
      abilityName: q('abilityName'),
      abilityType: q('abilityType'),
      abilityTrigger: q('abilityTrigger'),
      abilityClass: q('abilityClass'),
      abilityTags: q('abilityTags'),
      abilitySlots: q('abilitySlots'),
      abilityVariants: q('abilityVariants'),
      moveTitle: q('moveTitle'),
      moveName: q('moveName'),
      moveTags: q('moveTags'),
      knockbackBase: q('knockbackBase'),
      cancelWindow: q('cancelWindow'),
      moveSequenceBody: q('moveSequenceBody'),
      moveTimeline: q('moveTimeline'),
      moveDuration: q('moveDuration'),
      addMovePhase: q('addMovePhase'),
      resetMove: q('resetMove'),
      attackTitle: q('attackTitle'),
      attackName: q('attackName'),
      attackTags: q('attackTags'),
      attackSequenceBody: q('attackSequenceBody'),
      attackTimeline: q('attackTimeline'),
      attackDuration: q('attackDuration'),
      addAttackStep: q('addAttackStep'),
      resetAttack: q('resetAttack'),
      moveJson: q('moveJson'),
      attackJson: q('attackJson'),
      copyMoveJson: q('copyMoveJson'),
      copyAttackJson: q('copyAttackJson'),
      downloadJson: q('downloadJson'),
    };
  }

  buildData() {
    const CONFIG = window.CONFIG || {};
    const hierarchy = CONFIG.hierarchy || {};
    const abilities = hierarchy.abilities || {};
    const attacks = hierarchy.attacks || {};
    const moves = hierarchy.moves || {};
    const poses = hierarchy.poses || {};

    const abilityList = Object.keys(abilities).sort();
    const attackList = Object.keys(attacks).sort();
    const moveList = Object.keys(moves).sort();
    const poseList = Object.keys(poses).sort();

    const baseMoveDraft = (id) => {
      const src = moves[id];
      if (!src) return null;
      const draft = clone(src);
      draft.sequence = this.normalizeMoveSequence(src);
      draft.tags = src.tags || [];
      draft.knockbackBase = src.knockbackBase ?? null;
      draft.cancelWindow = src.cancelWindow ?? null;
      draft.legacyId = src.legacyId || id;
      draft.name = src.name || id;
      return draft;
    };

    const baseAttackDraft = (id) => {
      const src = attacks[id];
      if (!src) return null;
      const draft = clone(src);
      draft.sequence = this.normalizeAttackMoves(src);
      draft.tags = src.tags || [];
      draft.legacyId = src.legacyId || id;
      draft.name = src.name || id;
      return draft;
    };

    return { abilities, attacks, moves, poses, abilityList, attackList, moveList, poseList, baseMoveDraft, baseAttackDraft };
  }

  normalizeMoveSequence(move = {}) {
    if (Array.isArray(move.sequence) && move.sequence.length) {
      return move.sequence.map((entry) => ({
        poseKey: entry.pose || entry.poseKey || entry.stage || 'Pose',
        durMs: Number(entry.duration || entry.durMs || 0) || 0,
        strike: Boolean(entry.strike)
      }));
    }
    if (Array.isArray(move.stages) && move.stages.length) {
      return move.stages.map((stage) => ({
        poseKey: stage.stage || stage.pose || 'Pose',
        durMs: Number(stage.duration || 0) || 0,
        strike: Boolean(stage.strike)
      }));
    }
    return [{ poseKey: 'PoseA', durMs: 300, strike: false }];
  }

  normalizeAttackMoves(attack = {}) {
    if (Array.isArray(attack.moves) && attack.moves.length) {
      return attack.moves.map((entry, index) => ({
        move: entry.move || entry.id || `Move${index + 1}`,
        startMs: Number.isFinite(entry.startMs) ? entry.startMs : '',
        limb: entry.limb || '',
        tags: entry.tags || []
      }));
    }
    if (attack.primaryMove) {
      return [{ move: attack.primaryMove, startMs: 0, limb: attack.limb || '', tags: attack.tags || [] }];
    }
    return [{ move: 'Move', startMs: 0, limb: '', tags: [] }];
  }

  init() {
    this.populateSelect(this.dom.abilitySelect, this.data.abilityList);
    this.populateSelect(this.dom.attackSelect, this.data.attackList);
    this.populateSelect(this.dom.moveSelect, this.data.moveList);
    this.bindEvents();
    this.selectInitial();
  }

  bindEvents() {
    const { abilitySelect, attackSelect, moveSelect, addMovePhase, resetMove, addAttackStep, resetAttack, moveName, moveTags,
      knockbackBase, cancelWindow, attackName, attackTags, copyMoveJson, copyAttackJson, downloadJson } = this.dom;

    abilitySelect?.addEventListener('change', (e) => this.selectAbility(e.target.value));
    attackSelect?.addEventListener('change', (e) => this.selectAttack(e.target.value));
    moveSelect?.addEventListener('change', (e) => this.selectMove(e.target.value));

    addMovePhase?.addEventListener('click', () => this.addMovePhase());
    resetMove?.addEventListener('click', () => this.resetMove());
    addAttackStep?.addEventListener('click', () => this.addAttackStep());
    resetAttack?.addEventListener('click', () => this.resetAttack());

    moveName?.addEventListener('input', (e) => { if (this.state.moveDraft) { this.state.moveDraft.name = e.target.value; this.render(); } });
    moveTags?.addEventListener('input', (e) => { if (this.state.moveDraft) { this.state.moveDraft.tags = cleanTags(e.target.value); this.render(); } });
    knockbackBase?.addEventListener('change', (e) => { if (this.state.moveDraft) { this.state.moveDraft.knockbackBase = numberOrNull(e.target.value); this.render(); } });
    cancelWindow?.addEventListener('change', (e) => { if (this.state.moveDraft) { this.state.moveDraft.cancelWindow = numberOrNull(e.target.value); this.render(); } });

    attackName?.addEventListener('input', (e) => { if (this.state.attackDraft) { this.state.attackDraft.name = e.target.value; this.render(); } });
    attackTags?.addEventListener('input', (e) => { if (this.state.attackDraft) { this.state.attackDraft.tags = cleanTags(e.target.value); this.render(); } });

    copyMoveJson?.addEventListener('click', () => this.copyJson(this.dom.moveJson?.value, 'Move JSON copied'));
    copyAttackJson?.addEventListener('click', () => this.copyJson(this.dom.attackJson?.value, 'Attack JSON copied'));
    downloadJson?.addEventListener('click', () => this.downloadJson());
  }

  selectInitial() {
    const ability = this.data.abilityList[0] || null;
    const attack = this.data.attackList[0] || null;
    const move = this.data.moveList[0] || null;
    this.selectAbility(ability, { silent: true });
    this.selectAttack(attack, { silent: true });
    this.selectMove(move, { silent: true });
    this.render();
  }

  selectAbility(abilityId, { silent } = {}) {
    this.state.abilityId = abilityId || null;
    this.dom.abilitySelect.value = abilityId || '';
    const ability = this.data.abilities[abilityId];
    if (ability) {
      const suggestedAttack = ability.attack || ability.defaultAttack || ability.sequence?.[0];
      if (suggestedAttack && this.data.attacks[suggestedAttack]) {
        this.selectAttack(suggestedAttack, { silent: true });
      }
    }
    if (!silent) this.render();
  }

  selectAttack(attackId, { silent } = {}) {
    this.state.attackId = attackId || null;
    this.dom.attackSelect.value = attackId || '';
    this.state.attackDraft = attackId ? this.data.baseAttackDraft(attackId) : null;
    if (this.state.attackDraft?.primaryMove) {
      this.selectMove(this.state.attackDraft.primaryMove, { silent: true });
    }
    if (!silent) this.render();
  }

  selectMove(moveId, { silent } = {}) {
    this.state.moveId = moveId || null;
    this.dom.moveSelect.value = moveId || '';
    this.state.moveDraft = moveId ? this.data.baseMoveDraft(moveId) : null;
    if (!silent) this.render();
  }

  addMovePhase() {
    if (!this.state.moveDraft) return;
    this.state.moveDraft.sequence = this.state.moveDraft.sequence || [];
    this.state.moveDraft.sequence.push({ poseKey: 'NewPose', durMs: 250, strike: false });
    this.render();
  }

  resetMove() {
    if (!this.state.moveId) return;
    this.state.moveDraft = this.data.baseMoveDraft(this.state.moveId);
    this.render();
  }

  addAttackStep() {
    if (!this.state.attackDraft) return;
    this.state.attackDraft.sequence = this.state.attackDraft.sequence || [];
    this.state.attackDraft.sequence.push({ move: this.state.moveId || 'Move', startMs: '', limb: '', tags: [] });
    this.render();
  }

  resetAttack() {
    if (!this.state.attackId) return;
    this.state.attackDraft = this.data.baseAttackDraft(this.state.attackId);
    this.render();
  }

  populateSelect(select, values = []) {
    if (!select) return;
    clearChildren(select);
    values.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  }

  render() {
    this.renderAbility();
    this.renderMove();
    this.renderAttack();
    this.renderExports();
    this.updateStatus();
  }

  renderAbility() {
    const ability = this.data.abilities[this.state.abilityId] || null;
    if (!ability) return;
    setText(this.dom.abilityName, ability.name || this.state.abilityId);
    setText(this.dom.abilityType, ability.type || 'ability');
    setText(this.dom.abilityTrigger, ability.trigger || '—');
    setText(this.dom.abilityClass, ability.classification || '—');
    setText(this.dom.abilityTags, formatList(ability.tags));
    setText(this.dom.abilitySlots, formatList(ability.inputSlots));
    const variants = ability.variants && ability.variants.length
      ? ability.variants.map((v) => `${v.id || 'variant'} → ${v.attack}`).join(' · ')
      : 'No variants registered';
    setText(this.dom.abilityVariants, variants);
  }

  renderMove() {
    const move = this.state.moveDraft;
    if (!move) return;
    setText(this.dom.moveTitle, `${move.name || move.id || 'Move'}`);
    if (this.dom.moveName) this.dom.moveName.value = move.name || '';
    if (this.dom.moveTags) this.dom.moveTags.value = (move.tags || []).join(', ');
    if (this.dom.knockbackBase) this.dom.knockbackBase.value = move.knockbackBase ?? '';
    if (this.dom.cancelWindow) this.dom.cancelWindow.value = move.cancelWindow ?? '';

    this.renderMoveSequence();
    this.renderMoveTimeline();
  }

  renderMoveSequence() {
    const body = this.dom.moveSequenceBody;
    clearChildren(body);
    (this.state.moveDraft?.sequence || []).forEach((entry, idx) => {
      const row = document.createElement('tr');

      const poseCell = document.createElement('td');
      const poseInput = document.createElement('input');
      poseInput.type = 'text';
      poseInput.value = entry.poseKey || '';
      poseInput.addEventListener('input', (e) => {
        entry.poseKey = e.target.value;
        this.render();
      });
      poseCell.appendChild(poseInput);

      const durationCell = document.createElement('td');
      const durInput = document.createElement('input');
      durInput.type = 'number';
      durInput.min = '0';
      durInput.value = Number(entry.durMs) || 0;
      durInput.addEventListener('change', (e) => {
        entry.durMs = Math.max(0, Number(e.target.value) || 0);
        this.render();
      });
      durationCell.appendChild(durInput);

      const strikeCell = document.createElement('td');
      const strikeInput = document.createElement('input');
      strikeInput.type = 'checkbox';
      strikeInput.checked = Boolean(entry.strike);
      strikeInput.addEventListener('change', (e) => {
        entry.strike = e.target.checked;
        this.render();
      });
      strikeCell.appendChild(strikeInput);

      const removeCell = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'danger';
      removeBtn.addEventListener('click', () => {
        this.state.moveDraft.sequence.splice(idx, 1);
        if (!this.state.moveDraft.sequence.length) {
          this.state.moveDraft.sequence.push({ poseKey: 'Pose', durMs: 250, strike: false });
        }
        this.render();
      });
      removeCell.appendChild(removeBtn);

      [poseCell, durationCell, strikeCell, removeCell].forEach((cell) => row.appendChild(cell));
      body.appendChild(row);
    });
  }

  renderMoveTimeline() {
    const timeline = this.dom.moveTimeline;
    clearChildren(timeline);
    const seq = this.state.moveDraft?.sequence || [];
    const total = seq.reduce((sum, step) => sum + Math.max(0, Number(step.durMs) || 0), 0) || 1;
    seq.forEach((step) => {
      const segment = document.createElement('div');
      segment.className = 'timeline-segment';
      segment.dataset.kind = step.strike ? 'strike' : 'pose';
      segment.style.width = timelineWidth(Math.max(0, Number(step.durMs) || 0), total);
      segment.textContent = `${step.poseKey || 'Pose'} • ${step.durMs || 0}ms`;
      timeline.appendChild(segment);
    });
    setText(this.dom.moveDuration, `${total} ms total`);
  }

  renderAttack() {
    const attack = this.state.attackDraft;
    if (!attack) return;
    setText(this.dom.attackTitle, `${attack.name || attack.id || 'Attack'}`);
    if (this.dom.attackName) this.dom.attackName.value = attack.name || '';
    if (this.dom.attackTags) this.dom.attackTags.value = (attack.tags || []).join(', ');

    this.renderAttackSequence();
    this.renderAttackTimeline();
  }

  renderAttackSequence() {
    const body = this.dom.attackSequenceBody;
    clearChildren(body);
    const moveOptions = this.data.moveList;
    (this.state.attackDraft?.sequence || []).forEach((entry, idx) => {
      const row = document.createElement('tr');

      const moveCell = document.createElement('td');
      const moveSelect = document.createElement('select');
      moveOptions.forEach((moveId) => {
        const opt = document.createElement('option');
        opt.value = moveId;
        opt.textContent = moveId;
        if (moveId === entry.move) opt.selected = true;
        moveSelect.appendChild(opt);
      });
      moveSelect.addEventListener('change', (e) => { entry.move = e.target.value; this.render(); });
      moveCell.appendChild(moveSelect);

      const startCell = document.createElement('td');
      const startInput = document.createElement('input');
      startInput.type = 'number';
      startInput.min = '0';
      startInput.placeholder = 'auto';
      startInput.value = entry.startMs === '' || entry.startMs === null || entry.startMs === undefined ? '' : entry.startMs;
      startInput.addEventListener('change', (e) => {
        const val = e.target.value;
        entry.startMs = val === '' ? '' : Math.max(0, Number(val) || 0);
        this.render();
      });
      startCell.appendChild(startInput);

      const limbCell = document.createElement('td');
      const limbInput = document.createElement('input');
      limbInput.type = 'text';
      limbInput.value = entry.limb || '';
      limbInput.addEventListener('input', (e) => { entry.limb = e.target.value; this.render(); });
      limbCell.appendChild(limbInput);

      const tagsCell = document.createElement('td');
      const tagsInput = document.createElement('input');
      tagsInput.type = 'text';
      tagsInput.value = (entry.tags || []).join(', ');
      tagsInput.addEventListener('input', (e) => { entry.tags = cleanTags(e.target.value); this.render(); });
      tagsCell.appendChild(tagsInput);

      const removeCell = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'danger';
      removeBtn.addEventListener('click', () => {
        this.state.attackDraft.sequence.splice(idx, 1);
        if (!this.state.attackDraft.sequence.length) {
          this.state.attackDraft.sequence.push({ move: this.state.moveId || 'Move', startMs: 0, limb: '', tags: [] });
        }
        this.render();
      });
      removeCell.appendChild(removeBtn);

      [moveCell, startCell, limbCell, tagsCell, removeCell].forEach((cell) => row.appendChild(cell));
      body.appendChild(row);
    });
  }

  renderAttackTimeline() {
    const timeline = this.dom.attackTimeline;
    clearChildren(timeline);
    const seq = this.state.attackDraft?.sequence || [];
    if (!seq.length) return;
    const resolved = this.resolveAttackTimings(seq);
    const total = resolved.length ? resolved[resolved.length - 1].end : 1;
    resolved.forEach((step) => {
      const segment = document.createElement('div');
      segment.className = 'timeline-segment';
      segment.style.width = timelineWidth(step.duration || 1, total || 1);
      segment.textContent = `${step.move} @ ${step.start}ms`;
      timeline.appendChild(segment);
    });
    setText(this.dom.attackDuration, `${total} ms span`);
  }

  resolveAttackTimings(seq) {
    let cursor = 0;
    return seq.map((step) => {
      const duration =  Math.max(1, (this.data.moves[step.move]?.sequence?.[0]?.durMs) || 1);
      const start = Number.isFinite(step.startMs) ? step.startMs : cursor;
      cursor = start + duration;
      return { move: step.move, start, end: cursor, duration };
    });
  }

  renderExports() {
    this.dom.moveJson.value = this.state.moveDraft ? this.buildMoveExport(this.state.moveDraft) : '';
    this.dom.attackJson.value = this.state.attackDraft ? this.buildAttackExport(this.state.attackDraft) : '';
  }

  buildMoveExport(move) {
    const payload = {
      name: move.name || move.id,
      tags: move.tags?.length ? move.tags : undefined,
      knockbackBase: Number.isFinite(move.knockbackBase) ? move.knockbackBase : undefined,
      cancelWindow: Number.isFinite(move.cancelWindow) ? move.cancelWindow : undefined,
      sequence: (move.sequence || []).map((step) => ({
        poseKey: step.poseKey,
        durMs: Math.max(0, Number(step.durMs) || 0),
        strike: step.strike || undefined
      }))
    };
    const key = move.legacyId || move.id || 'Move';
    return JSON.stringify({ moves: { [key]: payload } }, null, 2);
  }

  buildAttackExport(attack) {
    const payload = {
      name: attack.name || attack.id,
      tags: attack.tags?.length ? attack.tags : undefined,
      preset: attack.primaryMove || attack.sequence?.[0]?.move || undefined,
      sequence: (attack.sequence || []).map((step) => ({
        move: step.move,
        startMs: step.startMs === '' ? undefined : Number(step.startMs) || 0,
        limb: step.limb || undefined,
        tags: step.tags?.length ? step.tags : undefined
      }))
    };
    const key = attack.legacyId || attack.id || 'Attack';
    return JSON.stringify({ attacks: { [key]: payload } }, null, 2);
  }

  copyJson(value, successMessage) {
    if (!navigator?.clipboard || !value) return;
    navigator.clipboard.writeText(value).then(() => {
      this.dom.statusBadge.textContent = successMessage;
      setTimeout(() => { this.dom.statusBadge.textContent = ''; }, 1400);
    }).catch(() => {});
  }

  downloadJson() {
    const move = this.dom.moveJson?.value || '{}';
    const attack = this.dom.attackJson?.value || '{}';
    const blob = new Blob([`// Animation Editor Export\n${move}\n${attack}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation-editor-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  updateStatus() {
    const ability = this.data.abilities[this.state.abilityId];
    const attack = this.state.attackDraft;
    const move = this.state.moveDraft;
    const parts = [];
    if (ability) parts.push(`Ability: ${ability.name || this.state.abilityId}`);
    if (attack) parts.push(`Attack: ${attack.name}`);
    if (move) parts.push(`Move poses: ${(move.sequence || []).length}`);
    this.dom.statusBadge.textContent = parts.join(' • ');
  }
}

window.addEventListener('DOMContentLoaded', () => new AnimationEditor());
