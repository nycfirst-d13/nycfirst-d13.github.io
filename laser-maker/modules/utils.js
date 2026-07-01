// =============================================================================
// utils.js — math, dom, id, formatting
// =============================================================================

export const PX_PER_INCH = 96;

export const uid = (() => {
  let n = 0;
  return (prefix = 's') => `${prefix}${(++n).toString(36)}${Math.random().toString(36).slice(2,5)}`;
})();

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round = (v, p = 2) => Math.round(v * 10**p) / 10**p;
export const inToPx = (i) => i * PX_PER_INCH;
export const pxToIn = (p) => p / PX_PER_INCH;

export function svgNS(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

export function setAttrs(el, attrs) {
  for (const k in attrs) {
    if (attrs[k] === null || attrs[k] === undefined) el.removeAttribute(k);
    else el.setAttribute(k, attrs[k]);
  }
  return el;
}

export function fmtIn(v) {
  return v.toFixed(2);
}

// rotate point (px,py) around (cx,cy) by deg
export function rotatePoint(px, py, cx, cy, deg) {
  const r = deg * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos };
}

// snap value to nearest step
export function snap(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

// Vertex points for polygon/star shapes. Was copy-pasted in
// artboard / pathops / shapebuilder; single home now. attrs: {cx,cy,r,sides}
// for polygon, {cx,cy,r,points,innerRatio} for star.
export function polygonPoints(a) {
  const n = Math.max(3, a.sides | 0);
  const pts = [], start = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const ang = start + i * 2 * Math.PI / n;
    pts.push({ x: a.cx + a.r * Math.cos(ang), y: a.cy + a.r * Math.sin(ang) });
  }
  return pts;
}

export function starPoints(a) {
  const n = Math.max(3, a.points | 0);
  const ri = a.r * (a.innerRatio ?? 0.4);
  const pts = [], start = -Math.PI / 2;
  for (let i = 0; i < n * 2; i++) {
    const ang = start + i * Math.PI / n;
    const rad = i % 2 === 0 ? a.r : ri;
    pts.push({ x: a.cx + rad * Math.cos(ang), y: a.cy + rad * Math.sin(ang) });
  }
  return pts;
}

// rotated bbox corners
export function rotatedCorners(bbox, rot) {
  const cx = bbox.x + bbox.w/2, cy = bbox.y + bbox.h/2;
  const pts = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
    { x: bbox.x, y: bbox.y + bbox.h },
  ];
  return pts.map(p => rotatePoint(p.x, p.y, cx, cy, rot));
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function deepCloneWithNewIds(sh) {
  const clone = deepClone(sh);
  clone.id = uid();
  if (clone.type === 'group' && clone.children) {
    clone.children = clone.children.map(deepCloneWithNewIds);
  }
  return clone;
}

export function parsePathAnchors(d) {
  if (!d) return [];
  const pts = [];
  const re = /([MmLlCcSsQqTtHhVvZz])([^MmLlCcSsQqTtHhVvZz]*)/g;
  let lx = 0, ly = 0, mx = 0, my = 0, m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1], abs = cmd === cmd.toUpperCase();
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (cmd.toUpperCase()) {
      case 'M': lx = abs?nums[0]:lx+nums[0]; ly = abs?nums[1]:ly+nums[1]; mx=lx; my=ly; pts.push({x:lx,y:ly}); break;
      case 'L': case 'T': lx = abs?nums[0]:lx+nums[0]; ly = abs?nums[1]:ly+nums[1]; pts.push({x:lx,y:ly}); break;
      case 'H': lx = abs?nums[0]:lx+nums[0]; pts.push({x:lx,y:ly}); break;
      case 'V': ly = abs?nums[0]:ly+nums[0]; pts.push({x:lx,y:ly}); break;
      case 'C': lx = abs?nums[4]:lx+nums[4]; ly = abs?nums[5]:ly+nums[5]; pts.push({x:lx,y:ly}); break;
      case 'Q': case 'S': lx = abs?nums[2]:lx+nums[2]; ly = abs?nums[3]:ly+nums[3]; pts.push({x:lx,y:ly}); break;
      case 'Z': lx=mx; ly=my; break;
    }
  }
  return pts;
}

