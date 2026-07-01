// =============================================================================
// properties.js — inspector controls (process type, fill, stroke, weight, x/y/w/h, rotate)
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { inToPx, pxToIn, round, rotatedCorners, scalePathD } from './utils.js';
import { PROCESS_DEFINITIONS, normalizeForProcess } from './process-registry.js';
import { quickFlip } from './reflect.js';
import { defaultEtchParams } from './image-filters.js';
import { getCornerUIState, setCornerRadiusIn } from './select.js';

const fillColor       = document.getElementById('fill-color');
const fillSwatchWrap  = document.getElementById('fill-swatch-wrap');
const fillR           = document.getElementById('fill-r');
const fillG           = document.getElementById('fill-g');
const fillB           = document.getElementById('fill-b');
const fillNone        = document.getElementById('fill-none');
const strokeColor     = document.getElementById('stroke-color');
const strokeSwatchWrap = document.getElementById('stroke-swatch-wrap');
const strokeR         = document.getElementById('stroke-r');
const strokeG         = document.getElementById('stroke-g');
const strokeB         = document.getElementById('stroke-b');
const strokeNone      = document.getElementById('stroke-none');
const strokeWidth = document.getElementById('stroke-width');
const tX = document.getElementById('t-x');
const tY = document.getElementById('t-y');
const tW = document.getElementById('t-w');
const tH = document.getElementById('t-h');
const tR = document.getElementById('t-r');
const qrBtns = document.querySelectorAll('.qr-btn');

const textPanel = document.getElementById('text-panel');
const polygonPanel      = document.getElementById('polygon-panel');
const polygonSidesInput = document.getElementById('polygon-sides');
const cornerPanel       = document.getElementById('corner-panel');
const cornerPanelTitle  = document.getElementById('corner-panel-title');
const cornerRadiusLabel = document.getElementById('corner-radius-label');
const cornerRadiusInput = document.getElementById('corner-radius');
const starPanel         = document.getElementById('star-panel');
const starPointsInput     = document.getElementById('star-points');
const starInnerRatioInput = document.getElementById('star-inner-ratio');

// Custom process-type dropdown
const _ptWrapper  = document.getElementById('process-type-wrapper');
const _ptTrigger  = document.getElementById('process-type-trigger');
const _ptLabel    = document.getElementById('process-type-label');
const _ptDropdown = document.getElementById('process-type-dropdown');
const _ptOptions  = () => [..._ptDropdown.querySelectorAll('.custom-select-option:not([hidden])')];

let _ptValue = 'free';
const _ptChangeListeners = [];

function _ptOpen() { _ptDropdown.classList.add('open'); _ptWrapper.classList.add('open'); }
function _ptClose() { _ptDropdown.classList.remove('open'); _ptWrapper.classList.remove('open'); }

_ptTrigger.addEventListener('click', () => {
  _ptDropdown.classList.contains('open') ? _ptClose() : _ptOpen();
});
_ptDropdown.addEventListener('click', (e) => {
  const opt = e.target.closest('.custom-select-option');
  if (!opt || opt.hidden) return;
  const val = opt.dataset.value;
  _ptSetValue(val);
  _ptClose();
  _ptChangeListeners.forEach(fn => fn(val));
});
document.addEventListener('click', (e) => {
  if (!_ptTrigger.contains(e.target) && !_ptDropdown.contains(e.target)) _ptClose();
});

function _ptSetValue(val) {
  _ptValue = val;
  const opt = _ptDropdown.querySelector(`.custom-select-option[data-value="${val}"]`);
  _ptLabel.textContent = opt ? opt.textContent : val;
  _ptDropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.toggle('selected', o.dataset.value === val));
  _updateProcessDesc(val);
}

const processTypeSelect = {
  get value() { return _ptValue; },
  set value(v) { _ptSetValue(v); },
  querySelector(sel) { return _ptDropdown.querySelector(sel); },
  addEventListener(evt, fn) { if (evt === 'change') _ptChangeListeners.push(fn); },
};
const processDescEl = document.getElementById('process-type-desc');
const PROCESS_DESCS = {
  mainCut:   { title: 'Main Cut',        body: 'Cuts the primary outline of the part all the way through the material.' },
  fold:      { title: 'Fold / Score',    body: 'Scores the surface or perforates the material without cutting through. Either a clean line or dashed line.' },
  finalCut:  { title: 'Final Cut',       body: 'Releases the finished piece from the sheet. Runs last so parts stay in place during cutting.' },
  etch:      { title: 'Etch',            body: 'Burns a design into the surface without cutting through. Used for labels, artwork, or texture.' },
  free:      { title: 'Free Appearance', body: '</br><span style="color:#cc0000">No laser process assigned.</span></br>Full control over color and appearance.' },
  __mixed__: { title: 'Mixed',           body: 'Multiple processes applied within this group. Select a process type to <span style="color:#cc0000">apply to all</span>.' },
};

