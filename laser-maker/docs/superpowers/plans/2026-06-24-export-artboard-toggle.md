# Export Artboard Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pill toggle to the export dialog that switches SVG export between full artboard bounds (default) and tight ink bounds of the design content.

**Architecture:** `_contentBBox()` in `export.js` walks all visible shapes, computes geometry bbox via `artboard.getShapeBBox`, expands by half stroke width, applies rotation if needed, unions into one bbox. `buildSVG(pathMap, tight)` uses that bbox for `viewBox`/`width`/`height` when `tight=true`. The toggle is a CSS pill (`<input type="checkbox">` + styled `<span>`) in the export dialog; its `.checked` state is read at click time by both export buttons.

**Tech Stack:** Vanilla JS ES modules, no build step, no test framework — verification is manual in-browser.

## Global Constraints

- No new npm/CDN dependencies
- No build step — pure ES modules served via `npx live-server`
- Git commands must use `git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io`
- Process colors: artboard state = `#0000FF`, content state = `#FF0000`
- Toggle resets to artboard (unchecked) on every page load — no localStorage

---

### Task 1: `_contentBBox()` + `buildSVG`/`_makeSVG` tight param

**Files:**
- Modify: `laser-maker/modules/export.js`

**Interfaces:**
- Produces: `_contentBBox() → {x, y, w, h} | null` (px, artboard coords); `buildSVG(pathMap?, tight?) → string`; `_makeSVG(tight?) → Promise<string>`

- [ ] **Step 1: Add `pxToIn` to the import from utils.js**

In `export.js` line 8, change:
```js
import { inToPx, applyPathCorners, wordWrapLines, roundedPolygonPath } from './utils.js';
```
to:
```js
import { inToPx, pxToIn, applyPathCorners, wordWrapLines, roundedPolygonPath } from './utils.js';
```

- [ ] **Step 2: Add `_contentBBox()` after the `collectTextShapes` function (after line 290)**

```js
function _contentBBox() {
  const s = store.get();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function rotateCorner(px, py, cx, cy, deg) {
    const r = deg * Math.PI / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    const dx = px - cx, dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function expandPoint(x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function processShape(sh) {
    if (sh.visible === false) return;
    if (sh.type === 'group') {
      (sh.children || []).forEach(processShape);
      return;
    }
    const b = artboard.getShapeBBox(sh);
    if (!b || (b.w === 0 && b.h === 0)) return;
    const resolved = resolveAppearance(sh);
    const half = (resolved.strokeWidth ?? 0) / 2;
    const x1 = b.x - half, y1 = b.y - half;
    const x2 = b.x + b.w + half, y2 = b.y + b.h + half;
    const corners = [
      { x: x1, y: y1 }, { x: x2, y: y1 },
      { x: x2, y: y2 }, { x: x1, y: y2 },
    ];
    if (sh.rotation) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      corners.forEach(p => {
        const rot = rotateCorner(p.x, p.y, cx, cy, sh.rotation);
        expandPoint(rot.x, rot.y);
      });
    } else {
      corners.forEach(p => expandPoint(p.x, p.y));
    }
  }

  s.shapes.forEach(processShape);
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
```

- [ ] **Step 3: Update `buildSVG` to accept `tight` param**

Replace the existing `buildSVG` function (lines 263–279):
```js
function buildSVG(pathMap = new Map(), tight = false) {
  const s = store.get();
  const defs = [];
  const body = s.shapes.map(sh => shapeToSVG(sh, pathMap, defs)).filter(Boolean).join('\n  ');
  const defsBlock = defs.length ? `<defs>\n  ${defs.join('\n  ')}\n</defs>\n  ` : '';

  let vx = 0, vy = 0, wPx, hPx;
  if (tight) {
    const bbox = _contentBBox();
    if (bbox) {
      vx = bbox.x; vy = bbox.y; wPx = bbox.w; hPx = bbox.h;
    } else {
      wPx = inToPx(s.artboard.w); hPx = inToPx(s.artboard.h);
    }
  } else {
    wPx = inToPx(s.artboard.w); hPx = inToPx(s.artboard.h);
  }
  const wIn = pxToIn(wPx), hIn = pxToIn(hPx);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"
     width="${wIn.toFixed(4)}in" height="${hIn.toFixed(4)}in"
     viewBox="${vx.toFixed(3)} ${vy.toFixed(3)} ${wPx.toFixed(3)} ${hPx.toFixed(3)}">
  <title>Laser Maker Export</title>
  <desc>${wIn.toFixed(3)} × ${hIn.toFixed(3)} inches</desc>
  ${defsBlock}${body}
</svg>
`;
}
```

- [ ] **Step 4: Update `_makeSVG` to accept and pass `tight`**

Replace the existing `_makeSVG` function (lines 292–309):
```js
async function _makeSVG(tight = false) {
  const s = store.get();
  const textShapes = collectTextShapes(s.shapes);
  const pathMap = new Map();

  if (fontkit && textShapes.length) {
    await Promise.all(textShapes.map(async sh => {
      try {
        const d = await textShapeToPathD(sh);
        if (d) pathMap.set(sh.id, d);
      } catch (err) {
        console.warn('text-to-path failed for', sh.id, err);
      }
    }));
  }

  return buildSVG(pathMap, tight);
}
```

- [ ] **Step 5: Update `download` to accept and pass `tight`**

Replace the existing `download` function (lines 323–327):
```js
async function download(filename, tight = false) {
  const svg = await _makeSVG(tight);
  _saveLocally(svg, filename);
  return svg;
}
```

- [ ] **Step 6: Verify in browser — artboard mode unchanged**

Run `npx live-server` in `laser-maker/`. Draw a rect, open export dialog, click Download. Open the downloaded SVG in a text editor. Confirm `width` and `height` match the artboard size (e.g. `12.0000in` × `9.0000in` for a 12×9 artboard). `viewBox` should start with `0.000 0.000`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/export.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(export): add _contentBBox and tight param to buildSVG/_makeSVG"
```

