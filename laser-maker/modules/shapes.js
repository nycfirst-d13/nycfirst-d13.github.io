// =============================================================================
// shapes.js — drag-to-create tools (rect / ellipse / line / polygon / text)
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { uid, svgNS, setAttrs } from './utils.js';
import { normalizeForProcess } from './process-registry.js';
import { artboard } from './artboard.js';

const SHAPE_DEFAULTS = () => {
  const d = store.get().defaults;
  const pt = store.get().activeProcess ?? 'free';
  const defaults = {
    processType: pt,
    fill: d.fillEnabled ? d.fill : 'none',
    stroke: d.strokeEnabled ? d.stroke : 'none',
    strokeWidth: d.strokeWidth,
    visible: true,
    locked: false,
    rotation: 0,
  };
  if (pt === 'fold' && d.foldDash) defaults.foldDash = { ...d.foldDash };
  normalizeForProcess(defaults, pt);
  return defaults;
};

const baseName = {
  rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line',
  polygon: 'Polygon', text: 'Text', path: 'Path',
};

let nameCounter = {};
function nextName(type) {
  nameCounter[type] = (nameCounter[type] || 0) + 1;
  return `${baseName[type]} ${nameCounter[type]}`;
}

function addShape(shape) {
  store.commit(s => {
    s.shapes.push(shape);
    s.selection = [shape.id];
  }, 'shape-create');
  return shape;
}

// Live update during drag — without history
function updateShape(id, mut) {
  store.patch(s => {
    const sh = s.shapes.find(x => x.id === id);
    if (sh) mut(sh);
  }, 'shape-update');
}

function finishCreate(id) {
  // If shape ended up zero-size, remove it
  const sh = store.get().shapes.find(x => x.id === id);
  if (!sh) return;
  const tiny = 1; // px
  if (sh.type === 'rect' && (sh.attrs.w < tiny || sh.attrs.h < tiny)) {
    store.patch(s => { s.shapes = s.shapes.filter(x => x.id !== id); s.selection = []; }, 'shape-remove');
    return;
  }
  if (sh.type === 'ellipse' && (sh.attrs.rx < tiny/2 || sh.attrs.ry < tiny/2)) {
    store.patch(s => { s.shapes = s.shapes.filter(x => x.id !== id); s.selection = []; }, 'shape-remove');
    return;
  }
  if (sh.type === 'line') {
    const dx = sh.attrs.x2-sh.attrs.x1, dy = sh.attrs.y2-sh.attrs.y1;
    if (Math.hypot(dx, dy) < tiny) {
      store.patch(s => { s.shapes = s.shapes.filter(x => x.id !== id); s.selection = []; }, 'shape-remove');
      return;
    }
  }
  if (sh.type === 'polygon' && sh.attrs.r < tiny/2) {
    store.patch(s => { s.shapes = s.shapes.filter(x => x.id !== id); s.selection = []; }, 'shape-remove');
    return;
  }
  // Switch to select tool with shape selected
  tools.setActive('select');
}

// -------- Rect tool --------
tools.register('rect', {
  onDown({ snap, event }) {
    const id = uid('r');
    this.startId = id;
    this.start = snap;
    this.alt = event.altKey;
    addShape({
      id, type: 'rect', name: nextName('rect'),
      attrs: { x: snap.x, y: snap.y, w: 0, h: 0, rx: 0 },
      ...SHAPE_DEFAULTS(),
    });
  },
  onMove({ snap, event }) {
    if (!this.startId) return;
    let { x: x1, y: y1 } = this.start;
    let { x: x2, y: y2 } = snap;
    let w = x2 - x1, h = y2 - y1;
    if (event.shiftKey) {
      const m = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * m;
      h = Math.sign(h || 1) * m;
    }
    let x = w < 0 ? x1 + w : x1;
    let y = h < 0 ? y1 + h : y1;
    if (event.altKey) {
      x = x1 - Math.abs(w); y = y1 - Math.abs(h);
      w = Math.abs(w) * 2; h = Math.abs(h) * 2;
    }
    updateShape(this.startId, sh => { sh.attrs.x = x; sh.attrs.y = y; sh.attrs.w = Math.abs(w); sh.attrs.h = Math.abs(h); });
  },
  onUp() {
    if (!this.startId) return;
    store.endTransaction('shape-create');
    finishCreate(this.startId);
    this.startId = null;
  },
});

