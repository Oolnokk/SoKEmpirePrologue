/**
 * Prop Editor App
 * Visual editor for configuring prop prefabs with attachment points and contextual actions
 */

// Current prop configuration
let currentProp = {
  prefabId: 'bottle_01',
  displayName: 'Glass Bottle',
  tags: ['prop', 'item', 'container'],
  transform: {
    scale: { x: 1, y: 1 },
    rotation: 0
  },
  spriteBase: {
    x: 0,
    y: 0 // Distance from sprite center to ground contact point
  },
  attachment: {
    point1: { x: 0, y: 0 },    // Grip point (where bone attaches)
    point2: { x: 0, y: -10 }   // Orientation point (defines forward direction)
  },
  actions: ['use', 'drop', 'stow', 'throw']
};

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let zoom = 4;

// Initialize
function init() {
  setupEventListeners();
  loadPropToUI();
  draw();
}

function setupEventListeners() {
  // Prefab details
  document.getElementById('prefabId').addEventListener('input', (e) => {
    currentProp.prefabId = e.target.value;
    draw();
  });

  document.getElementById('displayName').addEventListener('input', (e) => {
    currentProp.displayName = e.target.value;
  });

  document.getElementById('tags').addEventListener('input', (e) => {
    currentProp.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
  });

  // Transform
  document.getElementById('scaleX').addEventListener('input', (e) => {
    currentProp.transform.scale.x = parseFloat(e.target.value) || 1;
    draw();
  });

  document.getElementById('scaleY').addEventListener('input', (e) => {
    currentProp.transform.scale.y = parseFloat(e.target.value) || 1;
    draw();
  });

  document.getElementById('rotation').addEventListener('input', (e) => {
    currentProp.transform.rotation = parseFloat(e.target.value) || 0;
    draw();
  });

  // Sprite base
  document.getElementById('basePointX').addEventListener('input', (e) => {
    currentProp.spriteBase.x = parseFloat(e.target.value) || 0;
    draw();
  });

  document.getElementById('basePointY').addEventListener('input', (e) => {
    currentProp.spriteBase.y = parseFloat(e.target.value) || 0;
    draw();
  });

  // Attachment points
  document.getElementById('attach1X').addEventListener('input', (e) => {
    currentProp.attachment.point1.x = parseFloat(e.target.value) || 0;
    draw();
  });

  document.getElementById('attach1Y').addEventListener('input', (e) => {
    currentProp.attachment.point1.y = parseFloat(e.target.value) || 0;
    draw();
  });

  document.getElementById('attach2X').addEventListener('input', (e) => {
    currentProp.attachment.point2.x = parseFloat(e.target.value) || 0;
    draw();
  });

  document.getElementById('attach2Y').addEventListener('input', (e) => {
    currentProp.attachment.point2.y = parseFloat(e.target.value) || 0;
    draw();
  });

  // Buttons
  document.getElementById('btnNew').addEventListener('click', newProp);
  document.getElementById('btnImport').addEventListener('click', importJSON);
  document.getElementById('btnExport').addEventListener('click', exportJSON);
  document.getElementById('btnAddAction').addEventListener('click', addCustomAction);

  // Canvas resize
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
}

function loadPropToUI() {
  document.getElementById('prefabId').value = currentProp.prefabId;
  document.getElementById('displayName').value = currentProp.displayName;
  document.getElementById('tags').value = currentProp.tags.join(', ');

  document.getElementById('scaleX').value = currentProp.transform.scale.x;
  document.getElementById('scaleY').value = currentProp.transform.scale.y;
  document.getElementById('rotation').value = currentProp.transform.rotation;

  document.getElementById('basePointX').value = currentProp.spriteBase.x;
  document.getElementById('basePointY').value = currentProp.spriteBase.y;

  document.getElementById('attach1X').value = currentProp.attachment.point1.x;
  document.getElementById('attach1Y').value = currentProp.attachment.point1.y;
  document.getElementById('attach2X').value = currentProp.attachment.point2.x;
  document.getElementById('attach2Y').value = currentProp.attachment.point2.y;
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, w, h);

  // Center point
  const cx = w / 2;
  const cy = h / 2;

  // Draw grid
  drawGrid(cx, cy);

  // Draw ground line
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cy + currentProp.spriteBase.y * zoom);
  ctx.lineTo(w, cy + currentProp.spriteBase.y * zoom);
  ctx.stroke();

  // Save context for transforms
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.rotate(currentProp.transform.rotation * Math.PI / 180);
  ctx.scale(currentProp.transform.scale.x, currentProp.transform.scale.y);

  // Draw placeholder sprite (bottle shape)
  drawBottle();

  // Draw sprite base point
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(currentProp.spriteBase.x, currentProp.spriteBase.y, 3 / zoom, 0, Math.PI * 2);
  ctx.fill();

  // Draw attachment points
  drawAttachmentPoints();

  ctx.restore();

  // Draw labels
  drawLabels(cx, cy);
}

