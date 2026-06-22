# SVG Import — Editable Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SVG files import as editable groups of path/text shapes instead of opaque rawsvg blobs.

**Architecture:** Extract a shared `parseSVGToShapes()` from `expand-svg.js`. Rewrite `importSVG()` to call it, commit a group directly, and offer an "Import raw" action toast when unsupported elements were skipped. Extend `toast.js` to support an optional action button.

**Tech Stack:** Vanilla JS ES modules, no build step, no test framework. Serve via `npx live-server` and verify in browser.

## Global Constraints

- No frameworks, no build pipeline — vanilla JS ES modules only
- No new npm dependencies
- All git commands run from `/Users/avigoldman/Desktop/nycfirst-d13.github.io` (parent dir, not laser-maker/)
- Commit command: `git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit`
- Design tokens in `styles.css`: `--blue-soft: #DCE8FC`, `--r-pill: 999px`, `--ink` (dark toast bg)
- All shapes get `processType: 'free'` on import
- Group name format: `'Group IMPORT ' + filename` (e.g. `'Group IMPORT logo.svg'`)
- Single extracted shape: name = filename without `.svg` extension
- `showToast` new signature: `showToast(msg, opts?)` where `opts = { bbox?, action?: { label, onClick } }`

---

## File Map

| File | Change |
|------|--------|
| `modules/toast.js` | Add `action` option; extract `dismissToast()`; update signature |
| `styles.css` | Add `.toast-action` and `.toast.has-action` rules |
| `modules/context-menu.js` | Update `showToast(msg, bbox)` → `showToast(msg, { bbox })` |
| `modules/keys.js` | Update `showToast(msg, bbox)` → `showToast(msg, { bbox })` |
| `modules/expand-svg.js` | Add `skipped` param to `walk()`; export `parseSVGToShapes()`; refactor `expandSVG()`; replace `_toast` with imported `showToast` |
| `modules/import-svg.js` | Rewrite `importSVG()`; add `_commitRawSVG()`; add `parseSVGDim()`; thread filename; import from toast.js |

---

## Task 1: Action toast

**Files:**
- Modify: `modules/toast.js`
- Modify: `styles.css`
- Modify: `modules/context-menu.js`
- Modify: `modules/keys.js`

**Interfaces:**
- Produces: `showToast(msg: string, opts?: { bbox?: {cx,bottom}, action?: { label: string, onClick: () => void } }): void`
- Produces: (internal) `dismissToast(): void` — triggers the same ease-out as the timeout dismiss

---

- [ ] **Step 1: Add `.toast-action` and `.toast.has-action` CSS to `styles.css`**

Find the `.toast` block (around line 992) and add after `.toast.anchored.show`:

```css
.toast.has-action { pointer-events: auto; }
.toast-action {
  background: none;
  border: none;
  color: var(--blue-soft);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--r-pill);
  margin-left: 8px;
}
.toast-action:hover { background: rgba(255,255,255,0.12); }
```

---

- [ ] **Step 2: Rewrite `modules/toast.js`**

Replace the entire file:

```js
// =============================================================================
// toast.js — anchored action toast (shared by context-menu and keys)
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';

export function selectionBBox() {
  const sel = store.get().selection;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of sel) {
    const el = artboard.getShapeNode(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    minX = Math.min(minX, r.left);  minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
  }
  return minX === Infinity ? null : { cx: (minX + maxX) / 2, bottom: maxY };
}

let _gen = 0;

function dismissToast() {
  const t = document.getElementById('toast');
  ++_gen;
  clearTimeout(showToast._t);
  clearTimeout(showToast._cleanup);
  t.style.transition = 'opacity .18s ease-out, transform .18s ease-out';
  t.classList.remove('show');
  showToast._cleanup = setTimeout(() => {
    t.style.transition = '';
    t.classList.remove('anchored');
    t.classList.remove('has-action');
    t.style.left = '';
    t.style.top  = '';
  }, 250);
}

export function showToast(msg, opts) {
  const { bbox, action } = opts || {};
  const t = document.getElementById('toast');
  const gen = ++_gen;

  // Rebuild content: text + optional action button
  t.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismissToast();
      action.onClick();
    });
    t.appendChild(btn);
    t.classList.add('has-action');
  } else {
    t.classList.remove('has-action');
  }

  if (bbox) {
    t.style.left = bbox.cx + 'px';
    t.style.top  = (bbox.bottom + 10) + 'px';
    t.classList.add('anchored');
    const track = () => {
      if (_gen !== gen) return;
      const b = selectionBBox();
      if (b) { t.style.left = b.cx + 'px'; t.style.top = (b.bottom + 10) + 'px'; }
      requestAnimationFrame(track);
    };
    requestAnimationFrame(track);
  } else {
    t.classList.remove('anchored');
    t.style.left = '';
    t.style.top  = '';
  }

  t.style.transition = '';
  t.classList.add('show');
  clearTimeout(showToast._t);
  clearTimeout(showToast._cleanup);
  showToast._t = setTimeout(dismissToast, 1800);
}
```

