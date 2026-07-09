// arrange.js — lay pieces out on the bed per state.cfg.
// Modes: grid (uniform cells), brick (grid + half-cell row offset), compact
// (shelf / next-fit pack). Optional alternating row flip. All units in inches.

import { state, render } from './state.js';

// Size cap: clamp down to fit the max box, never upscale.
function fit(p, cfg) {
  const s = Math.min(cfg.maxWIn / p.natWIn, cfg.maxHIn / p.natHIn, 1);
  return { scale: s, w: p.natWIn * s, h: p.natHIn * s };
}

// Variable-height row packing. Pieces are height-sorted, then greedily flowed
// into rows by width; each row's height is its OWN tallest piece — so one tall
// part never inflates the gaps of every other row. Height-sort makes similar
// heights share rows and pushes tall outliers to the last row(s) automatically,
// no threshold to tune (LIVE: re-runs on every size/spacing change).
//   sortAsc  — short-first (grid/brick, tall falls to end) vs tall-first (compact, tighter).
//   brick    — stagger odd rows by half a cell for interlocking parts.
function layoutRows(pieces, cfg, bed, sortAsc, brick) {
  const gap = cfg.gapIn;
  const dims = pieces.map(p => fit(p, cfg));
  const order = pieces.map((_, i) => i)
    .sort((a, b) => sortAsc ? dims[a].h - dims[b].h : dims[b].h - dims[a].h);

  const brickOffset = brick ? (Math.max(...dims.map(d => d.w)) + gap) / 2 : 0;
  let row = 0;
  const startX = () => (brick && row % 2 === 1) ? brickOffset : 0;

  let x = startX(), y = 0, rowH = 0;
  for (const i of order) {
    const d = dims[i], p = pieces[i];
    if (x > startX() && x + d.w > bed.wIn) {   // wrap to next row
      y += rowH + gap; row++; rowH = 0; x = startX();
    }
    p.scale = d.scale;
    p.xIn = x; p.yIn = y;
    p.flipY = cfg.rowFlip && row % 2 === 1;
    x += d.w + gap;
    rowH = Math.max(rowH, d.h);
  }
}

export function arrange() {
  const { pieces, cfg, bed } = state;
  if (!pieces.length) { state.overflow = 0; render(); return; }

  // grid/brick: short-first so tall parts sink to the last rows.
  // compact: tall-first (decreasing-height shelf) for the tightest fill.
  layoutRows(pieces, cfg, bed, cfg.tiling !== 'compact', cfg.tiling === 'brick');

  // Overflow: anything spilling past the bed (placed anyway, flagged red).
  const eps = 1e-6;
  state.overflow = pieces.reduce((n, p) => {
    const w = p.natWIn * p.scale, h = p.natHIn * p.scale;
    return n + ((p.xIn + w > bed.wIn + eps || p.yIn + h > bed.hIn + eps) ? 1 : 0);
  }, 0);

  render();
}

// ponytail: variable-height row/shelf packing by bounding box, not true irregular
// nesting. Upgrade to a polygon nester (e.g. SVGnest) only if scrap matters.

// Runnable self-check — call arrange.demo() from the console.
export function demo() {
  const mk = (w, h) => ({ natWIn: w, natHIn: h, scale: 1, xIn: 0, yIn: 0, flipY: false });
  const pieces = [mk(4, 3), mk(2, 6), mk(5, 5), mk(3, 3), mk(6, 2), mk(1, 1)];
  const cfg = { maxWIn: 6, maxHIn: 6, gapIn: 0.25, tiling: 'grid', rowFlip: false };
  const bed = { wIn: 36, hIn: 24 };
  layoutRows(pieces, cfg, bed, true, false);

  // 1) every piece stays within bed width
  for (const p of pieces) {
    const w = p.natWIn * p.scale;
    console.assert(p.xIn + w <= bed.wIn + 1e-6, 'piece exceeds bed width', p);
  }
  // 2) no two pieces on the same row (same yIn) overlap in x
  const byY = {};
  for (const p of pieces) (byY[p.yIn] ||= []).push(p);
  for (const row of Object.values(byY)) {
    row.sort((a, b) => a.xIn - b.xIn);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1], w = prev.natWIn * prev.scale;
      console.assert(row[i].xIn + 1e-6 >= prev.xIn + w, 'overlap on row', prev, row[i]);
    }
  }
  // 3) rows are height-sorted: each row's max height >= previous row's (short first)
  const ys = [...Object.keys(byY)].map(Number).sort((a, b) => a - b);
  let prevMax = 0;
  for (const y of ys) {
    const rowMax = Math.max(...byY[y].map(p => p.natHIn * p.scale));
    console.assert(rowMax + 1e-6 >= prevMax, 'rows not height-sorted', y);
    prevMax = rowMax;
  }
  console.log('arrange.demo: ok');
}
