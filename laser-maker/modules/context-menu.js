// =============================================================================
// context-menu.js — right-click copy/cut/paste menu
// =============================================================================
import { doCopy, doCut, doPaste, canPaste } from './keys.js';
import { groupSelected, ungroupSelected } from './group.js';
import { hitShape } from './select.js';
import { store } from './state.js';
import { artboard } from './artboard.js';

const _menu    = document.getElementById('ctx-menu');
const _copy    = _menu.querySelector('[data-action=copy]');
const _cut     = _menu.querySelector('[data-action=cut]');
const _paste   = _menu.querySelector('[data-action=paste]');
const _group   = _menu.querySelector('[data-action=group]');
const _ungroup = _menu.querySelector('[data-action=ungroup]');

// Platform shortcut labels
const mod = /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
_copy   .querySelector('.ctx-shortcut').textContent = mod + 'C';
_cut    .querySelector('.ctx-shortcut').textContent = mod + 'X';
_paste  .querySelector('.ctx-shortcut').textContent = mod + 'V';
_group  .querySelector('.ctx-shortcut').textContent = mod + 'G';
_ungroup.querySelector('.ctx-shortcut').textContent = mod + '⇧G';

// Compute the union screen bbox of current selection using rendered shape nodes
function _selectionBBox() {
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

function _toast(msg, bbox) {
  const t = document.getElementById('toast');
  t.textContent = msg;

  if (bbox) {
    t.style.left = bbox.cx + 'px';
    t.style.top  = (bbox.bottom + 10) + 'px';
    t.classList.add('anchored');
  }

  t.style.transition = ''; // clear any exit override so enter transition from CSS applies
  t.classList.add('show');
  clearTimeout(_toast._t);
  clearTimeout(_toast._cleanup);
  _toast._t = setTimeout(() => {
    // Set exit transition explicitly — CSS destination-state trick is unreliable
    t.style.transition = 'opacity .18s ease-out, transform .18s ease-out';
    t.classList.remove('show');
    _toast._cleanup = setTimeout(() => {
      t.style.transition = '';
      t.classList.remove('anchored');
      t.style.left = '';
      t.style.top  = '';
    }, 250);
  }, 1800);
}

function _onDocDown(e) {
  if (!_menu.contains(e.target)) _close();
}

function _onDocKey(e) {
  if (e.key === 'Escape') _close();
}

function _open(e) {
  e.preventDefault();

  // Hit-test: if cursor is over an unselected shape, select it first
  const hit = hitShape(e.clientX, e.clientY);
  if (hit) {
    const sel = store.get().selection;
    if (!sel.includes(hit)) {
      store.commit(st => { st.selection = [hit]; }, 'select');
    }
  }

  const sel    = store.get().selection;
  const shapes = store.selectedShapes();
  const hasSelection = sel.length > 0;
  const hasGroup     = shapes.some(sh => sh?.type === 'group');
  _copy   .disabled = !hasSelection;
  _cut    .disabled = !hasSelection;
  _paste  .disabled = !canPaste();
  _group  .disabled = sel.length < 2;
  _ungroup.disabled = !hasGroup;

  // Show and measure before positioning (offsetWidth needs display)
  _menu.hidden = false;
  const w = _menu.offsetWidth, h = _menu.offsetHeight;
  _menu.style.left = (e.clientX + w > innerWidth  ? e.clientX - w : e.clientX) + 'px';
  _menu.style.top  = (e.clientY + h > innerHeight ? e.clientY - h : e.clientY) + 'px';

  // Defer close listeners so this event doesn't immediately trigger them
  requestAnimationFrame(() => {
    window.addEventListener('pointerdown', _onDocDown, { capture: true });
    window.addEventListener('keydown', _onDocKey);
  });
}

function _close() {
  _menu.hidden = true;
  window.removeEventListener('pointerdown', _onDocDown, { capture: true });
  window.removeEventListener('keydown', _onDocKey);
}

_menu.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;

  if (action === 'copy') {
    const bbox = _selectionBBox();
    if (doCopy()) _toast('Copied! 📋', bbox);
  } else if (action === 'cut') {
    const bbox = _selectionBBox();
    if (doCut()) _toast('Cut! ✂️', bbox);
  } else if (action === 'paste') {
    if (doPaste()) requestAnimationFrame(() => _toast('Pasted! ✨', _selectionBBox()));
  } else if (action === 'group') {
    groupSelected();
    requestAnimationFrame(() => _toast('Grouped! 🫂', _selectionBBox()));
  } else if (action === 'ungroup') {
    ungroupSelected();
    requestAnimationFrame(() => _toast('Ungrouped! 💨', _selectionBBox()));
  }

  _close();
});

document.getElementById('canvas-area').addEventListener('contextmenu', _open);
