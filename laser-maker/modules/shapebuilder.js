// =============================================================================
// shapebuilder.js — Shape Builder: hover/drag regions to merge shapes
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { svgNS, setAttrs, uid, rectToPathData, applyPathCorners } from './utils.js';

let _ready = false;
let _sbOverlay = null;
let _dragging = false;
let _touched = new Set(); // shape IDs accumulated during drag

// ---- Paper.js helpers ----

function ensurePaper() {
  if (_ready) return true;
  if (typeof paper === 'undefined') return false;
  if (!paper.project) paper.setup(new paper.Size(1, 1));
  _ready = true;
  return true;
}

function _polyPts(a) {
  const pts = [], start = -Math.PI / 2;
  for (let i = 0; i < a.sides; i++) {
    const ang = start + i * 2 * Math.PI / a.sides;
    pts.push({ x: a.cx + a.r * Math.cos(ang), y: a.cy + a.r * Math.sin(ang) });
  }
  return pts;
}

function toPaper(sh) {
  const a = sh.attrs;
  let p;
  switch (sh.type) {
    case 'rect':    p = new paper.Path(rectToPathData(a)); break;
    case 'ellipse': p = new paper.Path.Ellipse({ center: [a.cx, a.cy], radius: [a.rx, a.ry] }); break;
    case 'polygon': {
      const pts = _polyPts(a);
      p = new paper.Path({ segments: pts.map(pt => [pt.x, pt.y]), closed: true });
      break;
    }
    case 'path':    p = new paper.CompoundPath(a.corners ? applyPathCorners(a.d, a.corners) : a.d); break;
    default:        return null;
  }
  if (sh.rotation) {
    const b = artboard.getShapeBBox(sh);
    p.rotate(sh.rotation, new paper.Point(b.x + b.w / 2, b.y + b.h / 2));
  }
  return p;
}

function isOpenPaper(pp) {
  if (pp instanceof paper.CompoundPath) return pp.children.some(c => !c.closed);
  return !pp.closed;
}

// Returns a clone with all subpaths closed (endpoints connected by straight line)
function closedClone(pp) {
  const clone = pp.clone();
  if (clone instanceof paper.CompoundPath) {
    clone.children.forEach(c => { c.closed = true; });
  } else {
    clone.closed = true;
  }
  return clone;
}

// All paper objects are created & removed inside this function.
// Returns { shapeIds, pathData, isIntersection, hasOpenPath } | null
function regionAt(x, y) {
  if (!ensurePaper()) return null;
  const { shapes, viewport } = store.get();
  const pt = new paper.Point(x, y);
  // ~8 screen pixels in SVG space
  const hitRadius = 8 / (viewport.zoom || 1);
  const hits = [];

  for (const sh of shapes) {
    if (sh.visible === false || sh.locked || sh.type === 'line' || sh.type === 'text') continue;
    const pp = toPaper(sh);
    if (!pp) continue;
    let hit;
    if (isOpenPaper(pp)) {
      const nearest = pp.getNearestPoint(pt);
      hit = nearest && pt.getDistance(nearest) <= hitRadius;
    } else {
      hit = pp.contains(pt);
    }
    pp.remove();
    if (hit) hits.push(sh);
  }

  if (!hits.length) return null;

  const anyOpen = hits.some(sh => {
    const pp = toPaper(sh);
    const open = isOpenPaper(pp);
    pp.remove();
    return open;
  });

  if (hits.length === 1) {
    const pp = toPaper(hits[0]);
    // For open paths, preview the closed implicit region
    const preview = anyOpen ? closedClone(pp) : pp;
    const pathData = preview?.pathData ?? null;
    if (anyOpen) { preview?.remove(); pp?.remove(); } else { pp?.remove(); }
    return { shapeIds: [hits[0].id], pathData, isIntersection: false, hasOpenPath: anyOpen };
  }

  // Multiple shapes — for preview, close any open paths before intersecting
  const pps = hits.map(sh => {
    const pp = toPaper(sh);
    if (!pp) return null;
    if (isOpenPaper(pp)) { const c = closedClone(pp); pp.remove(); return c; }
    return pp;
  }).filter(Boolean);

  let acc = pps[0];
  for (let i = 1; i < pps.length; i++) {
    const next = acc.intersect(pps[i]);
    acc.remove(); pps[i].remove();
    acc = next;
  }
  const pathData = acc?.pathData || null;
  acc?.remove();

  if (!pathData) {
    const top = hits[hits.length - 1];
    const pp = toPaper(top);
    const preview = isOpenPaper(pp) ? closedClone(pp) : pp;
    const pd = preview?.pathData ?? null;
    if (isOpenPaper(pp)) { preview?.remove(); pp?.remove(); } else { pp?.remove(); }
    return { shapeIds: [top.id], pathData: pd, isIntersection: false, hasOpenPath: anyOpen };
  }

  return { shapeIds: hits.map(s => s.id), pathData, isIntersection: true, hasOpenPath: anyOpen };
}

// ---- SVG overlay ----

