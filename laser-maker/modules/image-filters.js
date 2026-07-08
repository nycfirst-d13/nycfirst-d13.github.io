// =============================================================================
// image-filters.js — pixel-level raster pipeline for the `image` shape type.
//
// Used by Raster Etch mode. The whole adjustment chain is baked into the pixel
// data (not a render-time SVG filter) so the exported base64 is genuinely
// processed and survives the Illustrator → Epilog pipeline unchanged.
//
// Pipeline order (per pixel, then spatial passes):
//   grayscale → brightness → contrast → gamma → invert → depth → white-clip
//     → posterize → ONE binarizer (halftone | threshold[/dither] | none)
// =============================================================================

// ---- Default param set (neutral = plain grayscale) ----
export const DEFAULT_ETCH = {
  brightness: 0,     // -100..100  (add)
  contrast: 100,     // -100..100  (scale around mid-gray)
  gamma: 1,          // 0.1..3     (midtone curve)
  invert: false,     // engrave negative
  depth: 100,        // 0..100 %   black-point clamp — <100 lightens darkest (shallower burn)
  whiteClip: 100,    // 0..100 %   pixels >= this brightness → pure white (no burn)
  posterize: 0,      // 0 = off, else 2..8 gray levels
  threshold: false,  // continuous-tone → 1-bit
  level: 50,         // 0..100 %   threshold cutoff
  dither: 'none',    // none | floyd | ordered
  halftone: false,   // clustered-dot screen → 1-bit
  htSize: 6,         // 2..16 px   dot cell size
  htAngle: 45,       // 0..90 deg  screen angle
};

export function defaultEtchParams() { return { ...DEFAULT_ETCH }; }

// ---- Image element cache (keyed by source data URL) ----
const _imgCache = new Map();
export function loadImage(href) {
  if (_imgCache.has(href)) {
    const cached = _imgCache.get(href);
    if (cached.complete && cached.naturalWidth) return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { _imgCache.set(href, img); resolve(img); };
    img.onerror = reject;
    img.src = href;
  });
}

// 4x4 Bayer matrix (normalized 0..1) for ordered dithering.
const BAYER4 = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].map(row => row.map(v => (v + 0.5) / 16));

// ---- Core: process a loaded <img> → data URL ----
// maxDim: if set, downscale longest side to this many px (fast live preview).
export function processToDataURL(img, params, maxDim = 0) {
  const p = { ...DEFAULT_ETCH, ...params };
  let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
  if (maxDim && Math.max(w, h) > maxDim) {
    const k = maxDim / Math.max(w, h);
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  // Flatten transparency onto white — else transparent pixels read as
  // RGB(0,0,0) and bake to solid black instead of the intended tones.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  // Precompute scalar transforms.
  const bright = p.brightness * 2.55;                       // -255..255
  const c = Math.max(-255, Math.min(255, p.contrast * 2.55));
  const cFactor = (259 * (c + 255)) / (255 * (259 - c));    // standard contrast factor
  const invGamma = 1 / Math.max(0.01, p.gamma);
  const blackLo = 255 * (1 - p.depth / 100);                // depth: raise the black floor
  const whiteCut = (p.whiteClip / 100) * 255;               // >= this → white
  const postLevels = p.posterize >= 2 ? (p.posterize | 0) : 0;

  // Tonal pass → grayscale buffer (one value per pixel).
  const N = w * h;
  const gray = new Float32Array(N);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; // luma
    v += bright;
    v = cFactor * (v - 128) + 128;                          // contrast
    v = 255 * Math.pow(Math.max(0, Math.min(1, v / 255)), invGamma); // gamma
    if (p.invert) v = 255 - v;
    if (blackLo > 0) v = blackLo + v * (255 - blackLo) / 255; // depth clamp
    if (v >= whiteCut) v = 255;                              // white clip
    if (postLevels) v = Math.round((v / 255) * (postLevels - 1)) / (postLevels - 1) * 255;
    gray[j] = Math.max(0, Math.min(255, v));
  }

  // Binarizer (writes back into gray as 0/255 where applicable).
  if (p.halftone) {
    _halftone(gray, w, h, p.htSize, p.htAngle);
  } else if (p.threshold) {
    const cutoff = (p.level / 100) * 255;
    if (p.dither === 'floyd')      _floydSteinberg(gray, w, h, cutoff);
    else if (p.dither === 'ordered') _ordered(gray, w, h, cutoff);
    else                            { for (let j = 0; j < N; j++) gray[j] = gray[j] < cutoff ? 0 : 255; }
  }

  // Write grayscale back to RGBA (alpha preserved).
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = gray[j];
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return cv.toDataURL('image/png');
}

function _floydSteinberg(gray, w, h, cutoff) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const nv = old < cutoff ? 0 : 255;
      const err = old - nv;
      gray[i] = nv;
      if (x + 1 < w)              gray[i + 1]       += err * 7 / 16;
      if (y + 1 < h) {
        if (x > 0)                gray[i + w - 1]   += err * 3 / 16;
                                  gray[i + w]       += err * 5 / 16;
        if (x + 1 < w)            gray[i + w + 1]   += err * 1 / 16;
      }
    }
  }
}

function _ordered(gray, w, h, cutoff) {
  // Bias the cutoff per pixel using the Bayer matrix → simulates grays as dots.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bias = (BAYER4[y & 3][x & 3] - 0.5) * 255;      // -127.5..127.5
      gray[i] = gray[i] < cutoff + bias ? 0 : 255;
    }
  }
}

function _halftone(gray, w, h, size, angleDeg) {
  const cell = Math.max(2, size | 0);
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Rotate coords into the screen, find position within the dot cell.
      const xr = x * cos - y * sin;
      const yr = x * sin + y * cos;
      const fx = (((xr % cell) + cell) % cell) / cell - 0.5;
      const fy = (((yr % cell) + cell) % cell) / cell - 0.5;
      const dist = Math.sqrt(fx * fx + fy * fy);            // 0..~0.707
      const darkness = 1 - gray[i] / 255;                   // 0 (white) .. 1 (black)
      const radius = Math.sqrt(darkness) * 0.62;            // dot grows with darkness
      gray[i] = dist < radius ? 0 : 255;
    }
  }
}

// ---- Convenience wrappers ----
export function processEtchImage(href, params) {
  return loadImage(href).then(img => processToDataURL(img, params, 0));
}
export function processEtchPreview(href, params, maxDim = 320) {
  return loadImage(href).then(img => processToDataURL(img, params, maxDim));
}