function drawGrid(cx, cy) {
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;

  // Vertical lines
  for (let x = cx % (20 * zoom); x < canvas.width; x += 20 * zoom) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = cy % (20 * zoom); y < canvas.height; y += 20 * zoom) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Center crosshair
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy + 20);
  ctx.stroke();
}

function drawBottle() {
  // Simple bottle shape placeholder
  const bottleHeight = 9.25;
  const bottleWidth = 1.5;
  const neckHeight = 2;
  const capHeight = 0.5;

  // Body
  ctx.fillStyle = 'rgba(139, 69, 19, 0.8)';
  ctx.fillRect(-bottleWidth / 2, -bottleHeight / 2, bottleWidth, bottleHeight - neckHeight);

  // Neck
  const neckWidth = bottleWidth * 0.4;
  ctx.fillRect(-neckWidth / 2, -bottleHeight / 2 - neckHeight, neckWidth, neckHeight);

  // Cap
  const capWidth = neckWidth * 1.2;
  ctx.fillStyle = 'rgba(100, 50, 10, 0.9)';
  ctx.fillRect(-capWidth / 2, -bottleHeight / 2 - neckHeight - capHeight, capWidth, capHeight);

  // Outline
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.2;
  ctx.strokeRect(-bottleWidth / 2, -bottleHeight / 2, bottleWidth, bottleHeight - neckHeight);
}

function drawAttachmentPoints() {
  const p1 = currentProp.attachment.point1;
  const p2 = currentProp.attachment.point2;

  // Draw line between points
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // Draw point 1 (grip) - blue
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(p1.x, p1.y, 3 / zoom, 0, Math.PI * 2);
  ctx.fill();

  // Draw point 2 (orientation) - cyan
  ctx.fillStyle = '#06b6d4';
  ctx.beginPath();
  ctx.arc(p2.x, p2.y, 3 / zoom, 0, Math.PI * 2);
  ctx.fill();

  // Draw arrow at point 2 to show direction
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const angle = Math.atan2(dy, dx);
    const arrowLen = 2;
    const arrowAngle = Math.PI / 6;

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x - arrowLen * Math.cos(angle - arrowAngle),
      p2.y - arrowLen * Math.sin(angle - arrowAngle)
    );
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
      p2.x - arrowLen * Math.cos(angle + arrowAngle),
      p2.y - arrowLen * Math.sin(angle + arrowAngle)
    );
    ctx.stroke();
  }
}

function drawLabels(cx, cy) {
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui';

  // Prefab ID
  ctx.fillText(`Prefab: ${currentProp.prefabId}`, 10, 20);

  // Scale
  ctx.fillText(`Scale: ${currentProp.transform.scale.x.toFixed(2)} × ${currentProp.transform.scale.y.toFixed(2)}`, 10, 40);

  // Rotation
  ctx.fillText(`Rotation: ${currentProp.transform.rotation}°`, 10, 60);

  // Legend
  ctx.fillStyle = '#4ade80';
  ctx.fillText('● Sprite Base', 10, canvas.height - 60);

  ctx.fillStyle = '#3b82f6';
  ctx.fillText('● Attach Point 1 (Grip)', 10, canvas.height - 40);

  ctx.fillStyle = '#06b6d4';
  ctx.fillText('● Attach Point 2 (Direction)', 10, canvas.height - 20);
}

function resizeCanvas() {
  const wrapper = document.getElementById('cvWrap');
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  draw();
}

function newProp() {
  currentProp = {
    prefabId: 'new_prop',
    displayName: 'New Prop',
    tags: ['prop'],
    transform: {
      scale: { x: 1, y: 1 },
      rotation: 0
    },
    spriteBase: { x: 0, y: 0 },
    attachment: {
      point1: { x: 0, y: 0 },
      point2: { x: 0, y: -10 }
    },
    actions: ['use', 'drop']
  };
  loadPropToUI();
  draw();
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        currentProp = data;
        loadPropToUI();
        draw();
      } catch (err) {
        alert('Error parsing JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportJSON() {
  const json = JSON.stringify(currentProp, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProp.prefabId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function addCustomAction() {
  const input = document.getElementById('customAction');
  const action = input.value.trim();
  if (!action) return;

  if (!currentProp.actions.includes(action)) {
    currentProp.actions.push(action);
    renderActionList();
  }

  input.value = '';
}

function renderActionList() {
  const list = document.getElementById('actionList');
  list.innerHTML = currentProp.actions.map(action => `
    <div class="action-badge">
      ${action}
      <button onclick="window.removeAction('${action}')">×</button>
    </div>
  `).join('');
}

// Global functions for action management
window.toggleAction = function(action) {
  const index = currentProp.actions.indexOf(action);
  if (index > -1) {
    currentProp.actions.splice(index, 1);
  } else {
    currentProp.actions.push(action);
  }
  renderActionList();
};

window.removeAction = function(action) {
  const index = currentProp.actions.indexOf(action);
  if (index > -1) {
    currentProp.actions.splice(index, 1);
    renderActionList();
  }
};

// Start
init();
