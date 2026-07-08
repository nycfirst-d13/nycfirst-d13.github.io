# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose & Audience

Laser Maker is a browser-based vector design tool built for elementary and middle school students at an NYC FIRST STEM center. Students use it to design parts and projects for laser cutting — specifically the **Epilog Fusion Edge 36**.

The app intentionally mirrors Adobe Illustrator's interface but strips it down to the features that matter for this use case: drawing shapes, applying process types, and exporting clean SVGs. The goal is not to replace Illustrator but to give students a structured, approachable entry point before they move on to a full professional vector suite. Features that don't serve the laser-cutting learning objective are excluded by design.

## Laser Cutting Workflow

Designs created in Laser Maker travel through this pipeline before reaching the cutter:

```
Laser Maker (browser app)
        │
        │  Export SVG
        ▼
  SVG file (saved locally)
        │
        │  Import into
        ▼
  Adobe Illustrator
        │
        │  File → Print
        ▼
  Epilog Fusion Job Manager (print driver)
        │
        │  Send job
        ▼
  Epilog Fusion Edge 36 (laser cutter)
```

The SVG export is the handoff point — students save the file, and it gets opened in Illustrator later (typically by a teacher or more advanced student) before being sent to the cutter.

## Process Type Color System

The app uses a strict color-mapping system that maps directly to how the Epilog Fusion driver interprets vector files. Colors are locked per process type and cannot be changed by the student — this eliminates translation errors through the pipeline.

| Process | Code Key | Color | Hex | Stroke | Notes |
|---------|----------|-------|-----|--------|-------|
| Main Cut | `mainCut` | Blue | `#0000FF` | 1pt | Primary cut outline; locked |
| Fold / Score | `fold` | Red | `#FF0000` | 1pt | Score lines for folding; locked |
| Final Cut | `finalCut` | Green | `#00FF00` | 1pt | Final release cut; locked |
| Etch | `etch` | Black | `#000000` | user-set | Fill or stroke can be toggled; color locked to black |
| Free | `free` | any | — | user-set | No process constraints; student controls appearance |

Appearance is resolved at render and export time via `resolveAppearance()` in `process-registry.js`. That function is the single source of truth — never hardcode process colors elsewhere.

## Maintaining This File

Update CLAUDE.md when:
- A new feature or module is added that meaningfully changes the architecture
- An existing module's role, API, or data model changes significantly
- The user explicitly says "add this to CLAUDE.md", "write this down", "note this", or similar
- A key architectural decision is made that isn't obvious from the code

When updating, prefer expanding existing sections over creating new top-level sections. Keep descriptions precise and implementation-focused — the goal is to help a future Claude instance get productive fast, not to document every detail.

After updating CLAUDE.md, commit the change with a message like `docs: update CLAUDE.md — [what changed]`.

## Memory

Auto-memory lives at `/Users/avigoldman/.claude/projects/-Users-avigoldman-Desktop-nycfirst-d13-github-io/memory/`. When the user says "remember X" or "save this", write the appropriate memory file and update `MEMORY.md`. See the memory system instructions for file format details.
Ca
CLAUDE.md and memory serve different purposes:
- **Memory** — user preferences, feedback, project context, external references. Persists across all conversations.
- **CLAUDE.md** — codebase architecture, feature implementation notes, key design decisions. Scoped to this project's code.

When the user asks to "write down key takeaways" or "note important aspects" of a feature, add it to CLAUDE.md (not memory) under the relevant architecture section or a new feature-specific subsection.

## Git & Commits

The git repo root is `/Users/avigoldman/Desktop/nycfirst-d13.github.io` — the parent directory that serves the GitHub Pages site. `laser-maker/` is a subdirectory inside it, not a separate repo. **Always run git commands from the parent directory**, even when Claude Code is invoked from within `laser-maker/`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/foo.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "..."
```

Scope each commit to one app + one logical change — stage `laser-maker/` paths only, never bare `git add .` that pulls in other apps. Use a conventional prefix (`feat(laser-maker): …`, `docs(laser-maker): …`) and `git status` to verify staging before committing.

Do not ask for permission to run commits from the parent directory — this is always the correct behavior.

## Running the App

No build step. Pure ES modules — must serve over HTTP (not `file://`) due to CORS:

```bash
npx live-server
```

## Architecture

Browser-based SVG vector editor for middle-school students designing laser-cut parts. Mimics Illustrator with a classroom-friendly interface.

