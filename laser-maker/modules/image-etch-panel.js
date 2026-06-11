// =============================================================================
// image-etch-panel.js — Raster Etch inspector controls + bake pipeline.
//
// Owns the #appearance-image-etch panel: syncs controls from the selected
// image's attrs.etch, commits edits, and bakes the processed pixels into
// attrs.etchHref. (properties.js owns only the panel's show/hide.)
//
// Interaction model (confirmed with user):
//   slider `input`  (dragging) → fast low-res live preview on the canvas DOM
//   slider `change` (release)  → commit params; full-res bake → attrs.etchHref
// A signature watcher also re-bakes after undo/redo/load.
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { uid } from './utils.js';
import { mulMat, applyMatrixToD } from './expand-svg.js';
import { DEFAULT_ETCH, processEtchImage, processEtchPreview, loadImage } from './image-filters.js';

const $ = id => document.getElementById(id);

// Control element refs.
const C = {
  brightness: $('ie-brightness'),
  contrast:   $('ie-contrast'),
  gamma:      $('ie-gamma'),
  depth:      $('ie-depth'),
  white:      $('ie-white'),
  posterize:  $('ie-posterize'),
  invert:     $('ie-invert'),
  threshold:  $('ie-threshold'),
  level:      $('ie-level'),
  dither:     $('ie-dither'),
  halftone:   $('ie-halftone'),
  htsize:     $('ie-htsize'),
  htangle:    $('ie-htangle'),
  reset:      $('ie-reset'),
  trace:      $('ie-trace'),
};
const ROWS = {
  level:   $('ie-row-level'),
  dither:  $('ie-row-dither'),
  htsize:  $('ie-row-htsize'),
  htangle: $('ie-row-htangle'),
};

const sig = p => JSON.stringify(p);
const num = el => parseFloat(el.value) || 0;
const btnOn = el => el.classList.contains('active');

// Read all controls → params object.
function readParams() {
  return {
    brightness: Math.round(num(C.brightness)),
    contrast:   Math.round(num(C.contrast)),
    gamma:      num(C.gamma),
    depth:      Math.round(num(C.depth)),
    whiteClip:  Math.round(num(C.white)),
    posterize:  Math.round(num(C.posterize)),
    invert:     btnOn(C.invert),
    threshold:  btnOn(C.threshold),
    level:      Math.round(num(C.level)),
    dither:     C.dither.value,
    halftone:   btnOn(C.halftone),
    htSize:     Math.round(num(C.htsize)),
    htAngle:    Math.round(num(C.htangle)),
  };
}

function setSliderVal(el, text) {
  const span = el.closest('.slider-ctrl')?.querySelector('.slider-val');
  if (span) span.textContent = text;
}
function setToggle(el, on, label) {
  el.classList.toggle('active', on);
  el.textContent = on ? 'On' : (label || 'Off');
}

// Write params → controls (called when selection/params change, not mid-drag).
function setControls(p) {
  C.brightness.value = p.brightness; setSliderVal(C.brightness, `${p.brightness}`);
  C.contrast.value   = p.contrast;   setSliderVal(C.contrast, `${p.contrast}`);
  C.gamma.value      = p.gamma;      setSliderVal(C.gamma, p.gamma.toFixed(2));
  C.depth.value      = p.depth;      setSliderVal(C.depth, `${p.depth} %`);
  C.white.value      = p.whiteClip;  setSliderVal(C.white, `${p.whiteClip} %`);
  C.posterize.value  = p.posterize;  setSliderVal(C.posterize, p.posterize >= 2 ? `${p.posterize}` : 'Off');
  C.level.value      = p.level;      setSliderVal(C.level, `${p.level} %`);
  C.htsize.value     = p.htSize;     setSliderVal(C.htsize, `${p.htSize} px`);
  C.htangle.value    = p.htAngle;    setSliderVal(C.htangle, `${p.htAngle} °`);
  C.dither.value     = p.dither;
  setToggle(C.invert, p.invert);
  setToggle(C.threshold, p.threshold);
  setToggle(C.halftone, p.halftone);
  syncRowVisibility();
}

