// =============================================================================
// toast.js — anchored action toast (shared by context-menu and keys)
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';

export function selectionBBox() {
  const sel = store.get().selection;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of sel) {
    const el = artboard.getShapeNode(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    minX = Math.min(minX, r.left);  minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
  }
  return minX === Infinity ? null : { cx: (minX + maxX) / 2, bottom: maxY };
}

export function showToast(msg, bbox) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  if (bbox) {
    t.style.left = bbox.cx + 'px';
    t.style.top  = (bbox.bottom + 10) + 'px';
    t.classList.add('anchored');
  }
  t.style.transition = '';
  t.classList.add('show');
  clearTimeout(showToast._t);
  clearTimeout(showToast._cleanup);
  showToast._t = setTimeout(() => {
    t.style.transition = 'opacity .18s ease-out, transform .18s ease-out';
    t.classList.remove('show');
    showToast._cleanup = setTimeout(() => {
      t.style.transition = '';
      t.classList.remove('anchored');
      t.style.left = '';
      t.style.top  = '';
    }, 250);
  }, 1800);
}