---

### Task 2: Toggle HTML + CSS + JS wiring

**Files:**
- Modify: `laser-maker/index.html` (export dialog, after line 722)
- Modify: `laser-maker/styles.css` (after `.export-drive-error-close:hover` at line 1678)
- Modify: `laser-maker/modules/export.js` (dialog JS section, button handlers)

**Interfaces:**
- Consumes: `_makeSVG(tight: boolean)` and `download(filename, tight: boolean)` from Task 1
- Produces: `_tightCb` (HTMLInputElement), `_tightLabel` (HTMLElement) used by both button handlers

- [ ] **Step 1: Add toggle HTML to the export dialog**

In `index.html`, after the closing `</div>` of the project field (line 722, after `</div>`), add inside `.export-dialog-fields`:
```html
        <div class="export-field export-field--toggle">
          <label class="export-toggle-switch">
            <input type="checkbox" id="export-tight-cb" />
            <span class="export-toggle-track"></span>
          </label>
          <span class="export-toggle-label" id="export-tight-label">Fit to artboard</span>
        </div>
```

- [ ] **Step 2: Add toggle CSS to styles.css**

Append after line 1678 (`.export-drive-error-close:hover { opacity: 1; }`):
```css
.export-field--toggle {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.export-toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

.export-toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.export-toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: #0000FF;
  transition: background 0.2s;
}

.export-toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.export-toggle-switch input:checked + .export-toggle-track {
  background: #FF0000;
}

.export-toggle-switch input:checked + .export-toggle-track::after {
  transform: translateX(16px);
}

.export-toggle-label {
  font-size: 12px;
  color: var(--ink-2);
  user-select: none;
}
```

- [ ] **Step 3: Wire `_tightCb` and `_tightLabel` in `export.js`**

In the `// ---- Export dialog ----` section (around line 338), add after the existing `const _driveErrorClose` line:
```js
const _tightCb    = document.getElementById('export-tight-cb');
const _tightLabel = document.getElementById('export-tight-label');

_tightCb.addEventListener('change', () => {
  _tightLabel.textContent = _tightCb.checked ? 'Fit to content' : 'Fit to artboard';
});
```

- [ ] **Step 4: Update `_downloadBtn` handler to pass toggle state**

Replace the existing `_downloadBtn` click handler (lines 428–434):
```js
_downloadBtn.addEventListener('click', async () => {
  const filename = _validateFields();
  if (!filename) return;
  _syncHeader();
  _closeDialog();
  await download(filename, _tightCb.checked);
});
```

- [ ] **Step 5: Update `_confirmBtn` handler to pass toggle state**

Replace the existing `_confirmBtn` click handler (lines 437–465):
```js
_confirmBtn.addEventListener('click', async () => {
  const filename = _validateFields();
  if (!filename) return;
  _syncHeader();
  const tight = _tightCb.checked;

  _driveError.hidden = true;
  _confirmBtn.disabled = true;
  _confirmBtn.textContent = 'Saving…';
  _backdrop.hidden = true;

  const svg = await _makeSVG(tight);
  const result = await uploadToDrive(svg, filename);

  _confirmBtn.disabled = false;
  _confirmBtn.textContent = 'Save to Cloud';

  if (result === true) {
    showToast(`Saved to Drive · ${filename}`, { success: true });
  } else {
    _backdrop.hidden = false;
    if (result === false) {
      _driveError.hidden = false;
      const _doDownload = () => { _saveLocally(svg, filename); _closeDialog(); };
      _driveDownloadBtn.onclick = _doDownload;
      _driveErrorClose.onclick  = _doDownload;
    }
  }
});
```

- [ ] **Step 6: Verify toggle UI and behavior in browser**

Open the export dialog. Check:
1. Toggle pill is blue with thumb on left — label reads "Fit to artboard"
2. Click toggle → pill turns red, thumb slides right, label reads "Fit to content"
3. Click toggle again → blue, label reads "Fit to artboard"
4. Close and reopen dialog → still shows last state (within session)
5. Hard refresh page → toggle resets to blue / "Fit to artboard"

- [ ] **Step 7: Verify tight export SVG output**

With a rect placed at ~(50px, 50px) on the artboard (not at 0,0):
1. Toggle to "Fit to content"
2. Download SVG
3. Open in text editor — `viewBox` should NOT start with `0.000 0.000`; x/y should match the rect's position minus half stroke. `width`/`height` should be smaller than the artboard size.
4. Open in Illustrator or browser — confirm the SVG renders the shape flush to the document edge with no empty margin.

- [ ] **Step 8: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/index.html laser-maker/styles.css laser-maker/modules/export.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(export): add artboard/content toggle pill to export dialog"
```

---

### Task 3: Update CLAUDE.md

**Files:**
- Modify: `laser-maker/CLAUDE.md`

- [ ] **Step 1: Update `export.js` row in module table**

Find the `export.js` row in the Key Module Roles table in `CLAUDE.md`:
```
| `export.js` | Clean SVG export sized in inches |
```
Replace with:
```
| `export.js` | Clean SVG export sized in inches. Toggle in export dialog switches between artboard bounds (default) and tight ink bounds (`_contentBBox`): geometry bbox + half stroke width, rotation-corrected, used for InDesign data merge / Illustrator tiling. |
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/CLAUDE.md
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "docs: update CLAUDE.md — export.js tight/content bbox toggle"
```
