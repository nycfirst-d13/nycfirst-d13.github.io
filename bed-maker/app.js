// app.js — entry point. Wire inspector controls, init modules, status bar.

import { state, subscribe, render, getPiece, pxToIn } from './modules/state.js';
import './modules/cache.js';  // restores saved board at import time; wires Clear button
import { initImport, retrimPiece } from './modules/import.js';
import { arrange } from './modules/arrange.js';
import { initBed, fitView, deleteSelected, rotateSelected, flipSelected } from './modules/bed.js';
import { initExport } from './modules/export.js';
import { initRulers } from './modules/rulers.js';

const $ = id => document.getElementById(id);

function initInspector() {
  // Layout config — numeric fields re-arrange on change.
  const num = (id, key, min) => {
    const el = $(id);
    el.value = state.cfg[key];
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      if (isFinite(v) && v >= min) { state.cfg[key] = v; arrange(); }
      else el.value = state.cfg[key];
    });
  };
  num('cfg-maxw', 'maxWIn', 0.25);   // dimensions must be positive
  num('cfg-maxh', 'maxHIn', 0.25);
  num('cfg-gap', 'gapIn', 0);        // gap may be zero (parts touching)

  $('cfg-tiling').value = state.cfg.tiling;
  $('cfg-tiling').addEventListener('change', e => { state.cfg.tiling = e.target.value; arrange(); });

  $('cfg-rowflip').checked = state.cfg.rowFlip;
  $('cfg-rowflip').addEventListener('change', e => { state.cfg.rowFlip = e.target.checked; arrange(); });

  $('cfg-snap').checked = state.cfg.snap;
  $('cfg-snap').addEventListener('change', e => { state.cfg.snap = e.target.checked; });

  $('arrange-btn').addEventListener('click', () => arrange());
  $('fit-btn').addEventListener('click', () => fitView());

  $('sel-rotate').addEventListener('click', rotateSelected);
  $('sel-flip').addEventListener('click', flipSelected);
  $('sel-delete').addEventListener('click', deleteSelected);
  $('sel-trim').addEventListener('click', () => { if (state.selection) retrimPiece(state.selection); });
}

function syncStatus() {
  $('status-count').textContent = `${state.pieces.length} part${state.pieces.length === 1 ? '' : 's'}`;
  const of = $('status-overflow');
  of.hidden = state.overflow === 0;
  of.textContent = `${state.overflow} off-bed`;

  // Selected-piece panel
  const p = getPiece(state.selection);
  const panel = $('panel-selected');
  if (p) {
    panel.hidden = false;
    $('sel-name').textContent = p.name;
    const w = (p.natWIn * p.scale), h = (p.natHIn * p.scale);
    $('sel-size').textContent = `${w.toFixed(2)} × ${h.toFixed(2)} in` +
      (p.rot ? ` · ${p.rot}°` : '') + (p.flipY ? ' · flipped' : '');
  } else {
    panel.hidden = true;
  }
}

function initCursorReadout() {
  const area = $('canvas-area');
  const out = $('status-cursor');
  area.addEventListener('pointermove', e => {
    const rect = area.getBoundingClientRect();
    const { zoom, panX, panY } = state.viewport;
    const x = pxToIn((e.clientX - rect.left - panX) / zoom);
    const y = pxToIn((e.clientY - rect.top - panY) / zoom);
    out.textContent = `${x.toFixed(2)}, ${y.toFixed(2)} in`;
  });
}

initInspector();
initImport();
initBed();
initRulers();
initExport();
initCursorReadout();
subscribe(syncStatus);
render();