function sbOverlay() {
  if (_sbOverlay) return _sbOverlay;
  _sbOverlay = svgNS('g');
  _sbOverlay.id = 'sb-overlay';
  document.getElementById('artboard').appendChild(_sbOverlay);
  return _sbOverlay;
}

function clearOverlay() {
  const o = sbOverlay();
  while (o.firstChild) o.removeChild(o.firstChild);
}

function showRegion(region, variant) {
  if (!region?.pathData) return;
  const isDrag = variant === 'drag';
  const attrs = {
    d: region.pathData,
    fill:   isDrag ? 'rgba(37,99,235,0.18)'  : 'rgba(140,140,140,0.26)',
    stroke: isDrag ? 'rgba(37,99,235,0.80)'  : (region.isIntersection ? 'rgba(37,99,235,0.48)' : 'rgba(80,80,80,0.38)'),
    'stroke-width': isDrag ? 1.5 : 1,
    'vector-effect': 'non-scaling-stroke',
    'pointer-events': 'none',
  };
  // Dashed implied edge for regions that include open paths
  if (region.hasOpenPath && !isDrag) attrs['stroke-dasharray'] = '4 3';
  const el = svgNS('path');
  setAttrs(el, attrs);
  sbOverlay().appendChild(el);
}

// During drag, show all accumulated shapes with blue tint
function renderDragState() {
  clearOverlay();
  for (const id of _touched) {
    const node = artboard.getShapeNode(id);
    const el = node?.children[1]; // actual shape element (children[0]=catcher, [1]=shape, [2]=hover-hl)
    if (!el) continue;
    const clone = el.cloneNode(true);
    setAttrs(clone, {
      fill:   'rgba(37,99,235,0.18)',
      stroke: 'rgba(37,99,235,0.78)',
      'stroke-width': 1.5,
      'vector-effect': 'non-scaling-stroke',
      'pointer-events': 'none',
    });
    sbOverlay().appendChild(clone);
  }
}

// ---- Merge ----

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1600);
}

function mergeShapes(ids) {
  if (!ensurePaper()) return;
  const { shapes } = store.get();
  const sel = [...ids].map(id => shapes.find(s => s.id === id)).filter(Boolean);
  if (!sel.length) return;

  if (sel.length === 1) {
    store.commit(st => { st.selection = [sel[0].id]; }, 'sb-select');
    return;
  }

  const pps = sel.map(sh => {
    const pp = toPaper(sh);
    if (!pp) return null;
    if (isOpenPaper(pp)) { const c = closedClone(pp); pp.remove(); return c; }
    return pp;
  }).filter(Boolean);
  if (pps.length < 2) { pps.forEach(p => p.remove()); return; }

  let result;
  try {
    result = pps.reduce((acc, p) => acc.unite(p));
  } catch (e) {
    pps.forEach(p => p.remove());
    console.error('Shape builder merge failed', e);
    return;
  }

  const d = result?.pathData;
  pps.forEach(p => p.remove());
  result?.remove();
  if (!d) return;

  // Inherit appearance from topmost (highest z-order) shape
  const topmost = sel.reduce((best, sh) => {
    const idx = shapes.indexOf(sh);
    return idx > best.idx ? { idx, sh } : best;
  }, { idx: -1, sh: sel[0] }).sh;

  const newId = uid('sb');
  store.commit(st => {
    st.shapes = st.shapes.filter(sh => !ids.has(sh.id));
    st.shapes.push({
      id: newId, type: 'path',
      name: `Shape ${st.shapes.length + 1}`,
      attrs: { d },
      fill: topmost.fill, stroke: topmost.stroke, strokeWidth: topmost.strokeWidth,
      visible: true, locked: false, rotation: 0,
    });
    st.selection = [newId];
  }, 'shapebuilder');
}

// ---- Tool registration ----

tools.register('shapebuilder', {
  onActivate()   { _dragging = false; _touched = new Set(); clearOverlay(); },
  onDeactivate() { _dragging = false; _touched = new Set(); clearOverlay(); },

  onHover({ raw }) {
    const r = regionAt(raw.x, raw.y);
    clearOverlay();
    if (r) showRegion(r, 'hover');
  },

  onDown({ raw }) {
    _dragging = true;
    _touched = new Set();
    const r = regionAt(raw.x, raw.y);
    if (r) r.shapeIds.forEach(id => _touched.add(id));
    renderDragState();
  },

  onMove({ raw }) {
    if (!_dragging) return;
    const r = regionAt(raw.x, raw.y);
    if (r) {
      let changed = false;
      r.shapeIds.forEach(id => { if (!_touched.has(id)) { _touched.add(id); changed = true; } });
      if (changed) renderDragState();
    }
  },

  onUp({ raw }) {
    _dragging = false;
    clearOverlay();
    if (_touched.size) mergeShapes(_touched);
    _touched = new Set();
    // Restore hover highlight after merge re-renders shapes
    requestAnimationFrame(() => {
      const r = regionAt(raw.x, raw.y);
      if (r) showRegion(r, 'hover');
    });
  },
});