function _updateProcessDesc(val) {
  const d = PROCESS_DESCS[val];
  if (!d) { processDescEl.innerHTML = ''; return; }
  processDescEl.innerHTML = `<strong>${d.title}:</strong> ${d.body}`;
}
_updateProcessDesc('free');

const appearanceFree     = document.getElementById('appearance-free');
const appearanceLocked   = document.getElementById('appearance-locked');
const appearanceEtch     = document.getElementById('appearance-etch');
const appearanceMixed    = document.getElementById('appearance-mixed');
const appearanceImageEtch = document.getElementById('appearance-image-etch');
const lockedStrokeSwatch = document.getElementById('locked-stroke-swatch');
const lockedStrokeLabel  = document.getElementById('locked-stroke-label');
const etchStrokeToggle   = document.getElementById('etch-stroke-toggle');
const etchFillToggle     = document.getElementById('etch-fill-toggle');
const strokeWidthEtch    = document.getElementById('stroke-width-etch');

// Fold dash controls
const foldDashSection   = document.getElementById('fold-dash-section');
const foldSolidBtn      = document.getElementById('fold-solid-btn');
const foldDashedBtn     = document.getElementById('fold-dashed-btn');
const foldDashOptions   = document.getElementById('fold-dash-options');
const foldAlignGroup    = document.getElementById('fold-align-group');
const foldAlignLabel    = document.getElementById('fold-align-label');
const foldDashLenInput  = document.getElementById('fold-dash-len');
const foldGapLenInput   = document.getElementById('fold-gap-len');
const foldAlignNatBtn   = document.getElementById('fold-align-natural');
const foldAlignCtrBtn   = document.getElementById('fold-align-centered');

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

// Strip leading #, expand 3-digit shorthand to 6 digits. Returns bare digits.
function expandHex(hex) {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  return h.length === 3 ? h.split('').map(c => c+c).join('') : h;
}

function hexToRgbStr(hex) {
  if (!hex || hex === 'none' || hex === '—') return hex;
  const full = expandHex(hex);
  const r = parseInt(full.slice(0,2), 16);
  const g = parseInt(full.slice(2,4), 16);
  const b = parseInt(full.slice(4,6), 16);
  return `RGB(${r}, ${g}, ${b})`;
}

function setRgbInputs(rInp, gInp, bInp, hex) {
  if (!hex || hex === 'none' || hex === '—') {
    rInp.value = gInp.value = bInp.value = '';
    return;
  }
  const full = expandHex(hex);
  rInp.value = parseInt(full.slice(0,2), 16);
  gInp.value = parseInt(full.slice(2,4), 16);
  bInp.value = parseInt(full.slice(4,6), 16);
}

function setSwatchNone(wrap, isNone) {
  wrap.classList.toggle('is-none', isNone);
}

function normalizeHex(v) {
  if (!v) return null;
  if (v.toLowerCase() === 'none') return 'none';
  const rgbMatch = v.match(/^RGB?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }
  if (!HEX_RE.test(v)) return null;
  return ('#' + expandHex(v)).toUpperCase();
}

function commonValue(arr, fn) {
  if (!arr.length) return null;
  const v0 = fn(arr[0]);
  for (let i = 1; i < arr.length; i++) if (fn(arr[i]) !== v0) return null;
  return v0;
}

const FOLD_DASH_DEFAULTS = { enabled: false, dashLen: 8, gapLen: 4, caps: 'butt', align: 'natural' };

function _getFoldDash(sh) {
  return sh.foldDash ? { ...FOLD_DASH_DEFAULTS, ...sh.foldDash } : { ...FOLD_DASH_DEFAULTS };
}

