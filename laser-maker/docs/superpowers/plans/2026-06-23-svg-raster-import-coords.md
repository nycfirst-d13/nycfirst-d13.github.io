# SVG & Raster Import Coordinate Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix SVG import so shapes land at their exact designed coordinates, and cap raster imports at 4 inches on the longest side.

**Architecture:** Two bugs in `expand-svg.js` and `import-svg.js`. Fix `viewBoxTransform` to parse units correctly, replace the scale+center `initMat` with identity logic, update raster sizing. Two files, no new files needed. A standalone doc is written at the end.

**Tech Stack:** Vanilla JS ES modules, no build step. App runs via `npx live-server` from `laser-maker/`. All testing is manual in the browser.

## Global Constraints

- No framework imports, no build step, pure ES modules only
- `git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io` for all git commands (parent repo)
- 96 px = 1 inch throughout
- Ponytail mode: no abstractions beyond what the task requires

---

### Task 1: Fix `viewBoxTransform` unit parsing and export `parseSVGDim`

**Files:**
- Modify: `laser-maker/modules/expand-svg.js` (around line 344 — `viewBoxTransform`)

**Interfaces:**
- Produces: `export function parseSVGDim(val)` → `number` (px). Used by Task 2.

**Context:** `viewBoxTransform` calls `parseFloat(el.getAttribute('width'))` which strips units. `parseFloat("36in")` returns `36` not `3456`, producing a `1/96` scale error. The same `DIM_TO_PX` + `parseSVGDim` logic already exists in `import-svg.js` — move the source of truth here and export it.

- [ ] **Step 1: Open `expand-svg.js` and locate `viewBoxTransform` (~line 344)**

The current broken code:
```js
const pw = el.getAttribute('width') ? parseFloat(el.getAttribute('width')) : vw;
const ph = el.getAttribute('height') ? parseFloat(el.getAttribute('height')) : vh;
```

- [ ] **Step 2: Add `_DIM_TO_PX` and `parseSVGDim` near the top of `expand-svg.js`, after the matrix math section (~line 55, before `resolveColor`)**

```js
// ---- SVG dimension → px ----

const _DIM_TO_PX = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

export function parseSVGDim(val) {
  if (!val) return null;
  const m = String(val).trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/);
  if (!m) return null;
  return parseFloat(m[1]) * (_DIM_TO_PX[m[2] || 'px'] || 1);
}
```

- [ ] **Step 3: Fix `viewBoxTransform` to call `parseSVGDim` with a fallback**

Replace the two `parseFloat` lines with:
```js
const pw = parseSVGDim(el.getAttribute('width')) ?? vw;
const ph = parseSVGDim(el.getAttribute('height')) ?? vh;
```

Full fixed function for reference:
```js
function viewBoxTransform(el) {
  const vb = el.getAttribute('viewBox');
  if (!vb) return null;
  const parts = vb.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4) return null;
  const [vx, vy, vw, vh] = parts;
  if (!vw || !vh) return null;
  const pw = parseSVGDim(el.getAttribute('width')) ?? vw;
  const ph = parseSVGDim(el.getAttribute('height')) ?? vh;
  if (!pw || !ph) return null;
  const sx = pw / vw, sy = ph / vh;
  return [sx, 0, 0, sy, -vx * sx, -vy * sy];
}
```

- [ ] **Step 4: Verify in browser**

Start the app: `npx live-server` from `laser-maker/`.

Create a test file `test-36x24.svg` with this content:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="36in" height="24in" viewBox="0 0 3456 2304">
  <rect x="192" y="192" width="192" height="192" fill="#0000FF"/>
</svg>
```

Import it via the Import SVG button. The blue rect should appear at exactly 2 inches from the top-left of the canvas (not scaled, not centered). Open inspector → X should read `2 in`, Y should read `2 in`, W and H should each read `2 in`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/expand-svg.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "fix(laser-maker): unit-aware viewBoxTransform; export parseSVGDim"
```

---

### Task 2: Fix SVG `initMat` — identity transform with artboard-match detection

**Files:**
- Modify: `laser-maker/modules/import-svg.js`

