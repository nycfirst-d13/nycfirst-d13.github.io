// =============================================================================
// canvas-cache.js — localStorage auto-save + reset
// =============================================================================
import { store } from './state.js';
import { deepClone } from './utils.js';

const KEY = 'laser-maker-canvas';

// ---- Restore on load ----
(function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    store.patch(s => {
      if (saved.shapes)   s.shapes   = saved.shapes;
      if (saved.artboard) s.artboard = saved.artboard;
    }, 'cache-restore');
    if (saved.name)    document.getElementById('header-name').value    = saved.name;
    if (saved.project) document.getElementById('header-project').value = saved.project;
    // re-fit the pi inputs width
    ['header-name', 'header-project'].forEach(id => {
      const el = document.getElementById(id);
      const chars = Math.max(el.value.length, el.placeholder.length, 16);
      el.style.width = chars + 'ch';
    });
  } catch (_) { /* corrupt cache — ignore */ }
})();

// ---- Auto-save on state change (debounced) ----
let _timer;
store.subscribe((s) => {
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    try {
      const data = {
        shapes:   deepClone(s.shapes),
        artboard: deepClone(s.artboard),
        name:     document.getElementById('header-name').value,
        project:  document.getElementById('header-project').value,
      };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (_) { /* quota exceeded (large base64 images) — silent */ }
  }, 800);
});

// Also save when the name/project inputs change
['header-name', 'header-project'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      try {
        const s = store.get();
        const data = {
          shapes:   deepClone(s.shapes),
          artboard: deepClone(s.artboard),
          name:     document.getElementById('header-name').value,
          project:  document.getElementById('header-project').value,
        };
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (_) {}
    }, 800);
  });
});

// ---- Reset button ----
document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Clear the canvas? This will erase all shapes and cannot be undone.')) return;
  localStorage.removeItem(KEY);
  location.reload();
});
