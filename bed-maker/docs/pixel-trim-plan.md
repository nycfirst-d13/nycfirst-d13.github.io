# Plan (deferred): A3 — pixel-trim fallback for content cropping

## Context

Bed Maker crops each imported SVG to its content so part-size limits apply to the
artwork, not an empty artboard. Two passes exist today (`modules/import.js`):

- **A1 (auto, on import)** — strip elements that paint nothing before measuring:
  empty/whitespace `<text>`, `display:none`, `visibility:hidden`. This also cleans
  the exported cut file.
- **A2 (auto)** — measure the tight bbox as the union of each surviving element's
  `getBBox()`, skipping zero-area boxes.
- **M1 (manual, "Trim to art")** — teacher-triggered aggressive re-trim of one
  piece; additionally drops `fill:none` + no-stroke graphics.

All three are **vector** methods: they trust the SVG's declared geometry and
visibility. They fail when an element has real area and nominal paint but is
**visually blank** — e.g. white-on-white fills, a `fill`/`stroke` set to the paper
color, a fully-transparent group `opacity`, a clipped-away shape, or a raster
`<image>` that is mostly empty pixels. Those inflate the crop box and no vector
rule reliably catches them without risking deletion of legitimate art.

A3 sidesteps geometry entirely: **crop to the pixels that actually paint.**

## Approach

Render the piece to a canvas, scan the alpha channel for the ink bounds, map that
pixel rect back into the SVG's user-unit coordinate space, and set the piece's
`viewBox` + natural size to it.

Because it's lossier (resolution-limited, ignores sub-pixel strokes) it should be a
**manual, per-piece action** — a second button next to "Trim to art", e.g.
**"Trim to pixels"** — not the default import path.

## Implementation sketch (`modules/import.js` or a new `pixel-trim.js`)

```js
export async function pixelTrimPiece(id) {
  const p = getPiece(id);
  if (!p) return;

  // 1. Render current canonical SVG to a canvas at a known px/in.
  const PPI = 300;                       // higher than display raster for tighter bounds
  const w = Math.max(1, Math.round(p.natWIn * PPI));
  const h = Math.max(1, Math.round(p.natHIn * PPI));
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svgText);
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  // 2. Scan alpha (with a small threshold) for the inked bounding box.
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const A_MIN = 8;                       // ignore near-transparent antialiasing dust
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > A_MIN) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return;               // fully blank — nothing to do

  // 3. Map pixel rect → current viewBox user units.
  const [vx, vy, vw, vh] = p.viewBox.split(/\s+/).map(Number);
  const sx = vw / w, sy = vh / h;
  const pad = 1;                          // px in user units
  const nx = vx + minX * sx - pad;
  const ny = vy + minY * sy - pad;
  const nw = (maxX - minX + 1) * sx + 2 * pad;
  const nh = (maxY - minY + 1) * sy + 2 * pad;

  // 4. Rewrite viewBox + size (keep innerSVG untouched — coords still valid), re-raster.
  p.viewBox = `${nx} ${ny} ${nw} ${nh}`;
  p.natWpx = nw; p.natHpx = nh;
  p.natWIn = pxToIn(nw); p.natHIn = pxToIn(nh);
  p.svgText = canonicalSVG(p.viewBox, p.natWIn, p.natHIn, p.innerSVG);
  p.href = await svgToDataURL(p.svgText, p.natWIn, p.natHIn);
  render();
}
```

Wire a **"Trim to pixels"** button in the Selected-part panel, next to "Trim to art".

## Tradeoffs / ceilings

- **Resolution-bound.** At 300 PPI a 0.003-in feature is one pixel; thin cut lines
  survive but hairline detail near the edge can be trimmed by up to ~1px. Bump PPI
  for precision at the cost of memory (a 6-in part at 300 PPI = 1800² × 4 bytes ≈
  13 MB per scan — fine for one piece on demand, not for a batch pass).
- **`getImageData` is a full O(w·h) scan** — trivial for one piece, why it stays
  manual. A batch/import-time version would want a coarse pass (downsample first,
  refine bounds) — only build if teachers ask for auto pixel-trim on every import.
- **Does not alter geometry**, only the crop window — so it's non-destructive and
  reversible by re-importing. The exported vectors are unchanged; only the framing
  tightens. (Contrast M1, which *removes* elements.)
- **Cross-origin taint**: `svgToDataURL` already notes SVG→Image can't fetch remote
  resources; same applies here. Self-contained laser-maker exports are fine.

## When to build

Only after a real case surfaces that A1/A2/M1 miss — a piece that stays oversized
after "Trim to art" because its stray element has area + nominal paint but no
visible pixels. Until then this is YAGNI.