function _syncFoldDash(shapes) {
  const fds = shapes.map(_getFoldDash);
  const enabled = commonValue(fds, d => d.enabled);
  const isDashed = enabled === true;
  foldSolidBtn.classList.toggle('active', !isDashed);
  foldDashedBtn.classList.toggle('active', isDashed);
  foldDashOptions.style.display = isDashed ? '' : 'none';
  foldAlignGroup.style.display = isDashed ? '' : 'none';
  foldAlignLabel.style.display = isDashed ? '' : 'none';
  if (isDashed) {
    const dashLen = commonValue(fds, d => d.dashLen);
    const gapLen  = commonValue(fds, d => d.gapLen);
    const align   = commonValue(fds, d => d.align);
    foldDashLenInput.value = dashLen ?? '';
    foldGapLenInput.value  = gapLen  ?? '';
    foldAlignNatBtn.classList.toggle('active', align !== 'centered');
    foldAlignCtrBtn.classList.toggle('active', align === 'centered');
  }
}

// Visit every non-group leaf under a group, recursing through nested groups.
function forEachLeaf(group, fn) {
  for (const child of group.children) {
    if (child.type === 'group') forEachLeaf(child, fn);
    else fn(child);
  }
}

function _setFoldDashInGroup(group, prop, value) {
  forEachLeaf(group, child => {
    if (child.processType !== 'fold') return;
    if (!child.foldDash) child.foldDash = { ...FOLD_DASH_DEFAULTS };
    child.foldDash[prop] = value;
  });
}

function _setFoldDash(prop, value) {
  const hasSelection = store.get().selection.length > 0;
  if (hasSelection) {
    store.commit(() => {
      const s = store.get();
      if (!s.defaults.foldDash) s.defaults.foldDash = { ...FOLD_DASH_DEFAULTS };
      s.defaults.foldDash[prop] = value;
      for (const id of s.selection) {
        const sh = store.findShape(id);
        if (!sh) continue;
        if (sh.type === 'group') _setFoldDashInGroup(sh, prop, value);
        else if (sh.processType === 'fold') {
          if (!sh.foldDash) sh.foldDash = { ...FOLD_DASH_DEFAULTS };
          sh.foldDash[prop] = value;
        }
      }
    }, 'fold-dash');
  } else {
    store.patch(s => {
      if (!s.defaults.foldDash) s.defaults.foldDash = { ...FOLD_DASH_DEFAULTS };
      s.defaults.foldDash[prop] = value;
    }, 'defaults');
  }
}

let syncing = false;

function _showAppearanceMode(mode) {
  appearanceFree.style.display   = mode === 'free'   ? '' : 'none';
  appearanceLocked.style.display = mode === 'locked' ? '' : 'none';
  appearanceEtch.style.display   = mode === 'etch'   ? '' : 'none';
  if (appearanceMixed) appearanceMixed.style.display = mode === 'mixed' ? '' : 'none';
  if (appearanceImageEtch) appearanceImageEtch.style.display = mode === 'imageEtch' ? '' : 'none';
  if (mode !== 'locked') foldDashSection.style.display = 'none';
}

const _PROCESS_SWATCH_COLOR = {
  mainCut: '#0000FF', fold: '#FF0000', finalCut: '#00FF00', etch: '#000000',
};

function _populateMixedList(leaves) {
  const list = document.getElementById('mixed-process-list');
  if (!list) return;
  const seen = new Set();
  const unique = [];
  for (const sh of leaves) {
    const pt = sh.processType ?? 'free';
    if (!seen.has(pt)) { seen.add(pt); unique.push(pt); }
  }
  list.innerHTML = '';
  for (const pt of unique) {
    const def = PROCESS_DEFINITIONS[pt] ?? PROCESS_DEFINITIONS.free;
    const li = document.createElement('li');
    li.className = 'mixed-process-item';
    const swatch = document.createElement('span');
    swatch.className = 'process-swatch';
    const color = _PROCESS_SWATCH_COLOR[pt];
    if (color) {
      swatch.style.background = color;
    } else {
      swatch.style.background = 'transparent';
    }
    li.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = def.label ?? pt;
    li.appendChild(label);
    list.appendChild(li);
  }
}

