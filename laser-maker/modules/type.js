// =============================================================================
// type.js — text tool, text edit mode
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { uid, svgNS, setAttrs } from './utils.js';
import { artboard } from './artboard.js';
import { addShape, nextName, SHAPE_DEFAULTS } from './shapes.js';

// -------- Text edit mode --------
let _textEditId    = null;
let _textEditEl    = null;
let _textEditUnsub = null;

export function enterTextEdit(shapeId) {
  if (_textEditId === shapeId) { _textEditEl?.focus(); return; }
  exitTextEdit();
  const sh = store.findShape(shapeId);
  if (!sh || sh.type !== 'text') return;

  _textEditId = shapeId;
  store.patch(s => { s.textEditId = shapeId; }, 'text-edit-enter');
  store.beginTransaction();

  const canvasArea = document.getElementById('canvas-area');
  const ta = document.createElement('textarea');
  ta.className = 'text-edit-overlay';
  ta.value = sh.attrs.content || '';
  ta.spellcheck = false;
  _positionTextarea(ta, sh);

  ta.addEventListener('input', () => {
    store.patch(s => {
      const live = s.shapes.find(x => x.id === _textEditId);
      if (live) live.attrs.content = ta.value;
    }, 'text-edit');
  });

  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.stopPropagation(); exitTextEdit(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '\t' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = s + 1;
      ta.dispatchEvent(new Event('input'));
    }
  });

  canvasArea.appendChild(ta);
  _textEditEl = ta;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  _textEditUnsub = store.subscribe(() => {
    if (!_textEditId || !_textEditEl) return;
    const live = store.findShape(_textEditId);
    if (!live) {
      // Shape removed (e.g. undo) — cancel transaction so it doesn't pollute undo stack
      _cleanupEdit();
      store.cancelTransaction();
      store.patch(s => { delete s.textEditId; }, 'text-edit-exit');
      return;
    }
    _positionTextarea(_textEditEl, live);
    // Keep textarea content in sync with store (handles undo during edit)
    if (_textEditEl.value !== (live.attrs.content || '')) {
      _textEditEl.value = live.attrs.content || '';
    }
  });
}

function _positionTextarea(ta, sh) {
  const z = store.get().viewport.zoom;
  const { x: sx, y: sy } = artboard.artboardToScreen(sh.attrs.x, sh.attrs.y);
  ta.style.left       = `${sx}px`;
  ta.style.top        = `${sy}px`;
  ta.style.width      = `${(sh.attrs.width  ?? 300) * z}px`;
  ta.style.height     = `${(sh.attrs.height ?? 100) * z}px`;
  ta.style.fontSize   = `${(sh.attrs.size   ?? 16)  * z}px`;
  ta.style.fontFamily = sh.attrs.family || 'Geist, sans-serif';
  ta.style.fontWeight = String(sh.attrs.weight || 500);
  ta.style.textAlign  = sh.attrs.align || 'left';
  ta.style.lineHeight = String(sh.attrs.lineHeight || 1.2);
}

function _cleanupEdit() {
  if (_textEditEl) { _textEditEl.remove(); _textEditEl = null; }
  if (_textEditUnsub) { _textEditUnsub(); _textEditUnsub = null; }
  _textEditId = null;
}

export function exitTextEdit() {
  if (!_textEditId) return;
  _cleanupEdit();
  store.patch(s => { delete s.textEditId; }, 'text-edit-exit');
  store.endTransaction('text-edit');
}

// Exit on click outside the textarea
document.getElementById('canvas-area').addEventListener('pointerdown', e => {
  if (_textEditId && _textEditEl && !_textEditEl.contains(e.target)) exitTextEdit();
}, { capture: true });

// -------- Text tool --------
tools.register('text', {
  onDown({ snap, event }) {
    // Click on existing text → enter edit
    let el = event.target;
    while (el && el !== document.body) {
      if (el.dataset?.id) {
        const sh = store.findShape(el.dataset.id);
        if (sh?.type === 'text') {
          store.patch(st => st.selection = [sh.id], 'selection');
          enterTextEdit(sh.id);
          return;
        }
        break;
      }
      el = el.parentNode;
    }
    // Begin drag-create
    this._start = snap;
    this._preview = null;
    this._dragEnd = null;
  },
  onMove({ snap }) {
    if (!this._start) return;
    const a = this._start, b = snap;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    if (!this._preview) {
      this._preview = svgNS('rect');
      setAttrs(this._preview, { class: 'text-frame-preview', x, y, width: w, height: h });
      document.getElementById('overlay').appendChild(this._preview);
    } else {
      setAttrs(this._preview, { x, y, width: w, height: h });
    }
    this._dragEnd = snap;
  },
  onUp({ snap }) {
    if (this._preview) { this._preview.remove(); this._preview = null; }
    if (!this._start) return;
    const a = this._start, b = this._dragEnd || snap;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    this._start = null; this._dragEnd = null;
    let tx = x, ty = y, tw = w, th = h;
    if (w < 5 || h < 5) {
      // Click without drag → default-sized text box at click point
      tw = 288; th = 200;
      tx = a.x; ty = a.y;
    }
    const id = uid('t');
    addShape({
      id, type: 'text', name: nextName('text'),
      attrs: { x: tx, y: ty, width: tw, height: th, content: '', size: 100,
               family: 'Geist, sans-serif', weight: 600, align: 'left', lineHeight: 1.2 },
      ...SHAPE_DEFAULTS(),
      fill: store.get().defaults.fill || '#0F1419',
      stroke: 'none',
    });
    enterTextEdit(id);
  },
  onHover({ event }) {
    const ca = document.getElementById('canvas-area');
    let el = event.target;
    while (el && el !== document.body) {
      if (el.dataset?.id) {
        ca.style.cursor = store.findShape(el.dataset.id)?.type === 'text' ? 'text' : '';
        return;
      }
      el = el.parentNode;
    }
    ca.style.cursor = '';
  },
  onDeactivate() {
    exitTextEdit();
    if (this._preview) { this._preview.remove(); this._preview = null; }
    this._start = null;
    document.getElementById('canvas-area').style.cursor = '';
  },
});
