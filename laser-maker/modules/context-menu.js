// =============================================================================
// context-menu.js — right-click copy/cut/paste/group/ungroup menu
// =============================================================================
import { doCopy, doCut, doPaste, doPasteInPlace, canPaste } from './keys.js';
import { groupSelected, ungroupSelected } from './group.js';
import { hitShape } from './select.js';
import { store } from './state.js';
import { showToast, selectionBBox } from './toast.js';

const _menu     = document.getElementById('ctx-menu');
const _copy     = _menu.querySelector('[data-action=copy]');
const _cut      = _menu.querySelector('[data-action=cut]');
const _paste    = _menu.querySelector('[data-action=paste]');
const _pasteIP  = _menu.querySelector('[data-action=paste-in-place]');
const _group    = _menu.querySelector('[data-action=group]');
const _ungroup  = _menu.querySelector('[data-action=ungroup]');

const mod = /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
_copy   .querySelector('.ctx-shortcut').textContent = mod + 'C';
_cut    .querySelector('.ctx-shortcut').textContent = mod + 'X';
_paste  .querySelector('.ctx-shortcut').textContent = mod + 'V';
_pasteIP.querySelector('.ctx-shortcut').textContent = mod + '⇧V';
_group  .querySelector('.ctx-shortcut').textContent = mod + 'G';
_ungroup.querySelector('.ctx-shortcut').textContent = mod + '⇧G';

function _onDocDown(e) {
  if (!_menu.contains(e.target)) _close();
}

function _onDocKey(e) {
  if (e.key === 'Escape') _close();
}

function _open(e) {
  e.preventDefault();

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
  _pasteIP.disabled = !canPaste();
  _group  .disabled = sel.length < 2;
  _ungroup.disabled = !hasGroup;

  _menu.hidden = false;
  const w = _menu.offsetWidth, h = _menu.offsetHeight;
  _menu.style.left = (e.clientX + w > innerWidth  ? e.clientX - w : e.clientX) + 'px';
  _menu.style.top  = (e.clientY + h > innerHeight ? e.clientY - h : e.clientY) + 'px';

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
    const bbox = selectionBBox();
    if (doCopy()) showToast('Copied! 📋', { bbox });
  } else if (action === 'cut') {
    const bbox = selectionBBox();
    if (doCut()) showToast('Cut! ✂️', { bbox });
  } else if (action === 'paste') {
    if (doPaste()) requestAnimationFrame(() => showToast('Pasted! ✨', { bbox: selectionBBox() }));
  } else if (action === 'paste-in-place') {
    if (doPasteInPlace()) requestAnimationFrame(() => showToast('Pasted in place! 📌', { bbox: selectionBBox() }));
  } else if (action === 'group') {
    groupSelected();
    requestAnimationFrame(() => showToast('Grouped! 🫂', { bbox: selectionBBox() }));
  } else if (action === 'ungroup') {
    ungroupSelected();
    requestAnimationFrame(() => showToast('Ungrouped! 💨', { bbox: selectionBBox() }));
  }

  _close();
});

document.getElementById('canvas-area').addEventListener('contextmenu', _open);
