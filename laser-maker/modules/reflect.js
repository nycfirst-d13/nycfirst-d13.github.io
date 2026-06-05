// =============================================================================
// reflect.js — Reflect tool
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { svgNS, setAttrs, deepCloneWithNewIds } from './utils.js';
import { artboard } from './artboard.js';

const overlay = document.getElementById('overlay');

// ---- Math ----

function reflectPoint(px, py, ax1, ay1, ax2, ay2) {
  const dx = ax2 - ax1, dy = ay2 - ay1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return { x: px, y: py };
  const t = ((px - ax1) * dx + (py - ay1) * dy) / len2;
  return { x: 2 * (ax1 + t * dx) - px, y: 2 * (ay1 + t * dy) - py };
}

function snapToAngle45(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return p2;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return { x: p1.x + Math.cos(snapped) * len, y: p1.y + Math.sin(snapped) * len };
}

function axisAngleDeg(ax1, ay1, ax2, ay2) {
  return Math.atan2(ay2 - ay1, ax2 - ax1) * 180 / Math.PI;
}

function reflectRotation(rotation, ax1, ay1, ax2, ay2) {
  const alpha = axisAngleDeg(ax1, ay1, ax2, ay2);
  let r = (2 * alpha - (rotation || 0)) % 360;
  if (r < 0) r += 360;
  return r;
}

// Reflects all coordinates in an SVG path d string.
// Converts relative commands to absolute, reflects, outputs absolute.
// H/V become L. Arc sweep-flag is toggled.
function reflectPathD(d, ax1, ay1, ax2, ay2) {
  if (!d) return d;
  const out = [];
  const re = /([MLCSQTAHVZmlcsqtahvz])([^MLCSQTAHVZmlcsqtahvz]*)/g;
  let lx = 0, ly = 0, mx = 0, my = 0, m;

  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const C = cmd.toUpperCase();
    const rel = cmd !== C;
    const raw = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);

    if (C === 'Z') { out.push('Z'); lx = mx; ly = my; continue; }

    // Convert relative → absolute
    let abs;
    switch (C) {
      case 'M': case 'L': case 'T': case 'C': case 'S': case 'Q':
        abs = raw.map((n, i) => rel ? (i % 2 === 0 ? lx + n : ly + n) : n);
        break;
      case 'H':
        abs = raw.map(n => rel ? lx + n : n);
        break;
      case 'V':
        abs = raw.map(n => rel ? ly + n : n);
        break;
      case 'A': {
        abs = [];
        for (let i = 0; i + 6 < raw.length; i += 7) {
          abs.push(raw[i], raw[i+1], raw[i+2], raw[i+3], raw[i+4],
            rel ? lx + raw[i+5] : raw[i+5],
            rel ? ly + raw[i+6] : raw[i+6]);
        }
        break;
      }
      default: abs = raw;
    }

    // Reflect and emit
    switch (C) {
      case 'M': {
        const pts = [];
        for (let i = 0; i + 1 < abs.length; i += 2) {
          const p = reflectPoint(abs[i], abs[i+1], ax1, ay1, ax2, ay2);
          pts.push(p.x.toFixed(3), p.y.toFixed(3));
          lx = abs[i]; ly = abs[i+1];
        }
        mx = abs[0]; my = abs[1];
        out.push('M ' + pts.join(' '));
        break;
      }
      case 'L': case 'T': {
        const pts = [];
        for (let i = 0; i + 1 < abs.length; i += 2) {
          const p = reflectPoint(abs[i], abs[i+1], ax1, ay1, ax2, ay2);
          pts.push(p.x.toFixed(3), p.y.toFixed(3));
          lx = abs[i]; ly = abs[i+1];
        }
        out.push(C + ' ' + pts.join(' '));
        break;
      }
      case 'H': {
        // Becomes L since y changes after arbitrary-axis reflection
        const pts = [];
        for (const x of abs) {
          const p = reflectPoint(x, ly, ax1, ay1, ax2, ay2);
          pts.push(p.x.toFixed(3), p.y.toFixed(3));
          lx = x;
        }
        out.push('L ' + pts.join(' '));
        break;
      }
      case 'V': {
        const pts = [];
        for (const y of abs) {
          const p = reflectPoint(lx, y, ax1, ay1, ax2, ay2);
          pts.push(p.x.toFixed(3), p.y.toFixed(3));
          ly = y;
        }
        out.push('L ' + pts.join(' '));
        break;
      }
      case 'C': {
        const pts = [];
        for (let i = 0; i + 5 < abs.length; i += 6) {
          const p1 = reflectPoint(abs[i],   abs[i+1], ax1, ay1, ax2, ay2);
          const p2 = reflectPoint(abs[i+2], abs[i+3], ax1, ay1, ax2, ay2);
          const p3 = reflectPoint(abs[i+4], abs[i+5], ax1, ay1, ax2, ay2);
          pts.push(p1.x.toFixed(3), p1.y.toFixed(3),
                   p2.x.toFixed(3), p2.y.toFixed(3),
                   p3.x.toFixed(3), p3.y.toFixed(3));
          lx = abs[i+4]; ly = abs[i+5];
        }
        out.push('C ' + pts.join(' '));
        break;
      }
      case 'S': {
        const pts = [];
        for (let i = 0; i + 3 < abs.length; i += 4) {
          const p1 = reflectPoint(abs[i],   abs[i+1], ax1, ay1, ax2, ay2);
          const p2 = reflectPoint(abs[i+2], abs[i+3], ax1, ay1, ax2, ay2);
          pts.push(p1.x.toFixed(3), p1.y.toFixed(3),
                   p2.x.toFixed(3), p2.y.toFixed(3));
          lx = abs[i+2]; ly = abs[i+3];
        }
        out.push('S ' + pts.join(' '));
        break;
      }
      case 'Q': {
        const pts = [];
        for (let i = 0; i + 3 < abs.length; i += 4) {
          const p1 = reflectPoint(abs[i],   abs[i+1], ax1, ay1, ax2, ay2);
          const p2 = reflectPoint(abs[i+2], abs[i+3], ax1, ay1, ax2, ay2);
          pts.push(p1.x.toFixed(3), p1.y.toFixed(3),
                   p2.x.toFixed(3), p2.y.toFixed(3));
          lx = abs[i+2]; ly = abs[i+3];
        }
        out.push('Q ' + pts.join(' '));
        break;
      }
      case 'A': {
        const pts = [];
        for (let i = 0; i + 6 < abs.length; i += 7) {
          const p = reflectPoint(abs[i+5], abs[i+6], ax1, ay1, ax2, ay2);
          pts.push(
            abs[i].toFixed(3), abs[i+1].toFixed(3), abs[i+2].toFixed(3),
            abs[i+3], (1 - abs[i+4]),  // toggle sweep-flag
            p.x.toFixed(3), p.y.toFixed(3)
          );
          lx = abs[i+5]; ly = abs[i+6];
        }
        out.push('A ' + pts.join(' '));
        break;
      }
    }
  }

  return out.join(' ');
}

