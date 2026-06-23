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

let _gen = 0;
let _timer = null;
let _cleanup = null;

function dismissToast() {
  const t = document.getElementById('toast');
  ++_gen;
  clearTimeout(_timer);
  clearTimeout(_cleanup);
  t.style.transition = 'opacity .18s ease-out, transform .18s ease-out';
  t.classList.remove('show');
  _cleanup = setTimeout(() => {
    t.style.transition = '';
    t.classList.remove('anchored');
    t.classList.remove('has-action');
    t.classList.remove('toast--success');
    t.style.left = '';
    t.style.top  = '';
  }, 250);
}

export function showToast(msg, opts) {
  const { bbox, action, success } = opts || {};
  const t = document.getElementById('toast');
  const gen = ++_gen;

  // Rebuild content: text + optional action button
  t.classList.toggle('toast--success', !!success);
  t.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismissToast();
      action.onClick();
    });
    t.appendChild(btn);
    t.classList.add('has-action');
  } else {
    t.classList.remove('has-action');
  }

  if (bbox) {
    t.style.left = bbox.cx + 'px';
    t.style.top  = (bbox.bottom + 10) + 'px';
    t.classList.add('anchored');
    const track = () => {
      if (_gen !== gen) return;
      const b = selectionBBox();
      if (b) { t.style.left = b.cx + 'px'; t.style.top = (b.bottom + 10) + 'px'; }
      requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
  } else {
    t.classList.remove('anchored');
    t.style.left = '';
    t.style.top  = '';
  }

  t.style.transition = '';
  t.classList.add('show');
  clearTimeout(_timer);
  clearTimeout(_cleanup);
  _timer = setTimeout(dismissToast, 1800);
}