export function getShapeAnchorPoints(sh) {
  switch (sh.type) {
    case 'line': return [{ x: sh.attrs.x1, y: sh.attrs.y1 }, { x: sh.attrs.x2, y: sh.attrs.y2 }];
    case 'rect': {
      const { x, y, w, h } = sh.attrs;
      return [{ x, y }, { x: x+w, y }, { x: x+w, y: y+h }, { x, y: y+h }];
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = sh.attrs;
      return [{ x: cx, y: cy - ry }, { x: cx + rx, y: cy }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy }];
    }
    case 'path':
    case 'polygon':
      return parsePathAnchors(sh.attrs.d);
  }
  return [];
}

// ---- Rect-to-path and path corner rounding utilities ----

// Scale an SVG path `d` from old bbox `ob` to new bbox `nb`. Was copy-pasted
// as scaleD (properties) / scalePathD (select); single home now.
export function scalePathD(d, ob, nb) {
  const sx = nb.w / Math.max(0.0001, ob.w);
  const sy = nb.h / Math.max(0.0001, ob.h);
  return d.replace(/([MLCSQTAHVZmlcsqtahvz])([^MLCSQTAHVZmlcsqtahvz]*)/g, (m, cmd, args) => {
    if (cmd === 'Z' || cmd === 'z') return cmd;
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const isAbs = cmd === cmd.toUpperCase();
    let scaled;
    if (cmd === 'H' || cmd === 'h') scaled = nums.map(n => isAbs ? nb.x + (n - ob.x) * sx : n * sx);
    else if (cmd === 'V' || cmd === 'v') scaled = nums.map(n => isAbs ? nb.y + (n - ob.y) * sy : n * sy);
    else scaled = nums.map((n, i) => (i % 2 === 0)
      ? (isAbs ? nb.x + (n - ob.x) * sx : n * sx)
      : (isAbs ? nb.y + (n - ob.y) * sy : n * sy));
    return cmd + ' ' + scaled.map(n => n.toFixed(3)).join(' ');
  });
}

