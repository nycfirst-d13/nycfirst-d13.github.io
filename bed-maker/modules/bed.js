// bed.js — render pieces as <img> on a zoom/pan bed; click-select, drag-move,
// keyboard nudge/rotate/flip/delete. DOM + one CSS transform, no canvas renderer.

import { state, render, subscribe, getPiece, inToPx, pxToIn } from './state.js';
import { arrange } from './arrange.js';

let canvasArea, stage, bed, dropHint;
let tool = 'select';          // 'select' | 'hand'
let spaceDown = false;

// ---- viewport ----

function applyViewport() {
  const { zoom, panX, panY } = state.viewport;
  stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  // pan/zoom bypass render() — tell the rulers to redraw
  window.dispatchEvent(new CustomEvent('bm-viewport'));
}

export function fitView() {
  const area = canvasArea.getBoundingClientRect();
  const bw = inToPx(state.bed.wIn), bh = inToPx(state.bed.hIn);
  const pad = 48;
  const zoom = Math.min((area.width - pad) / bw, (area.height - pad) / bh, 4) || 1;
  state.viewport.zoom = zoom;
  state.viewport.panX = (area.width - bw * zoom) / 2;
  state.viewport.panY = (area.height - bh * zoom) / 2;
  applyViewport();
}

// Transform string for a placed piece box, applying rotation + row-flip about
// the box center. Used verbatim (in px) by export.js too.
export function pieceTransform(cx, cy, rot, flipY) {
  const sy = flipY ? -1 : 1;
  if (!rot && sy === 1) return '';
  return `translate(${cx} ${cy}) rotate(${rot || 0}) scale(1 ${sy}) translate(${-cx} ${-cy})`;
}

// ---- rendering ----

function renderBed() {
  const bw = inToPx(state.bed.wIn), bh = inToPx(state.bed.hIn);
  bed.style.width = bw + 'px';
  bed.style.height = bh + 'px';

  const seen = new Set();
  for (const p of state.pieces) {
    seen.add(p.id);
    let el = bed.querySelector(`img.piece[data-id="${p.id}"]`);
    if (!el) {
      el = document.createElement('img');
      el.className = 'piece';
      el.dataset.id = p.id;
      el.draggable = false;
      bed.appendChild(el);
    }
    if (el.src !== p.href && p.href) el.src = p.href;
    const w = inToPx(p.natWIn * p.scale), h = inToPx(p.natHIn * p.scale);
    el.style.left = inToPx(p.xIn) + 'px';
    el.style.top = inToPx(p.yIn) + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.transform = `rotate(${p.rot || 0}deg) scaleY(${p.flipY ? -1 : 1})`;
    el.classList.toggle('selected', state.selection === p.id);
    const over = p.xIn < 0 || p.yIn < 0 ||
      p.xIn + p.natWIn * p.scale > state.bed.wIn + 1e-6 ||
      p.yIn + p.natHIn * p.scale > state.bed.hIn + 1e-6;
    el.classList.toggle('overflow', over);
  }
  // drop removed pieces
  bed.querySelectorAll('img.piece').forEach(el => {
    if (!seen.has(el.dataset.id)) el.remove();
  });

  dropHint.hidden = state.pieces.length > 0;
  applyViewport();
}

// ---- piece ops (also called by inspector buttons) ----

export function deleteSelected() {
  if (!state.selection) return;
  state.pieces = state.pieces.filter(p => p.id !== state.selection);
  state.selection = null;
  render();
}
export function rotateSelected() {
  const p = getPiece(state.selection);
  if (!p) return;
  p.rot = ((p.rot || 0) + 90) % 360;
  render();
}
export function flipSelected() {
  const p = getPiece(state.selection);
  if (!p) return;
  p.flipY = !p.flipY;
  render();
}

// ---- interaction ----

function screenToBedIn(clientX, clientY) {
  const rect = canvasArea.getBoundingClientRect();
  const { zoom, panX, panY } = state.viewport;
  const xpx = (clientX - rect.left - panX) / zoom;
  const ypx = (clientY - rect.top - panY) / zoom;
  return { xIn: pxToIn(xpx), yIn: pxToIn(ypx) };
}

