// raster.js — turn an SVG string into a PNG data-URL snapshot for cheap display.
// The <img> snapshot is what's shown/dragged on the bed; the original svgText is
// kept untouched for vector export.

import { PX_PER_INCH } from './state.js';

// Cap raster resolution so huge parts don't blow up memory. ~150 px/in is plenty
// for on-screen preview at typical zoom.
const MAX_PX_PER_IN = 150;

// ponytail: SVG->Image rasterization can't pull external resources (fonts/images
// over the network). Fine here — laser-maker exports are self-contained (text is
// converted to paths, raster images are base64-embedded). If an SVG ever fails to
// decode, we surface it to the caller (returns null) rather than hanging.
export async function svgToDataURL(svgText, natWIn, natHIn) {
  const ppi = Math.min(MAX_PX_PER_IN, PX_PER_INCH);
  const w = Math.max(1, Math.round(natWIn * ppi));
  const h = Math.max(1, Math.round(natHIn * ppi));

  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