// -------- Ellipse tool --------
tools.register('ellipse', {
  onDown({ snap }) {
    const id = uid('e');
    this.startId = id;
    this.start = snap;
    addShape({
      id, type: 'ellipse', name: nextName('ellipse'),
      attrs: { cx: snap.x, cy: snap.y, rx: 0, ry: 0 },
      ...SHAPE_DEFAULTS(),
    });
  },
  onMove({ snap, event }) {
    if (!this.startId) return;
    let dx = snap.x - this.start.x;
    let dy = snap.y - this.start.y;
    if (event.shiftKey) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m;
      dy = Math.sign(dy || 1) * m;
    }
    let rx, ry, cx, cy;
    if (event.altKey) {
      rx = Math.abs(dx); ry = Math.abs(dy);
      cx = this.start.x; cy = this.start.y;
    } else {
      rx = Math.abs(dx) / 2; ry = Math.abs(dy) / 2;
      cx = this.start.x + dx/2;
      cy = this.start.y + dy/2;
    }
    updateShape(this.startId, sh => { sh.attrs.cx = cx; sh.attrs.cy = cy; sh.attrs.rx = rx; sh.attrs.ry = ry; });
  },
  onUp() {
    if (!this.startId) return;
    finishCreate(this.startId);
    this.startId = null;
  },
});

// -------- Line tool --------
tools.register('line', {
  onDown({ snap }) {
    const id = uid('l');
    this.startId = id;
    this.start = snap;
    addShape({
      id, type: 'line', name: nextName('line'),
      attrs: { x1: snap.x, y1: snap.y, x2: snap.x, y2: snap.y },
      ...SHAPE_DEFAULTS(),
      fill: 'none',
      stroke: store.get().defaults.stroke,
      strokeWidth: store.get().defaults.strokeWidth || 1,
    });
  },
  onMove({ snap, event }) {
    if (!this.startId) return;
    let x = snap.x, y = snap.y;
    if (event.shiftKey) {
      const dx = x - this.start.x, dy = y - this.start.y;
      const ang = Math.atan2(dy, dx);
      const step = Math.PI / 4;
      const a = Math.round(ang / step) * step;
      const len = Math.hypot(dx, dy);
      x = this.start.x + Math.cos(a) * len;
      y = this.start.y + Math.sin(a) * len;
    }
    updateShape(this.startId, sh => { sh.attrs.x2 = x; sh.attrs.y2 = y; });
  },
  onUp() {
    if (!this.startId) return;
    finishCreate(this.startId);
    this.startId = null;
  },
});

// -------- Polygon tool --------
tools.register('polygon', {
  sides: 6,
  onDown({ snap }) {
    const id = uid('p');
    this.startId = id;
    this.start = snap;
    addShape({
      id, type: 'polygon', name: nextName('polygon'),
      attrs: { cx: snap.x, cy: snap.y, r: 0, sides: this.sides },
      ...SHAPE_DEFAULTS(),
    });
  },
  onMove({ snap }) {
    if (!this.startId) return;
    const dx = snap.x - this.start.x;
    const dy = snap.y - this.start.y;
    const r = Math.hypot(dx, dy);
    updateShape(this.startId, sh => { sh.attrs.r = r; });
  },
  onUp() {
    if (!this.startId) return;
    finishCreate(this.startId);
    this.startId = null;
  },
});

// -------- Text edit mode --------
let _textEditId   = null;
let _textEditEl   = null;
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
    if (e.key === 'Escape') { e.stopPropagation(); exitTextEdit(); }
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
    if (w < 5 || h < 5) return;
    const id = uid('t');
    addShape({
      id, type: 'text', name: nextName('text'),
      attrs: { x, y, width: w, height: h, content: '', size: 150,
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

// -------- Hand tool --------
tools.register('hand', { /* pan handled in tools.js */ });
