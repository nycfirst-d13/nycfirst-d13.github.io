# Export: Artboard / Content Toggle

**Date:** 2026-06-24  
**Status:** Approved

## Problem

Teachers preparing laser cutting jobs (data merge in InDesign, tiling in Illustrator) need SVGs sized to the design's actual content — not the full artboard with surrounding empty space. Currently all exports include the full artboard bounds.

## Goal

Add a toggle in the export dialog that switches between:

- **Fit to artboard** (default) — current behavior, viewBox = full artboard dimensions
- **Fit to content** — viewBox = ink bounds of all visible shapes

## UI Design

A pill toggle switch in the export dialog, below the project field:

```
[●━━━━] Fit to artboard        ← default, blue pill
[━━━━●] Fit to content         ← toggled, red pill
```

- Toggle sits left; label sits **right** of the toggle
- Label text updates with state — only the active state's label is shown
- **Blue** (`#0000FF`) pill = artboard mode (matches mainCut process color)
- **Red** (`#FF0000`) pill = content mode (matches fold process color)
- Default: artboard (left/blue)
- No persistence — resets to artboard on every page load

## Behavior

Both "Download" and "Save to Cloud" buttons respect the toggle.

When **Fit to content**:
- `_contentBBox()` walks all visible shapes recursively
- For each leaf shape: `artboard.getShapeBBox(sh)` → geometry bbox, then expand edges by `resolveAppearance(sh).strokeWidth / 2` (ink bounds, so nothing clips in Illustrator/InDesign)
- If `sh.rotation` is set: rotate all 4 expanded corners around the bbox center, take their min/max
- Union all per-shape ink bboxes into one global bbox
- If canvas empty (no shapes), fall back to artboard bounds
- `buildSVG` sets `viewBox="${x} ${y} ${w} ${h}"` and `width/height` in inches derived from the bbox (px ÷ 96)

When **Fit to artboard**: existing behavior unchanged.

## Code Changes

### `export.js`

1. Add `pxToIn` to import from `utils.js`
2. New `_contentBBox()` function (~30 lines)
3. `buildSVG(pathMap, tight = false)` — add `tight` param, branch on it for `viewBox`/`width`/`height`. Backward-compat: default `false`.
4. `_makeSVG(tight = false)` — add `tight` param, pass to `buildSVG`
5. Both `_downloadBtn` and `_confirmBtn` click handlers: read `_tightCb.checked` and pass to `_makeSVG`
6. Add `const _tightCb = document.getElementById('export-tight-cb')` and `const _tightLabel = document.getElementById('export-tight-label')`

### `index.html`

Add toggle row in `.export-dialog-fields` after the project field:

```html
<div class="export-field export-field--toggle">
  <label class="export-toggle-switch">
    <input type="checkbox" id="export-tight-cb" />
    <span class="export-toggle-track"></span>
  </label>
  <span class="export-toggle-label" id="export-tight-label">Fit to artboard</span>
</div>
```

### `styles.css`

New `.export-toggle-switch` / `.export-toggle-track` CSS:
- Pill shape, thumb slides left→right on check
- Unchecked: blue background, thumb left
- Checked: red background, thumb right
- Transition: `background 0.2s, transform 0.2s`

JS in `export.js` updates `#export-tight-label` text on `change`:
```js
_tightCb.addEventListener('change', () => {
  _tightLabel.textContent = _tightCb.checked ? 'Fit to content' : 'Fit to artboard';
});
```

### `CLAUDE.md`

Update `export.js` row in module table: note tight/content export and `_contentBBox()`.

## Non-Goals

- No persistence between sessions
- No per-shape content-vs-artboard selection
- No preview of the tight bounds in the dialog