function syncRowVisibility() {
  const th = btnOn(C.threshold), ht = btnOn(C.halftone);
  ROWS.level.style.display   = th ? '' : 'none';
  ROWS.dither.style.display  = th ? '' : 'none';
  ROWS.htsize.style.display  = ht ? '' : 'none';
  ROWS.htangle.style.display = ht ? '' : 'none';
}

// -------- Selected image helpers --------
function selectedEtchImage() {
  const s = store.get();
  if (s.selection.length !== 1) return null;
  const sh = store.findShape(s.selection[0]);
  return (sh && sh.type === 'image' && sh.processType === 'etch' && sh.attrs.etch) ? sh : null;
}

// -------- Baking --------
let _previewTimer = null;
let _bakeTimer = null;
let _previewToken = 0;

// Fast low-res preview straight to the live <image> DOM node — no state change.
function livePreview(sh, params) {
  clearTimeout(_previewTimer);
  const token = ++_previewToken;
  _previewTimer = setTimeout(() => {
    processEtchPreview(sh.attrs.href, params).then(url => {
      if (token !== _previewToken) return;            // a newer drag superseded this
      const node = artboard.getShapeNode(sh.id);
      const im = node?.querySelector('image');
      if (im) { im.setAttribute('href', url); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url); }
    }).catch(() => {});
  }, 30);
}

// Full-res bake → attrs.etchHref (+ cached signature). Patched without history.
function bakeFull(id) {
  const sh = store.findShape(id);
  if (!sh || sh.type !== 'image' || !sh.attrs.etch) return;
  const params = { ...sh.attrs.etch };
  const s = sig(params);
  processEtchImage(sh.attrs.href, params).then(url => {
    store.patch(() => {
      const live = store.findShape(id);
      if (live && live.type === 'image') { live.attrs.etchHref = url; live.attrs._etchSig = s; }
    }, 'image-etch-bake');
  }).catch(() => {});
}

// -------- Wiring --------
let _interacting = false;   // true while a slider is being dragged → suppress sync

// Commit current controls to the selected image's attrs.etch (undoable).
function commitParams() {
  const sh = selectedEtchImage();
  if (!sh) return;
  const params = readParams();
  store.commit(() => {
    const live = store.findShape(sh.id);
    if (live && live.type === 'image') live.attrs.etch = params;
  }, 'image-etch-params');
}

// Sliders: live preview on input, commit on change.
for (const el of [C.brightness, C.contrast, C.gamma, C.depth, C.white, C.posterize, C.level, C.htsize, C.htangle]) {
  el.addEventListener('input', () => {
    _interacting = true;
    const p = readParams();
    // Keep the readout in sync while dragging.
    if (el === C.gamma) setSliderVal(el, num(el).toFixed(2));
    else if (el === C.posterize) setSliderVal(el, p.posterize >= 2 ? `${p.posterize}` : 'Off');
    else setSliderVal(el, el.dataset.unit ? `${Math.round(num(el))} ${el.dataset.unit}` : `${Math.round(num(el))}`);
    const sh = selectedEtchImage();
    if (sh) livePreview(sh, p);
  });
  el.addEventListener('change', () => { _interacting = false; commitParams(); });
}

// Dither select: commit immediately.
C.dither.addEventListener('change', commitParams);

// Toggle buttons. Threshold and Halftone are mutually exclusive.
C.invert.addEventListener('click', () => { setToggle(C.invert, !btnOn(C.invert)); commitParams(); });
C.threshold.addEventListener('click', () => {
  const on = !btnOn(C.threshold);
  setToggle(C.threshold, on);
  if (on) setToggle(C.halftone, false);
  syncRowVisibility();
  commitParams();
});
C.halftone.addEventListener('click', () => {
  const on = !btnOn(C.halftone);
  setToggle(C.halftone, on);
  if (on) setToggle(C.threshold, false);
  syncRowVisibility();
  commitParams();
});

C.reset.addEventListener('click', () => {
  setControls({ ...DEFAULT_ETCH });
  commitParams();
});

// -------- Trace to vector --------
// Convert the processed (baked) etch pixels into filled vector paths and replace
// the source image in place. Output paths are Etch (black fill) — the student
// can switch them to any process afterward via the Process panel.
const TRACE_MAX = 1000;   // cap longest traced side for performance