// Type-aware in-place reflection of a shape
function reflectShape(sh, ax1, ay1, ax2, ay2) {
  if (sh.type === 'group') {
    for (const child of sh.children) reflectShape(child, ax1, ay1, ax2, ay2);
    return;
  }

  const a = sh.attrs;
  sh.rotation = reflectRotation(sh.rotation, ax1, ay1, ax2, ay2);

  switch (sh.type) {
    case 'rect': {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      const nc = reflectPoint(cx, cy, ax1, ay1, ax2, ay2);
      a.x = nc.x - a.w / 2;
      a.y = nc.y - a.h / 2;
      break;
    }
    case 'ellipse': {
      const nc = reflectPoint(a.cx, a.cy, ax1, ay1, ax2, ay2);
      a.cx = nc.x; a.cy = nc.y;
      break;
    }
    case 'line': {
      const p1 = reflectPoint(a.x1, a.y1, ax1, ay1, ax2, ay2);
      const p2 = reflectPoint(a.x2, a.y2, ax1, ay1, ax2, ay2);
      a.x1 = p1.x; a.y1 = p1.y;
      a.x2 = p2.x; a.y2 = p2.y;
      break;
    }
    case 'polygon': {
      const nc = reflectPoint(a.cx, a.cy, ax1, ay1, ax2, ay2);
      a.cx = nc.x; a.cy = nc.y;
      break;
    }
    case 'path': {
      a.d = reflectPathD(a.d, ax1, ay1, ax2, ay2);
      break;
    }
    case 'text':
    case 'rawsvg': {
      const nc = reflectPoint(a.x, a.y, ax1, ay1, ax2, ay2);
      a.x = nc.x; a.y = nc.y;
      break;
    }
  }
}

// ---- Overlay ----

function _clearOverlay() {
  overlay.querySelectorAll('[data-reflect]').forEach(n => n.remove());
}

function _drawAxis(p1, p2) {
  _clearOverlay();

  // Extend visual line well past artboard edges for clarity
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ext = 10000;
  const ux = dx / len, uy = dy / len;

  const line = svgNS('line');
  setAttrs(line, {
    x1: p1.x - ux * ext, y1: p1.y - uy * ext,
    x2: p1.x + ux * ext, y2: p1.y + uy * ext,
    stroke: '#1B4FE5',
    'stroke-width': 1,
    'stroke-dasharray': '4 4',
    'vector-effect': 'non-scaling-stroke',
    'data-reflect': '1',
  });
  overlay.appendChild(line);

  // Endpoint dot at p1
  const c1 = svgNS('circle');
  setAttrs(c1, { cx: p1.x, cy: p1.y, r: 3, fill: '#1B4FE5', 'vector-effect': 'non-scaling-stroke', 'data-reflect': '1' });
  overlay.appendChild(c1);

  // Moving dot at p2
  const c2 = svgNS('circle');
  setAttrs(c2, { cx: p2.x, cy: p2.y, r: 3, fill: '#1B4FE5', 'vector-effect': 'non-scaling-stroke', 'data-reflect': '1' });
  overlay.appendChild(c2);
}

