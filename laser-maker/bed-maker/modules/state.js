// state.js — tiny plain store for Bed Maker.
// No undo/history: this is a layout tool, not an editor. Mutate then render().

// 96 CSS px = 1 inch (same real-world scale as laser-maker). Copied (3 lines)
// rather than importing ../modules/utils.js to avoid its transitive
// imports. ponytail: keep in sync with laser-maker if PX_PER_INCH ever changes.
export const PX_PER_INCH = 96;
export const inToPx = (i) => i * PX_PER_INCH;
export const pxToIn = (p) => p / PX_PER_INCH;

export const state = {
  bed:   { wIn: 36, hIn: 24 },
  cfg:   { maxWIn: 6, maxHIn: 6, gapIn: 0.25, tiling: 'grid', rowFlip: false, snap: true },
  pieces: [],          // Piece[] (see import.js for shape)
  selection: null,     // piece id or null
  overflow: 0,         // count of pieces that spilled past the bed
  viewport: { zoom: 1, panX: 0, panY: 0 },
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function render() { for (const fn of subs) fn(); }

export function getPiece(id) { return state.pieces.find(p => p.id === id) || null; }