function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function traceSelected() {
  const sh = selectedEtchImage();
  if (!sh) return;
  if (typeof ImageTracer === 'undefined') { toast('Tracer not loaded'); return; }
  const src = sh.attrs.etchHref || sh.attrs.href;
  if (!src) return;
  toast('Tracing…');

  loadImage(src).then(img => {
    // Draw the processed image to a (possibly downscaled) canvas → ImageData.
    let tw = img.naturalWidth || 1, th = img.naturalHeight || 1;
    if (Math.max(tw, th) > TRACE_MAX) {
      const k = TRACE_MAX / Math.max(tw, th);
      tw = Math.max(1, Math.round(tw * k));
      th = Math.max(1, Math.round(th * k));
    }
    const cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    const imgData = ctx.getImageData(0, 0, tw, th);

    // Two-color (black/white) trace — matches the binarized etch look.
    const opts = {
      pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
      ltres: 1, qtres: 1, pathomit: 8, rightangleenhance: true,
      strokewidth: 0, linefilter: false, scale: 1, roundcoords: 2,
      viewbox: false, desc: false, blurradius: 0,
    };
    const svgStr = ImageTracer.imagedataToSVG(imgData, opts);

    // Map traced (canvas px) → artboard coords: scale to the image's displayed
    // w/h, offset by its position, and carry any image rotation.
    const sx = sh.attrs.w / tw, sy = sh.attrs.h / th;
    let m = [sx, 0, 0, sy, sh.attrs.x, sh.attrs.y];
    if (sh.rotation) {
      const cx = sh.attrs.x + sh.attrs.w / 2, cy = sh.attrs.y + sh.attrs.h / 2;
      const a = sh.rotation * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      m = mulMat([cos, sin, -sin, cos, cx - cx*cos + cy*sin, cy - cx*sin - cy*cos], m);
    }

    // Keep only the dark regions; drop the near-white background paths.
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    const paths = [...doc.querySelectorAll('path')].filter(p => {
      const rgb = (p.getAttribute('fill') || '').match(/\d+/g);
      if (!rgb) return true;
      const lum = (+rgb[0]) * 0.299 + (+rgb[1]) * 0.587 + (+rgb[2]) * 0.114;
      return lum < 128;
    }).map(p => applyMatrixToD(p.getAttribute('d'), m)).filter(Boolean);

    if (!paths.length) { toast('Nothing to trace'); return; }

    const base = { fill: '#000000', stroke: 'none', strokeWidth: 1,
                   processType: 'etch', visible: true, locked: false, rotation: 0 };
    let n = 0;
    const children = paths.map(d => ({
      id: uid('tp'), type: 'path', name: `Path ${++n}`, attrs: { d }, ...base,
    }));
    const replacement = children.length === 1
      ? { ...children[0], name: sh.name }
      : { id: uid('tg'), type: 'group', name: sh.name || 'Traced Image',
          children, visible: true, locked: false, rotation: 0 };

    store.commit(st => {
      const idx = st.shapes.findIndex(s => s.id === sh.id);
      if (idx < 0) return;
      st.shapes.splice(idx, 1, replacement);
      st.selection = [replacement.id];
    }, 'trace-image');
    toast(`Traced to ${paths.length} path${paths.length > 1 ? 's' : ''}`);
  }).catch(() => toast('Trace failed'));
}

C.trace.addEventListener('click', traceSelected);

// -------- Sync + bake watcher --------
let _shownSig = null;
store.subscribe(() => {
  const sh = selectedEtchImage();
  if (!sh) { _shownSig = null; return; }
  const s = sig(sh.attrs.etch);
  // Refresh controls when the params changed underneath us (selection/undo/redo)
  // — but never while the user is actively dragging a slider.
  if (!_interacting && s !== _shownSig) {
    setControls({ ...DEFAULT_ETCH, ...sh.attrs.etch });
    _shownSig = s;
  }
  // Re-bake if the cached pixels are stale relative to the params.
  if (sh.attrs._etchSig !== s) {
    clearTimeout(_bakeTimer);
    const id = sh.id;
    _bakeTimer = setTimeout(() => bakeFull(id), 90);
  }
});
