// =============================================================================
// export.js — clean SVG export sized in inches
// =============================================================================
import { uploadToDrive } from './drive-upload.js';
import { store } from './state.js';
import { artboard } from './artboard.js';
import { inToPx, applyPathCorners, wordWrapLines, roundedPolygonPath } from './utils.js';
import { fetchFontBuffer, fontkit } from './text-panel.js';
import { resolveAppearance } from './process-registry.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}

// Convert a text shape to a single SVG path d string using fontkit.
// Returns null if conversion fails (caller falls back to <text> element).
async function textShapeToPathD(sh) {
  const a = sh.attrs;
  const family = a.family || 'Geist';
  const weight = a.weight || 400;
  const size   = a.size   || 16;
  const lh     = a.lineHeight || 1.2;
  const align  = a.align  || 'left';
  const content = a.content || '';

  const rawBuffer = await fetchFontBuffer(family, weight);
  const font = fontkit.create(new Uint8Array(rawBuffer));
  const scale = size / font.unitsPerEm;
  const ascender = (font.ascent || font.unitsPerEm * 0.8) * scale;

  // Split into lines — frame text wraps, point text splits on \n
  let lines;
  if (a.width != null) {
    lines = wordWrapLines(content, a.width, family, size, weight);
  } else {
    lines = content.split('\n');
  }

  const allParts = [];

  for (let li = 0; li < lines.length; li++) {
    const lineText = lines[li];
    const glyphRun = font.layout(lineText);
    const lineWidth = glyphRun.positions.reduce((s, p) => s + p.xAdvance, 0) * scale;

    // Determine anchor x for this line
    let anchorX;
    if (a.width != null) {
      // Frame text: origin is top-left of box
      if (align === 'center') anchorX = a.x + a.width / 2 - lineWidth / 2;
      else if (align === 'right') anchorX = a.x + a.width - lineWidth;
      else anchorX = a.x;
    } else {
      // Point text: x is anchor
      if (align === 'center') anchorX = a.x - lineWidth / 2;
      else if (align === 'right') anchorX = a.x - lineWidth;
      else anchorX = a.x;
    }

    const baselineY = a.y + ascender + li * size * lh;
    let curX = anchorX;

    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const glyph = glyphRun.glyphs[i];
      const pos   = glyphRun.positions[i];
      const tx = curX + pos.xOffset * scale;
      const ty = baselineY - pos.yOffset * scale;

      for (const cmd of (glyph.path.commands || [])) {
        const ca = cmd.args;
        switch (cmd.command) {
          case 'moveTo':
            allParts.push(`M${(tx+ca[0]*scale).toFixed(2)} ${(ty-ca[1]*scale).toFixed(2)}`);
            break;
          case 'lineTo':
            allParts.push(`L${(tx+ca[0]*scale).toFixed(2)} ${(ty-ca[1]*scale).toFixed(2)}`);
            break;
          case 'quadraticCurveTo':
            allParts.push(`Q${(tx+ca[0]*scale).toFixed(2)} ${(ty-ca[1]*scale).toFixed(2)} ${(tx+ca[2]*scale).toFixed(2)} ${(ty-ca[3]*scale).toFixed(2)}`);
            break;
          case 'bezierCurveTo':
            allParts.push(`C${(tx+ca[0]*scale).toFixed(2)} ${(ty-ca[1]*scale).toFixed(2)} ${(tx+ca[2]*scale).toFixed(2)} ${(ty-ca[3]*scale).toFixed(2)} ${(tx+ca[4]*scale).toFixed(2)} ${(ty-ca[5]*scale).toFixed(2)}`);
            break;
          case 'closePath':
            allParts.push('Z');
            break;
        }
      }
      curX += pos.xAdvance * scale;
    }
  }

  return allParts.join(' ') || null;
}

