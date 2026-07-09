// export.js — merge all placed pieces into one 36×24 SVG.
// Each piece is embedded as a nested <svg> so its ORIGINAL vectors and process
// colors (blue cut / red score / green final / black etch) survive untouched —
// zero geometry math, round-trips cleanly into Illustrator → Epilog.

import { state, inToPx, pxToIn } from './state.js';
import { pieceTransform } from './bed.js';

// Namespace a piece's internal ids so clip-paths / gradients / masks from
// different student exports don't collide when merged into one document.
function namespaceIds(inner, prefix) {
  const ids = new Set();
  inner.replace(/\bid="([^"]+)"/g, (m, id) => { ids.add(id); return m; });
  let out = inner;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\bid="${esc}"`, 'g'), `id="${prefix}${id}"`);
    out = out.replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}${id})`);
    out = out.replace(new RegExp(`((?:xlink:)?href)="#${esc}"`, 'g'), `$1="#${prefix}${id}"`);
  }
  return out;
}

export function buildMergedSVG() {
  const bedWpx = inToPx(state.bed.wIn), bedHpx = inToPx(state.bed.hIn);

  const body = state.pieces.map((p, i) => {
    const xPx = inToPx(p.xIn), yPx = inToPx(p.yIn);
    const wPx = p.natWpx * p.scale, hPx = p.natHpx * p.scale;
    const cx = xPx + wPx / 2, cy = yPx + hPx / 2;
    const inner = namespaceIds(p.innerSVG, `p${i}_`);
    const nested =
      `<svg x="${xPx.toFixed(3)}" y="${yPx.toFixed(3)}" ` +
      `width="${wPx.toFixed(3)}" height="${hPx.toFixed(3)}" ` +
      `viewBox="${p.viewBox}" preserveAspectRatio="xMinYMin meet" overflow="visible">${inner}</svg>`;
    const tf = pieceTransform(cx, cy, p.rot || 0, p.flipY);
    return tf ? `<g transform="${tf}">${nested}</g>` : nested;
  }).join('\n  ');

  const wIn = pxToIn(bedWpx), hIn = pxToIn(bedHpx);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"
     width="${wIn.toFixed(4)}in" height="${hIn.toFixed(4)}in"
     viewBox="0 0 ${bedWpx.toFixed(3)} ${bedHpx.toFixed(3)}">
  <title>Bed Maker Export</title>
  <desc>${wIn.toFixed(2)} × ${hIn.toFixed(2)} inches — ${state.pieces.length} parts</desc>
  ${body}
</svg>
`;
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

export function initExport() {
  const btn = document.getElementById('export-btn');
  const dateInput = document.getElementById('export-date');
  btn.addEventListener('click', () => {
    if (!state.pieces.length) return;
    const date = (dateInput.value || '').trim();
    const filename = date ? `bed-${date}_laser.svg` : 'bed_laser.svg';
    download(filename, buildMergedSVG());
  });
}