function syncFromState() {
  if (syncing) return;
  syncing = true;
  const s = store.get();
  const sel = s.selection.map(id => store.findShape(id)).filter(Boolean);

  const isSingleText = sel.length === 1 && sel[0].type === 'text';
  const isTextTool = s.activeTool === 'text';
  if (textPanel) textPanel.style.display = (isSingleText || isTextTool) ? '' : 'none';

  const isSinglePolygon = sel.length === 1 && sel[0].type === 'polygon';
  if (polygonPanel) {
    polygonPanel.style.display = isSinglePolygon ? '' : 'none';
    if (isSinglePolygon) {
      polygonSidesInput.value = sel[0].attrs.sides ?? 6;
    }
  }

  const isSingleStar = sel.length === 1 && sel[0].type === 'star';
  if (starPanel) {
    starPanel.style.display = isSingleStar ? '' : 'none';
    if (isSingleStar) {
      starPointsInput.value     = sel[0].attrs.points ?? 5;
      starInnerRatioInput.value = (sel[0].attrs.innerRatio ?? 0.4).toFixed(2);
      const valSpan = starInnerRatioInput.closest('.slider-ctrl')?.querySelector('.slider-val');
      if (valSpan) valSpan.textContent = _sliderValText(starInnerRatioInput);
    }
  }

  if (cornerPanel) {
    const cs = getCornerUIState();
    cornerPanel.style.display = cs.visible ? '' : 'none';
    if (cs.visible && document.activeElement !== cornerRadiusInput) {
      cornerPanelTitle.textContent  = cs.scope === 'one' ? 'Corner' : 'Corners';
      cornerRadiusLabel.textContent = 'Radius';
      cornerRadiusInput.max   = cs.maxIn;
      cornerRadiusInput.value = cs.valueIn == null ? '' : cs.valueIn;
    }
  }

  if (!sel.length) {
    // No selection — show activeProcess (default for next shape)
    const ap = s.activeProcess ?? 'free';
    processTypeSelect.value = ap;
    if (ap === 'etch') {
      _showAppearanceMode('etch');
      etchStrokeToggle.classList.toggle('active', s.defaults.strokeEnabled);
      etchStrokeToggle.setAttribute('aria-pressed', s.defaults.strokeEnabled);
      etchFillToggle.classList.toggle('active', s.defaults.fillEnabled);
      etchFillToggle.setAttribute('aria-pressed', s.defaults.fillEnabled);
      strokeWidthEtch.value = s.defaults.strokeWidth;
    } else if (ap === 'mainCut' || ap === 'fold' || ap === 'finalCut') {
      _showAppearanceMode('locked');
      const def = PROCESS_DEFINITIONS[ap];
      lockedStrokeSwatch.style.background = def.stroke;
      lockedStrokeLabel.textContent = hexToRgbStr(def.stroke);
      if (ap === 'fold') {
        foldDashSection.style.display = '';
        _syncFoldDash([{ foldDash: s.defaults.foldDash ?? FOLD_DASH_DEFAULTS }]);
      } else {
        foldDashSection.style.display = 'none';
      }
    } else {
      _showAppearanceMode('free');
      fillColor.value   = ensureColor(s.defaults.fill);
      setRgbInputs(fillR, fillG, fillB, s.defaults.fillEnabled ? s.defaults.fill : null);
      setSwatchNone(fillSwatchWrap, !s.defaults.fillEnabled);
      strokeColor.value = ensureColor(s.defaults.stroke);
      setRgbInputs(strokeR, strokeG, strokeB, s.defaults.strokeEnabled ? s.defaults.stroke : null);
      setSwatchNone(strokeSwatchWrap, !s.defaults.strokeEnabled);
      strokeWidth.value = s.defaults.strokeWidth;
    }
    [tX, tY, tW, tH, tR].forEach(i => { i.value = ''; i.disabled = true; });
    qrBtns.forEach(b => b.disabled = true);
    syncing = false;
    return;
  }

  [tX, tY, tW, tH, tR].forEach(i => i.disabled = false);
  qrBtns.forEach(b => b.disabled = false);

  // Process type across selection — for groups, inspect their leaf children
  const nonGroups = sel.filter(sh => sh.type !== 'group');
  const groupLeaves = [];
  sel.filter(sh => sh.type === 'group').forEach(g => _collectLeaves(g, groupLeaves));
  const allLeaves = [...nonGroups, ...groupLeaves];

  const pt = allLeaves.length
    ? commonValue(allLeaves, sh => sh.processType ?? 'free')
    : null;

  // Update process dropdown
  const isMixed = allLeaves.length > 0 && pt === null;
  processTypeSelect.querySelector('.custom-select-option[data-value="__mixed__"]').hidden = !isMixed;
  processTypeSelect.value = isMixed ? '__mixed__' : (pt ?? 'free');

  // Images only support Free Appearance + Etch — hide the cut/fold options.
  const onlyImages = sel.length > 0 && sel.every(sh => sh.type === 'image');
  for (const v of ['mainCut', 'fold', 'finalCut']) {
    const opt = processTypeSelect.querySelector(`.custom-select-option[data-value="${v}"]`);
    if (opt) opt.hidden = onlyImages;
  }
  if (onlyImages) _ensureImageEtch(sel);

  // Show correct appearance section
  if (isMixed) {
    _showAppearanceMode('mixed');
    _populateMixedList(allLeaves);
  } else if (pt === 'free' || pt === null) {
    _showAppearanceMode('free');
    const fill   = commonValue(sel, sh => sh.fill);
    const stroke = commonValue(sel, sh => sh.stroke);
    const sw     = commonValue(sel, sh => sh.strokeWidth);
    fillColor.value   = ensureColor(fill);
    setRgbInputs(fillR, fillG, fillB, fill ?? null);
    setSwatchNone(fillSwatchWrap, fill === 'none');
    strokeColor.value = ensureColor(stroke);
    setRgbInputs(strokeR, strokeG, strokeB, stroke ?? null);
    setSwatchNone(strokeSwatchWrap, stroke === 'none');
    strokeWidth.value = sw ?? '';
  } else if (pt === 'etch' && sel.length === 1 && sel[0].type === 'image') {
    // Raster etch — dedicated image-processing panel (image-etch-panel.js syncs controls).
    _showAppearanceMode('imageEtch');
  } else if (pt === 'etch') {
    _showAppearanceMode('etch');
    const stroke = commonValue(allLeaves, sh => sh.stroke);
    const fill   = commonValue(allLeaves, sh => sh.fill);
    const sw     = commonValue(allLeaves, sh => sh.strokeWidth);
    etchStrokeToggle.classList.toggle('active', stroke !== 'none');
    etchStrokeToggle.setAttribute('aria-pressed', stroke !== 'none');
    etchFillToggle.classList.toggle('active', fill !== 'none');
    etchFillToggle.setAttribute('aria-pressed', fill !== 'none');
    strokeWidthEtch.value = sw ?? '';
  } else {
    // locked process type (mainCut, fold, finalCut)
    _showAppearanceMode('locked');
    const def = PROCESS_DEFINITIONS[pt];
    lockedStrokeSwatch.style.background = def.stroke;
    lockedStrokeLabel.textContent = hexToRgbStr(def.stroke);
    // Show fold dash controls only for fold type
    foldDashSection.style.display = pt === 'fold' ? '' : 'none';
    if (pt === 'fold') _syncFoldDash(nonGroups);
  }

  // bounding box across selection
  if (sel.length === 1) {
    const b = artboard.getShapeBBox(sel[0]);
    tX.value = round(pxToIn(b.x), 2);
    tY.value = round(pxToIn(b.y), 2);
    tW.value = round(pxToIn(b.w), 2);
    tH.value = round(pxToIn(b.h), 2);
    tR.value = round(sel[0].rotation || 0, 1);
  } else {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sh of sel) {
      const b = artboard.getShapeBBox(sh);
      if (sh.rotation) {
        for (const p of rotatedCorners(b, sh.rotation)) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      } else {
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      }
    }
    tX.value = round(pxToIn(minX), 2);
    tY.value = round(pxToIn(minY), 2);
    tW.value = round(pxToIn(maxX - minX), 2);
    tH.value = round(pxToIn(maxY - minY), 2);
    tR.value = '';
  }
  syncing = false;
}