function shapeToSVG(sh, pathMap = new Map(), defs = []) {
  if (sh.visible === false) return '';

  if (sh.type === 'rawsvg') {
    const tx = sh.attrs.x || 0;
    const ty = sh.attrs.y || 0;
    const tr = (tx !== 0 || ty !== 0) ? ` transform="translate(${tx.toFixed(3)},${ty.toFixed(3)})"` : '';
    return `<g${tr}>\n  ${sh.attrs.markup}\n</g>`;
  }

  if (sh.type === 'group') {
    const children = (sh.children || []).map(c => shapeToSVG(c, pathMap, defs)).filter(Boolean).join('\n    ');
    if (!children) return '';
    let transform = '';
    if (sh.rotation) {
      const b = artboard.getShapeBBox(sh);
      transform = ` transform="rotate(${sh.rotation} ${(b.x+b.w/2).toFixed(3)} ${(b.y+b.h/2).toFixed(3)})"`;
    }
    let clipAttr = '';
    if (sh.clipRect) {
      const clipId = `clip-${sh.id}`;
      const r = sh.clipRect;
      defs.push(`<clipPath id="${clipId}"><rect x="${r.x.toFixed(3)}" y="${r.y.toFixed(3)}" width="${r.w.toFixed(3)}" height="${r.h.toFixed(3)}"/></clipPath>`);
      clipAttr = ` clip-path="url(#${clipId})"`;
    }
    return `<g${transform}${clipAttr}>\n    ${children}\n  </g>`;
  }

  const a = sh.attrs;
  let style = '';
  const resolved = resolveAppearance(sh);
  const fill    = resolved.fill;
  const stroke  = resolved.stroke;
  const sw      = resolved.strokeWidth;
  const linecap = resolved.strokeLinecap ?? 'round';
  style = ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="${linecap}"`;
  if (resolved.strokeDasharray) {
    style += ` stroke-dasharray="${resolved.strokeDasharray}"`;
    if (resolved.strokeDashoffset) style += ` stroke-dashoffset="${resolved.strokeDashoffset}"`;
  }

  let transform = '';
  if (sh.rotation) {
    const b = artboard.getShapeBBox(sh);
    transform = ` transform="rotate(${sh.rotation} ${(b.x+b.w/2).toFixed(3)} ${(b.y+b.h/2).toFixed(3)})"`;
  }

  switch (sh.type) {
    case 'rect': {
      const hasPC = a.r_nw || a.r_ne || a.r_se || a.r_sw;
      if (hasPC) {
        const half = Math.min(a.w, a.h) / 2;
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
        return `<path d="${d}"${style}${transform}/>`;
      }
      return `<rect x="${a.x.toFixed(3)}" y="${a.y.toFixed(3)}" width="${a.w.toFixed(3)}" height="${a.h.toFixed(3)}"${a.rx ? ` rx="${a.rx}"` : ''}${style}${transform}/>`;
    }
    case 'ellipse':
      return `<ellipse cx="${a.cx.toFixed(3)}" cy="${a.cy.toFixed(3)}" rx="${a.rx.toFixed(3)}" ry="${a.ry.toFixed(3)}"${style}${transform}/>`;
    case 'line':
      return `<line x1="${a.x1.toFixed(3)}" y1="${a.y1.toFixed(3)}" x2="${a.x2.toFixed(3)}" y2="${a.y2.toFixed(3)}"${style}${transform}/>`;
    case 'polygon': {
      const pts = polyPoints(a);
      const radii = pts.map((_, i) => a.cornerRadii?.[i] ?? a.cornerRadius ?? 0);
      if (radii.some(r => r > 0)) {
        return `<path d="${roundedPolygonPath(pts, radii)}"${style}${transform}/>`;
      }
      return `<polygon points="${pts.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}"${style}${transform}/>`;
    }
    case 'star': {
      const pts = starPoints(a);
      const outerR = a.outerCornerR ?? 0;
      const innerR = a.innerCornerR ?? 0;
      const radii = pts.map((_, i) => a.cornerRadii?.[i] ?? (i % 2 === 0 ? outerR : innerR));
      if (radii.some(r => r > 0)) {
        return `<path d="${roundedPolygonPath(pts, radii)}"${style}${transform}/>`;
      }
      return `<polygon points="${pts.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}"${style}${transform}/>`;
    }
    case 'path': {
      const pd = a.corners ? applyPathCorners(a.d, a.corners) : a.d;
      const fr = a.fillRule ? ` fill-rule="${a.fillRule}"` : '';
      return `<path d="${pd}"${fr}${style}${transform}/>`;
    }
    case 'image': {
      // Embed raster as base64 data URL — survives the round-trip into Illustrator.
      // Etch exports the baked grayscale version.
      const href = (sh.processType === 'etch' && a.etchHref) ? a.etchHref : a.href;
      return `<image x="${a.x.toFixed(3)}" y="${a.y.toFixed(3)}" width="${a.w.toFixed(3)}" height="${a.h.toFixed(3)}" preserveAspectRatio="none" xlink:href="${href}" href="${href}"${transform}/>`;
    }
    case 'text': {
      if (pathMap.has(sh.id)) {
        const d = pathMap.get(sh.id);
        const fillStr = (!fill || fill === 'none') ? '#0F1419' : fill;
        return `<path d="${d}" fill="${fillStr}" stroke="${stroke === 'none' ? 'none' : stroke}" stroke-width="${sw}" fill-rule="nonzero"${transform}/>`;
      }
      const anchorMap = { left: 'start', center: 'middle', right: 'end' };
      const al     = a.align || 'left';
      const anchor = anchorMap[al] || 'start';
      const ff     = esc(a.family || 'sans-serif');
      const fw     = a.weight || 400;
      const sz     = a.size || 16;
      const lh     = a.lineHeight || 1.2;
      const fillStr = (!fill || fill === 'none') ? '#0F1419' : fill;
      const baseStyle = ` font-family="${ff}" font-size="${sz}" font-weight="${fw}" ` +
        `text-anchor="${anchor}" dominant-baseline="text-before-edge" ` +
        `fill="${fillStr}" stroke="${stroke === 'none' ? 'none' : stroke}" stroke-width="${sw}"${transform}`;

      if (a.width != null) {
        let textX = a.x;
        if (al === 'center') textX = a.x + a.width / 2;
        else if (al === 'right') textX = a.x + a.width;
        const lines = wordWrapLines(a.content || '', a.width, a.family || 'sans-serif', sz, fw);
        const tspans = lines.map((line, i) => {
          const pos = i === 0
            ? `x="${textX.toFixed(3)}" y="${a.y.toFixed(3)}"`
            : `x="${textX.toFixed(3)}" dy="${lh}em"`;
          return `<tspan ${pos}>${esc(line)}</tspan>`;
        }).join('');
        return `<text${baseStyle}>${tspans}</text>`;
      }
      return `<text x="${a.x.toFixed(3)}" y="${a.y.toFixed(3)}"${baseStyle}>${esc(a.content || '')}</text>`;
    }
  }
  return '';
}

function polyPoints(a) {
  const pts = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < a.sides; i++) {
    const ang = start + i * 2 * Math.PI / a.sides;
    pts.push({ x: a.cx + a.r * Math.cos(ang), y: a.cy + a.r * Math.sin(ang) });
  }
  return pts;
}

function starPoints(a) {
  const n = Math.max(3, (a.points)|0);
  const ri = a.r * (a.innerRatio ?? 0.4);
  const pts = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < n * 2; i++) {
    const ang = start + i * Math.PI / n;
    const rad = i % 2 === 0 ? a.r : ri;
    pts.push({ x: a.cx + rad * Math.cos(ang), y: a.cy + rad * Math.sin(ang) });
  }
  return pts;
}

function buildSVG(pathMap = new Map()) {
  const s = store.get();
  const wPx = inToPx(s.artboard.w);
  const hPx = inToPx(s.artboard.h);
  const defs = [];
  const body = s.shapes.map(sh => shapeToSVG(sh, pathMap, defs)).filter(Boolean).join('\n  ');
  const defsBlock = defs.length ? `<defs>\n  ${defs.join('\n  ')}\n</defs>\n  ` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"
     width="${s.artboard.w}in" height="${s.artboard.h}in"
     viewBox="0 0 ${wPx} ${hPx}">
  <title>Laser Maker Export</title>
  <desc>${s.artboard.w} × ${s.artboard.h} inches</desc>
  ${defsBlock}${body}
</svg>
`;
}

