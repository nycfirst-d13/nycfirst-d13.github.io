// =============================================================================
// pen.js — Illustrator-style bezier pen
//   • click to add anchor (line)
//   • click + drag to add anchor with handle (curve)
//   • click first anchor (or shift/alt-click) to close path
//   • Enter / Escape to finish open path
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { svgNS, setAttrs, uid } from './utils.js';
import { computeDrawSnap, renderGuides, clearGuides, renderSnapHighlight, clearSnapHighlight } from './guides.js';

const overlay = document.getElementById('overlay');

const PEN_SNAP_THRESHOLD = 10;   // screen px
const CLOSE_SNAP_THRESHOLD = 18; // screen px — ring + magnetic snap to close path

let nodes = [];          // [{ p, hIn, hOut }]
let dragging = false;
let closeOnUp = false;
let snapCommitOnUp = false;
let penSnapPt = null;        // snapped position from guide system, or null
let penSnapToAnchor = false; // true when snapping to an existing shape's anchor
let nearClose = false;       // true when cursor is within close-snap threshold of first anchor

function reset() {
  nodes = [];
  dragging = false;
  closeOnUp = false;
  snapCommitOnUp = false;
  penSnapPt = null;
  penSnapToAnchor = false;
  nearClose = false;
  clearGuides();
  clearSnapHighlight();
  redraw();
}

// When cursor is near the first anchor, snap magnetically and set nearClose flag.
// Returns true if close-snap took over (skip applyPenSnap).
function checkCloseSnap(raw) {
  if (nodes.length < 2) { nearClose = false; return false; }
  const z = store.get().viewport.zoom;
  const threshold = CLOSE_SNAP_THRESHOLD / z;
  const first = nodes[0].p;
  if (Math.hypot(raw.x - first.x, raw.y - first.y) < threshold) {
    nearClose = true;
    penSnapPt = { ...first };
    clearGuides();
    clearSnapHighlight();
    return true;
  }
  nearClose = false;
  return false;
}

// Resolve snap for the pen cursor. Uses the guide system (computeDrawSnap) so
// midpoint markers, guide lines, and midpoints.enabled all behave consistently.
// Also checks midpoints of the current in-progress path segments.
function applyPenSnap(raw) {
  const s = store.get();
  const threshold = PEN_SNAP_THRESHOLD / s.viewport.zoom;

  // Current in-progress path midpoints (not in s.shapes, checked separately)
  if (nodes.length >= 2 && s.midpoints?.enabled) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const h1 = a.hOut || a.p, h2 = b.hIn || b.p;
      const mp = (a.hOut || b.hIn)
        ? { x: (a.p.x + 3*h1.x + 3*h2.x + b.p.x) / 8, y: (a.p.y + 3*h1.y + 3*h2.y + b.p.y) / 8 }
        : { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 };
      if (Math.hypot(raw.x - mp.x, raw.y - mp.y) < threshold) {
        penSnapPt = mp;
        penSnapToAnchor = false;
        renderGuides([{ type: 'v', pos: mp.x }, { type: 'h', pos: mp.y }], [mp]);
        clearSnapHighlight();
        return;
      }
    }
  }

  // Delegate to the shared draw-snap system (handles anchors, midpoints, axis-align)
  const { pt, guides, snapAnchor, midpointMarkers } = computeDrawSnap(raw);
  const hasEuclideanSnap = !!snapAnchor || midpointMarkers.length > 0;
  penSnapPt = hasEuclideanSnap ? pt : null;
  penSnapToAnchor = !!snapAnchor;
  renderGuides(guides, midpointMarkers);
  if (snapAnchor) renderSnapHighlight(snapAnchor); else clearSnapHighlight();
}