function _applyAppearanceToGroup(group, prop, value) {
  forEachLeaf(group, child => { child[prop] = value; });
}

function _collectLeaves(group, out) {
  forEachLeaf(group, child => out.push(child));
}

function _applyProcessTypeToGroup(group, pt) {
  forEachLeaf(group, child => { child.processType = pt; normalizeForProcess(child, pt); });
}

// Ensure each selected Etch image has its `attrs.etch` adjustment params. Actual
// baking of attrs.etchHref is handled reactively by image-etch-panel.js (which
// watches the param signature). Defaults patched without history.
function _ensureImageEtch(sel) {
  for (const sh of sel) {
    if (sh.type !== 'image' || sh.processType !== 'etch' || sh.attrs.etch) continue;
    const id = sh.id;
    store.patch(() => {
      const live = store.findShape(id);
      if (live && live.type === 'image' && !live.attrs.etch) live.attrs.etch = defaultEtchParams();
    }, 'image-etch-init');
  }
}

function setProcessType(pt) {
  if (syncing) return;
  store.commit(s => {
    s.activeProcess = pt;
    for (const id of store.get().selection) {
      const sh = store.findShape(id);
      if (!sh) continue;
      if (sh.type === 'group') {
        _applyProcessTypeToGroup(sh, pt);
      } else {
        sh.processType = pt;
        normalizeForProcess(sh, pt);
        if (sh.type === 'image' && pt === 'etch' && !sh.attrs.etch) {
          sh.attrs.etch = defaultEtchParams();
        }
      }
    }
  }, 'process-type');
}

