// =============================================================================
// expand-svg.js — "Expand to Paths" action: converts rawsvg to native path shapes
// =============================================================================
import { store } from './state.js';
import { uid } from './utils.js';
import { showToast } from './toast.js';
import { detectProcess } from './process-registry.js';

// ---- Matrix math: [a, b, c, d, e, f]
// Transform: x' = a*x + c*y + e,  y' = b*x + d*y + f

export function mulMat(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1*a2 + c1*b2,
    b1*a2 + d1*b2,
    a1*c2 + c1*d2,
    b1*c2 + d1*d2,
    a1*e2 + c1*f2 + e1,
    b1*e2 + d1*f2 + f1,
  ];
}

function ptMat(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

function parseTfm(str) {
  if (!str) return [1, 0, 0, 1, 0, 0];
  let m = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const t = match[1];
    const n = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let tm;
    switch (t) {
      case 'matrix':    tm = [n[0], n[1], n[2], n[3], n[4], n[5]]; break;
      case 'translate': tm = [1, 0, 0, 1, n[0], n[1] ?? 0]; break;
      case 'scale':     tm = [n[0], 0, 0, n[1] ?? n[0], 0, 0]; break;
      case 'rotate': {
        const a = n[0] * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
        const cx = n[1] ?? 0, cy = n[2] ?? 0;
        tm = [cos, sin, -sin, cos, cx - cx*cos + cy*sin, cy - cx*sin - cy*cos];
        break;
      }
      case 'skewX': { const t2 = Math.tan(n[0] * Math.PI / 180); tm = [1, 0, t2, 1, 0, 0]; break; }
      case 'skewY': { const t2 = Math.tan(n[0] * Math.PI / 180); tm = [1, t2, 0, 1, 0, 0]; break; }
      default: continue;
    }
    m = mulMat(m, tm);
  }
  return m;
}

// ---- SVG dimension → px ----

const _DIM_TO_PX = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

export function parseSVGDim(val) {
  if (!val) return null;
  const m = String(val).trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/);
  if (!m) return null;
  return parseFloat(m[1]) * (_DIM_TO_PX[m[2] || 'px'] || 1);
}

// ---- Color resolution via canvas ----

const _cc = document.createElement('canvas');
_cc.width = _cc.height = 1;
const _cx = _cc.getContext('2d');

function resolveColor(v) {
  if (!v || v === 'none') return 'none';
  if (v === 'transparent') return 'none';
  if (v.startsWith('url(')) return 'none';
  if (v === 'currentColor') return '#000000';
  // Normalize hex shorthand
  const hexShort = /^#[0-9a-fA-F]{3}$/.test(v.trim());
  if (hexShort) {
    const h = v.trim().slice(1);
    return ('#' + h[0]+h[0]+h[1]+h[1]+h[2]+h[2]).toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) return v.trim().toUpperCase();
  // Use canvas to resolve CSS color names and rgb()
  _cx.fillStyle = v;
  const c = _cx.fillStyle;
  if (c.startsWith('#')) return c.toUpperCase();
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return 'none';
}

// Per-parse CSS class map — set by parseSVGToShapes, cleared after walk
let _sheet = null;

// Parse simple class rules from <style> blocks: .classname { prop: val; ... }
function parseStyleSheet(svgRoot) {
  const sheet = {};
  for (const s of svgRoot.querySelectorAll('style')) {
    const re = /\.([\w-]+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s.textContent || '')) !== null) {
      const cls = m[1];
      sheet[cls] = sheet[cls] || {};
      const declRe = /([\w-]+)\s*:\s*([^;]+)/g;
      let dm;
      while ((dm = declRe.exec(m[2])) !== null) {
        sheet[cls][dm[1].trim()] = dm[2].trim();
      }
    }
  }
  return sheet;
}

// Get property: inline style > CSS class > presentation attribute
function getAttr(el, prop) {
  const style = el.getAttribute('style') || '';
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  if (m) return m[1].trim();
  if (_sheet) {
    const classes = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    for (const cls of classes) {
      if (_sheet[cls]?.[prop] != null) return _sheet[cls][prop];
    }
  }
  return el.getAttribute(prop);
}

