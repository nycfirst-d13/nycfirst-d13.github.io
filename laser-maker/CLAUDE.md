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

Students can drag-and-drop a raster image (PNG/JPG/GIF/WebP/BMP) onto the canvas, or use the **Import Image** topbar button. Handled in `import-svg.js` (same drop infrastructure as SVG import).

- Stored as `type: 'image'`, `attrs: { x, y, w, h, href, naturalW, naturalH }`. `href` is a **base64 data URL** — the pixel data is embedded directly in the shape, so it survives the SVG export round-trip into Illustrator.
- Placement: 1 image pixel = 1 artboard pixel (96 px/in); scaled down to fit 90% of the artboard if larger. Drop centers on the cursor; button centers on the artboard.
- Renders as `<svg:image>` (with a transparent rect catcher + rect hover-highlight, since `<image>` ignores `fill`/`stroke`). Resizes like a rect via `setGeomFromBBox`/`applyBBox` (`preserveAspectRatio="none"` — free stretch). Moves/nudges/reflects like `rawsvg` (position + rotation only; raster pixels are not truly mirrored).
- Export (`export.js`) emits `<image ... xlink:href href ...>`; root `<svg>` declares `xmlns:xlink`. Boolean/offset/shape-builder ops skip `image`.
- **Process restriction:** when the selection is all images, the process dropdown hides Main Cut / Fold / Final Cut — only **Free Appearance** and **Etch** are offered (`onlyImages` check in `syncFromState`).

#### Raster Etch mode

Setting an image to **Etch** opens a dedicated appearance panel (`#appearance-image-etch`, appearance mode `imageEtch` in `properties.js` — *not* the vector etch stroke/fill panel, which is meaningless for raster). `processType` stays `'etch'` (preserves the black color mapping); the panel is purely image preprocessing.

- **Adjustment params** live in `attrs.etch` (defaults from `DEFAULT_ETCH` in `image-filters.js`): `brightness`, `contrast`, `gamma`, `invert`, `depth` (black-point clamp — lower = shallower burn), `whiteClip` (near-white → pure white = no burn), `posterize` (0=off, else 2–8 levels), `threshold` + `level` + `dither` (none/floyd/ordered), `halftone` + `htSize` + `htAngle`. Threshold and Halftone are mutually exclusive.
- **Pipeline** (`processToDataURL` in `image-filters.js`, one `ImageData` pass): grayscale → brightness → contrast → gamma → invert → depth → white-clip → posterize → one binarizer (halftone | threshold[/dither] | none). All baked into pixels (not a render-time SVG filter) so the exported base64 is genuinely processed through the pipeline.
- **Controller:** `image-etch-panel.js` owns the panel's control sync, edit commits, and baking. `properties.js` owns only the panel show/hide. The processed pixels cache to `attrs.etchHref` with a param-signature in `attrs._etchSig`.
- **Interaction:** slider `input` (dragging) → fast downscaled live preview written straight to the live `<image>` DOM node (no state change); slider `change` (release) → `commit` params (undoable). A `store.subscribe` watcher re-bakes full-res (`processEtchImage` → `patch` `etchHref`, no history) whenever `_etchSig` ≠ current param signature — covers release, undo/redo, and load. `_interacting` guard prevents control sync from fighting an active drag.
- Render (`artboard.js`) and export (`export.js`) use `etchHref` when `processType === 'etch'`, falling back to the color original (`attrs.href`) until the first bake lands.

#### Trace to vector (raster → paths)

The Raster Etch panel's **Trace to vector** button (`#ie-trace`, handler in `image-etch-panel.js`) converts the *processed* etch pixels into editable vector `path` shapes via **imagetracerjs** (CDN script in `index.html`, exposes global `ImageTracer`).