// Collect all text shapes recursively from the shape tree
function collectTextShapes(shapes) {
  const result = [];
  for (const sh of shapes) {
    if (sh.visible === false) continue;
    if (sh.type === 'text') result.push(sh);
    if (sh.type === 'group' && sh.children) result.push(...collectTextShapes(sh.children));
  }
  return result;
}

async function download(filename) {
  const s = store.get();
  const textShapes = collectTextShapes(s.shapes);
  const pathMap = new Map();

  if (fontkit && textShapes.length) {
    await Promise.all(textShapes.map(async sh => {
      try {
        const d = await textShapeToPathD(sh);
        if (d) pathMap.set(sh.id, d);
      } catch (err) {
        console.warn('text-to-path failed for', sh.id, err);
        // falls back to <text> element
      }
    }));
  }

  const svg = buildSVG(pathMap);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'laser.svg';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  toast('SVG exported');
  return svg;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---- Export dialog ----
const _backdrop     = document.getElementById('export-backdrop');
const _nameInput    = document.getElementById('export-name');
const _projectInput = document.getElementById('export-project');
const _headerName   = document.getElementById('header-name');
const _headerProject = document.getElementById('header-project');
const _preview     = document.getElementById('export-filename-preview');
const _errorMsg    = document.getElementById('export-error-msg');
const _confirmBtn  = document.getElementById('export-confirm-btn');
const _cancelBtn   = document.getElementById('export-cancel-btn');

function _fitPiInput(input) {
  const chars = Math.max(input.value.length, input.placeholder.length, 16);
  input.style.width = chars + 'ch';
}
_headerName.addEventListener('input', () => _fitPiInput(_headerName));
_headerProject.addEventListener('input', () => _fitPiInput(_headerProject));
_fitPiInput(_headerName);
_fitPiInput(_headerProject);

function _slugify(str) {
  return str.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || null;
}

function _updatePreview() {
  const name    = _slugify(_nameInput.value);
  const project = _slugify(_projectInput.value);
  if (name && project) {
    _preview.textContent = `${name}-${project}_laser.svg`;
  } else if (name) {
    _preview.textContent = `${name}_laser.svg`;
  } else if (project) {
    _preview.textContent = `${project}_laser.svg`;
  } else {
    _preview.textContent = 'laser.svg';
  }
}

function _openDialog() {
  // Pre-fill from header inputs if dialog fields are empty
  if (!_nameInput.value && _headerName.value) _nameInput.value = _headerName.value;
  if (!_projectInput.value && _headerProject.value) _projectInput.value = _headerProject.value;
  _backdrop.hidden = false;
  _updatePreview();
  _nameInput.focus();
}

function _closeDialog() {
  _backdrop.hidden = true;
  _nameInput.classList.remove('export-field-input--error');
  _projectInput.classList.remove('export-field-input--error');
  _errorMsg.hidden = true;
}

function _clearError(input) {
  input.classList.remove('export-field-input--error');
  _errorMsg.hidden = true;
}

_nameInput.addEventListener('input', () => { _updatePreview(); _clearError(_nameInput); });
_projectInput.addEventListener('input', () => { _updatePreview(); _clearError(_projectInput); });

_cancelBtn.addEventListener('click', _closeDialog);
_backdrop.addEventListener('click', e => { if (e.target === _backdrop) _closeDialog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !_backdrop.hidden) _closeDialog(); });