---

- [ ] **Step 3: Update callers in `modules/context-menu.js`**

All calls pass `bbox` as second arg. Change each `showToast(msg, bbox)` → `showToast(msg, { bbox })`. There are 5 call sites (lines ~80–93):

```js
// Before:
if (doCopy()) showToast('Copied! 📋', bbox);
if (doCut()) showToast('Cut! ✂️', bbox);
if (doPaste()) requestAnimationFrame(() => showToast('Pasted! ✨', selectionBBox()));
if (doPasteInPlace()) requestAnimationFrame(() => showToast('Pasted in place! 📌', selectionBBox()));
requestAnimationFrame(() => showToast('Grouped! 🫂', selectionBBox()));
requestAnimationFrame(() => showToast('Ungrouped! 💨', selectionBBox()));

// After:
if (doCopy()) showToast('Copied! 📋', { bbox });
if (doCut()) showToast('Cut! ✂️', { bbox });
if (doPaste()) requestAnimationFrame(() => showToast('Pasted! ✨', { bbox: selectionBBox() }));
if (doPasteInPlace()) requestAnimationFrame(() => showToast('Pasted in place! 📌', { bbox: selectionBBox() }));
requestAnimationFrame(() => showToast('Grouped! 🫂', { bbox: selectionBBox() }));
requestAnimationFrame(() => showToast('Ungrouped! 💨', { bbox: selectionBBox() }));
```

---

- [ ] **Step 4: Update callers in `modules/keys.js`**

Same pattern. There are 6 call sites (lines ~176–215):

```js
// Before:
requestAnimationFrame(() => showToast('Grouped! 🫂', selectionBBox()));
requestAnimationFrame(() => showToast('Ungrouped! 💨', selectionBBox()));
if (doCopy()) { e.preventDefault(); showToast('Copied! 📋', bbox); }
if (doCut()) { e.preventDefault(); showToast('Cut! ✂️', bbox); }
if (doPasteInPlace()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted in place! 📌', selectionBBox())); }
if (doPaste()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted! ✨', selectionBBox())); }

// After:
requestAnimationFrame(() => showToast('Grouped! 🫂', { bbox: selectionBBox() }));
requestAnimationFrame(() => showToast('Ungrouped! 💨', { bbox: selectionBBox() }));
if (doCopy()) { e.preventDefault(); showToast('Copied! 📋', { bbox }); }
if (doCut()) { e.preventDefault(); showToast('Cut! ✂️', { bbox }); }
if (doPasteInPlace()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted in place! 📌', { bbox: selectionBBox() })); }
if (doPaste()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted! ✨', { bbox: selectionBBox() })); }
```

---

- [ ] **Step 5: Verify in browser**

Run: `npx live-server` from `laser-maker/`

1. Select a shape, press Cmd+C, Cmd+V — toast should say "Copied!" / "Pasted!" anchored near shape, dismiss after ~1.8s
2. Open browser console — no errors
3. Trigger an action toast manually in console to test button:
```js
// In browser console:
import('./modules/toast.js').then(m => m.showToast('Test message', { action: { label: 'Do it', onClick: () => console.log('clicked') } }))
```
Expected: toast appears with "Test message" + blue "Do it" button. Clicking button logs "clicked" and toast dismisses with ease-out.

---