export function rectToPathData(a) {
  const hasPC = a.r_nw || a.r_ne || a.r_se || a.r_sw;
  const half = Math.min(a.w, a.h) / 2;
  if (hasPC || (a.rx && a.rx > 0)) {
    const r = {
      nw: Math.min(Math.max(0, a.r_nw ?? a.rx ?? 0), half),
      ne: Math.min(Math.max(0, a.r_ne ?? a.rx ?? 0), half),
      se: Math.min(Math.max(0, a.r_se ?? a.rx ?? 0), half),
      sw: Math.min(Math.max(0, a.r_sw ?? a.rx ?? 0), half),
    };
    const { x, y, w, h } = a;
    let d = `M ${x + r.nw} ${y}`;
    d += ` L ${x + w - r.ne} ${y}`;
    if (r.ne > 0) d += ` A ${r.ne} ${r.ne} 0 0 1 ${x + w} ${y + r.ne}`;
    d += ` L ${x + w} ${y + h - r.se}`;
    if (r.se > 0) d += ` A ${r.se} ${r.se} 0 0 1 ${x + w - r.se} ${y + h}`;
    d += ` L ${x + r.sw} ${y + h}`;
    if (r.sw > 0) d += ` A ${r.sw} ${r.sw} 0 0 1 ${x} ${y + h - r.sw}`;
    d += ` L ${x} ${y + r.nw}`;
    if (r.nw > 0) d += ` A ${r.nw} ${r.nw} 0 0 1 ${x + r.nw} ${y}`;
    d += ' Z';
    return d;
  }
  const { x, y, w, h } = a;
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

// Parses SVG path d into straight-line subpaths.
// Returns null if any curve commands (C, Q, S, T, A) are present.
// Parse a path into subpaths handling both straight (L/H/V) and cubic-bezier (C) segments.
// Returns null if d contains S/Q/T/A commands (unsupported).
// Closed subpath: segTypes.length === nodes.length; segTypes[i] = seg from nodes[i] to nodes[(i+1)%n]
// Open subpath:   segTypes.length === nodes.length - 1; segTypes[i] = seg from nodes[i] to nodes[i+1]
function _parseMixedSubpaths(d) {
  if (/[SsQqTtAa]/.test(d)) return null;
  const subpaths = [];
  let nodes = null, segTypes = null, segCPs = null;
  let cx = 0, cy = 0, mx = 0, my = 0;
  const re = /([MmLlHhVvCcZz])([^MmLlHhVvCcZzSsQqTtAa]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1], C = cmd.toUpperCase(), rel = cmd !== C;
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (C === 'M') {
      if (nodes && nodes.length > 0) subpaths.push({ nodes, segTypes, segCPs, closed: false });
      const x = rel ? cx + nums[0] : nums[0], y = rel ? cy + nums[1] : nums[1];
      nodes = [{ x, y }]; segTypes = []; segCPs = [];
      cx = mx = x; cy = my = y;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        const lx = rel ? cx + nums[i] : nums[i], ly = rel ? cy + nums[i + 1] : nums[i + 1];
        segTypes.push('L'); segCPs.push(null); nodes.push({ x: lx, y: ly });
        cx = lx; cy = ly;
      }
    } else if (C === 'L') {
      if (!nodes) { nodes = [{ x: cx, y: cy }]; segTypes = []; segCPs = []; }
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = rel ? cx + nums[i] : nums[i], y = rel ? cy + nums[i + 1] : nums[i + 1];
        segTypes.push('L'); segCPs.push(null); nodes.push({ x, y });
        cx = x; cy = y;
      }
    } else if (C === 'H') {
      if (!nodes) { nodes = [{ x: cx, y: cy }]; segTypes = []; segCPs = []; }
      for (const v of nums) {
        const x = rel ? cx + v : v;
        segTypes.push('L'); segCPs.push(null); nodes.push({ x, y: cy });
        cx = x;
      }
    } else if (C === 'V') {
      if (!nodes) { nodes = [{ x: cx, y: cy }]; segTypes = []; segCPs = []; }
      for (const v of nums) {
        const y = rel ? cy + v : v;
        segTypes.push('L'); segCPs.push(null); nodes.push({ x: cx, y });
        cy = y;
      }
    } else if (C === 'C') {
      if (!nodes) { nodes = [{ x: cx, y: cy }]; segTypes = []; segCPs = []; }
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const x1 = rel ? cx + nums[i]     : nums[i];
        const y1 = rel ? cy + nums[i + 1] : nums[i + 1];
        const x2 = rel ? cx + nums[i + 2] : nums[i + 2];
        const y2 = rel ? cy + nums[i + 3] : nums[i + 3];
        const x  = rel ? cx + nums[i + 4] : nums[i + 4];
        const y  = rel ? cy + nums[i + 5] : nums[i + 5];
        segTypes.push('C'); segCPs.push({ cp1: { x: x1, y: y1 }, cp2: { x: x2, y: y2 } });
        nodes.push({ x, y }); cx = x; cy = y;
      }
    } else if (C === 'Z') {
      if (nodes && nodes.length > 0) {
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (nodes.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) < 0.01) {
          // Last node duplicates first (pen closes with explicit C ending at first pt)
          nodes.pop(); // closing segment is already in segTypes as the last entry
        } else {
          segTypes.push('L'); segCPs.push(null); // implicit straight close
        }
        subpaths.push({ nodes, segTypes, segCPs, closed: true });
        nodes = null; segTypes = null; segCPs = null;
        cx = mx; cy = my;
      }
    }
  }
  if (nodes && nodes.length > 0) subpaths.push({ nodes, segTypes, segCPs, closed: false });
  return subpaths;
}

function _pcFmt(n) { return n.toFixed(3); }

function _cornerSweep(prev, curr, next) {
  const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  return cross > 0 ? 1 : 0;
}