- **Source** is `attrs.etchHref` (the baked B&W result — what-you-see-is-what-you-trace), falling back to `attrs.href`. So all etch adjustments (threshold/halftone/contrast…) flow through into the trace.
- **Trace:** the source is drawn to a canvas (longest side capped at `TRACE_MAX = 1000` px for speed) → `ImageTracer.imagedataToSVG` with a fixed 2-color black/white `pal`. Near-white background paths are dropped by luminance; only dark regions are kept.
- **Coordinate mapping:** traced canvas px → artboard coords via a matrix that scales to the image's displayed `w`/`h`, offsets by `x`/`y`, and carries image `rotation`. Built with `mulMat` + `applyMatrixToD` (now **exported** from `expand-svg.js` — shared, not duplicated).
- **Result replaces the image in place** (`st.shapes.splice`): a `group` of `path` children (or a single `path`), each `fill:'#000000'`, `processType:'etch'`. The student can change the process afterward via the Process panel. Undoable (`store.commit`, label `'trace-image'`).

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
| `export.js` | Clean SVG export sized in inches |
| `guides.js` | Smart snap guides: alignment detection with other shapes |
| `text-panel.js` | Text tool + font loading (Google Fonts, custom uploads) |
| `import-svg.js` | SVG import (→ editable group of paths) and raster image import (→ `image`, base64) via button + drag-drop. Falls back to `rawsvg` on parse failure or user request. |
| `image-filters.js` | Raster pixel pipeline for Raster Etch (grayscale/contrast/threshold/dither/halftone…); bakes to data URL |
| `image-etch-panel.js` | Raster Etch inspector controls + live preview + bake-to-`etchHref` + Trace to vector (imagetracerjs → paths) |
| `progress.js` | Reusable global progress bar (singleton). `show/update/done/hide` + `raf()` yield helper. See "Progress Bar" below |

### Progress Bar (reusable)

`progress.js` is a **singleton floating progress bar** for any operation slow enough to feel laggy. One bar at a time, anchored bottom-center above the status bar (same lane as the toast). The host element `#progress` lives in `index.html`; styling is the `.progress*` block in `styles.css` (uses design tokens — `--blue`→`--accent-hi` gradient fill, `--sh-3`, `--r-md`).

**Two text slots:** `label` (operation name, top-left, set once in `show()`) and `detail` (a line *under* the track, `#progress-detail`, describing the current step — update it as phases change). The `%` sits top-right.

**API:**
```js
import { progress, raf } from './progress.js';
progress.show('Offset Path', { detail: 'Preparing…' });   // determinate, 0%
progress.update(0.4, 'Flattening · 12/30');                // fraction 0..1 + detail line
progress.crawl(0.93, 0.99, 'Computing outline…', 9000);    // compositor crawl (see below)
progress.setDetail('Drawing result…');                     // change detail only, no width change
progress.done('Done');                                      // snap 100% → auto-hide after ~320ms
progress.hide();                                            // dismiss immediately
progress.show('Tracing…', { determinate:false });          // animated barber-pole (unknown dur.)
```

**Rules:**
- A determinate bar only animates if the driving loop **yields** — synchronous loops never repaint. Make the op `async` and `await raf()` between work chunks (the exported helper). `progress.update()` from a sync loop is invisible.
- **Gate behind a cost estimate** so the bar shows only for genuinely slow work; flashing it for a 5 ms op is worse than nothing.

**The crawl — animating a *blocking* tail.** Heavy ops end in a synchronous, un-chunkable block (e.g. Clipper `Execute()`, a big re-render). The main thread is frozen there, so width-driven `update()` calls can't animate — the bar parks at its last %. `crawl(from, to, detail, ms)` instead drives the fill with a CSS **`transform: scaleX` animation**, which runs on the **compositor thread** and keeps moving while JS is blocked. It eases from `from`→`to` (never reaches 100% on its own — leave headroom); `done()` snaps the rest once the block returns. Call `crawl()` then `await raf()` *immediately before* the blocking call so the animation is live by the time the thread locks up. `transform:scaleX` is compositor-friendly; `width` is not — that's the whole reason for the two-mode design (`.progress.crawl` vs plain). `update()` and `done()` clear the crawl (`clearCrawl()`); `setDetail()` does not, so use it to change the caption while the crawl keeps running.

**Current use — Offset Path** (`pathops.js`): `runOffset` is `async`. It estimates cost via `countLeaves()` (leaf shapes ≈ clipper polygons) and shows the bar only when `totalLeaves >= OFFSET_PROGRESS_MIN` (40). Heavy jobs route through `_offsetShapeAsync` → `_clipperOffsetFromPathsAsync`, which flattens paths in batches of `OFFSET_CHUNK` (12) and `await raf()`s between batches, calling `report(n)` per path. Below threshold it uses the original synchronous `_offsetShape` path.

**Tail reservation + crawl:** the blocking `ClipperOffset.Execute()` and the post-`commit` re-render can't be subdivided. Flattening fills only **0–88%** (`FLATTEN_MAX`, detail "Flattening paths · n / total"); `onFinishing` then starts a `crawl(0.93, 0.99, …, 9000)` ("Computing offset outline…") and paints a frame just before `Execute()`, so the fill keeps creeping while the thread is frozen; `setDetail('Drawing result…')` swaps the caption before `store.commit` *without* killing the crawl; `progress.done('Done')` snaps to 100% **after** the commit returns. General pattern for any progress-barred op: never let counted work reach 100% before the uncounted blocking tail — reserve headroom, drive that tail with `crawl()` (not `update()`), and paint a frame before the blocking call.