_confirmBtn.addEventListener('click', async () => {
  const name    = _slugify(_nameInput.value);
  const project = _slugify(_projectInput.value);

  if (!name || !project) {
    const missing = [];
    if (!name)    { _nameInput.classList.remove('export-field-input--error'); void _nameInput.offsetWidth; _nameInput.classList.add('export-field-input--error'); missing.push('name'); }
    if (!project) { _projectInput.classList.remove('export-field-input--error'); void _projectInput.offsetWidth; _projectInput.classList.add('export-field-input--error'); missing.push('project'); }
    _errorMsg.textContent = missing.length === 2 ? 'Name and project are required.' : `${missing[0] === 'name' ? 'Your name' : 'Project'} is required.`;
    _errorMsg.hidden = false;
    (name ? _projectInput : _nameInput).focus();
    return;
  }

  const filename = `${name}-${project}_laser.svg`;

  // Sync back to header inputs
  _headerName.value    = _nameInput.value;
  _headerProject.value = _projectInput.value;

  _closeDialog();
  const svg = await download(filename);
  uploadToDrive(svg, filename);
});

_projectInput.addEventListener('keydown', e => { if (e.key === 'Enter') _confirmBtn.click(); });
_nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') _projectInput.focus(); });

document.getElementById('export-btn').addEventListener('click', _openDialog);

export const exporter = { download, buildSVG };
