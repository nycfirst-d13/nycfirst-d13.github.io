// =============================================================================
// properties.js — inspector controls (fill, stroke, weight, x/y/w/h, rotate)
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { inToPx, pxToIn, round, rotatedCorners } from './utils.js';

const fillColor   = document.getElementById('fill-color');
const fillHex     = document.getElementById('fill-hex');
const fillNone    = document.getElementById('fill-none');
const strokeColor = document.getElementById('stroke-color');
const strokeHex   = document.getElementById('stroke-hex');
const strokeNone  = document.getElementById('stroke-none');
const strokeWidth = document.getElementById('stroke-width');
const tX = document.getElementById('t-x');
const tY = document.getElementById('t-y');
const tW = document.getElementById('t-w');
const tH = document.getElementById('t-h');
const tR = document.getElementById('t-r');

const textPanel = document.getElementById('text-panel');

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function normalizeHex(v) {
  if (!v) return null;
  if (v.toLowerCase() === 'none') return 'none';
  if (!HEX_RE.test(v)) return null;
  let h = v.startsWith('#') ? v : '#' + v;
  if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c+c).join('');
  return h.toUpperCase();
}

function commonValue(arr, fn) {
  if (!arr.length) return null;
  const v0 = fn(arr[0]);
  for (let i = 1; i < arr.length; i++) if (fn(arr[i]) !== v0) return null;
  return v0;
}

let syncing = false;

function syncFromState() {
  if (syncing) return;
  syncing = true;
  const s = store.get();
  const sel = s.selection.map(id => store.findShape(id)).filter(Boolean);

  const isSingleText = sel.length === 1 && sel[0].type === 'text';
  const isTextTool = s.activeTool === 'text';
  if (textPanel) textPanel.style.display = (isSingleText || isTextTool) ? '' : 'none';

  if (!sel.length) {
    fillColor.value   = ensureColor(s.defaults.fill);
    fillHex.value     = s.defaults.fillEnabled ? s.defaults.fill : 'none';
    strokeColor.value = ensureColor(s.defaults.stroke);
    strokeHex.value   = s.defaults.strokeEnabled ? s.defaults.stroke : 'none';
    strokeWidth.value = s.defaults.strokeWidth;
    [tX, tY, tW, tH, tR].forEach(i => { i.value = ''; i.disabled = true; });
    syncing = false;
    return;
  }

  [tX, tY, tW, tH, tR].forEach(i => i.disabled = false);

  const fill   = commonValue(sel, sh => sh.fill);
  const stroke = commonValue(sel, sh => sh.stroke);
  const sw     = commonValue(sel, sh => sh.strokeWidth);

  fillHex.value     = fill   ?? '—';
  fillColor.value   = ensureColor(fill);
  strokeHex.value   = stroke ?? '—';
  strokeColor.value = ensureColor(stroke);
  strokeWidth.value = sw ?? '';

  // bounding box across selection (ignores rotation for the input read)
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
  for (const child of group.children) {
    if (child.type === 'group') _applyAppearanceToGroup(child, prop, value);
    else child[prop] = value;
  }
}

function ensureColor(v) {
  if (!v || v === 'none') return '#000000';
  if (v.length === 4) return '#' + [...v.slice(1)].map(c => c+c).join('');
  return v;
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

function bindColor(colorInput, hexInput, prop, noneBtn) {
  let tx = false;
  colorInput.addEventListener('input', () => {
    const v = colorInput.value.toUpperCase();
    if (!tx) { store.beginTransaction(); tx = true; }
    hexInput.value = v;
    setAppearance(prop, v);
  });
  colorInput.addEventListener('change', () => { if (tx) { store.endTransaction(prop); tx = false; } });
  hexInput.addEventListener('change', () => {
    const v = normalizeHex(hexInput.value);
    if (v === null) { syncFromState(); return; }
    if (v !== 'none') colorInput.value = v;
    setAppearance(prop, v);
  });
  noneBtn.addEventListener('click', () => {
    hexInput.value = 'none';
    setAppearance(prop, 'none');
  });
}

bindColor(fillColor,   fillHex,   'fill',   fillNone);
bindColor(strokeColor, strokeHex, 'stroke', strokeNone);

strokeWidth.addEventListener('change', () => {
  const v = Math.max(0, parseFloat(strokeWidth.value) || 0);
  setAppearance('strokeWidth', v);
});

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
    case 'ellipse': sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2; sh.attrs.rx = nb.w/2; sh.attrs.ry = nb.h/2; break;
    case 'line': {
      const sx = nb.w / Math.max(0.0001, ob.w), sy = nb.h / Math.max(0.0001, ob.h);
      sh.attrs.x1 = nb.x + (sh.attrs.x1 - ob.x) * sx;
      sh.attrs.y1 = nb.y + (sh.attrs.y1 - ob.y) * sy;
      sh.attrs.x2 = nb.x + (sh.attrs.x2 - ob.x) * sx;
      sh.attrs.y2 = nb.y + (sh.attrs.y2 - ob.y) * sy;
      break;
    }
    case 'polygon': sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2; sh.attrs.r = Math.min(nb.w, nb.h)/2; break;
    case 'text': {
      const scale = nb.h / Math.max(1, ob.h);
      sh.attrs.size = Math.max(2, sh.attrs.size * scale);
      sh.attrs.x = nb.x; sh.attrs.y = nb.y;
      break;
    }
    case 'path': {
      sh.attrs.d = scaleD(sh.attrs.d, ob, nb);
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
function scaleD(d, ob, nb) {
  const sx = nb.w / Math.max(0.0001, ob.w);
  const sy = nb.h / Math.max(0.0001, ob.h);
  return d.replace(/([MLCSQTAHVZmlcsqtahvz])([^MLCSQTAHVZmlcsqtahvz]*)/g, (m, cmd, args) => {
    if (cmd === 'Z' || cmd === 'z') return cmd;
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const isAbs = cmd === cmd.toUpperCase();
    let scaled;
    if (cmd === 'H' || cmd === 'h') scaled = nums.map(n => isAbs ? nb.x + (n - ob.x) * sx : n * sx);
    else if (cmd === 'V' || cmd === 'v') scaled = nums.map(n => isAbs ? nb.y + (n - ob.y) * sy : n * sy);
    else scaled = nums.map((n, i) => (i % 2 === 0)
      ? (isAbs ? nb.x + (n - ob.x) * sx : n * sx)
      : (isAbs ? nb.y + (n - ob.y) * sy : n * sy));
    return cmd + ' ' + scaled.map(n => n.toFixed(3)).join(' ');
  });
}

[tX, tY, tW, tH, tR].forEach(i => i.addEventListener('change', applyTransform));

store.subscribe(syncFromState);
syncFromState();