**Interfaces:**
- Consumes: `parseSVGDim` exported from `expand-svg.js` (Task 1)
- The `importSVG(svgText, filename, dropPt)` signature stays — `dropPt` is still accepted but only used when the SVG doesn't match the artboard size.

**Context:** The current code computes `k = min(abW×0.9/natW, abH×0.9/natH, 1)` and centers the import. Replace with identity `[1,0,0,1,tx,ty]` where `tx/ty` are non-zero only for drag-drop on a non-matching SVG.

- [ ] **Step 1: In `import-svg.js`, replace the local `DIM_TO_PX` constant and `parseSVGDim` function with an import from `expand-svg.js`**

Remove:
```js
const DIM_TO_PX = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

function parseSVGDim(val) {
  if (!val) return null;
  const m = String(val).trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/);
  if (!m) return null;
  return parseFloat(m[1]) * (DIM_TO_PX[m[2] || 'px'] || 1);
}
```

Update the import line at the top:
```js
import { parseSVGToShapes, parseSVGDim } from './expand-svg.js';
```

- [ ] **Step 2: Replace the `initMat` block inside `importSVG`**

Find this block (around line 77–83):
```js
// initMat: shrink to fit 90% artboard (never upscale), center on artboard or drop point
const st = store.get();
const abW = inToPx(st.artboard.w), abH = inToPx(st.artboard.h);
const k = Math.min(abW * 0.9 / natW, abH * 0.9 / natH, 1);
const cx = dropPt ? dropPt.x : abW / 2;
const cy = dropPt ? dropPt.y : abH / 2;
const initMat = [k, 0, 0, k, cx - natW * k / 2, cy - natH * k / 2];
```

Replace with:
```js
// initMat: identity — preserve SVG coordinates exactly.
// For drag-drop on non-matching SVGs, offset so top-left lands at cursor.
const st = store.get();
const abW = inToPx(st.artboard.w), abH = inToPx(st.artboard.h);
const matchesArtboard = Math.abs(natW - abW) < 1 && Math.abs(natH - abH) < 1;
const tx = (dropPt && !matchesArtboard) ? dropPt.x : 0;
const ty = (dropPt && !matchesArtboard) ? dropPt.y : 0;
const initMat = [1, 0, 0, 1, tx, ty];
```

- [ ] **Step 3: Verify case 1 — matching artboard (button import)**

Use the same `test-36x24.svg` from Task 1. Import via button. Inspector should show `X: 2 in`, `Y: 2 in`, `W: 2 in`, `H: 2 in`.

- [ ] **Step 4: Verify case 2 — non-matching SVG (button import)**

Create `test-small.svg`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288">
  <rect x="0" y="0" width="96" height="96" fill="#FF0000"/>
</svg>
```

Import via button. The red rect should appear at top-left of canvas: `X: 0 in`, `Y: 0 in`, `W: 1 in`, `H: 1 in`.

- [ ] **Step 5: Verify case 3 — non-matching SVG (drag-drop)**

Drag `test-small.svg` onto the center of the canvas. The red rect's top-left should be at or near where you dropped it (not offset to artboard center).

- [ ] **Step 6: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/import-svg.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "fix(laser-maker): SVG import uses identity matrix — no scale or center"
```

---

### Task 3: Fix raster import — 4-inch cap, button lands at (0,0)

**Files:**
- Modify: `laser-maker/modules/import-svg.js` — `importImage` function (~line 157)

**Context:** Current code scales to 90% of artboard (can be huge) and centers on artboard for button import. New behavior: cap at 4 inches (384 px) on longest side for both button and drag-drop; button lands at (0,0), drag-drop centers on cursor.

- [ ] **Step 1: Replace the sizing and placement block in `importImage`**

Find this block (~line 163):
```js
let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
const maxW = abW * 0.9, maxH = abH * 0.9;
if (w > maxW || h > maxH) {
  const k = Math.min(maxW / w, maxH / h);
  w *= k; h *= k;
}
const cx = dropPt ? dropPt.x : abW / 2;
const cy = dropPt ? dropPt.y : abH / 2;
const x = cx - w / 2, y = cy - h / 2;
```

Replace with:
```js
let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
const MAX_PX = 4 * 96; // 384 px = 4 in
const longest = Math.max(w, h);
if (longest > MAX_PX) {
  const k = MAX_PX / longest;
  w *= k; h *= k;
}
const x = dropPt ? dropPt.x - w / 2 : 0;
const y = dropPt ? dropPt.y - h / 2 : 0;
```