**No frameworks. No build pipeline.** Vanilla JS ES modules only. Only runtime deps: `paper.js` (boolean path ops via CDN) and `clipper-lib` (path clipping via CDN).

### State Management

`state.js` is the single source of truth. All modules subscribe to state changes:
- `state.subscribe(callback)` — reactive updates
- `state.patch(delta)` — update without history
- `state.commit(delta)` — update + push to undo stack (80-level)
- `state.undo()` / `state.redo()`

**Undo history is canvas-only.** A snapshot (`_snapshot()`) holds exactly `artboard`, `shapes`, `selection`. UI/DOM state is deliberately excluded — most notably the header **name/project** inputs (`#header-name`/`#header-project`), which live in the DOM + localStorage (`canvas-cache.js`), never in the store. They must never be added to the snapshot.
- Caveat: Chrome's native cross-element undo can leak. A `Cmd+Z` fired while editing a canvas text box (the textarea has no native undo history) falls back to the last-edited text input — the header fields — and wipes them. The text-edit overlay guards against this in `type.js`: `Cmd/Ctrl+Z` is `preventDefault`ed only when `ta.value === ta._initialValue` (nothing of its own to undo), so native char-by-char undo inside the box still works while the leak is blocked.

### Tool System

`tools.js` is the tool registry. Each tool is an object with optional `pointerdown`, `pointermove`, `pointerup`, `keydown` handlers. Register with `registerTool(name, handler)`. Active tool routes all pointer events.