- [ ] **Step 6: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/toast.js laser-maker/styles.css laser-maker/modules/context-menu.js laser-maker/modules/keys.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(laser-maker): add action button support to toast"
```

---

## Task 2: Extract `parseSVGToShapes` from `expand-svg.js`

**Files:**
- Modify: `modules/expand-svg.js`

**Interfaces:**
- Consumes: `showToast` from `./toast.js`
- Produces: `export function parseSVGToShapes(rootSvgEl: SVGSVGElement, initMat: number[6]): { shapes: ShapeSpec[], hadUnsupported: boolean }`
  - `ShapeSpec` = `{ _shapeType: 'path'|'text', fill, stroke, strokeWidth, d? (path), attrs? (text), name? (text) }`
- `expandSVG(id)` behavior unchanged from user perspective

---

- [ ] **Step 1: Add `skipped` parameter to `walk()` and thread it through**

`walk` currently: `function walk(nodes, m, inh, results)`.

Change to `function walk(nodes, m, inh, results, skipped)` and add skip tracking + thread through recursive calls:

```js
function walk(nodes, m, inh, results, skipped) {
  for (const el of nodes) {
    if (el.nodeType !== 1) continue;
    const tag = (el.tagName || '').toLowerCase().replace(/[a-z]+:/, '');
    if (SKIP_TAGS.has(tag)) {
      // Track if this skip tag has meaningful child content
      if (skipped && Array.from(el.childNodes).some(n => n.nodeType === 1)) {
        skipped.push(tag);
      }
      continue;
    }
    if (tag === 'tspan') continue;
    if (getAttr(el, 'display') === 'none') continue;
    if (getAttr(el, 'visibility') === 'hidden') continue;

    const elMat = parseTfm(el.getAttribute('transform') || '');
    const curMat = mulMat(m, elMat);

    const fillVal   = getAttr(el, 'fill');
    const strokeVal = getAttr(el, 'stroke');
    const swVal     = getAttr(el, 'stroke-width');
    const fill   = (!fillVal   || fillVal   === 'inherit') ? inh.fill   : fillVal;
    const stroke = (!strokeVal || strokeVal === 'inherit') ? inh.stroke : strokeVal;
    const sw     = (!swVal     || swVal     === 'inherit') ? inh.sw     : parseFloat(swVal) || 1;

    const childInh = { fill, stroke, sw };

    if (CONTAINER_TAGS.has(tag)) {
      let childMat = curMat;
      if (tag === 'svg') {
        const vbMat = viewBoxTransform(el);
        if (vbMat) childMat = mulMat(curMat, vbMat);
      }
      walk(el.childNodes, childMat, childInh, results, skipped);
    } else if (tag === 'text') {
      const textShape = parseTextElement(el, curMat, childInh);
      if (textShape) results.push(textShape);
    } else if (SHAPE_TAGS.has(tag)) {
      const d = elementToD(el);
      if (!d) continue;
      const td = applyMatrixToD(d, curMat);
      if (!td) continue;
      results.push({
        _shapeType: 'path',
        fill: resolveColor(fill),
        stroke: resolveColor(stroke),
        strokeWidth: sw,
        d: td,
      });
    }
  }
}
```

---

- [ ] **Step 2: Add `parseSVGToShapes` export**

Add this function after the `walk` definition (before `expandSVG`):

```js
export function parseSVGToShapes(rootSvgEl, initMat) {
  const vbMat = viewBoxTransform(rootSvgEl);
  const startMat = vbMat ? mulMat(initMat, vbMat) : initMat;
  const skipped = [];
  const extracted = [];
  walk(rootSvgEl.childNodes, startMat, { fill: 'black', stroke: 'none', sw: 1 }, extracted, skipped);
  return { shapes: extracted, hadUnsupported: skipped.length > 0 };
}
```

---

- [ ] **Step 3: Refactor `expandSVG()` to use `parseSVGToShapes`**

Replace the body of `expandSVG`:

```js
export function expandSVG(id) {
  const sh = store.findShape(id);
  if (!sh || sh.type !== 'rawsvg') return;

  let initMat = [1, 0, 0, 1, sh.attrs.x || 0, sh.attrs.y || 0];
  if (sh.rotation && sh._bbox) {
    const { x: bx, y: by, w: bw, h: bh } = sh._bbox;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const a = sh.rotation * Math.PI / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const rotMat = [cos, sin, -sin, cos, cx - cx*cos + cy*sin, cy - cx*sin - cy*cos];
    initMat = mulMat(rotMat, initMat);
  }

  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${sh.attrs.markup}</svg>`,
    'image/svg+xml',
  );
  if (doc.querySelector('parsererror')) {
    showToast('Invalid SVG markup'); return;
  }

  const { shapes: extracted } = parseSVGToShapes(doc.documentElement, initMat);

  if (!extracted.length) {
    showToast('No paths found in SVG'); return;
  }

  store.commit(st => {
    const idx = st.shapes.findIndex(s => s.id === id);
    if (idx < 0) return;

    let pathCount = 0, textCount = 0;
    const newShapes = extracted.map(p => {
      const base = { fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth,
                     visible: true, locked: false, rotation: 0 };
      if (p._shapeType === 'text') {
        return { id: uid('xt'), type: 'text', name: p.name || `Text ${++textCount}`,
                 attrs: p.attrs, ...base };
      }
      return { id: uid('xp'), type: 'path', name: `Path ${++pathCount}`,
               attrs: { d: p.d }, ...base };
    });

    const replacement = newShapes.length === 1
      ? { ...newShapes[0], name: sh.name }
      : {
          id: uid('xg'),
          type: 'group',
          name: sh.name,
          children: newShapes,
          visible: true,
          locked: false,
          rotation: 0,
        };

    st.shapes.splice(idx, 1, replacement);
    st.selection = [replacement.id];
  }, 'expand-svg');

  showToast(`Expanded to ${extracted.length} shape${extracted.length > 1 ? 's' : ''}`);
}
```

---

- [ ] **Step 4: Replace local `_toast` with imported `showToast` in `expand-svg.js`**

At the top of `expand-svg.js`, add the import:

```js
import { showToast } from './toast.js';
```

Delete the `_toast` function at the bottom of the file (currently lines ~512–518):

```js
// DELETE this entire block:
function _toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toast._t);
  _toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}
```

---

- [ ] **Step 5: Verify in browser**

1. Import any SVG file via the Import button
2. It will still land as rawsvg (import-svg.js not changed yet)
3. Select it, click "Expand to Paths" in the inspector — should work as before
4. Try an SVG with a viewBox (e.g. an icon SVG with `viewBox="0 0 24 24"`) — paths should be correctly scaled
5. No console errors

---

- [ ] **Step 6: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/expand-svg.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "refactor(laser-maker): extract parseSVGToShapes from expand-svg"
```

---

## Task 3: Rewrite SVG import to produce editable groups

**Files:**
- Modify: `modules/import-svg.js`

**Interfaces:**
- Consumes: `parseSVGToShapes` from `./expand-svg.js`
- Consumes: `showToast` from `./toast.js`
- Consumes: `inToPx` from `./utils.js` (already imported)
- Internal: `parseSVGDim(val: string | null): number | null` — parses SVG dimension string to px
- Internal: `_commitRawSVG(markup: string, filename: string): void` — commits a rawsvg shape
- `importSVG(svgText: string, filename: string, dropPt?: {x,y}): void`

---

- [ ] **Step 1: Add imports and remove the local `showToast` function**

At the top of `import-svg.js`, update imports:

```js
import { store } from './state.js';
import { uid, inToPx } from './utils.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { showToast } from './toast.js';
import { parseSVGToShapes } from './expand-svg.js';
```

Delete the local `showToast` function (currently lines ~120–126):

```js
// DELETE this entire block:
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1800);
}
```

---

- [ ] **Step 2: Add `parseSVGDim` helper**

Add after the `SVG_NS` constant:

```js
const DIM_TO_PX = { px: 1, pt: 96 / 72, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

function parseSVGDim(val) {
  if (!val) return null;
  const m = String(val).trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/);
  if (!m) return null;
  return parseFloat(m[1]) * (DIM_TO_PX[m[2] || 'px'] || 1);
}
```

---

- [ ] **Step 3: Add `_commitRawSVG` helper**

Add after `parseSVGDim`:

```js
function _commitRawSVG(markup, filename) {
  const id = uid('svg');
  const name = filename ? filename.replace(/\.svg$/i, '') : 'Imported SVG';
  store.commit(st => {
    st.shapes.push({
      id,
      type: 'rawsvg',
      name,
      attrs: { markup, x: 0, y: 0 },
      processType: 'free',
      rotation: 0,
      visible: true,
      locked: false,
      fill: 'none',
      stroke: 'none',
      strokeWidth: 1,
    });
    st.selection = [id];
  }, 'shape-create');
  tools.setActive('select');
}
```

---

- [ ] **Step 4: Rewrite `importSVG`**

Replace the existing `importSVG(svgText)` function entirely:

```js
function importSVG(svgText, filename, dropPt) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    showToast('Invalid SVG file');
    return;
  }
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    showToast('Invalid SVG file');
    return;
  }

  // Natural size: width/height attrs → px, fallback to viewBox, fallback to 96
  const vbParts = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const natW = parseSVGDim(root.getAttribute('width'))  || vbParts[2] || 96;
  const natH = parseSVGDim(root.getAttribute('height')) || vbParts[3] || 96;

  // initMat: shrink to fit 90% artboard (never upscale), center on artboard or drop point
  const st = store.get();
  const abW = inToPx(st.artboard.w), abH = inToPx(st.artboard.h);
  const k = Math.min(abW * 0.9 / natW, abH * 0.9 / natH, 1);
  const cx = dropPt ? dropPt.x : abW / 2;
  const cy = dropPt ? dropPt.y : abH / 2;
  const initMat = [k, 0, 0, k, cx - natW * k / 2, cy - natH * k / 2];

  const { shapes: extracted, hadUnsupported } = parseSVGToShapes(root, initMat);

  if (!extracted.length) {
    // No parseable shapes — fall back to rawsvg silently
    const markup = extractMarkup(svgText);
    if (markup) _commitRawSVG(markup, filename);
    else showToast('Invalid SVG file');
    return;
  }

  const id = uid('svg');
  const baseName = filename ? filename.replace(/\.svg$/i, '') : 'Imported SVG';
  const groupName = `Group IMPORT ${filename || 'imported.svg'}`;

  store.commit(st => {
    let pathCount = 0, textCount = 0;
    const newShapes = extracted.map(p => {
      const base = {
        fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth,
        processType: 'free', visible: true, locked: false, rotation: 0,
      };
      if (p._shapeType === 'text') {
        return { id: uid('xt'), type: 'text', name: `Text ${++textCount}`, attrs: p.attrs, ...base };
      }
      return { id: uid('xp'), type: 'path', name: `Path ${++pathCount}`, attrs: { d: p.d }, ...base };
    });

    const shape = newShapes.length === 1
      ? { ...newShapes[0], id, name: baseName }
      : {
          id, type: 'group', name: groupName,
          children: newShapes,
          processType: 'free', visible: true, locked: false, rotation: 0,
        };

    st.shapes.push(shape);
    st.selection = [id];
  }, 'shape-create');

  tools.setActive('select');

  if (hadUnsupported) {
    const markup = extractMarkup(svgText);
    showToast('SVG imported. Some elements skipped.', {
      action: {
        label: 'Import raw',
        onClick: () => {
          store.undo();
          if (markup) {
            _commitRawSVG(markup, filename);
            showToast('Imported as raw SVG');
          }
        },
      },
    });
  } else {
    showToast('SVG imported');
  }
}
```

---

- [ ] **Step 5: Thread `filename` through the button and drop handlers**

Update the file input handler (currently reads `reader.onload = ev => importSVG(ev.target.result)`):

```js
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importSVG(ev.target.result, file.name);
  reader.readAsText(file);
  fileInput.value = '';
});
```

Update the drop handler (find the `svgFile` block inside the `drop` listener):

```js
if (svgFile) {
  const dropPt = artboard.screenToArtboard(e.clientX, e.clientY);
  const reader = new FileReader();
  reader.onload = ev => importSVG(ev.target.result, svgFile.name, dropPt);
  reader.readAsText(svgFile);
  return;
}
```

---

- [ ] **Step 6: Verify in browser**

Run: `npx live-server` from `laser-maker/`

**Test A — Simple SVG (no unsupported elements):**
1. Create a minimal SVG file `test.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
  <rect x="10" y="10" width="80" height="80" fill="#FF0000"/>
  <circle cx="150" cy="50" r="40" fill="none" stroke="#0000FF" stroke-width="2"/>
