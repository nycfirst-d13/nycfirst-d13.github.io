// =============================================================================
// guides.js — smart guide snap computation + SVG guide line rendering
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { svgNS, setAttrs, inToPx, rotatePoint, getShapeAnchorPoints, getSegmentMidpoints } from './utils.js';

const SNAP_THRESHOLD_PX = 6;

function bboxXs(b) { return [b.x, b.x + b.w / 2, b.x + b.w]; }
function bboxYs(b) { return [b.y, b.y + b.h / 2, b.y + b.h]; }

function getRotatedMidpoints(sh) {
  const mids = getSegmentMidpoints(sh);
  const rot = sh.rotation || 0;
  if (!rot || !mids.length) return mids;
  const b = artboard.getShapeBBox(sh);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return mids.map(p => rotatePoint(p.x, p.y, cx, cy, rot));
}

function renderMidpointInGroup(container, mx, my) {
  const z = store.get().viewport.zoom;
  const hs = 8 / z;
  const grp = svgNS('g');
  const r = svgNS('rect');
  setAttrs(r, { x: mx - hs / 2, y: my - hs / 2, width: hs, height: hs, class: 'midpoint-marker' });
  const t = svgNS('text');
  setAttrs(t, { x: mx, y: my, class: 'midpoint-label', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': (hs * 0.7).toFixed(3) });
  t.textContent = 'M';
  grp.appendChild(r);
  grp.appendChild(t);
  container.appendChild(grp);
}

export function computeSnap(movingBbox, dx, dy) {
  const s = store.get();
  const z = s.viewport.zoom;
  const threshold = SNAP_THRESHOLD_PX / z;

  const mb = { x: movingBbox.x + dx, y: movingBbox.y + dy, w: movingBbox.w, h: movingBbox.h };
  const mxs = bboxXs(mb);
  const mys = bboxYs(mb);

  const artW = inToPx(s.artboard.w), artH = inToPx(s.artboard.h);
  const staticXs = [0, artW / 2, artW];
  const staticYs = [0, artH / 2, artH];
  const allMidpoints = [];
  const selSet = new Set(s.selection);

  const midpointsEnabled = s.midpoints?.enabled;
  for (const sh of s.shapes) {
    if (selSet.has(sh.id) || sh.visible === false || sh.locked) continue;
    const b = artboard.getShapeBBox(sh);
    if (!b) continue;
    staticXs.push(...bboxXs(b));
    staticYs.push(...bboxYs(b));
    if (midpointsEnabled) {
      const mids = getRotatedMidpoints(sh);
      for (const m of mids) { staticXs.push(m.x); staticYs.push(m.y); allMidpoints.push(m); }
    }
  }

  let snapToX = null, snapFromX = null, bestXDist = threshold;
  for (const mx of mxs) {
    for (const sx of staticXs) {
      const d = Math.abs(mx - sx);
      if (d < bestXDist) { bestXDist = d; snapToX = sx; snapFromX = mx; }
    }
  }

  let snapToY = null, snapFromY = null, bestYDist = threshold;
  for (const my of mys) {
    for (const sy of staticYs) {
      const d = Math.abs(my - sy);
      if (d < bestYDist) { bestYDist = d; snapToY = sy; snapFromY = my; }
    }
  }

  const adjDx = snapToX !== null ? dx + (snapToX - snapFromX) : dx;
  const adjDy = snapToY !== null ? dy + (snapToY - snapFromY) : dy;

  const guides = [];
  if (snapToX !== null) guides.push({ type: 'v', pos: snapToX });
  if (snapToY !== null) guides.push({ type: 'h', pos: snapToY });

  const midpointMarkers = allMidpoints.filter(m =>
    (snapToX !== null && Math.abs(m.x - snapToX) < threshold) ||
    (snapToY !== null && Math.abs(m.y - snapToY) < threshold)
  );

  return { dx: adjDx, dy: adjDy, guides, midpointMarkers };
}

let guideGroup = null;

function ensureGuideGroup() {
  if (!guideGroup) {
    const svg = document.getElementById('artboard');
    guideGroup = svgNS('g');
    guideGroup.id = 'smart-guides';
    svg.appendChild(guideGroup);
  }
  return guideGroup;
}

export function renderGuides(guides, midpointMarkers = []) {
  const g = ensureGuideGroup();
  g.replaceChildren();
  const s = store.get();
  const artH = inToPx(s.artboard.h), artW = inToPx(s.artboard.w);
  const sw = 1 / s.viewport.zoom;
  for (const guide of (guides || [])) {
    const line = svgNS('line');
    if (guide.type === 'v') {
      setAttrs(line, { x1: guide.pos, y1: -9999, x2: guide.pos, y2: artH + 9999, 'stroke-width': sw });
    } else {
      setAttrs(line, { x1: -9999, y1: guide.pos, x2: artW + 9999, y2: guide.pos, 'stroke-width': sw });
    }
    line.classList.add('smart-guide');
    g.appendChild(line);
  }
  for (const m of midpointMarkers) {
    renderMidpointInGroup(g, m.x, m.y);
  }
}

export function clearGuides() {
  if (guideGroup) guideGroup.replaceChildren();
}

let snapHighlightEl = null;

export function renderSnapHighlight(pt) {
  if (!snapHighlightEl) {
    const svg = document.getElementById('artboard');
    snapHighlightEl = svgNS('rect');
    svg.appendChild(snapHighlightEl);
  }
  const z = store.get().viewport.zoom;
  const hs = 7 / z;
  setAttrs(snapHighlightEl, {
    x: pt.x - hs/2, y: pt.y - hs/2,
    width: hs, height: hs,
    class: 'anchor hovered',
  });
}

export function clearSnapHighlight() {
  if (snapHighlightEl) {
    snapHighlightEl.remove();
    snapHighlightEl = null;
  }
}

// Snap a single point (e.g. cursor or anchor) to other shapes' key positions + artboard edges.
export function computePointSnap(pt, excludeIds = new Set()) {
  const s = store.get();
  const z = s.viewport.zoom;
  const threshold = SNAP_THRESHOLD_PX / z;

  const artW = inToPx(s.artboard.w), artH = inToPx(s.artboard.h);
  const staticXs = [0, artW / 2, artW];
  const staticYs = [0, artH / 2, artH];
  const allMidpoints = [];
  const midpointsEnabled = s.midpoints?.enabled;

  for (const sh of s.shapes) {
    if (excludeIds.has(sh.id) || sh.visible === false || sh.locked) continue;
    const b = artboard.getShapeBBox(sh);
    if (!b) continue;
    staticXs.push(...bboxXs(b));
    staticYs.push(...bboxYs(b));
    if (midpointsEnabled) {
      const mids = getRotatedMidpoints(sh);
      for (const m of mids) { staticXs.push(m.x); staticYs.push(m.y); allMidpoints.push(m); }
    }
  }

  let snapToX = null, bestXDist = threshold;
  for (const sx of staticXs) {
    const d = Math.abs(pt.x - sx);
    if (d < bestXDist) { bestXDist = d; snapToX = sx; }
  }

  let snapToY = null, bestYDist = threshold;
  for (const sy of staticYs) {
    const d = Math.abs(pt.y - sy);
    if (d < bestYDist) { bestYDist = d; snapToY = sy; }
  }

  const guides = [];
  if (snapToX !== null) guides.push({ type: 'v', pos: snapToX });
  if (snapToY !== null) guides.push({ type: 'h', pos: snapToY });

  const midpointMarkers = allMidpoints.filter(m =>
    (snapToX !== null && Math.abs(m.x - snapToX) < threshold) ||
    (snapToY !== null && Math.abs(m.y - snapToY) < threshold)
  );

  return {
    pt: { x: snapToX !== null ? snapToX : pt.x, y: snapToY !== null ? snapToY : pt.y },
    guides,
    midpointMarkers,
  };
}

// Snap a draw-tool cursor to actual anchor points of shapes (Euclidean),
// falling back to axis-aligned bbox snap for guide lines.
export function computeDrawSnap(raw, excludeIds = new Set()) {
  const s = store.get();
  const z = s.viewport.zoom;
  const threshold = SNAP_THRESHOLD_PX / z;

  const midpointsEnabled = s.midpoints?.enabled;
  let best = null, bestDist = threshold, isMidSnap = false;
  for (const sh of s.shapes) {
    if (excludeIds.has(sh.id) || sh.visible === false || sh.locked) continue;
    const pts = getShapeAnchorPoints(sh);
    const rot = sh.rotation || 0;
    let cx = 0, cy = 0;
    if (rot) {
      const b = artboard.getShapeBBox(sh);
      cx = b.x + b.w / 2; cy = b.y + b.h / 2;
    }
    for (const p of pts) {
      const vp = rot ? rotatePoint(p.x, p.y, cx, cy, rot) : p;
      const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
      if (d < bestDist) { bestDist = d; best = { x: vp.x, y: vp.y }; isMidSnap = false; }
    }
    if (midpointsEnabled) {
      const mids = getSegmentMidpoints(sh);
      for (const p of mids) {
        const vp = rot ? rotatePoint(p.x, p.y, cx, cy, rot) : p;
        const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
        if (d < bestDist) { bestDist = d; best = { x: vp.x, y: vp.y }; isMidSnap = true; }
      }
    }
  }

  if (best) {
    return {
      pt: best,
      guides: [{ type: 'v', pos: best.x }, { type: 'h', pos: best.y }],
      snapAnchor: isMidSnap ? null : best,
      midpointMarkers: isMidSnap ? [best] : [],
    };
  }

  const result = computePointSnap(raw, excludeIds);
  return { ...result, snapAnchor: null };
}