// Apply per-vertex corner radii to a path with straight and/or cubic-bezier segments.
// Only vertices where both adjacent segments are straight lines can be rounded.
// Returns original d for unsupported commands (S/Q/T/A).
export function applyPathCorners(d, corners) {
  if (!corners || !Object.keys(corners).length) return d;
  const subpaths = _parseMixedSubpaths(d);
  if (!subpaths) return d;

  let result = '';
  let gi = 0;

  for (const sp of subpaths) {
    const pts = sp.nodes, n = pts.length;
    const types = sp.segTypes, cps = sp.segCPs;
    if (n < 2) {
      result += `M ${_pcFmt(pts[0].x)} ${_pcFmt(pts[0].y)} `;
      if (sp.closed) result += 'Z ';
      gi += n; continue;
    }

    const arcs = pts.map((curr, i) => {
      const r = +(corners[gi + i] ?? corners[String(gi + i)] ?? 0);
      if (r <= 0) return null;
      if (!sp.closed && (i === 0 || i === n - 1)) return null;
      const inIdx = sp.closed ? (i - 1 + n) % n : i - 1;
      if (types[inIdx] !== 'L' || types[i] !== 'L') return null;
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
      if (dprev < 0.01 || dnext < 0.01) return null;
      const ar = Math.min(r, dprev / 2, dnext / 2);
      const e1x = (prev.x - curr.x) / dprev, e1y = (prev.y - curr.y) / dprev;
      const e2x = (next.x - curr.x) / dnext, e2y = (next.y - curr.y) / dnext;
      const sinθ = Math.abs(e1x * e2y - e1y * e2x);
      const denom = 1 + e1x * e2x + e1y * e2y;
      if (denom < 0.001) return null;
      const rArc = ar * sinθ / denom;
      return {
        r: rArc,
        start: { x: curr.x + (prev.x - curr.x) * ar / dprev, y: curr.y + (prev.y - curr.y) * ar / dprev },
        end:   { x: curr.x + (next.x - curr.x) * ar / dnext, y: curr.y + (next.y - curr.y) * ar / dnext },
        sweep: _cornerSweep(prev, curr, next),
      };
    });

    const a0 = arcs[0];
    result += `M ${_pcFmt(a0 ? a0.end.x : pts[0].x)} ${_pcFmt(a0 ? a0.end.y : pts[0].y)} `;

    const segCount = sp.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const nextI = (i + 1) % n;
      const nextArc = arcs[nextI];
      if (types[i] === 'C') {
        const cp = cps[i];
        result += `C ${_pcFmt(cp.cp1.x)} ${_pcFmt(cp.cp1.y)} ${_pcFmt(cp.cp2.x)} ${_pcFmt(cp.cp2.y)} ${_pcFmt(pts[nextI].x)} ${_pcFmt(pts[nextI].y)} `;
      } else {
        const toPt = nextArc ? nextArc.start : pts[nextI];
        result += `L ${_pcFmt(toPt.x)} ${_pcFmt(toPt.y)} `;
        if (nextArc) result += `A ${_pcFmt(nextArc.r)} ${_pcFmt(nextArc.r)} 0 0 ${nextArc.sweep} ${_pcFmt(nextArc.end.x)} ${_pcFmt(nextArc.end.y)} `;
      }
    }

    if (sp.closed) result += 'Z ';
    gi += n;
  }
  return result.trim();
}

// Compute corner bisector info for each vertex of a closed polygon (same schema as getPathCornerInfos).
// pts: array of {x, y}. Returns [{idx, x, y, bisX, bisY, maxR, sinHalf}].
export function getPolyCornerInfos(pts) {
  const n = pts.length;
  const result = [];
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
    if (dprev < 0.01 || dnext < 0.01) continue;
    const e1x = (prev.x - curr.x) / dprev, e1y = (prev.y - curr.y) / dprev;
    const e2x = (next.x - curr.x) / dnext, e2y = (next.y - curr.y) / dnext;
    const bisX = e1x + e2x, bisY = e1y + e2y;
    const bisLen = Math.hypot(bisX, bisY);
    const cosθ = e1x * e2x + e1y * e2y;
    result.push({
      idx: i,
      x: curr.x, y: curr.y,
      bisX: bisLen > 0.01 ? bisX / bisLen : e1x,
      bisY: bisLen > 0.01 ? bisY / bisLen : e1y,
      maxR: Math.min(dprev, dnext) / 2,
      sinHalf: Math.sqrt(Math.max(0, (1 - cosθ) / 2)),
    });
  }
  return result;
}