function ensureColor(v) {
  if (!v || v === 'none') return '#000000';
  return v.length === 4 ? '#' + expandHex(v) : v;
}

// ---------------- Fill / Stroke / Weight ----------------
function setAppearance(prop, value) {
  if (syncing) return;
  const s = store.get();
  if (!s.selection.length) {
    // mutate defaults
    if (prop === 'fill')        store.patch(st => { st.defaults.fill = value; st.defaults.fillEnabled = value !== 'none'; }, 'defaults');
    else if (prop === 'stroke') store.patch(st => { st.defaults.stroke = value; st.defaults.strokeEnabled = value !== 'none'; }, 'defaults');
    else if (prop === 'strokeWidth') store.patch(st => st.defaults.strokeWidth = value, 'defaults');
    return;
  }
  store.commit(() => {
    for (const id of store.get().selection) {
      const sh = store.findShape(id);
      if (!sh) continue;
      if (sh.type === 'group') {
        _applyAppearanceToGroup(sh, prop, value);
      } else {
        sh[prop] = value;
      }
    }
  }, 'appearance');
}

function bindColor(colorInput, swatchWrap, rInp, gInp, bInp, prop, noneBtn) {
  function rgbToHex() {
    const r = Math.min(255, Math.max(0, parseInt(rInp.value) || 0));
    const g = Math.min(255, Math.max(0, parseInt(gInp.value) || 0));
    const b = Math.min(255, Math.max(0, parseInt(bInp.value) || 0));
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
  }
  let tx = false;
  colorInput.addEventListener('input', () => {
    const v = colorInput.value.toUpperCase();
    if (!tx) { store.beginTransaction(); tx = true; }
    setRgbInputs(rInp, gInp, bInp, v);
    setSwatchNone(swatchWrap, false);
    setAppearance(prop, v);
  });
  colorInput.addEventListener('change', () => { if (tx) { store.endTransaction(prop); tx = false; } });
  [rInp, gInp, bInp].forEach(inp => {
    inp.addEventListener('input', () => {
      if (!tx) { store.beginTransaction(); tx = true; }
      const v = rgbToHex().toUpperCase();
      colorInput.value = v;
      setSwatchNone(swatchWrap, false);
      setAppearance(prop, v);
    });
    inp.addEventListener('change', () => { if (tx) { store.endTransaction(prop); tx = false; } });
  });
  noneBtn.addEventListener('click', () => {
    rInp.value = gInp.value = bInp.value = '';
    setSwatchNone(swatchWrap, true);
    setAppearance(prop, 'none');
  });
}

bindColor(fillColor,   fillSwatchWrap,   fillR,   fillG,   fillB,   'fill',   fillNone);
bindColor(strokeColor, strokeSwatchWrap, strokeR, strokeG, strokeB, 'stroke', strokeNone);

strokeWidth.addEventListener('change', () => {
  const v = Math.max(0, parseFloat(strokeWidth.value) || 0);
  setAppearance('strokeWidth', v);
});

// Process type dropdown
processTypeSelect.addEventListener('change', () => {
  const pt = processTypeSelect.value;
  if (pt === '__mixed__') return;
  if (!store.get().selection.length) {
    store.patch(s => { s.activeProcess = pt; }, 'active-process');
  } else {
    setProcessType(pt);
  }
});

// Etch toggle buttons
function _etchLeaves() {
  const sel = store.get().selection.map(id => store.findShape(id)).filter(Boolean);
  const leaves = [];
  for (const sh of sel) {
    if (sh.type === 'group') _collectLeaves(sh, leaves);
    else leaves.push(sh);
  }
  return leaves;
}
etchStrokeToggle.addEventListener('click', () => {
  const cur = commonValue(_etchLeaves(), sh => sh.stroke);
  setAppearance('stroke', cur !== 'none' ? 'none' : '#000000');
});
etchFillToggle.addEventListener('click', () => {
  const cur = commonValue(_etchLeaves(), sh => sh.fill);
  setAppearance('fill', cur !== 'none' ? 'none' : '#000000');
});
strokeWidthEtch.addEventListener('change', () => {
  const v = Math.max(0, parseFloat(strokeWidthEtch.value) || 0);
  setAppearance('strokeWidth', v);
});

