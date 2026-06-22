// =============================================================================
// context-menu.js — right-click copy/cut/paste menu
// =============================================================================
import { doCopy, doCut, doPaste, canPaste } from './keys.js';
import { hitShape } from './select.js';
import { store } from './state.js';

const _menu  = document.getElementById('ctx-menu');
const _copy  = _menu.querySelector('[data-action=copy]');
const _cut   = _menu.querySelector('[data-action=cut]');
const _paste = _menu.querySelector('[data-action=paste]');

// Platform shortcut labels
const mod = /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
_copy .querySelector('.ctx-shortcut').textContent = mod + 'C';
_cut  .querySelector('.ctx-shortcut').textContent = mod + 'X';
_paste.querySelector('.ctx-shortcut').textContent = mod + 'V';

function _toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toast._t);
  _toast._t = setTimeout(() => t.classList.remove('show'), 1800);
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

  const hasSelection = store.get().selection.length > 0;
  _copy.disabled  = !hasSelection;
  _cut.disabled   = !hasSelection;
  _paste.disabled = !canPaste();

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
  if (action === 'copy'  && doCopy())  _toast('Copied! 📋');
  if (action === 'cut'   && doCut())   _toast('Cut! ✂️');
  if (action === 'paste' && doPaste()) _toast('Pasted! ✨');
  _close();
});

document.getElementById('canvas-area').addEventListener('contextmenu', _open);
