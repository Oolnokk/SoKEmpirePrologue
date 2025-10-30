// app.js — minimal bootstrap (no external modules required)
const $$ = (sel, el=document) => el.querySelector(sel);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }
function show(el, v){ if(!el) return; el.style.display = v ? '' : 'none'; }

// HUD init
const statusInfo = $$('#statusInfo');
if (statusInfo) statusInfo.textContent = 'Booted';

// Help panel
const helpPanel = $$('#helpPanel');
on($$('#btnHelp'), 'click', () => {
  const v = getComputedStyle(helpPanel).display !== 'none';
  show(helpPanel, !v);
});

// Fullscreen
on($$('#btnFullscreen'), 'click', async () => {
  const c = $$('#game');
  if (!document.fullscreenElement) { await c?.requestFullscreen?.(); }
  else { await document.exitFullscreen(); }
});

// Simple draw loop
const ctx = $$('#game')?.getContext('2d');
let t0 = performance.now();
function frame(t){
  const dt = (t - t0) / 1000; t0 = t;
  if (ctx){
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('KHY Modular Demo', 14, 22);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Show interact prompt briefly as a sanity check
setTimeout(()=>{ show($$('#interactPrompt'), true); setTimeout(()=>show($$('#interactPrompt'), false), 1800); }, 600);