</svg>
```
2. Import via button — should land as group `"Group IMPORT test.svg"` with 2 path children
3. Toast: "SVG imported" (no action button)
4. Ungroup (Cmd+Shift+G) — should produce 2 separate paths
5. Each path: process = Free Appearance, colors preserved (red fill, blue stroke)

**Test B — SVG with gradient (unsupported elements):**
1. Create `gradient.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs><linearGradient id="g"><stop offset="0%" stop-color="red"/></linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
</svg>
```
2. Import — should still import the rect path (fill resolves to 'none' for url ref)
3. Toast: "SVG imported. Some elements skipped." with "Import raw" button
4. Click "Import raw" — group disappears, rawsvg lands on canvas
5. Undo (Cmd+Z) — rawsvg disappears, group reappears
6. Undo again (Cmd+Z) — group disappears entirely

**Test C — Drop import:**
1. Drag `test.svg` onto canvas — group should center at drop point, not artboard center

**Test D — No parseable shapes (fallback):**
1. Create `empty.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <defs><symbol id="s"><rect width="10" height="10"/></symbol></defs>
</svg>
```
2. Import — should fall back to rawsvg silently (no crash, no error toast)

**Test E — ViewBox scaling:**
1. Create `icon.svg`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 2L2 22h20Z" fill="#000"/>
</svg>
```
2. Import — no declared width/height, so natW/natH = 24×24. k = min(artboardW*0.9/24, artboardH*0.9/24, 1) = 1 (since 24px << artboard). Shape should land at ~24×24px centered.

---

- [ ] **Step 7: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/import-svg.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(laser-maker): SVG import produces editable groups"
```