Keyboard shortcuts in `keys.js` match Adobe Illustrator exactly — intentional so students transferring to Illustrator already know the keys: V=select, A=direct-select, M=rect, L=ellipse, `\`=line, P=pen, T=text, H=hand, O=reflect, Shift+M=shape-builder. Polygon has no dedicated key (same as Illustrator where it's a sub-tool). Never change tool keys away from their Illustrator equivalents — the goal is to teach Illustrator muscle memory.

### Coordinate System

96 CSS pixels = 1 inch (real-world scale for laser cutting). `utils.js` has `pxToIn()` / `inToPx()`. Artboard coordinates ≠ screen coordinates — use `artboard.js` conversion helpers (`screenToArtboard`, `artboardToScreen`) when implementing pointer interactions.

### Shape Data Model

Shapes stored in `state.shapes` array. Each shape has:
- `id`, `type` (rect/ellipse/line/polygon/path/text/group/rawsvg/image)
- `x`, `y`, `width`, `height`, `rotation`
- `fill`, `stroke`, `strokeWidth`
- `process` — one of `mainCut`/`fold`/`finalCut`/`etch`/`free` (maps to visual style via `process-registry.js`)
- Type-specific fields (e.g. `points` for polygon, `d` for path, `content`/`font` for text)

### Raster Image Import

Stored as `type: 'image'`, base64 `href`, drag-to-drop or Import Image button. Etch mode (`attrs.etch` params → `etchHref`), Trace to vector (imagetracerjs → path group). See [`docs/raster-image.md`](docs/raster-image.md) for full details.

#### Trace to Vector — decomposition & selectability

ImageTracer emits **one `<path>` per palette color**, so all dark pixels land in a single compound `d`. `traceSelected()` in `image-etch-panel.js` decomposes that into **selectable region paths**:

1. `splitSubpaths(d)` — split the transformed (all-absolute) `d` on each `M` boundary into one string per contour.
2. `subpathsToRegions(subs)` — group contours by **bbox containment** (via paper.js `.area`/`.bounds`). Each contour's `parent` = smallest-area region whose bbox strictly contains it; nesting `depth` follows the parent chain. **Even depth = a filled region** (its own shape); its **odd-depth direct children are holes**, appended to the same `d` and painted out via `fill-rule: evenodd`. An island inside a hole (even depth again) becomes its own region recursively.
3. Result: a flat `group` whose children are one `path` per region, each `attrs: { d, fillRule: 'evenodd' }`, `processType: 'etch'`. Single-region traces collapse to a bare top-level path (no group).

**Selectability contract.** Every region path is a normal group child, so all standard group navigation works: expand in the layers panel, double-click on canvas to enter isolation, direct-select the child. When adding/changing trace decomposition, preserve this — the traced group must never be an un-decomposable blob; each region must be an individually selectable child shape.

**Deliberate tradeoff (chosen by user):** output favors correct **etch fill** over per-contour selection. A hole (e.g. the white shine inside a black eye) is merged into its parent region's even-odd compound `d`, so it is *not* separately selectable. This is required because etch locks fill to black — holes can only read as see-through via even-odd, not as separate stacked paths. Making every contour individually selectable would require Free-process parity fills (black/white stacking) and was explicitly declined. Don't "fix" merged holes back into separate paths without re-confirming this decision.

**Ceiling:** containment is bbox-only, not true point-in-polygon (`ponytail:` comment in `subpathsToRegions`). Fine for cleanly-nested line art; upgrade to `path.contains()` if side-by-side shapes with overlapping bboxes misgroup.

### Key Module Roles

| Module | Role |
|--------|------|
| `app.js` | Entry point; initializes all modules |
| `artboard.js` | Viewport (zoom/pan/fit), grid, shape rendering, coordinate conversion |
| `select.js` | Selection, transform handles, marquee, direct anchor editing |
| `pen.js` | Bézier pen tool; click=corner, drag=curve |
| `shapes.js` | Drag-to-create tools: rect, ellipse, line, polygon |
| `properties.js` | Inspector panel: position/size/rotation, fill/stroke, process type |
| `layers.js` | Layers panel: reorder, lock/hide, group/ungroup |
| `pathops.js` | Boolean ops (unite/subtract/intersect) via Paper.js; Offset Path via Clipper. Rect/ellipse offset analytically; everything else via `collectPaperPaths` (recursive, world coords) → Clipper. Groups offset as one combined outline around all descendant geometry, so image-traced groups and nested groups work; group rotation applied around group bbox center. Per shape in multi-select. Skips text/line/image. |
| `export.js` | Clean SVG export sized in inches. Toggle in export dialog switches between artboard bounds (default) and tight ink bounds (`_contentBBox`): geometry bbox + half stroke width, rotation-corrected, used for InDesign data merge / Illustrator tiling. |
| `guides.js` | Smart snap guides: alignment detection with other shapes |
| `text-panel.js` | Text tool + font loading (Google Fonts, custom uploads) |
| `import-svg.js` | SVG import (→ editable group of paths) and raster image import (→ `image`, base64) via button + drag-drop. Falls back to `rawsvg` on parse failure or user request. |
| `image-filters.js` | Raster pixel pipeline for Raster Etch (grayscale/contrast/threshold/dither/halftone…); bakes to data URL |
| `image-etch-panel.js` | Raster Etch inspector controls + live preview + bake-to-`etchHref` + Trace to vector (imagetracerjs → paths) |
| `progress.js` | Reusable global progress bar (singleton). `show/update/done/hide` + `raf()` yield helper. See "Progress Bar" below |

### Progress Bar (reusable)

Singleton bar (`progress.js`) anchored bottom-center. API: `show/update/crawl/setDetail/done/hide`. Crawl drives a compositor-thread CSS animation for blocking tail ops (e.g. Clipper `Execute()`). See [`docs/progress-bar.md`](docs/progress-bar.md) for full API, crawl mechanics, and wiring guide.

### SVG Import (editable groups)

SVGs import as editable groups (`processType: 'free'`, original colors preserved) via `parseSVGToShapes()` in `expand-svg.js` (shared with Expand to Paths). Unsupported elements trigger "Import raw" toast action → fallback to `rawsvg`. See [`docs/svg-import.md`](docs/svg-import.md) for pipeline, CSS class resolver, path tokenizer, and rendering seam notes.

### Layout

Topbar (56px) | Tool sidebar (56px) | Canvas (flex-fill) | Inspector (280px) | Status bar (30px). CSS variables and design tokens in `styles.css`.

### Inspector Input Classes

Use the right class for each parameter type. Never mix them.

| Class | Element | When to use | Examples |
|-------|---------|-------------|---------|
| `.numeric` | `<div>` wrapping `<input type="number">` | Precise dimensional values with unit suffix. User types exact numbers. Spinner arrows hidden. | X, Y, W, H, R (rotation), stroke weight, font size, offset amount |
| `.stepper` | `<div>` wrapping `[−] <input type="number"> [+]` | Small-range discrete integers where ±1 steps are the natural interaction. No unit label needed. | Polygon sides, star point count |
| `.slider-ctrl` | `<div>` wrapping `[−] <input type="range"> <span class="slider-val"> [+]` | Continuous ratio/percentage values (0–1 or 0–100%) where feel matters more than exact entry. Always include a `.slider-val` span between the range input and the + button — it shows the live value + unit (uses `data-unit` on the `<input>`). Buttons for fine ±step nudging. Use `input` event for live patch, `change` event for undo-stack commit. | Star inner ratio |
| `.prop-select` | `<select>` | Enum/named choices, mutually exclusive. | Text weight |
| `.color-control` | `<div>` wrapping color picker + hex input + ∅ button | Fill or stroke color with none option. | Fill color, stroke color |
| `.icon-btn-group` / `.seg-group` | `<div>` of `.icon-btn` buttons | Mutually exclusive visual mode toggles. | Text align, fold line style |

**JS wiring rules:**
- `.numeric` — listen on `change` → `store.commit`
- `.stepper` — buttons dispatch `change` on the input → same `change` handler
- `.slider-ctrl` — listen on `input` → `store.patch` (live); `change` → `store.commit` (history). Buttons dispatch both `input` and `change`.

### Inspector Panel Order

Fixed order in `index.html`:
1. **Transform** — always visible
2. **Process** — always visible
3. **Shape/tool-specific panels** (conditional, `display:none` by default) — e.g. Text, Star, Expand SVG
4. **Pathfinder** — collapsed
5. **Offset Path** — collapsed
6. **Layers** — fixed to bottom

Rule: any new shape- or tool-specific inspector panel belongs in slot 3, after Process, never above Transform. Panels show/hide via `syncFromState()` in `properties.js`.

### Select Tool (V) vs Direct Select Tool (A)

V = object-level (move/resize/rotate, all corners uniform). A = anchor-level (move anchors, per-vertex corner radius). Both mirror Illustrator exactly. See [`docs/select-tools.md`](docs/select-tools.md) for full behavior spec and corner rounding rules for all shape types.

### Polygon Tool

`type: 'polygon'`, attrs: `{ cx, cy, r, sides, cornerRadius, cornerRadii? }`. Inspector panel shows Sides (3–64). Default 6 sides, 0 corner radius.

### Star Tool

`type: 'star'`, attrs: `{ cx, cy, r, points, innerRatio, outerCornerR, innerCornerR, cornerRadii? }`. Outer radius `r`, inner radius `r * innerRatio`. Inspector panel shows Points (3–20) and Inner Ratio (0.05–0.95). Default 5 points, 0.4 inner ratio, 0 corner radii. Drag-from-center like polygon.

### Corner Rounding Panel

The `#corner-panel` (inspector slot 3, after Process) gives numeric corner-radius entry in inches, complementing the drag-to-round corner widgets. Shown for `rect`/`polygon`/`star`/`path`; hidden for everything else (ellipse, text, group, line, image). Visibility tracks *selection of a roundable shape*, never the radius value — 0 stays editable, no flicker.