function initPointer() {
  let drag = null;   // { piece, offX, offY } or { pan, sx, sy, px, py }

  canvasArea.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const handMode = tool === 'hand' || spaceDown;
    const target = e.target.closest('img.piece');

    if (handMode || !target) {
      if (!handMode && !target) { state.selection = null; render(); }
      // start pan
      drag = { pan: true, sx: e.clientX, sy: e.clientY,
               px: state.viewport.panX, py: state.viewport.panY };
      canvasArea.classList.add('panning');
      canvasArea.setPointerCapture(e.pointerId);
      return;
    }

    const p = getPiece(target.dataset.id);
    state.selection = p.id;
    render();
    const pt = screenToBedIn(e.clientX, e.clientY);
    drag = { piece: p, offX: pt.xIn - p.xIn, offY: pt.yIn - p.yIn };
    canvasArea.setPointerCapture(e.pointerId);
  });

  canvasArea.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.pan) {
      state.viewport.panX = drag.px + (e.clientX - drag.sx);
      state.viewport.panY = drag.py + (e.clientY - drag.sy);
      applyViewport();
      return;
    }
    const pt = screenToBedIn(e.clientX, e.clientY);
    let nx = pt.xIn - drag.offX, ny = pt.yIn - drag.offY;
    if (state.cfg.snap) {
      const g = 0.125; // 1/8 in snap
      nx = Math.round(nx / g) * g;
      ny = Math.round(ny / g) * g;
    }
    drag.piece.xIn = nx;
    drag.piece.yIn = ny;
    // live-update only this element (no full render on every frame)
    const el = bed.querySelector(`img.piece[data-id="${drag.piece.id}"]`);
    if (el) { el.style.left = inToPx(nx) + 'px'; el.style.top = inToPx(ny) + 'px'; }
  });

  const end = e => {
    if (!drag) return;
    const wasPiece = !drag.pan;
    drag = null;
    canvasArea.classList.remove('panning');
    if (wasPiece) render(); // recompute overflow flag + settle
  };
  canvasArea.addEventListener('pointerup', end);
  canvasArea.addEventListener('pointercancel', end);

  // wheel = zoom toward cursor
  canvasArea.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvasArea.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const vp = state.viewport;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const z = Math.min(8, Math.max(0.05, vp.zoom * factor));
    // keep the point under the cursor fixed
    vp.panX = mx - (mx - vp.panX) * (z / vp.zoom);
    vp.panY = my - (my - vp.panY) * (z / vp.zoom);
    vp.zoom = z;
    applyViewport();
  }, { passive: false });
}

function initKeys() {
  window.addEventListener('keydown', e => {
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.code === 'Space') { spaceDown = true; canvasArea.classList.add('hand'); return; }
    if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
    if (e.key === 'h' || e.key === 'H') { setTool('hand'); return; }
    if (!state.selection) return;
    const p = getPiece(state.selection);
    const step = e.shiftKey ? 0.5 : 0.1;
    if (e.key === 'ArrowLeft')  { p.xIn -= step; render(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { p.xIn += step; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp')    { p.yIn -= step; render(); e.preventDefault(); }
    else if (e.key === 'ArrowDown')  { p.yIn += step; render(); e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { deleteSelected(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') rotateSelected();
    else if (e.key === 'f' || e.key === 'F') flipSelected();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceDown = false; canvasArea.classList.remove('hand'); }
  });
}

export function setTool(name) {
  tool = name;
  document.querySelectorAll('.tool').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === name));
  canvasArea.classList.toggle('tool-hand', name === 'hand');
}

export function initBed() {
  canvasArea = document.getElementById('canvas-area');
  stage = document.getElementById('bed-stage');
  bed = document.getElementById('bed');
  dropHint = document.getElementById('drop-hint');

  document.querySelectorAll('.tool').forEach(b =>
    b.addEventListener('click', () => setTool(b.dataset.tool)));
  setTool('select');

  initPointer();
  initKeys();
  subscribe(renderBed);
  fitView();
  renderBed();
  window.addEventListener('resize', applyViewport);
}