// ---- Shape element → path d (in element's local coordinate space) ----

function elementToD(el) {
  const tag = el.tagName.toLowerCase().replace(/[a-z]+:/, '');
  switch (tag) {
    case 'path': {
      return el.getAttribute('d');
    }
    case 'rect': {
      const x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0;
      const w = +(el.getAttribute('width') || 0), h = +(el.getAttribute('height') || 0);
      if (!w || !h) return null;
      const rxAttr = el.getAttribute('rx'), ryAttr = el.getAttribute('ry');
      let rx = rxAttr != null ? +rxAttr : (ryAttr != null ? +ryAttr : 0);
      let ry = ryAttr != null ? +ryAttr : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx && !ry) return `M${x},${y}L${x+w},${y}L${x+w},${y+h}L${x},${y+h}Z`;
      return `M${x+rx},${y}L${x+w-rx},${y}A${rx},${ry},0,0,1,${x+w},${y+ry}`
        + `L${x+w},${y+h-ry}A${rx},${ry},0,0,1,${x+w-rx},${y+h}`
        + `L${x+rx},${y+h}A${rx},${ry},0,0,1,${x},${y+h-ry}`
        + `L${x},${y+ry}A${rx},${ry},0,0,1,${x+rx},${y}Z`;
    }
    case 'circle': {
      const cx = +el.getAttribute('cx') || 0, cy = +el.getAttribute('cy') || 0;
      const r = +(el.getAttribute('r') || 0);
      if (!r) return null;
      return `M${cx+r},${cy}A${r},${r},0,1,1,${cx-r},${cy}A${r},${r},0,1,1,${cx+r},${cy}Z`;
    }
    case 'ellipse': {
      const cx = +el.getAttribute('cx') || 0, cy = +el.getAttribute('cy') || 0;
      const rx = +(el.getAttribute('rx') || 0), ry = +(el.getAttribute('ry') || 0);
      if (!rx || !ry) return null;
      return `M${cx+rx},${cy}A${rx},${ry},0,1,1,${cx-rx},${cy}A${rx},${ry},0,1,1,${cx+rx},${cy}Z`;
    }
    case 'line': {
      const x1 = +el.getAttribute('x1') || 0, y1 = +el.getAttribute('y1') || 0;
      const x2 = +el.getAttribute('x2') || 0, y2 = +el.getAttribute('y2') || 0;
      return `M${x1},${y1}L${x2},${y2}`;
    }
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]},${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]},${pts[i+1]}`;
      if (tag === 'polygon') d += 'Z';
      return d;
    }
    default: return null;
  }
}

// ---- Arc argument parser (handles flag concatenation: "0 01" = [0, 0, 1]) ----

function parseArcArgs(str) {
  const result = [];
  let i = 0;
  const s = str.trim();
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length) break;
    const pos = result.length % 7;
    if (pos === 3 || pos === 4) {
      result.push(s[i] === '1' ? 1 : 0);
      i++;
    } else {
      const start = i;
      if (s[i] === '-' || s[i] === '+') i++;
      while (i < s.length && /[0-9]/.test(s[i])) i++;
      if (i < s.length && s[i] === '.') { i++; while (i < s.length && /[0-9]/.test(s[i])) i++; }
      if (i < s.length && (s[i] === 'e' || s[i] === 'E')) {
        i++;
        if (s[i] === '+' || s[i] === '-') i++;
        while (i < s.length && /[0-9]/.test(s[i])) i++;
      }
      if (i === start) break;
      result.push(parseFloat(s.slice(start, i)));
    }
  }
  return result;
}

// ---- Apply affine matrix to path d string ----

// Proper SVG number tokenizer: handles implicit separators (8.2.4 → [8.2, 0.4],
// -6.5-2.2 → [-6.5, -2.2]) that naive split(/[\s,]+/) cannot.
function parseNums(str) {
  const nums = [];
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let m;
  while ((m = re.exec(str)) !== null) nums.push(+m[0]);
  return nums;
}

function num(n) {
  return parseFloat(n.toFixed(3)).toString();
}

export function applyMatrixToD(d, m) {
  if (!d) return null;
  const [a, b, c, dd, e, f] = m;
  if (a === 1 && b === 0 && c === 0 && dd === 1 && e === 0 && f === 0) return d;

  const P = (x, y) => ptMat(m, x, y);
  // Approximate scale factors for arc radii
  const sx = Math.sqrt(a*a + b*b);
  const sy = Math.sqrt(c*c + dd*dd);
  const xrot = Math.atan2(b, a) * 180 / Math.PI;

  let cx = 0, cy = 0, mx = 0, my = 0;
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;

  while ((match = re.exec(d)) !== null) {
    const cmd = match[1];
    const C = cmd.toUpperCase();
    const rel = cmd !== C;
    const ns = C === 'A' ? parseArcArgs(match[2]) : parseNums(match[2]);

    switch (C) {
      case 'M': {
        for (let i = 0; i + 1 < ns.length; i += 2) {
          const ax = rel ? cx + ns[i] : ns[i], ay = rel ? cy + ns[i+1] : ns[i+1];
          const [px, py] = P(ax, ay);
          out.push(i === 0 ? `M${num(px)},${num(py)}` : `L${num(px)},${num(py)}`);
          cx = ax; cy = ay;
          if (i === 0) { mx = ax; my = ay; }
        }
        break;
      }
      case 'L': {
        for (let i = 0; i + 1 < ns.length; i += 2) {
          const ax = rel ? cx + ns[i] : ns[i], ay = rel ? cy + ns[i+1] : ns[i+1];
          const [px, py] = P(ax, ay);
          out.push(`L${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'H': {
        for (const v of ns) {
          const ax = rel ? cx + v : v;
          const [px, py] = P(ax, cy);
          out.push(`L${num(px)},${num(py)}`);
          cx = ax;
        }
        break;
      }
      case 'V': {
        for (const v of ns) {
          const ay = rel ? cy + v : v;
          const [px, py] = P(cx, ay);
          out.push(`L${num(px)},${num(py)}`);
          cy = ay;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i + 5 < ns.length; i += 6) {
          const ax1 = rel?cx+ns[i]:ns[i], ay1 = rel?cy+ns[i+1]:ns[i+1];
          const ax2 = rel?cx+ns[i+2]:ns[i+2], ay2 = rel?cy+ns[i+3]:ns[i+3];
          const ax = rel?cx+ns[i+4]:ns[i+4], ay = rel?cy+ns[i+5]:ns[i+5];
          const [px1,py1] = P(ax1,ay1), [px2,py2] = P(ax2,ay2), [px,py] = P(ax,ay);
          out.push(`C${num(px1)},${num(py1)},${num(px2)},${num(py2)},${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'S': {
        for (let i = 0; i + 3 < ns.length; i += 4) {
          const ax2 = rel?cx+ns[i]:ns[i], ay2 = rel?cy+ns[i+1]:ns[i+1];
          const ax = rel?cx+ns[i+2]:ns[i+2], ay = rel?cy+ns[i+3]:ns[i+3];
          const [px2,py2] = P(ax2,ay2), [px,py] = P(ax,ay);
          out.push(`S${num(px2)},${num(py2)},${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i + 3 < ns.length; i += 4) {
          const ax1 = rel?cx+ns[i]:ns[i], ay1 = rel?cy+ns[i+1]:ns[i+1];
          const ax = rel?cx+ns[i+2]:ns[i+2], ay = rel?cy+ns[i+3]:ns[i+3];
          const [px1,py1] = P(ax1,ay1), [px,py] = P(ax,ay);
          out.push(`Q${num(px1)},${num(py1)},${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'T': {
        for (let i = 0; i + 1 < ns.length; i += 2) {
          const ax = rel?cx+ns[i]:ns[i], ay = rel?cy+ns[i+1]:ns[i+1];
          const [px,py] = P(ax,ay);
          out.push(`T${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'A': {
        for (let i = 0; i + 6 < ns.length; i += 7) {
          const rx = ns[i] * sx, ry = ns[i+1] * sy;
          const newXRot = ns[i+2] + xrot;
          const laf = ns[i+3], sf = ns[i+4];
          const ax = rel?cx+ns[i+5]:ns[i+5], ay = rel?cy+ns[i+6]:ns[i+6];
          const [px, py] = P(ax, ay);
          out.push(`A${num(rx)},${num(ry)},${num(newXRot)},${laf},${sf},${num(px)},${num(py)}`);
          cx = ax; cy = ay;
        }
        break;
      }
      case 'Z': {
        out.push('Z');
        cx = mx; cy = my;
        break;
      }
    }
  }

  return out.join(' ') || null;
}

// ---- Compute viewBox transform for nested <svg> elements ----

function viewBoxTransform(el) {
  const vb = el.getAttribute('viewBox');
  if (!vb) return null;
  const parts = vb.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4) return null;
  const [vx, vy, vw, vh] = parts;
  if (!vw || !vh) return null;
  // ponytail: no width/height = Illustrator pt units (72/in); multiply by 96/72 to get px
  const pw = parseSVGDim(el.getAttribute('width')) ?? vw * (96 / 72);
  const ph = parseSVGDim(el.getAttribute('height')) ?? vh * (96 / 72);
  if (!pw || !ph) return null;
  const sx = pw / vw, sy = ph / vh;
  return [sx, 0, 0, sy, -vx * sx, -vy * sy];
}

// ---- Text element reconstruction ----

const ANCHOR_TO_ALIGN = { start: 'left', middle: 'center', end: 'right' };

function parseTextElement(el, curMat, inh) {
  const family    = el.getAttribute('font-family') || inh.family || 'Geist, sans-serif';
  const size      = parseFloat(el.getAttribute('font-size') || '16') || 16;
  const weight    = parseInt(el.getAttribute('font-weight') || '400') || 400;
  const anchor    = el.getAttribute('text-anchor') || 'start';
  const align     = ANCHOR_TO_ALIGN[anchor] || 'left';

  const fillAttr   = getAttr(el, 'fill');
  const strokeAttr = getAttr(el, 'stroke');
  const swAttr     = getAttr(el, 'stroke-width');
  const fill   = (!fillAttr   || fillAttr   === 'inherit') ? inh.fill   : fillAttr;
  const stroke = (!strokeAttr || strokeAttr === 'inherit') ? inh.stroke : strokeAttr;
  const sw     = (!swAttr     || swAttr     === 'inherit') ? inh.sw     : parseFloat(swAttr) || 1;

  const tspans = Array.from(el.querySelectorAll('tspan'));
  const posEl  = tspans.length > 0 ? tspans[0] : el;
  const rawX   = parseFloat(posEl.getAttribute('x') || el.getAttribute('x') || '0') || 0;
  const rawY   = parseFloat(posEl.getAttribute('y') || el.getAttribute('y') || '0') || 0;

  const [ax, ay] = ptMat(curMat, rawX, rawY);

  const content = tspans.length > 0
    ? tspans.map(ts => ts.textContent || '').join('\n')
    : (el.textContent || '');

  // Line height from dy on second tspan (e.g. dy="1.2em")
  let lineHeight = 1.2;
  if (tspans.length > 1) {
    const dy = tspans[1].getAttribute('dy') || '';
    const m  = dy.match(/([\d.]+)em/);
    if (m) lineHeight = parseFloat(m[1]);
  }

  // Scale font size if matrix has a uniform scale component
  const matScale = Math.sqrt(curMat[0]*curMat[0] + curMat[1]*curMat[1]);
  const scaledSize = Math.round(size * (matScale || 1));

  return {
    _shapeType: 'text',
    name: 'Text',
    attrs: { x: ax, y: ay, content, family, size: scaledSize, weight, align, lineHeight },
    fill:        resolveColor(fill),
    stroke:      resolveColor(stroke),
    strokeWidth: sw,
    visible: true, locked: false, rotation: 0,
  };
}

// ---- Walk element tree, accumulate transforms, collect shapes ----

const SKIP_TAGS = new Set([
  'defs', 'symbol', 'marker', 'clippath', 'mask', 'filter',
  'lineargradient', 'radialgradient', 'pattern',
  'metadata', 'script', 'style', 'title', 'desc', 'use',
]);
const CONTAINER_TAGS = new Set(['g', 'svg', 'a', 'switch']);
const SHAPE_TAGS     = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

function walk(nodes, m, inh, results, skipped) {
  for (const el of nodes) {
    if (el.nodeType !== 1) continue;
    const tag = (el.tagName || '').toLowerCase().replace(/[a-z]+:/, '');
    if (SKIP_TAGS.has(tag)) {
      // Track if this skip tag has meaningful child content
      if (skipped && Array.from(el.childNodes).some(n => n.nodeType === 1)) {
        skipped.push(tag);
      }
      continue;
    }
    if (tag === 'tspan') continue; // handled inside parseTextElement
    if (getAttr(el, 'display') === 'none') continue;
    if (getAttr(el, 'visibility') === 'hidden') continue;

    const elMat = parseTfm(el.getAttribute('transform') || '');
    const curMat = mulMat(m, elMat);
    // Primary process channel written by our own export; null for foreign SVGs.
    const dataProc = el.getAttribute('data-lm-process');

    const fillVal   = getAttr(el, 'fill');
    const strokeVal = getAttr(el, 'stroke');
    const swVal     = getAttr(el, 'stroke-width');
    const fill   = (!fillVal   || fillVal   === 'inherit') ? inh.fill   : fillVal;
    const stroke = (!strokeVal || strokeVal === 'inherit') ? inh.stroke : strokeVal;
    const sw     = (!swVal     || swVal     === 'inherit') ? inh.sw     : parseFloat(swVal) || 1;

    const childInh = { fill, stroke, sw };

    if (CONTAINER_TAGS.has(tag)) {
      let childMat = curMat;
      if (tag === 'svg') {
        const vbMat = viewBoxTransform(el);
        if (vbMat) childMat = mulMat(curMat, vbMat);
      }
      walk(el.childNodes, childMat, childInh, results, skipped);
    } else if (tag === 'text') {
      const textShape = parseTextElement(el, curMat, childInh);
      if (textShape) {
        textShape._process = dataProc || detectProcess(textShape);
        results.push(textShape);
      }
    } else if (tag === 'image') {
      // Round-trip our own base64 <image> exports back to editable image shapes.
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      const w = +(el.getAttribute('width') || 0), h = +(el.getAttribute('height') || 0);
      if (!href || !w || !h) continue;
      const x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0;
      // Decompose curMat: scale from column norms, rotation from atan2, and keep
      // x/y/w/h UNROTATED — our export applies rotation as rotate(θ, cx, cy) about
      // the shape center, which the render re-applies about center too. The center
      // is the rotation's fixed point, so transforming it recovers the true center.
      // ponytail: approximate for skewed matrices from foreign SVGs; exact for ours.
      const sx = Math.hypot(curMat[0], curMat[1]) || 1;
      const sy = Math.hypot(curMat[2], curMat[3]) || 1;
      const rot = Math.atan2(curMat[1], curMat[0]) * 180 / Math.PI;
      const w2 = w * sx, h2 = h * sy;
      const [ccx, ccy] = ptMat(curMat, x + w / 2, y + h / 2);
      results.push({
        _shapeType: 'image',
        _process: dataProc || 'free', // color detection is meaningless for rasters
        attrs: { x: ccx - w2 / 2, y: ccy - h2 / 2, w: w2, h: h2, href },
        fill: 'none', stroke: 'none', strokeWidth: 1,
        rotation: rot, visible: true, locked: false,
      });
    } else if (SHAPE_TAGS.has(tag)) {
      const d = elementToD(el);
      if (!d) continue;
      const td = applyMatrixToD(d, curMat);
      if (!td) continue;
      const rFill = resolveColor(fill);
      const rStroke = resolveColor(stroke);
      results.push({
        _shapeType: 'path',
        _process: dataProc || detectProcess({ fill: rFill, stroke: rStroke, strokeWidth: sw }),
        fill: rFill,
        stroke: rStroke,
        strokeWidth: sw,
        d: td,
      });
    }
  }
}

// ---- Public API: parse SVG element to shape specs ----

export function parseSVGToShapes(rootSvgEl, initMat) {
  _sheet = parseStyleSheet(rootSvgEl);
  const vbMat = viewBoxTransform(rootSvgEl);
  const startMat = vbMat ? mulMat(initMat, vbMat) : initMat;
  const skipped = [];
  const extracted = [];
  walk(rootSvgEl.childNodes, startMat, { fill: 'black', stroke: 'none', sw: 1 }, extracted, skipped);
  _sheet = null;
  return { shapes: extracted, hadUnsupported: skipped.length > 0 };
}

// ---- Main export ----

export function expandSVG(id) {
  const sh = store.findShape(id);
  if (!sh || sh.type !== 'rawsvg') return;

  let initMat = [1, 0, 0, 1, sh.attrs.x || 0, sh.attrs.y || 0];
  if (sh.rotation && sh._bbox) {
    const { x: bx, y: by, w: bw, h: bh } = sh._bbox;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const a = sh.rotation * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const rotMat = [cos, sin, -sin, cos, cx - cx*cos + cy*sin, cy - cx*sin - cy*cos];
    initMat = mulMat(rotMat, initMat);
  }

  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${sh.attrs.markup}</svg>`,
    'image/svg+xml',
  );
  if (doc.querySelector('parsererror')) {
    showToast('Invalid SVG markup'); return;
  }

  // hadUnsupported is intentionally unused here — Expand to Paths has no
  // unsupported-element toast by design; see importSVG for the import path behavior
  const { shapes: extracted } = parseSVGToShapes(doc.documentElement, initMat);

  if (!extracted.length) {
    showToast('No paths found in SVG'); return;
  }

  store.commit(st => {
    const idx = st.shapes.findIndex(s => s.id === id);
    if (idx < 0) return;

    let pathCount = 0, textCount = 0;
    const newShapes = extracted.map(p => {
      const base = { fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth,
                     processType: p._process || 'free',
                     visible: true, locked: false, rotation: p.rotation || 0 };
      if (p._shapeType === 'text') {
        return { id: uid('xt'), type: 'text', name: p.name || `Text ${++textCount}`,
                 attrs: p.attrs, ...base };
      }
      if (p._shapeType === 'image') {
        return { id: uid('img'), type: 'image', name: 'Image', attrs: p.attrs, ...base };
      }
      return { id: uid('xp'), type: 'path', name: `Path ${++pathCount}`,
               attrs: { d: p.d }, ...base };
    });

    const replacement = newShapes.length === 1
      ? { ...newShapes[0], name: sh.name }
      : {
          id: uid('xg'),
          type: 'group',
          name: sh.name,
          children: newShapes,
          visible: true,
          locked: false,
          rotation: 0,
        };

    st.shapes.splice(idx, 1, replacement);
    st.selection = [replacement.id];
  }, 'expand-svg');

  showToast(`Expanded to ${extracted.length} shape${extracted.length > 1 ? 's' : ''}`);
}

// ---- UI panel ----

const _panel = document.getElementById('expand-svg-panel');
const _btn   = document.getElementById('expand-svg-btn');

store.subscribe(() => {
  const s = store.get();
  const sel = s.selection.map(id => store.findShape(id)).filter(Boolean);
  _panel.style.display = (sel.length === 1 && sel[0].type === 'rawsvg') ? '' : 'none';
});

_btn.addEventListener('click', () => {
  const id = store.get().selection[0];
  if (id) expandSVG(id);
});