**Scope.** Master (all corners) by default. The A (direct-select) tool with exactly one roundable anchor selected scopes the field to that single corner (title flips to "Corner"). Differing corners read as "mixed" → field blank with a `Mixed` placeholder.

**Source of truth.** `select.js` owns the geometry and exports two functions consumed by `properties.js`:
- `getCornerUIState()` → `{ visible, scope: 'all'|'one', valueIn, maxIn }`
- `setCornerRadiusIn(valIn)` → commits a clamped radius to the current scope

Internal helpers (`_cornerRadiusPx`, `_cornerMaxPx`, `_writeCornerRadius`, `_activeCornerKey`) reconcile the per-type data model: rect `rx`/`r_{nw,ne,se,sw}`, polygon `cornerRadius`/`cornerRadii`, star `outer/innerCornerR`/`cornerRadii`, path `corners[idx]`. Writing one rect corner materializes all four (deletes `rx`) so it becomes independent.

**Sync seam.** Anchor/corner selection lives in `select.js` module state, *not* the store, so `store.subscribe` can't see scope changes. `renderOverlay()` dispatches a `lm-overlay-change` window event that `properties.js` listens to alongside `store.subscribe(syncFromState)`.

**Hybrid drag readout.** While a corner widget is dragged, `_appendCornerReadout()` floats a live inch label (`.corner-readout`) at the active widget — wired into all four widget-render loops (V/A × rect/poly-star-path), gated on the active-drag corner. Cleared automatically when the drag ends and the overlay re-renders.
