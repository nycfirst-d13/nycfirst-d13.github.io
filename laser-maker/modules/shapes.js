// =============================================================================
// shapes.js — drag-to-create tools (rect / ellipse / line / polygon / star)
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { uid } from './utils.js';
import { normalizeForProcess } from './process-registry.js';

export const SHAPE_DEFAULTS = () => {
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
  polygon: 'Polygon', star: 'Star', text: 'Text', path: 'Path',
};

export let nameCounter = {};
export function nextName(type) {
  nameCounter[type] = (nameCounter[type] || 0) + 1;
  return `${baseName[type]} ${nameCounter[type]}`;
}

export function addShape(shape) {
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
  if ((sh.type === 'polygon' || sh.type === 'star') && sh.attrs.r < tiny/2) {
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
      attrs: { cx: snap.x, cy: snap.y, r: 0, sides: this.sides, cornerRadius: 0 },
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

// -------- Star tool --------
tools.register('star', {
  points: 5,
  innerRatio: 0.4,
  onDown({ snap }) {
    const id = uid('s');
    this.startId = id;
    this.start = snap;
    addShape({
      id, type: 'star', name: nextName('star'),
      attrs: { cx: snap.x, cy: snap.y, r: 0, points: this.points, innerRatio: this.innerRatio, outerCornerR: 0, innerCornerR: 0 },
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

// -------- Hand tool --------
tools.register('hand', { /* pan handled in tools.js */ });
