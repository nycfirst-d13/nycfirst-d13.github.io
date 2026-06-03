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

export function formatHex(s) {
  if (!s) return '#000000';
  if (s === 'none') return 'none';
  return s.toUpperCase();
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

// shape bounding box (axis-aligned, ignores rotation — used for handle positions)
export function shapeBBox(s) {
  switch (s.type) {
    case 'rect':    return { x: s.attrs.x, y: s.attrs.y, w: s.attrs.w, h: s.attrs.h };
    case 'ellipse': return { x: s.attrs.cx - s.attrs.rx, y: s.attrs.cy - s.attrs.ry, w: s.attrs.rx*2, h: s.attrs.ry*2 };
    case 'line': {
      const x = Math.min(s.attrs.x1, s.attrs.x2);
      const y = Math.min(s.attrs.y1, s.attrs.y2);
      return { x, y, w: Math.abs(s.attrs.x2-s.attrs.x1), h: Math.abs(s.attrs.y2-s.attrs.y1) };
    }
    case 'polygon':
    case 'path':
    case 'text':
      // computed from rendered element
      return s._bbox || { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
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

export function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts); return () => el.removeEventListener(ev, fn, opts); }

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
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
function _parseStraightSubpaths(d) {
  if (/[CcSsQqTtAa]/.test(d)) return null;
  const subpaths = [];
  let cur = null;
  let cx = 0, cy = 0, mx = 0, my = 0;
  const re = /([MmLlHhVvZz])([^MmLlHhVvZzCcSsQqTtAa]*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const cmd = m[1], C = cmd.toUpperCase(), rel = cmd !== C;
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (C === 'M') {
      if (cur) subpaths.push(cur);
      const x = rel ? cx + nums[0] : nums[0], y = rel ? cy + nums[1] : nums[1];
      cur = { pts: [{ x, y }], closed: false };
      cx = mx = x; cy = my = y;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        const lx = rel ? cx + nums[i] : nums[i], ly = rel ? cy + nums[i + 1] : nums[i + 1];
        cur.pts.push({ x: lx, y: ly }); cx = lx; cy = ly;
      }
    } else if (C === 'L') {
      if (!cur) cur = { pts: [], closed: false };
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = rel ? cx + nums[i] : nums[i], y = rel ? cy + nums[i + 1] : nums[i + 1];
        cur.pts.push({ x, y }); cx = x; cy = y;
      }
    } else if (C === 'H') {
      if (!cur) cur = { pts: [], closed: false };
      for (const v of nums) { const x = rel ? cx + v : v; cur.pts.push({ x, y: cy }); cx = x; }
    } else if (C === 'V') {
      if (!cur) cur = { pts: [], closed: false };
      for (const v of nums) { const y = rel ? cy + v : v; cur.pts.push({ x: cx, y }); cy = y; }
    } else if (C === 'Z') {
      if (cur) { cur.closed = true; subpaths.push(cur); cur = null; }
      cx = mx; cy = my;
    }
  }
  if (cur) subpaths.push(cur);
  return subpaths;
}

function _pcFmt(n) { return n.toFixed(3); }

function _cornerSweep(prev, curr, next) {
  const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  return cross > 0 ? 1 : 0;
}

// Apply per-vertex corner radii (corners: {[vertexIdx]: radius}) to a straight-line path.
// Returns original d if the path contains curve commands.
export function applyPathCorners(d, corners) {
  if (!corners || !Object.keys(corners).length) return d;
  const subpaths = _parseStraightSubpaths(d);
  if (!subpaths) return d;

  let result = '';
  let gi = 0;

  for (const sp of subpaths) {
    const pts = sp.pts, n = pts.length;
    if (n < 2) {
      result += pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${_pcFmt(p.x)} ${_pcFmt(p.y)}`).join(' ');
      if (sp.closed) result += ' Z';
      result += ' ';
      gi += n; continue;
    }

    const arcs = pts.map((curr, i) => {
      const r = +(corners[gi + i] ?? corners[String(gi + i)] ?? 0);
      if (r <= 0 || (!sp.closed && (i === 0 || i === n - 1))) return null;
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
      if (dprev < 0.01 || dnext < 0.01) return null;
      const ar = Math.min(r, dprev / 2, dnext / 2);
      return {
        r: ar,
        start: { x: curr.x + (prev.x - curr.x) * ar / dprev, y: curr.y + (prev.y - curr.y) * ar / dprev },
        end:   { x: curr.x + (next.x - curr.x) * ar / dnext, y: curr.y + (next.y - curr.y) * ar / dnext },
        sweep: _cornerSweep(prev, curr, next),
      };
    });

    const a0 = arcs[0];
    const sp0 = a0 ? a0.end : pts[0];
    result += `M ${_pcFmt(sp0.x)} ${_pcFmt(sp0.y)} `;

    for (let i = 1; i < n; i++) {
      const ai = arcs[i];
      if (ai) {
        result += `L ${_pcFmt(ai.start.x)} ${_pcFmt(ai.start.y)} A ${_pcFmt(ai.r)} ${_pcFmt(ai.r)} 0 0 ${ai.sweep} ${_pcFmt(ai.end.x)} ${_pcFmt(ai.end.y)} `;
      } else {
        result += `L ${_pcFmt(pts[i].x)} ${_pcFmt(pts[i].y)} `;
      }
    }

    if (sp.closed) {
      if (a0) {
        result += `L ${_pcFmt(a0.start.x)} ${_pcFmt(a0.start.y)} A ${_pcFmt(a0.r)} ${_pcFmt(a0.r)} 0 0 ${a0.sweep} ${_pcFmt(a0.end.x)} ${_pcFmt(a0.end.y)} `;
      }
      result += 'Z ';
    }
    gi += n;
  }
  return result.trim();
}

// Returns array of {idx, x, y, bisX, bisY, maxR} for each roundable corner
// in a straight-line SVG path. Returns [] if path has curves.
export function getPathCornerInfos(d) {
  const subpaths = _parseStraightSubpaths(d);
  if (!subpaths) return [];
  const result = [];
  let gi = 0;
  for (const sp of subpaths) {
    const pts = sp.pts, n = pts.length;
    for (let i = 0; i < n; i++) {
      if (!sp.closed && (i === 0 || i === n - 1)) continue;
      const curr = pts[i];
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const dprev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dnext = Math.hypot(curr.x - next.x, curr.y - next.y);
      if (dprev < 0.01 || dnext < 0.01) continue;
      const e1x = (prev.x - curr.x) / dprev, e1y = (prev.y - curr.y) / dprev;
      const e2x = (next.x - curr.x) / dnext, e2y = (next.y - curr.y) / dnext;
      if (Math.abs(e1x * e2y - e1y * e2x) < 0.17) continue; // skip near-collinear
      const bisX = e1x + e2x, bisY = e1y + e2y;
      const bisLen = Math.hypot(bisX, bisY);
      result.push({
        idx: gi + i, x: curr.x, y: curr.y,
        bisX: bisLen > 0.01 ? bisX / bisLen : e1x,
        bisY: bisLen > 0.01 ? bisY / bisLen : e1y,
        maxR: Math.min(dprev, dnext) / 2,
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