// Fold dash event listeners
foldSolidBtn.addEventListener('click', () => _setFoldDash('enabled', false));
foldDashedBtn.addEventListener('click', () => _setFoldDash('enabled', true));
foldDashLenInput.addEventListener('change', () => {
  const v = Math.max(1, parseFloat(foldDashLenInput.value) || 8);
  foldDashLenInput.value = v;
  _setFoldDash('dashLen', v);
});
foldGapLenInput.addEventListener('change', () => {
  const v = Math.max(0.5, parseFloat(foldGapLenInput.value) || 4);
  foldGapLenInput.value = v;
  _setFoldDash('gapLen', v);
});
foldAlignNatBtn.addEventListener('click', () => _setFoldDash('align', 'natural'));
foldAlignCtrBtn.addEventListener('click', () => _setFoldDash('align', 'centered'));

// ---------------- Transform ----------------
function applyTransform() {
  if (syncing) return;
  const s = store.get();
  if (s.selection.length !== 1) return;
  const sh = store.findShape(s.selection[0]);
  if (!sh) return;

  const x = inToPx(parseFloat(tX.value) || 0);
  const y = inToPx(parseFloat(tY.value) || 0);
  const w = Math.max(0.0001, inToPx(parseFloat(tW.value) || 0));
  const h = Math.max(0.0001, inToPx(parseFloat(tH.value) || 0));
  const rot = parseFloat(tR.value) || 0;

  store.commit(() => {
    const live = store.findShape(sh.id);
    if (!live) return;
    const bb = artboard.getShapeBBox(live);
    applyBBox(live, { x: bb.x, y: bb.y, w: bb.w, h: bb.h }, { x, y, w, h });
    live.rotation = rot;
  }, 'transform-input');
}

function applyBBox(sh, ob, nb) {
  switch (sh.type) {
    case 'rect': {
      sh.attrs.x = nb.x; sh.attrs.y = nb.y; sh.attrs.w = nb.w; sh.attrs.h = nb.h;
      const half = Math.min(nb.w, nb.h) / 2;
      const rsx = ob.w > 0 ? nb.w / ob.w : 1;
      const rsy = ob.h > 0 ? nb.h / ob.h : 1;
      const rsc = Math.min(rsx, rsy);
      if (sh.attrs.rx != null) sh.attrs.rx = Math.min(sh.attrs.rx * rsc, half);
      for (const k of ['r_nw', 'r_ne', 'r_se', 'r_sw']) {
        if (sh.attrs[k] != null) sh.attrs[k] = Math.min(sh.attrs[k] * rsc, half);
      }
      break;
    }
    case 'image': sh.attrs.x = nb.x; sh.attrs.y = nb.y; sh.attrs.w = nb.w; sh.attrs.h = nb.h; break;
    case 'ellipse': sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2; sh.attrs.rx = nb.w/2; sh.attrs.ry = nb.h/2; break;
    case 'line': {
      const sx = nb.w / Math.max(0.0001, ob.w), sy = nb.h / Math.max(0.0001, ob.h);
      sh.attrs.x1 = nb.x + (sh.attrs.x1 - ob.x) * sx;
      sh.attrs.y1 = nb.y + (sh.attrs.y1 - ob.y) * sy;
      sh.attrs.x2 = nb.x + (sh.attrs.x2 - ob.x) * sx;
      sh.attrs.y2 = nb.y + (sh.attrs.y2 - ob.y) * sy;
      break;
    }
    case 'polygon':
    case 'star': sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2; sh.attrs.r = Math.min(nb.w, nb.h)/2; break;
    case 'text': {
      const scale = nb.h / Math.max(1, ob.h);
      sh.attrs.size = Math.max(2, sh.attrs.size * scale);
      sh.attrs.x = nb.x; sh.attrs.y = nb.y;
      break;
    }
    case 'path': {
      sh.attrs.d = scalePathD(sh.attrs.d, ob, nb);
      if (sh.attrs.corners) {
        const psx = ob.w > 0 ? nb.w / ob.w : 1;
        const psy = ob.h > 0 ? nb.h / ob.h : 1;
        const psc = Math.min(psx, psy);
        const scaled = {};
        for (const [k, v] of Object.entries(sh.attrs.corners)) scaled[k] = v * psc;
        sh.attrs.corners = scaled;
      }
      break;
    }
    case 'group': {
      const gsx = ob.w > 0 ? nb.w / ob.w : 1;
      const gsy = ob.h > 0 ? nb.h / ob.h : 1;
      for (const child of sh.children) {
        const cb = artboard.getShapeBBox(child);
        applyBBox(child, cb, {
          x: nb.x + (cb.x - ob.x) * gsx,
          y: nb.y + (cb.y - ob.y) * gsy,
          w: Math.max(0.0001, cb.w * gsx),
          h: Math.max(0.0001, cb.h * gsy),
        });
      }
      break;
    }
  }
}
[tX, tY, tW, tH, tR].forEach(i => i.addEventListener('change', applyTransform));

qrBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.flip) {
      const s = store.get();
      if (s.selection.length === 0) return;
      quickFlip(btn.dataset.flip);
      return;
    }
    if (!btn.dataset.deg) return;
    const s = store.get();
    if (s.selection.length === 0) return;
    const delta = parseFloat(btn.dataset.deg);
    tR.value = (parseFloat(tR.value) || 0) + delta;
    applyTransform();
  });
});


polygonSidesInput.addEventListener('change', () => {
  const n = Math.max(3, Math.min(64, parseInt(polygonSidesInput.value) || 6));
  polygonSidesInput.value = n;
  store.commit(s => {
    for (const id of s.selection) {
      const sh = store.findShape(id);
      if (sh?.type === 'polygon') sh.attrs.sides = n;
    }
  }, 'polygon-sides');
});

starPointsInput.addEventListener('change', () => {
  const n = Math.max(3, Math.min(20, parseInt(starPointsInput.value) || 5));
  starPointsInput.value = n;
  store.commit(s => {
    for (const id of s.selection) {
      const sh = store.findShape(id);
      if (sh?.type === 'star') sh.attrs.points = n;
    }
  }, 'star-points');
});

starInnerRatioInput.addEventListener('input', () => {
  const v = Math.max(0.05, Math.min(0.95, parseFloat(starInnerRatioInput.value) || 0.4));
  const valSpan = starInnerRatioInput.closest('.slider-ctrl')?.querySelector('.slider-val');
  if (valSpan) valSpan.textContent = _sliderValText(starInnerRatioInput);
  store.patch(s => {
    for (const id of s.selection) {
      const sh = store.findShape(id);
      if (sh?.type === 'star') sh.attrs.innerRatio = v;
    }
  }, 'star-inner-ratio');
});
starInnerRatioInput.addEventListener('change', () => {
  const v = Math.max(0.05, Math.min(0.95, parseFloat(starInnerRatioInput.value) || 0.4));
  store.commit(s => {
    for (const id of s.selection) {
      const sh = store.findShape(id);
      if (sh?.type === 'star') sh.attrs.innerRatio = v;
    }
  }, 'star-inner-ratio');
});

if (cornerRadiusInput) {
  cornerRadiusInput.addEventListener('change', () => {
    if (cornerRadiusInput.value === '') return; // left "Mixed" untouched
    setCornerRadiusIn(parseFloat(cornerRadiusInput.value) || 0);
    const cs = getCornerUIState(); // reflect clamping back into the field
    if (cs.visible && cs.valueIn != null) cornerRadiusInput.value = cs.valueIn;
  });
}

function _sliderValText(input) {
  const step = parseFloat(input.step) || 1;
  const val  = step % 1 === 0 ? input.value : parseFloat(input.value).toFixed(2);
  const unit = input.dataset.unit || '';
  return unit ? `${val} ${unit}` : val;
}

// Wire stepper buttons — works for .stepper and .slider-ctrl containers
document.querySelectorAll('.stepper, .slider-ctrl').forEach(wrap => {
  const input   = wrap.querySelector('input');
  const valSpan = wrap.querySelector('.slider-val');
  wrap.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta);
      const min  = input.min !== '' ? parseFloat(input.min) : -Infinity;
      const max  = input.max !== '' ? parseFloat(input.max) :  Infinity;
      const step = parseFloat(input.step) || 1;
      const cur  = parseFloat(input.value) || 0;
      const next = Math.max(min, Math.min(max, cur + delta * step));
      input.value = step % 1 === 0 ? next : next.toFixed(2);
      if (valSpan) valSpan.textContent = _sliderValText(input);
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
    });
  });
});

store.subscribe(syncFromState);
window.addEventListener('lm-overlay-change', syncFromState);
syncFromState();
