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
import { toast } from './toast.js';
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


// Split a transformed (all-absolute) compound path d into one string per
// subpath. applyMatrixToD always emits absolute commands, so every subpath
// begins with a capital M. Drop degenerate subpaths (M with no geometry).
function splitSubpaths(d) {
  return d.split(/(?=M)/).map(s => s.trim())
    .filter(s => /[LCQAHVZ]/.test(s));
}

let _paperReady = false;
function ensurePaper() {
  if (_paperReady) return true;
  if (typeof paper === 'undefined') return false;
  paper.setup(new paper.Size(1, 1));
  _paperReady = true;
  return true;
}

// Group traced subpaths into filled regions. ImageTracer flattens all dark
// pixels into one compound path; naively splitting on M makes each contour a
// solid shape, so holes (the white interior of line art) fill black. Instead we
// gather each connected nest of contours (an outer shape + everything inside it,
// at any depth) into ONE selectable compound rendered even-odd. Even-odd fills a
// point iff it sits inside an ODD number of contours, so holes, islands-in-holes,
// and holes-in-islands all resolve correctly by crossing count alone — no need to
// know which contour is whose parent.
//
// ponytail: containment is bbox-only, not true point-in-polygon. That only ever
// OVER-merges (a bbox can contain a shape it doesn't geometrically enclose, but a
// real container's bbox always contains the child's) — and over-merging is safe
// under even-odd: disjoint contours in one compound each fill independently. The
// only cost is coarser selection grouping. Upgrade to path.contains() if you need
// tighter per-shape selection, not for correctness.
function subpathsToRegions(subs) {
  if (!subs.length) return [];
  if (!ensurePaper()) return subs;   // no paper → fall back to raw subpaths
  const items = subs.map(d => {
    const p = new paper.Path(d);
    const it = { d, area: Math.abs(p.area), b: p.bounds };
    p.remove();
    return it;
  }).filter(x => x.area > 0);
  if (!items.length) return [];

  // parent[i] = smallest-area region whose bbox contains region i (or -1).
  const parent = items.map((it, i) => {
    let best = -1, bestArea = Infinity;
    items.forEach((o, j) => {
      if (j !== i && o.area > it.area && o.b.contains(it.b) && o.area < bestArea) {
        best = j; bestArea = o.area;
      }
    });
    return best;
  });

  // Walk each contour to its top-level ancestor; all contours sharing a root are
  // one connected nest → one even-odd compound covering every depth beneath it.
  const groups = new Map();
  items.forEach((_, i) => {
    let root = i;
    while (parent[root] >= 0) root = parent[root];
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(items[i].d);
  });
  return [...groups.values()].map(ds => ds.join(' '));
}

// Trace works on any single image (any process) — the two-color trace binarizes
// regardless, and it reads etchHref if present else the raw href.
function selectedImage() {
  const s = store.get();
  if (s.selection.length !== 1) return null;
  const sh = store.findShape(s.selection[0]);
  return (sh && sh.type === 'image') ? sh : null;
}

function traceSelected() {
  const sh = selectedImage();
  if (!sh) return;
  if (typeof ImageTracer === 'undefined') { toast('Tracer not loaded'); return; }
  const src = sh.attrs.etchHref || sh.attrs.href;
  if (!src) return;
  toast('Tracing…');

  loadImage(src).then(async img => {
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
    // Flatten transparency onto white — else transparent pixels read as
    // RGB(0,0,0) and the tracer paints the whole background solid black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    const imgData = ctx.getImageData(0, 0, tw, th);

    // Trace runs on the baked etch image, which is opaque (and may be
    // inverted, turning the transparent region dark). Re-derive the alpha
    // mask from the ORIGINAL png and force originally-transparent pixels to
    // white so they trace as droppable background, never as a black object.
    const origSrc = sh.attrs.href;
    if (origSrc) {
      const oimg = await loadImage(origSrc).catch(() => null);
      if (oimg) {
        const oc = document.createElement('canvas');
        oc.width = tw; oc.height = th;
        const octx = oc.getContext('2d');
        octx.drawImage(oimg, 0, 0, tw, th);
        const alpha = octx.getImageData(0, 0, tw, th).data;
        const d = imgData.data;
        for (let i = 3; i < alpha.length; i += 4) {
          if (alpha[i] < 128) { d[i - 3] = d[i - 2] = d[i - 1] = 255; }
        }
      }
    }

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

    // Break the one compound path into separate selectable regions, each
    // keeping its holes so line art doesn't fill solid black.
    const regions = subpathsToRegions(paths.flatMap(splitSubpaths));

    if (!regions.length) { toast('Nothing to trace'); return; }

    const base = { fill: '#000000', stroke: 'none', strokeWidth: 1,
                   processType: 'etch', visible: true, locked: false, rotation: 0 };
    let n = 0;
    const children = regions.map(d => ({
      id: uid('tp'), type: 'path', name: `Path ${++n}`,
      attrs: { d, fillRule: 'evenodd' }, ...base,
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
    toast(`Traced to ${regions.length} path${regions.length > 1 ? 's' : ''}`);
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