function _drawP1(p1) {
  _clearOverlay();
  const c = svgNS('circle');
  setAttrs(c, { cx: p1.x, cy: p1.y, r: 3, fill: '#1B4FE5', 'vector-effect': 'non-scaling-stroke', 'data-reflect': '1' });
  overlay.appendChild(c);
}

// ---- Store helpers ----

function _selectionBBox() {
  const shapes = store.selectedShapes();
  if (!shapes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sh of shapes) {
    const b = artboard.getShapeBBox(sh) || sh._bbox;
    if (!b) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  }
  return isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

function _applyReflect(ax1, ay1, ax2, ay2) {
  const ids = store.get().selection;
  if (!ids.length) return;
  store.commit(s => {
    for (const id of ids) {
      const sh = store.findShape(id);
      if (sh) reflectShape(sh, ax1, ay1, ax2, ay2);
    }
  }, 'reflect');
}

function _applyReflectCopy(ax1, ay1, ax2, ay2) {
  const ids = store.get().selection;
  if (!ids.length) return;
  const originals = ids.map(id => store.findShape(id)).filter(Boolean);
  const clones = originals.map(deepCloneWithNewIds);
  for (const cl of clones) reflectShape(cl, ax1, ay1, ax2, ay2);
  store.commit(s => {
    s.shapes.push(...clones);
    s.selection = clones.map(c => c.id);
  }, 'reflect-copy');
}

export function quickFlip(dir) { _quickFlip(dir); }

function _quickFlip(dir) {
  const bb = _selectionBBox();
  if (!bb) return;
  const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
  if (dir === 'h') {
    // Flip horizontal = reflect across vertical axis through center
    _applyReflect(cx, cy - 1, cx, cy + 1);
  } else {
    // Flip vertical = reflect across horizontal axis through center
    _applyReflect(cx - 1, cy, cx + 1, cy);
  }
}

// ---- Tool state ----

const state = { phase: 'idle', p1: null };

function _reset() {
  state.phase = 'idle';
  state.p1 = null;
  _clearOverlay();
}

// ---- Key handler (capture phase — intercepts before keys.js) ----

function _keyHandler(e) {
  if (store.get().activeTool !== 'reflect') return;
  if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const key = e.key.toLowerCase();
  if (key === 'h') {
    e.preventDefault(); e.stopPropagation();
    _reset();
    _quickFlip('h');
  } else if (key === 'f') {
    e.preventDefault(); e.stopPropagation();
    _reset();
    _quickFlip('v');
  } else if (key === 'escape') {
    e.preventDefault(); e.stopPropagation();
    _reset();
  }
}

window.addEventListener('keydown', _keyHandler, { capture: true });

// ---- Tool registration ----

tools.register('reflect', {
  onActivate() {
    _reset();
  },

  onDeactivate() {
    _reset();
  },

  onDown({ snap }) {
    // Only react when idle — set p1. When phase='axis', do nothing here;
    // the second onUp will handle it (keeping _activeHandler alive for onMove).
    if (state.phase === 'idle') {
      state.p1 = snap;
      state.phase = 'axis';
      _drawP1(snap);
    }
  },

  onMove({ snap, event }) {
    // During drag after first click
    if (state.phase !== 'axis') return;
    const p2 = event.shiftKey ? snapToAngle45(state.p1, snap) : snap;
    _drawAxis(state.p1, p2);
  },

  onHover({ snap, event }) {
    // Between first and second click (no button held)
    if (state.phase !== 'axis') return;
    const p2 = event.shiftKey ? snapToAngle45(state.p1, snap) : snap;
    _drawAxis(state.p1, p2);
  },

  onUp({ snap, event }) {
    if (state.phase !== 'axis') return;

    const p2 = event.shiftKey ? snapToAngle45(state.p1, snap) : snap;
    const { p1 } = state;

    // First click: p1 === p2 (no drag) — stay in axis phase waiting for second click
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-6) return;

    // Second click (or drag release) with real axis — apply reflect
    _reset();

    if (event.altKey) {
      _applyReflectCopy(p1.x, p1.y, p2.x, p2.y);
    } else {
      _applyReflect(p1.x, p1.y, p2.x, p2.y);
    }
  },
});
