// cache.js — localStorage auto-save + reset for the bed.
// Mirrors laser-maker's canvas-cache.js, adapted to the plain store.
import { state, subscribe, render } from './state.js';

const KEY = 'bed-maker-board';

// ---- Restore on load (runs at import time, before app.js wires inputs) ----
(function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.pieces)) state.pieces = saved.pieces;
    if (saved.cfg) Object.assign(state.cfg, saved.cfg);
    // Keep the user's manual piece positions — don't re-arrange.
  } catch (_) { /* corrupt cache — ignore */ }
})();

// ---- Auto-save on state change (debounced) ----
let _timer;
subscribe(() => {
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ pieces: state.pieces, cfg: state.cfg }));
    } catch (_) { /* quota exceeded (many base64 rasters) — silent */ }
  }, 800);
});

// ---- Reset board (X button in topbar) ----
document.getElementById('reset-btn').addEventListener('click', () => {
  if (!state.pieces.length || confirm('Clear the board? This removes all placed parts.')) {
    localStorage.removeItem(KEY);
    location.reload();
  }
});
