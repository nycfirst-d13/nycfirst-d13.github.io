// arrange.js — lay pieces out on the bed per state.cfg.
// Modes: grid (uniform cells), brick (grid + half-cell row offset), compact
// (shelf / next-fit pack). Optional alternating row flip. All units in inches.

import { state, render } from './state.js';

// Size cap: clamp down to fit the max box, never upscale.
function fit(p, cfg) {
  const s = Math.min(cfg.maxWIn / p.natWIn, cfg.maxHIn / p.natHIn, 1);
  return { scale: s, w: p.natWIn * s, h: p.natHIn * s };
}

function layoutGrid(pieces, cfg, bed) {
  const gap = cfg.gapIn;
  const dims = pieces.map(p => fit(p, cfg));
  const cellW = Math.max(...dims.map(d => d.w)) + gap;
  const cellH = Math.max(...dims.map(d => d.h)) + gap;
  const cols = Math.max(1, Math.floor((bed.wIn + gap) / cellW));

  pieces.forEach((p, i) => {
    const d = dims[i];
    const col = i % cols, row = Math.floor(i / cols);
    let x = col * cellW;
    if (cfg.tiling === 'brick' && row % 2 === 1) x += cellW / 2;
    p.scale = d.scale;
    p.xIn = x;
    p.yIn = row * cellH;
    p.flipY = cfg.rowFlip && row % 2 === 1;
  });
}

function layoutCompact(pieces, cfg, bed) {
  const gap = cfg.gapIn;
  // Tallest first packs shelves tighter (next-fit decreasing height).
  const order = pieces
    .map(p => ({ p, d: fit(p, cfg) }))
    .sort((a, b) => b.d.h - a.d.h);

  let x = 0, y = 0, shelfH = 0, shelf = 0;
  for (const { p, d } of order) {
    if (x > 0 && x + d.w > bed.wIn) { y += shelfH + gap; x = 0; shelfH = 0; shelf++; }
    p.scale = d.scale;
    p.xIn = x;
    p.yIn = y;
    p.flipY = cfg.rowFlip && shelf % 2 === 1;
    x += d.w + gap;
    shelfH = Math.max(shelfH, d.h);
  }
}

export function arrange() {
  const { pieces, cfg, bed } = state;
  if (!pieces.length) { state.overflow = 0; render(); return; }

  if (cfg.tiling === 'compact') layoutCompact(pieces, cfg, bed);
  else layoutGrid(pieces, cfg, bed);

  // Overflow: anything spilling past the bed (placed anyway, flagged red).
  const eps = 1e-6;
  state.overflow = pieces.reduce((n, p) => {
    const w = p.natWIn * p.scale, h = p.natHIn * p.scale;
    return n + ((p.xIn + w > bed.wIn + eps || p.yIn + h > bed.hIn + eps) ? 1 : 0);
  }, 0);

  render();
}

// ponytail: shelf-pack by bounding box, not true irregular nesting. Upgrade to a
// polygon nester (e.g. SVGnest) only if scrap material actually matters.

// Runnable self-check — call arrange.demo() from the console.
export function demo() {
  const mk = (w, h) => ({ natWIn: w, natHIn: h, scale: 1, xIn: 0, yIn: 0, flipY: false });
  const pieces = [mk(4, 3), mk(2, 6), mk(5, 5), mk(3, 3), mk(6, 2), mk(1, 1)];
  const cfg = { maxWIn: 6, maxHIn: 6, gapIn: 0.25, tiling: 'compact', rowFlip: false };
  const bed = { wIn: 36, hIn: 24 };
  layoutCompact(pieces, cfg, bed);

  // 1) every piece stays within bed width
  for (const p of pieces) {
    const w = p.natWIn * p.scale;
    console.assert(p.xIn + w <= bed.wIn + 1e-6, 'piece exceeds bed width', p);
  }
  // 2) no two pieces on the same shelf (same yIn) overlap in x
  const byY = {};
  for (const p of pieces) (byY[p.yIn] ||= []).push(p);
  for (const row of Object.values(byY)) {
    row.sort((a, b) => a.xIn - b.xIn);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1], w = prev.natWIn * prev.scale;
      console.assert(row[i].xIn + 1e-6 >= prev.xIn + w, 'overlap on shelf', prev, row[i]);
    }
  }
  console.log('arrange.demo: ok');
}
