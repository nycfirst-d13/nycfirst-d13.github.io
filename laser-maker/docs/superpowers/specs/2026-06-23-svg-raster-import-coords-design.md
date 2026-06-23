# SVG & Raster Import: Coordinate Fidelity

**Date:** 2026-06-23
**Status:** Approved

## Intent

Laser Maker is used by kids who are learning to design for a real machine. When a student brings in artwork from another tool — whether an Illustrator file from a teacher, a traced image, or a photo they want to engrave — the import experience should feel predictable and safe by default.

**SVG imports should land exactly where they were designed.** A file built on a 36×24 artboard in Illustrator, matching the laser table, should appear on the Laser Maker canvas in the same positions — no guessing, no rescaling, no hunting for a shape that appeared somewhere unexpected. This is especially important for multi-part projects where a student designed a box in Illustrator and needs to trust that the pieces line up after import.

**Raster (photo) imports should not arrive huge.** Young students frequently drag in phone photos that are 4000+ pixels wide. If that lands on the canvas at full size it would be enormous — bigger than the artboard, confusing to navigate, and potentially slow to process for engraving. Capping at 4 inches on the longest side makes photos arrive at a workable engravable size. Students can always resize from there.

---

## Behavior

### SVG import

| Condition | Button import | Drag-and-drop |
|-----------|--------------|---------------|
| SVG dimensions match canvas (36×24 or current artboard size) | Natural SVG coords — shapes land exactly where they were drawn | Same — drop point ignored, natural coords preserved |
| SVG dimensions do not match canvas, or no artboard | Natural coords, top-left at canvas origin (0, 0) | Top-left of SVG placed at drop cursor |

No SVG is ever scaled on import. What was 2 inches in Illustrator is 2 inches in Laser Maker.

### Raster image import

| Condition | Button import | Drag-and-drop |
|-----------|--------------|---------------|
| Any raster image | Top-left at canvas origin (0, 0) | Centered on drop cursor |
| Longest side > 4 inches (384 px) | Scaled down proportionally to 4 inches max | Same scaling rule |
| Longest side ≤ 4 inches | No scaling | No scaling |

---

## Technical Design

### Bug 1 — `viewBoxTransform` unit parsing (`expand-svg.js`)

`viewBoxTransform` calls `parseFloat(el.getAttribute('width'))` which strips units. For `width="36in"` this returns `36` instead of `3456 px`, producing a `1/96` scale error in the viewBox matrix.

Fix: add a `_parseDimPx(val, fallback)` helper (same `DIM_TO_PX` table used in `import-svg.js`) and call it in place of `parseFloat`. Export it as `parseSVGDim` so `import-svg.js` can import it rather than maintaining its own copy.

### Bug 2 — `initMat` always scales and centers (`import-svg.js`)

Current code computes `k = min(abW×0.9/natW, abH×0.9/natH, 1)` and centers on the artboard or drop point. This discards the SVG's own coordinate system.

Fix:
```js
const matchesArtboard = Math.abs(natW - abW) < 1 && Math.abs(natH - abH) < 1;
const tx = (dropPt && !matchesArtboard) ? dropPt.x : 0;
const ty = (dropPt && !matchesArtboard) ? dropPt.y : 0;
const initMat = [1, 0, 0, 1, tx, ty];
```

### Raster sizing (`import-svg.js` — `importImage`)

Replace the 90%-of-artboard cap with a 4-inch cap on the longest side, applied to both button and drag-drop. Placement differs: button → top-left at `(0, 0)`, drag-drop → centered on `dropPt`.

```js
const MAX_PX = 4 * 96; // 384 px = 4 in
const longest = Math.max(w, h);
if (longest > MAX_PX) {
  const k = MAX_PX / longest;
  w *= k; h *= k;
}
const x = dropPt ? dropPt.x - w / 2 : 0;
const y = dropPt ? dropPt.y - h / 2 : 0;
```

### Files changed

| File | Change |
|------|--------|
| `expand-svg.js` | Add `_parseDimPx` helper; fix `viewBoxTransform`; export `parseSVGDim` |
| `import-svg.js` | Import `parseSVGDim` from `expand-svg.js`; remove local `DIM_TO_PX`; fix `initMat`; fix raster sizing |

No other files change.
