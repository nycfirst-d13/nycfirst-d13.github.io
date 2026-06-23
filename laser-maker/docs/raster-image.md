# Raster Image Import, Etch, and Trace

## Raster Image Import

Students can drag-and-drop a raster image (PNG/JPG/GIF/WebP/BMP) onto the canvas, or use the **Import Image** topbar button. Handled in `import-svg.js` (same drop infrastructure as SVG import).

- Stored as `type: 'image'`, `attrs: { x, y, w, h, href, naturalW, naturalH }`. `href` is a **base64 data URL** — the pixel data is embedded directly in the shape, so it survives the SVG export round-trip into Illustrator.
- Placement: 1 image pixel = 1 artboard pixel (96 px/in); scaled down if longer side exceeds 4 inches (384 px), preserving aspect ratio. Button import places top-left at canvas origin (0, 0); drag-drop centers on the cursor.
- Renders as `<svg:image>` (with a transparent rect catcher + rect hover-highlight, since `<image>` ignores `fill`/`stroke`). Resizes like a rect via `setGeomFromBBox`/`applyBBox` (`preserveAspectRatio="none"` — free stretch). Moves/nudges/reflects like `rawsvg` (position + rotation only; raster pixels are not truly mirrored).
- Export (`export.js`) emits `<image ... xlink:href href ...>`; root `<svg>` declares `xmlns:xlink`. Boolean/offset/shape-builder ops skip `image`.
- **Process restriction:** when the selection is all images, the process dropdown hides Main Cut / Fold / Final Cut — only **Free Appearance** and **Etch** are offered (`onlyImages` check in `syncFromState`).

## Raster Etch mode

Setting an image to **Etch** opens a dedicated appearance panel (`#appearance-image-etch`, appearance mode `imageEtch` in `properties.js` — *not* the vector etch stroke/fill panel, which is meaningless for raster). `processType` stays `'etch'` (preserves the black color mapping); the panel is purely image preprocessing.

- **Adjustment params** live in `attrs.etch` (defaults from `DEFAULT_ETCH` in `image-filters.js`): `brightness`, `contrast`, `gamma`, `invert`, `depth` (black-point clamp — lower = shallower burn), `whiteClip` (near-white → pure white = no burn), `posterize` (0=off, else 2–8 levels), `threshold` + `level` + `dither` (none/floyd/ordered), `halftone` + `htSize` + `htAngle`. Threshold and Halftone are mutually exclusive.
- **Pipeline** (`processToDataURL` in `image-filters.js`, one `ImageData` pass): grayscale → brightness → contrast → gamma → invert → depth → white-clip → posterize → one binarizer (halftone | threshold[/dither] | none). All baked into pixels (not a render-time SVG filter) so the exported base64 is genuinely processed through the pipeline.
- **Controller:** `image-etch-panel.js` owns the panel's control sync, edit commits, and baking. `properties.js` owns only the panel show/hide. The processed pixels cache to `attrs.etchHref` with a param-signature in `attrs._etchSig`.
- **Interaction:** slider `input` (dragging) → fast downscaled live preview written straight to the live `<image>` DOM node (no state change); slider `change` (release) → `commit` params (undoable). A `store.subscribe` watcher re-bakes full-res (`processEtchImage` → `patch` `etchHref`, no history) whenever `_etchSig` ≠ current param signature — covers release, undo/redo, and load. `_interacting` guard prevents control sync from fighting an active drag.
- Render (`artboard.js`) and export (`export.js`) use `etchHref` when `processType === 'etch'`, falling back to the color original (`attrs.href`) until the first bake lands.

## Trace to vector (raster → paths)

The Raster Etch panel's **Trace to vector** button (`#ie-trace`, handler in `image-etch-panel.js`) converts the *processed* etch pixels into editable vector `path` shapes via **imagetracerjs** (CDN script in `index.html`, exposes global `ImageTracer`).

- **Source** is `attrs.etchHref` (the baked B&W result — what-you-see-is-what-you-trace), falling back to `attrs.href`. So all etch adjustments (threshold/halftone/contrast…) flow through into the trace.
- **Trace:** the source is drawn to a canvas (longest side capped at `TRACE_MAX = 1000` px for speed) → `ImageTracer.imagedataToSVG` with a fixed 2-color black/white `pal`. Near-white background paths are dropped by luminance; only dark regions are kept.
- **Coordinate mapping:** traced canvas px → artboard coords via a matrix that scales to the image's displayed `w`/`h`, offsets by `x`/`y`, and carries image `rotation`. Built with `mulMat` + `applyMatrixToD` (now **exported** from `expand-svg.js` — shared, not duplicated).
- **Result replaces the image in place** (`st.shapes.splice`): a `group` of `path` children (or a single `path`), each `fill:'#000000'`, `processType:'etch'`. The student can change the process afterward via the Process panel. Undoable (`store.commit`, label `'trace-image'`).
