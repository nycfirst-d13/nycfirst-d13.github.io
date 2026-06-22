# SVG Import — Editable Shapes Design

**Date:** 2026-06-22  
**Status:** Approved

## Problem

Imported SVGs land as opaque `rawsvg` blobs. Students can move/resize them but cannot edit individual shapes, assign laser processes, or modify fill/stroke. The "Expand to Paths" button exists but requires a manual extra step every time.

## Goal

SVGs import directly as editable groups of `path`/`text` shapes. Process = `free`, original colors preserved. Students can ungroup and edit elements immediately.

---

## Design

### 1. Parser extraction (`expand-svg.js`)

Extract a new export: `parseSVGToShapes(rootSvgEl, initMat)`.

**Signature:**
```js
export function parseSVGToShapes(rootSvgEl, initMat)
// → { shapes: Array<shapeSpec>, hadUnsupported: boolean }
```

- `rootSvgEl`: the root `<svg>` DOM element (not markup string)
- `initMat`: `[a,b,c,d,e,f]` affine matrix applied before walking

**What it does:**
1. Applies the root SVG's `viewBox` transform (via existing `viewBoxTransform()`) on top of `initMat` — fixes a latent bug where root viewBox was silently dropped in the old expand flow
2. Calls `walk()` on `rootSvgEl.childNodes` with the combined matrix
3. `walk()` gains a `skipped` accumulator — any element whose tag is in `SKIP_TAGS` with non-trivial content pushes to it
4. Returns `{ shapes, hadUnsupported: skipped.length > 0 }`

**`expandSVG()` becomes a thin wrapper:**
```js
export function expandSVG(id) {
  const sh = store.findShape(id);
  // build initMat from sh.attrs.x/y and sh.rotation as before
  const tmp = document.createElementNS(SVG_NS, 'svg');
  tmp.innerHTML = sh.attrs.markup;
  const { shapes, hadUnsupported } = parseSVGToShapes(tmp, initMat);
  // commit to store as before
}
```

---

### 2. Import flow (`import-svg.js`)

`importSVG(svgText)` replaces the rawsvg commit:

**Step 1 — Parse:**
```js
const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
if (doc.querySelector('parsererror')) → fall back to rawsvg silently
const root = doc.documentElement;
```

**Step 2 — Natural size:**
- Read `width`/`height` attrs from root; convert to px: `px`=1:1, `pt`=96/72, `mm`=96/25.4, `cm`=96/2.54, `in`=96, unitless=1:1
- Fallback: viewBox `vw`×`vh`
- Fallback: `96×96`

**Step 3 — initMat:**
```
k  = min(artboardW×0.9 / natW,  artboardH×0.9 / natH,  1)   // shrink to fit, never upscale
tx = artboardW/2 - natW*k/2
ty = artboardH/2 - natH*k/2
initMat = [k, 0, 0, k, tx, ty]
```

Drop imports use `screenToArtboard(e.clientX, e.clientY)` as center instead of artboard center:
```
tx = dropPt.x - natW*k/2
ty = dropPt.y - natH*k/2
```

**Step 4 — Parse + commit:**
```js
const { shapes, hadUnsupported } = parseSVGToShapes(root, initMat);
if (!shapes.length) → fall back to rawsvg silently
```

Commit: single shape → commit as-is with `name` = filename (without extension). Multiple shapes → wrap in `group` with `name = 'Group IMPORT ' + filename` (e.g. `'Group IMPORT logo.svg'`). All shapes get `processType: 'free'`. Original `fill`/`stroke` colors preserved. Filename is sourced from the `File` object at the call site and threaded into `importSVG(svgText, filename)`.

**Step 5 — Toast:**
- No unsupported elements: `showToast('SVG imported')`
- Unsupported elements: `showToast('SVG imported. Some elements skipped.', { action: { label: 'Import raw', onClick: importRaw } })`

**`importRaw` callback:**
```js
function importRaw(svgText) {
  store.undo();   // removes the group
  store.commit(st => {
    st.shapes.push({ id, type: 'rawsvg', name: 'Imported SVG',
                     attrs: { markup, x: 0, y: 0 }, processType: 'free', ... });
    st.selection = [id];
  }, 'shape-create');
  showToast('Imported as raw SVG');
}
```

---

### 3. Action toast (`toast.js`)

`showToast` gets an options second argument:

```js
showToast(msg, opts)
// opts: { bbox?, action?: { label: string, onClick: () => void } }
```

Backwards-compatible: existing `showToast(msg, bbox)` callers updated to `showToast(msg, { bbox })`.

**Action button:**
- Rendered as `<button class="toast-action">` inside the toast element
- Styled as text-only, no border/background
- Color: `--blue-soft` (#DCE8FC) — readable on dark `--ink` toast background
- Hover: `rgba(255,255,255,0.12)` background, rounded (`var(--r-pill)`)
- Toast gets `pointer-events: auto` when action is present (currently always `none`)

**Dismiss on click:**
```js
btn.addEventListener('click', () => {
  dismissToast();   // same sequence as timeout: ++_gen, apply transition, remove .show
  action.onClick();
});
```
The existing `setTimeout` dismiss is also extracted into `dismissToast()` so both paths share one implementation.

---

## Files changed

| File | Change |
|------|--------|
| `modules/expand-svg.js` | Extract `parseSVGToShapes(rootSvgEl, initMat)` export; refactor `expandSVG()` to use it |
| `modules/import-svg.js` | Replace rawsvg commit with parse→group flow; wire "Import raw" action |
| `modules/toast.js` | Add `action` option; extract `dismissToast()`; update all callers |
| `styles.css` | Add `.toast-action` button styles; `.toast.has-action { pointer-events: auto }` |

---

## Out of scope

- Detecting and auto-assigning laser process colors from imported SVG strokes (not wanted — all shapes land as `free`)
- Handling SVG `<use>`, `<defs>`, gradients, filters — these are skipped with the "Import raw" offer
- Modifying the "Expand to Paths" inspector UI (still shown for rawsvg shapes, unchanged)