// Build a rounded closed polygon path from an array of {x,y} points.
// radii: single number (uniform) or array of numbers (one per vertex, same length as pts).
export function roundedPolygonPath(pts, radii) {
  const n = pts.length;
  if (n < 3) return '';
  const f = v => +v.toFixed(3);
  const arcs = pts.map((curr, i) => {
    const r = Array.isArray(radii) ? (radii[i] ?? 0) : (radii ?? 0);
    if (r <= 0) return null;
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
    if (dprev < 0.01 || dnext < 0.01) return null;
    const ar = Math.min(r, dprev / 2, dnext / 2);
    const e1x = (prev.x - curr.x) / dprev, e1y = (prev.y - curr.y) / dprev;
    const e2x = (next.x - curr.x) / dnext, e2y = (next.y - curr.y) / dnext;
    const sinθ = Math.abs(e1x * e2y - e1y * e2x);
    const denom = 1 + e1x * e2x + e1y * e2y;
    if (denom < 0.001) return null;
    const rArc = ar * sinθ / denom;
    return {
      r: rArc,
      start: { x: curr.x + (prev.x - curr.x) * ar / dprev, y: curr.y + (prev.y - curr.y) * ar / dprev },
      end:   { x: curr.x + (next.x - curr.x) * ar / dnext, y: curr.y + (next.y - curr.y) * ar / dnext },
      sweep: _cornerSweep(prev, curr, next),
    };
  });
  const a0 = arcs[0];
  let d = `M ${f(a0 ? a0.end.x : pts[0].x)} ${f(a0 ? a0.end.y : pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const ni = (i + 1) % n;
    const na = arcs[ni];
    const toPt = na ? na.start : pts[ni];
    d += ` L ${f(toPt.x)} ${f(toPt.y)}`;
    if (na) d += ` A ${f(na.r)} ${f(na.r)} 0 0 ${na.sweep} ${f(na.end.x)} ${f(na.end.y)}`;
  }
  return d + ' Z';
}

// Returns array of {idx, x, y, bisX, bisY, maxR} for each roundable corner in a path.
// Only vertices where both adjacent segments are straight lines are eligible.
export function getPathCornerInfos(d) {
  const subpaths = _parseMixedSubpaths(d);
  if (!subpaths) return [];
  const result = [];
  let gi = 0;
  for (const sp of subpaths) {
    const pts = sp.nodes, n = pts.length;
    const types = sp.segTypes;
    for (let i = 0; i < n; i++) {
      if (!sp.closed && (i === 0 || i === n - 1)) continue;
      const inIdx = sp.closed ? (i - 1 + n) % n : i - 1;
      if (types[inIdx] !== 'L' || types[i] !== 'L') continue;
      const curr = pts[i];
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
      if (dprev < 0.01 || dnext < 0.01) continue;
      const e1x = (prev.x - curr.x) / dprev, e1y = (prev.y - curr.y) / dprev;
      const e2x = (next.x - curr.x) / dnext, e2y = (next.y - curr.y) / dnext;
      if (Math.abs(e1x * e2y - e1y * e2x) < 0.17) continue;
      const bisX = e1x + e2x, bisY = e1y + e2y;
      const bisLen = Math.hypot(bisX, bisY);
      const cosθ = e1x * e2x + e1y * e2y;
      result.push({
        idx: gi + i, x: curr.x, y: curr.y,
        bisX: bisLen > 0.01 ? bisX / bisLen : e1x,
        bisY: bisLen > 0.01 ? bisY / bisLen : e1y,
        maxR: Math.min(dprev, dnext) / 2,
        sinHalf: Math.sqrt(Math.max(0, (1 - cosθ) / 2)),
      });
    }
    gi += n;
  }
  return result;
}

export function getSegmentMidpoints(sh) {
  if (sh.type === 'ellipse') return [];
  if ((sh.type === 'path' || sh.type === 'polygon') && sh.attrs?.d) {
    return getPathSegmentMidpoints(sh.attrs.d);
  }
  const pts = getShapeAnchorPoints(sh);
  if (pts.length < 2) return [];
  const closed = sh.type === 'rect' || /z/i.test(sh.attrs?.d || '');
  const n = pts.length;
  const mids = [];
  for (let i = 0; i < n - 1; i++) {
    mids.push({ x: (pts[i].x + pts[i+1].x) / 2, y: (pts[i].y + pts[i+1].y) / 2 });
  }
  if (closed && n > 1) {
    mids.push({ x: (pts[n-1].x + pts[0].x) / 2, y: (pts[n-1].y + pts[0].y) / 2 });
  }
  return mids;
}

// True t=0.5 midpoint for each segment in a path d string.
// Handles L (linear) and C (cubic bezier) commands.
// Canvas-based word-wrap: splits content into lines fitting maxWidth artboard px
const _wrapCtx = (() => { const c = document.createElement('canvas'); return c.getContext('2d'); })();
export function wordWrapLines(content, maxWidth, family, size, weight) {
  if (!maxWidth) return [content || ''];
  const cleanFamily = (family || 'sans-serif').split(',')[0].trim().replace(/['"]/g, '');
  _wrapCtx.font = `${weight} ${size}px ${cleanFamily}`;
  const result = [];
  for (const para of (content || '').split('\n')) {
    if (para === '') { result.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (!line || _wrapCtx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        result.push(line);
        line = word;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
}

export function getPathSegmentMidpoints(d) {
  if (!d) return [];
  const mids = [];
  const re = /([MmLlCcHhVvZz])([^MmLlCcHhVvZzSsQqTtAa]*)/g;
  let lx = 0, ly = 0, mx = 0, my = 0, m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1], abs = cmd === cmd.toUpperCase(), C = cmd.toUpperCase();
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (C === 'M') {
      lx = abs ? nums[0] : lx + nums[0]; ly = abs ? nums[1] : ly + nums[1];
      mx = lx; my = ly;
      // Additional implicit L after M
      for (let i = 2; i + 1 < nums.length; i += 2) {
        const nx = abs ? nums[i] : lx + nums[i], ny = abs ? nums[i+1] : ly + nums[i+1];
        mids.push({ x: (lx + nx) / 2, y: (ly + ny) / 2 });
        lx = nx; ly = ny;
      }
    } else if (C === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const nx = abs ? nums[i] : lx + nums[i], ny = abs ? nums[i+1] : ly + nums[i+1];
        mids.push({ x: (lx + nx) / 2, y: (ly + ny) / 2 });
        lx = nx; ly = ny;
      }
    } else if (C === 'H') {
      for (let i = 0; i < nums.length; i++) {
        const nx = abs ? nums[i] : lx + nums[i];
        mids.push({ x: (lx + nx) / 2, y: ly });
        lx = nx;
      }
    } else if (C === 'V') {
      for (let i = 0; i < nums.length; i++) {
        const ny = abs ? nums[i] : ly + nums[i];
        mids.push({ x: lx, y: (ly + ny) / 2 });
        ly = ny;
      }
    } else if (C === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const h1x = abs ? nums[i]   : lx + nums[i],   h1y = abs ? nums[i+1] : ly + nums[i+1];
        const h2x = abs ? nums[i+2] : lx + nums[i+2], h2y = abs ? nums[i+3] : ly + nums[i+3];
        const nx  = abs ? nums[i+4] : lx + nums[i+4], ny  = abs ? nums[i+5] : ly + nums[i+5];
        mids.push({ x: (lx + 3*h1x + 3*h2x + nx) / 8, y: (ly + 3*h1y + 3*h2y + ny) / 8 });
        lx = nx; ly = ny;
      }
    } else if (C === 'Z') {
      if (Math.hypot(lx - mx, ly - my) > 0.01) {
        mids.push({ x: (lx + mx) / 2, y: (ly + my) / 2 });
      }
      lx = mx; ly = my;
    }
  }
  return mids;
}