**Other good candidates** (not yet wired): Trace to vector (`image-etch-panel.js` — `ImageTracer.imagedataToSVG` is one blocking call, so use an **indeterminate** bar in place of the `Tracing…` toast); SVG export of large/many-path docs (`export.js`); Raster Etch full-res bake of large images (`processEtchImage` in `image-filters.js`); SVG import of complex files (`import-svg.js`); boolean ops on many shapes (`runOp` in `pathops.js`).

### SVG Import (editable groups)

SVGs import as editable groups of `path`/`text` shapes (`processType: 'free'`, original colors preserved). Students can ungroup and modify immediately. Falls back to `rawsvg` on parse failure or user request.

**Pipeline (`import-svg.js`):**
1. `DOMParser` → `parseSVGDim()` reads `width`/`height` attrs; unit conversions in `DIM_TO_PX` (`px`=1, `pt`=96/72, `mm`=96/25.4, `cm`=96/2.54, `in`=96); falls back to `viewBox` `vw×vh`, then `96×96`
2. `initMat = [k, 0, 0, k, tx, ty]` where `k = min(abW×0.9/natW, abH×0.9/natH, 1)` — shrink-to-fit, never upscale; `tx/ty` center on artboard (button) or drop cursor
3. `parseSVGToShapes(root, initMat)` → `{ shapes, hadUnsupported }`
4. Single shape → commit with `name = filename`; multiple shapes → wrap in `group` with `name = 'Group IMPORT filename.svg'`
5. `hadUnsupported` → `showToast('SVG imported. Some elements skipped.', { action: { label: 'Import raw', onClick } })`
6. "Import raw" callback: `store.undo()` removes the group, then commits a `rawsvg` blob; `showToast('Imported as raw SVG')`

**`parseSVGToShapes(rootSvgEl, initMat)` in `expand-svg.js`:**
- Shared with "Expand to Paths" (`expandSVG()`). Applies root SVG `viewBox` transform on top of `initMat` (was silently dropped before — latent bug fixed).
- Returns `{ shapes: Array<shapeSpec>, hadUnsupported: boolean }`. `hadUnsupported` is true when `walk()` hit elements in `SKIP_TAGS` (gradients, defs, `<use>`, filters) with non-trivial content.

**CSS class resolution (`parseStyleSheet` + `getAttr` in `expand-svg.js`):**
Illustrator SVGs use `<style>` blocks with class-based rules (`.st0 { fill: #231f20 }`). `getAttr(el, prop)` resolves in priority order: inline `style=` attribute → CSS class rule → presentation attribute. A module-level `_sheet` variable holds the parsed class map (set at parse start, cleared after) — no threading through all function signatures.

**Path number tokenizer (`parseNums` in `expand-svg.js`):**
SVG path data uses implicit separators that `split(/[\s,]+/)` breaks:
- `8.2.4` = two numbers (`8.2` and `0.4`) — second decimal starts a new number
- `-6.5-2.2` = two numbers — sign starts a new number

`parseNums` uses regex `/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g` to tokenize correctly. `parseTfm` (transform attrs) keeps the old split — transform syntax never uses implicit separators.

**Known limitation — sub-pixel rendering seams:**
Adjacent path elements in an imported group show hairline anti-aliasing gaps at shared edges. This is a browser rendering artifact: each `<path>` is composited independently, so shared edges are anti-aliased twice. It does **not** affect laser cut output (the SVG coordinates are mathematically correct). Options to suppress (stroke overlay, `shape-rendering: crispEdges`, single SVG context) would affect rendering for all shapes — not worth it.

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

These two tools mirror Adobe Illustrator's `V` and `A` tools with the same conceptual model:

**Select tool (V) — object-level operations**
- Click: select whole objects; click again on already-selected = no change; click empty = deselect
- Shift+click: add/remove from selection
- Drag: move selected objects; Alt+drag = duplicate
- Drag handle: resize (8 handles) or rotate (circle above bbox)
- Corner widgets appear on hover over a selected shape; dragging ANY widget applies to ALL corners uniformly (like Illustrator's "Live Corners" in the Select tool — all corners move together)
- Multi-select: compound bbox, uniform scale across all selected shapes
- Double-click group = enter isolation mode; double-click text = enter text edit

**Direct Select tool (A) — sub-object/anchor-level operations**
- Click empty area: deselect all; drag empty = anchor marquee (selects anchors, not whole objects)
- Click object: select it and show its anchor points (hollow squares); does NOT deselect if clicking already-selected shape
- Click anchor square: select that anchor (highlights it); Shift+click = add to anchor selection
- Drag selected anchor(s): move those anchors only (rect → free-form path conversion; line endpoints; path anchors)
- Drag segment: selects both endpoint anchors, moves the segment
- Double-click segment (path only): toggle straight ↔ bezier curve
- Drag bezier handle (circle): move a control point for that curve
- Corner widgets appear only on the selected/hovered anchor of the shape — dragging ONE widget affects ONLY that vertex's corner radius
- Per-vertex corner rounding stored in `cornerRadii` map (see below); select tool's uniform drag clears `cornerRadii`

**Key behavioral difference (matches Illustrator):**
- V tool corner drag: all corners move uniformly
- A tool corner drag: only the vertex whose widget you dragged changes

### Polygon Tool

`type: 'polygon'`, attrs: `{ cx, cy, r, sides, cornerRadius, cornerRadii? }`. Inspector panel shows Sides (3–64). Default 6 sides, 0 corner radius.

### Star Tool

`type: 'star'`, attrs: `{ cx, cy, r, points, innerRatio, outerCornerR, innerCornerR, cornerRadii? }`. Outer radius `r`, inner radius `r * innerRatio`. Inspector panel shows Points (3–20) and Inner Ratio (0.05–0.95). Default 5 points, 0.4 inner ratio, 0 corner radii. Drag-from-center like polygon.

### Corner Rounding — Rule for All Shape Types

**Every closed shape type must expose corner rounding via drag widgets on the canvas.** Never add inspector numeric inputs for corner radius — the widget interaction is the exclusive UI. This matches how rect and path already work.

| Shape | Corner radius fields | Select tool widget | Direct-select widget |
|-------|---------------------|--------------------|---------------------|
| `rect` | `rx` (uniform), `r_nw/ne/se/sw` (per-corner) | All 4 corners move uniformly (writes to `rx`, clears per-corner) | Only selected/hovered anchor; writes per-corner `r_*` field |
| `polygon` | `cornerRadius` (uniform), `cornerRadii` (per-vertex map) | All vertices uniformly (writes `cornerRadius`, deletes `cornerRadii`) | Only selected/hovered vertex; writes `cornerRadii[idx]` |
| `star` | `outerCornerR`, `innerCornerR` (uniform by parity), `cornerRadii` (per-vertex map) | Even-idx tips → `outerCornerR`; odd-idx valleys → `innerCornerR`; deletes `cornerRadii` | Only selected/hovered vertex; writes `cornerRadii[idx]` |
| `path` | `corners` (per-vertex map only) | Not shown in select tool | Per-vertex widget for straight-line vertices only |

**`cornerRadii` map (polygon/star):** `{ [vtxIdx]: radius }`. Per-vertex override that takes precedence over the uniform fields. When present, rendering and export iterate vertices and resolve `cornerRadii[i] ?? cornerRadius` (polygon) or `cornerRadii[i] ?? (i%2===0 ? outerCornerR : innerCornerR)` (star). Select tool (uniform drag) deletes `cornerRadii` entirely — direct-select is the only writer.

**Rendering:** `roundedPolygonPath(pts, radii)` in `utils.js` handles polygon and star. Always pass a per-vertex array (resolved from `cornerRadii` + fallback). When any radius > 0, shape renders/exports as `<path>` with arc segments instead of `<polygon>`.

**Corner info computation:** `getPolyCornerInfos(pts)` in `utils.js` computes bisector direction, max radius, and sinHalf for each vertex of a closed polygon — same schema as `getPathCornerInfos`. Used in `select.js` for widget positioning and drag math.

**Star corners rationale:** Outer tips and inner valleys have very different interior angles and natural radius ranges. `outerCornerR`/`innerCornerR` give students the expected "puffy star" vs "spiky star with rounded valleys" controls when using the Select tool. Direct-select gives per-vertex independence when needed.

**Direct-select anchor squares for polygon/star:** `anchorPoints()` in `select.js` returns `artboard._polyPoints` / `artboard._starPoints` so vertex anchor squares render in direct-select mode. Clicking a vertex square sets `selectedAnchors`, making that vertex's corner widget visible. Vertex dragging (moving anchors) is not supported for polygon/star — these shapes store geometry as `{cx, cy, r, sides}` / `{points, innerRatio}`, not as free-form paths. `applyAnchorsDelta` has no polygon/star case by design; only the corner-widget drag (via `[data-corner-widget]` elements) modifies these shapes.
