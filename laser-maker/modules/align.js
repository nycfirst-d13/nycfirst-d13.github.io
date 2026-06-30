// =============================================================================
// align.js — Align & Distribute panel
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { nudgeShape } from './select.js';

const PX_PER_IN = 96;

let alignTo = 'selection'; // 'selection' | 'artboard'

// ---- DOM refs ----
const panel      = document.getElementById('align-panel');
const alignToSel = document.getElementById('align-to-selection');
const alignToArt = document.getElementById('align-to-artboard');
const alignBtns  = ['align-left','align-center-h','align-right','align-top','align-center-v','align-bottom']
  .map(id => document.getElementById(id));
const distHBtn   = document.getElementById('dist-h');
const distVBtn   = document.getElementById('dist-v');

const ALIGN_TYPES = ['left', 'centerH', 'right', 'top', 'centerV', 'bottom'];

// ---- UI sync ----
function _syncUI() {
  const sel = store.selectedShapes();
  panel.style.display = sel.length >= 1 ? '' : 'none';
  if (sel.length >= 2) panel.classList.remove('collapsed');
  const alignDisabled = alignTo === 'selection' && sel.length < 2;
  alignBtns.forEach(b => { b.disabled = alignDisabled; });
  distHBtn.disabled = sel.length < 3;
  distVBtn.disabled = sel.length < 3;
  alignToSel.classList.toggle('active', alignTo === 'selection');
  alignToArt.classList.toggle('active', alignTo === 'artboard');
}

store.subscribe(_syncUI);
_syncUI();

// ---- align-to toggle ----
alignToSel.addEventListener('click', () => { alignTo = 'selection'; _syncUI(); });
alignToArt.addEventListener('click', () => { alignTo = 'artboard'; _syncUI(); });

// ---- align button handlers ----
alignBtns.forEach((btn, i) => btn.addEventListener('click', () => runAlign(ALIGN_TYPES[i])));
distHBtn.addEventListener('click', () => runDistribute('h'));
distVBtn.addEventListener('click', () => runDistribute('v'));

// ---- helpers ----
function _getRefBBox(sel) {
  if (alignTo === 'artboard') {
    const a = store.get().artboard;
    return { x: 0, y: 0, w: a.w * PX_PER_IN, h: a.h * PX_PER_IN };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sh of sel) {
    const b = artboard.getShapeBBox(sh);
    if (!b) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---- align ----
export function runAlign(type) {
  const sel = store.selectedShapes();
  if (!sel.length) return;
  if (alignTo === 'selection' && sel.length < 2) return;
  const ref = _getRefBBox(sel);
  if (!ref) return;
  // capture bboxes before mutation
  const items = sel.map(sh => ({ sh, b: artboard.getShapeBBox(sh) }));
  store.commit(() => {
    for (const { sh, b } of items) {
      if (!b) continue;
      let dx = 0, dy = 0;
      switch (type) {
        case 'left':    dx = ref.x - b.x; break;
        case 'centerH': dx = (ref.x + ref.w / 2) - (b.x + b.w / 2); break;
        case 'right':   dx = (ref.x + ref.w) - (b.x + b.w); break;
        case 'top':     dy = ref.y - b.y; break;
        case 'centerV': dy = (ref.y + ref.h / 2) - (b.y + b.h / 2); break;
        case 'bottom':  dy = (ref.y + ref.h) - (b.y + b.h); break;
      }
      nudgeShape(sh, dx, dy);
    }
  }, 'align');
}

// ---- distribute (equal spacing) ----
export function runDistribute(axis) {
  const sel = store.selectedShapes();
  if (sel.length < 3) return;
  const items = sel.map(sh => ({ sh, b: artboard.getShapeBBox(sh) })).filter(i => i.b);
  if (items.length < 3) return;
  store.commit(() => {
    const [pos, size] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
    items.sort((a, b) => a.b[pos] - b.b[pos]);
    const first = items[0].b, last = items[items.length - 1].b;
    const span = (last[pos] + last[size]) - first[pos];
    const total = items.reduce((s, i) => s + i.b[size], 0);
    const gap = (span - total) / (items.length - 1);
    let cur = first[pos];
    for (const item of items) {
      const d = cur - item.b[pos];
      nudgeShape(item.sh, axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
      cur += item.b[size] + gap;
    }
  }, 'distribute');
}