Also remove the now-dead `abW`/`abH` lines that were used for the old 90%-of-artboard cap:
```js
// Remove these two lines:
const s = store.get();
const abW = inToPx(s.artboard.w), abH = inToPx(s.artboard.h);
```

- [ ] **Step 2: Verify button import — large image**

Import a photo larger than 384px on its longest side via the Import Image button. It should appear at the top-left of the canvas (`X: 0`, `Y: 0`), sized to no more than 4 inches on the longest side.

- [ ] **Step 3: Verify button import — small image**

Import an image smaller than 384px (e.g. a 200×150px graphic). It should appear at (0,0) at its natural pixel size with no scaling.

- [ ] **Step 4: Verify drag-drop — large image**

Drag a large photo onto the canvas. It should be centered on where you dropped it, sized to 4 inches max on longest side.

- [ ] **Step 5: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/import-svg.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "fix(laser-maker): raster import — 4in max, button lands at origin"
```

---

### Task 4: Write `docs/import-placement.md` and update `docs/svg-import.md`

**Files:**
- Create: `laser-maker/docs/import-placement.md`
- Modify: `laser-maker/docs/svg-import.md` (step 2 of the pipeline — update the stale `initMat` description)

**Context:** The user wants a standalone doc in `laser-maker/docs/` (not in `CLAUDE.md`) that explains the full import placement behavior. Also update the existing `svg-import.md` which still documents the old shrink-to-fit `initMat`.

- [ ] **Step 1: Create `laser-maker/docs/import-placement.md`**

```markdown
# Import Placement & Scaling

How Laser Maker places SVG and raster files when you import them.

## SVG Import

SVG files are never scaled. Whatever size they were designed at, they arrive at that exact size.

**If the SVG matches the canvas size (36 × 24 inches by default):**
The shapes land exactly where they were drawn. A box at 2 inches from the top-left in Illustrator appears at 2 inches from the top-left in Laser Maker. This is intentional — students and teachers can design precise parts in Illustrator and import them with confidence that nothing has shifted.

**If the SVG has a different size, or no defined size:**
The shapes are placed with their top-left corner at the canvas origin (0, 0). Nothing is scaled.

**Drag-and-drop SVG:**
- Matching canvas size → same as button import; drop point is ignored, natural coordinates are preserved.
- Non-matching size → top-left of the SVG lands at your drop cursor.

## Raster Image Import (Photos & Graphics)

Raster images (PNG, JPG, GIF, WebP, BMP) are capped at **4 inches on the longest side**. If the image is smaller than 4 inches, it arrives at its natural size. If it's larger, it is scaled down proportionally.

This prevents huge phone photos from flooding the canvas — a 4000-pixel photo would otherwise be over 40 inches wide, far larger than the laser table.

**Button import:** Image lands with its top-left at the canvas origin (0, 0).

**Drag-and-drop import:** Image is centered on the drop cursor.

## Canvas Size

The default canvas matches the Epilog Fusion Edge 36 laser table: **36 × 24 inches**. Students can change this in the status bar. The "matches canvas" check for SVG import uses whatever the current canvas dimensions are, not the hardcoded 36 × 24 default.
```

- [ ] **Step 2: Update `docs/svg-import.md` — fix the stale `initMat` description in step 2 of the pipeline**

Find line 8:
```
2. `initMat = [k, 0, 0, k, tx, ty]` where `k = min(abW×0.9/natW, abH×0.9/natH, 1)` — shrink-to-fit, never upscale; `tx/ty` center on artboard (button) or drop cursor
```

Replace with:
```
2. `initMat = [1, 0, 0, 1, tx, ty]` — identity scale, preserves SVG coords. `tx/ty` are non-zero only for drag-drop on a non-matching SVG (top-left at cursor). Artboard-matching SVGs and button imports always use `[1,0,0,1,0,0]`. See [`docs/import-placement.md`](import-placement.md) for full rules.
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/docs/import-placement.md laser-maker/docs/svg-import.md
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "docs(laser-maker): add import-placement.md; update svg-import.md initMat description"
```