function buildD(nodes, closed, rubber) {
  if (!nodes.length) return '';
  const p = nodes[0].p;
  let d = `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i-1], cur = nodes[i];
    if (prev.hOut || cur.hIn) {
      const h1 = prev.hOut || prev.p;
      const h2 = cur.hIn  || cur.p;
      d += ` C ${h1.x.toFixed(2)} ${h1.y.toFixed(2)} ${h2.x.toFixed(2)} ${h2.y.toFixed(2)} ${cur.p.x.toFixed(2)} ${cur.p.y.toFixed(2)}`;
    } else {
      d += ` L ${cur.p.x.toFixed(2)} ${cur.p.y.toFixed(2)}`;
    }
  }
  if (rubber) {
    const prev = nodes[nodes.length-1];
    if (prev.hOut) {
      d += ` C ${prev.hOut.x.toFixed(2)} ${prev.hOut.y.toFixed(2)} ${rubber.x.toFixed(2)} ${rubber.y.toFixed(2)} ${rubber.x.toFixed(2)} ${rubber.y.toFixed(2)}`;
    } else {
      d += ` L ${rubber.x.toFixed(2)} ${rubber.y.toFixed(2)}`;
    }
  }
  if (closed) {
    const first = nodes[0], last = nodes[nodes.length-1];
    if (last.hOut || first.hIn) {
      const h1 = last.hOut || last.p;
      const h2 = first.hIn || first.p;
      d += ` C ${h1.x.toFixed(2)} ${h1.y.toFixed(2)} ${h2.x.toFixed(2)} ${h2.y.toFixed(2)} ${first.p.x.toFixed(2)} ${first.p.y.toFixed(2)}`;
    }
    d += ' Z';
  }
  return d;
}

function redraw(rubber, closed = false) {
  overlay.querySelectorAll('[data-pen]').forEach(n => n.remove());
  const z = store.get().viewport.zoom;
  const hs = 7 / z;

  if (nodes.length) {
    // Path preview
    const path = svgNS('path');
    const d = buildD(nodes, closed, rubber);
    setAttrs(path, { d, fill: 'none', stroke: '#1B4FE5', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' });
    path.dataset.pen = 'draft';
    overlay.appendChild(path);

    // Anchors + handles
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.hIn) drawHandle(n.p, n.hIn, hs);
      if (n.hOut) drawHandle(n.p, n.hOut, hs);
      if (nearClose && i === 0 && nodes.length >= 2) {
        const ring = svgNS('circle');
        setAttrs(ring, {
          cx: n.p.x, cy: n.p.y, r: hs * 1.6,
          fill: 'none', stroke: '#1B4FE5', 'stroke-width': 1.5,
          'vector-effect': 'non-scaling-stroke', opacity: '0.7',
        });
        ring.dataset.pen = 'close-ring';
        overlay.appendChild(ring);
      }
      const r = svgNS('rect');
      setAttrs(r, {
        x: n.p.x - hs/2, y: n.p.y - hs/2,
        width: hs, height: hs,
        class: i === 0 ? 'anchor selected' : 'anchor',
      });
      r.dataset.pen = 'anchor';
      r.dataset.idx = i;
      overlay.appendChild(r);
    }
  }
}

function drawHandle(p, h, hs) {
  const line = svgNS('line');
  setAttrs(line, { x1: p.x, y1: p.y, x2: h.x, y2: h.y, class: 'anchor-handle-line' });
  line.dataset.pen = 'handle';
  overlay.appendChild(line);
  const c = svgNS('circle');
  setAttrs(c, { cx: h.x, cy: h.y, r: hs * 0.4, class: 'anchor-handle' });
  c.dataset.pen = 'handle';
  overlay.appendChild(c);
}

const _popAudio = new Audio(new URL('../assets/sounds/pop.ogg', import.meta.url).href);

function playPop() {
  try {
    const snd = _popAudio.cloneNode();
    snd.volume = 0.6;
    snd.play();
  } catch (_) {}
}

function commit(closed) {
  if (nodes.length < 2) { reset(); return; }
  playPop();
  const d = buildD(nodes, closed, null);
  const id = uid('pa');
  const def = store.get().defaults;
  store.commit(s => {
    s.shapes.push({
      id, type: 'path', name: `Path ${s.shapes.filter(x => x.type === 'path').length + 1}`,
      attrs: { d },
      processType: 'free',
      fill: closed && def.fillEnabled ? def.fill : 'none',
      stroke: def.strokeEnabled ? def.stroke : (closed ? 'none' : def.stroke),
      strokeWidth: def.strokeWidth || 1,
      visible: true, locked: false, rotation: 0,
    });
    s.selection = [id];
  }, 'pen-commit');
  reset();
  tools.setActive('select');
}

tools.register('pen', {
  onActivate() { reset(); },
  onDeactivate() { commit(false); },
  onDown({ snap, event }) {
    // Prefer guide-snapped position over grid snap
    const pt = penSnapPt || snap;

    // Check if clicking on first anchor → close (defer to onUp to allow drag for curve)
    if (nodes.length >= 2) {
      const first = nodes[0].p;
      const z = store.get().viewport.zoom;
      const tol = 8 / z;
      if (Math.hypot(pt.x - first.x, pt.y - first.y) < tol) {
        closeOnUp = true;
        dragging = true;
        this._dragIdx = 0;
        redraw();
        return;
      }
    }
    const wasInProgress = nodes.length > 0;
    nodes.push({ p: { ...pt }, hIn: null, hOut: null });

    dragging = true;
    this._dragStart = pt;
    this._dragIdx = nodes.length - 1;

    // Snapped to another shape's anchor while path in progress → commit on mouseup
    if (wasInProgress && penSnapToAnchor) {
      snapCommitOnUp = true;
    }

    redraw();
  },
  onMove({ raw, event }) {
    if (dragging && this._dragIdx != null) {
      if (closeOnUp) {
        const first = nodes[0];
        first.hIn = { x: raw.x, y: raw.y };
        redraw(undefined, true);
      } else {
        const n = nodes[this._dragIdx];
        n.hOut = { x: raw.x, y: raw.y };
        n.hIn  = { x: 2*n.p.x - raw.x, y: 2*n.p.y - raw.y };
        redraw();
      }
    } else {
      if (!checkCloseSnap(raw)) applyPenSnap(raw);
      const rubber = penSnapPt || { x: raw.x, y: raw.y };
      if (nodes.length) redraw(rubber); else redraw();
    }
  },
  onHover({ raw }) {
    if (!checkCloseSnap(raw)) applyPenSnap(raw);
    const rubber = penSnapPt || { x: raw.x, y: raw.y };
    if (nodes.length) redraw(rubber); else redraw();
  },
  onUp({ raw, event }) {
    if (dragging && this._dragIdx != null) {
      if (closeOnUp) {
        const first = nodes[0];
        const moved = Math.hypot(raw.x - first.p.x, raw.y - first.p.y);
        if (moved < 1.5 / store.get().viewport.zoom) first.hIn = null;
        commit(true);
        return;
      }
      const n = nodes[this._dragIdx];
      const moved = Math.hypot(raw.x - n.p.x, raw.y - n.p.y);
      if (moved < 1.5 / store.get().viewport.zoom) {
        n.hOut = null; n.hIn = null;
      }
      if (snapCommitOnUp) {
        snapCommitOnUp = false;
        dragging = false;
        this._dragIdx = null;
        commit(false);
        return;
      }
    }
    dragging = false;
    this._dragIdx = null;
    nearClose = false;
    clearGuides();
    clearSnapHighlight();
    redraw();
  },
});

window.addEventListener('keydown', e => {
  if (store.get().activeTool !== 'pen') return;
  if (e.key === 'Enter')   { e.preventDefault(); commit(false); }
  if (e.key === 'Escape')  { e.preventDefault(); reset(); tools.setActive('select'); }
});
