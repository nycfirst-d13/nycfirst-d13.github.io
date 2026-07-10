// import.js — bring SVG files onto the bed via file-picker + drag-drop.
// Each file → parse → clean junk → crop to content → rasterize → push a Piece.

import { state, render, pxToIn, getPiece } from './state.js';
import { svgToDataURL } from './raster.js';
import { arrange } from './arrange.js';

const NS = 'http://www.w3.org/2000/svg';
let _seq = 0;
const uid = () => `p${++_seq}`;

// Parse an SVG length ("12.0000in", "96px", "3.5", "72pt"...) to px @96/in.
function parseSVGDim(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^([-\d.]+)\s*([a-z%]*)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  switch (m[2].toLowerCase()) {
    case 'in': return n * 96;
    case 'pt': return n * 96 / 72;
    case 'pc': return n * 16;
    case 'cm': return n * 96 / 2.54;
    case 'mm': return n * 96 / 25.4;
    case '':
    case 'px': return n;
    default:   return null;
  }
}

// ---- content cleaning (A1) ----
// Students who tap the text tool without typing leave empty <text> anchors at
// stray coordinates; getBBox counts those points and balloons the crop box.
// Strip anything that paints nothing so it inflates neither the size nor the cut.

const GRAPHIC = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline']);

function styleVal(el, prop) {
  const inline = el.style && el.style[prop];
  return (inline || el.getAttribute(prop) || '').trim().toLowerCase();
}
function isHidden(el) {
  return styleVal(el, 'display') === 'none' || styleVal(el, 'visibility') === 'hidden';
}
function isEmptyText(el) {
  return el.tagName.toLowerCase() === 'text' && !el.textContent.trim();
}
// aggressive-only: a graphic with fill:none AND no stroke paints nothing.
function isNoPaint(el) {
  if (!GRAPHIC.has(el.tagName.toLowerCase())) return false;
  const fill = styleVal(el, 'fill');
  const stroke = styleVal(el, 'stroke');
  const fillNone = fill === 'none' || fill === 'transparent';
  const strokeNone = stroke === '' || stroke === 'none' || stroke === 'transparent';
  return fillNone && strokeNone;
}

function cleanTree(el, aggressive) {
  for (const child of [...el.children]) {
    if (isHidden(child) || isEmptyText(child) || (aggressive && isNoPaint(child))) {
      child.remove();
      continue;
    }
    cleanTree(child, aggressive);
    // a group emptied by cleaning contributes nothing
    if (child.tagName.toLowerCase() === 'g' && child.children.length === 0) child.remove();
  }
}

// Clean a set of nodes off-screen, then measure the tight content bbox. Measured
// once on the wrapping <g> so descendant transforms are honored — a per-element
// union would use each element's LOCAL box and ignore its own transform, shifting
// transformed groups out of the crop and clipping them. Empty/invisible strays
// (A1/A2) are handled by cleanTree above, not by skipping boxes here.
// Returns { bbox, innerSVG } — innerSVG is the cleaned markup for display + export.
function fitContent(childNodes, aggressive) {
  const svg = document.createElementNS(NS, 'svg');
  svg.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden';
  const g = document.createElementNS(NS, 'g');
  for (const node of childNodes) g.appendChild(document.importNode(node, true));
  svg.appendChild(g);
  document.body.appendChild(svg);

  cleanTree(g, aggressive);

  let bb = null;
  try {
    const b = g.getBBox();
    if (b && isFinite(b.width) && isFinite(b.height) && b.width > 0 && b.height > 0) {
      const pad = 1; // ~half of a 1pt stroke, which getBBox excludes
      bb = { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
    }
  } catch { /* no renderable content — caller falls back to declared size */ }

  const innerSVG = g.innerHTML;
  svg.remove();
  return { bbox: bb, innerSVG };
}

function canonicalSVG(viewBox, natWIn, natHIn, innerSVG) {
  return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` viewBox="${viewBox}" width="${natWIn.toFixed(4)}in" height="${natHIn.toFixed(4)}in">${innerSVG}</svg>`;
}

function parseInner(innerSVG) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${innerSVG}</svg>`, 'image/svg+xml');
  return doc.documentElement.childNodes;
}

function applyFit(p, fit) {
  const bb = fit.bbox;
  p.innerSVG = fit.innerSVG;
  if (bb) {
    p.viewBox = `${bb.x} ${bb.y} ${bb.w} ${bb.h}`;
    p.natWpx = bb.w; p.natHpx = bb.h;
  }
  p.natWIn = pxToIn(p.natWpx);
  p.natHIn = pxToIn(p.natHpx);
  p.svgText = canonicalSVG(p.viewBox, p.natWIn, p.natHIn, p.innerSVG);
}

function makePiece(svgText, filename) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') return null;

  // Declared size + viewBox as the fallback if content can't be measured.
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const declW = parseSVGDim(root.getAttribute('width'))  || (vb[2] ? vb[2] * (96 / 72) : 0) || 96;
  const declH = parseSVGDim(root.getAttribute('height')) || (vb[3] ? vb[3] * (96 / 72) : 0) || 96;
  const declVB = (vb.length === 4 && vb.every(isFinite)) ? vb.join(' ') : `0 0 ${declW} ${declH}`;

  const p = {
    id: uid(),
    name: filename ? filename.replace(/\.svg$/i, '') : 'part',
    innerSVG: root.innerHTML,
    viewBox: declVB,
    natWpx: declW, natHpx: declH, natWIn: pxToIn(declW), natHIn: pxToIn(declH),
    svgText, scale: 1, xIn: 0, yIn: 0, flipY: false, rot: 0, href: null,
  };
  applyFit(p, fitContent(root.childNodes, false)); // A1+A2 conservative clean
  return p;
}

async function raster(p) { p.href = await svgToDataURL(p.svgText, p.natWIn, p.natHIn); }

async function addFiles(fileList) {
  const files = [...fileList].filter(f => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
  if (!files.length) return;
  const added = [];
  for (const file of files) {
    const piece = makePiece(await file.text(), file.name);
    if (!piece) continue;
    await raster(piece);
    state.pieces.push(piece);
    added.push(piece);
  }
  if (added.length) arrange();
}

// M1 — teacher-triggered aggressive re-trim of one piece (also drops no-paint
// graphics, not just empties). Escape hatch for strays the safe pass leaves.
export async function retrimPiece(id) {
  const p = getPiece(id);
  if (!p) return;
  const fit = fitContent(parseInner(p.innerSVG), true);
  if (!fit.bbox) return;
  applyFit(p, fit);
  await raster(p);
  render();
}

export function initImport() {
  const input = document.getElementById('file-input');
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  const stage = document.getElementById('workspace');
  ['dragenter', 'dragover'].forEach(ev => stage.addEventListener(ev, e => {
    stop(e); stage.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(ev => stage.addEventListener(ev, e => {
    stop(e); if (ev === 'dragleave' && e.target !== stage) return;
    stage.classList.remove('drag-over');
  }));
  stage.addEventListener('drop', e => { stop(e); addFiles(e.dataTransfer.files); });

  // Empty board: click anywhere on the canvas to open the file picker.
  document.getElementById('canvas-area').addEventListener('click', () => {
    if (!state.pieces.length) input.click();
  });
}
