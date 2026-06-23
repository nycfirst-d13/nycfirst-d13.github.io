# SVG Import (Editable Groups)

SVGs import as editable groups of `path`/`text` shapes (`processType: 'free'`, original colors preserved). Students can ungroup and modify immediately. Falls back to `rawsvg` on parse failure or user request.

## Pipeline (`import-svg.js`)

1. `DOMParser` → `parseSVGDim()` reads `width`/`height` attrs; unit conversions in `DIM_TO_PX` (`px`=1, `pt`=96/72, `mm`=96/25.4, `cm`=96/2.54, `in`=96); falls back to `viewBox` `vw×vh`, then `96×96`
2. `initMat = [1, 0, 0, 1, tx, ty]` — identity scale, preserves SVG coords. `tx/ty` are non-zero only for drag-drop on a non-matching SVG (top-left at cursor). Artboard-matching SVGs and button imports always use `[1,0,0,1,0,0]`. See [`docs/import-placement.md`](import-placement.md) for full rules.
3. `parseSVGToShapes(root, initMat)` → `{ shapes, hadUnsupported }`
4. Single shape → commit with `name = filename`; multiple shapes → wrap in `group` with `name = 'Group IMPORT filename.svg'`
5. `hadUnsupported` → `showToast('SVG imported. Some elements skipped.', { action: { label: 'Import raw', onClick } })`
6. "Import raw" callback: `store.undo()` removes the group, then commits a `rawsvg` blob; `showToast('Imported as raw SVG')`

## `parseSVGToShapes(rootSvgEl, initMat)` in `expand-svg.js`

Shared with "Expand to Paths" (`expandSVG()`). Applies root SVG `viewBox` transform on top of `initMat` (was silently dropped before — latent bug fixed).

Returns `{ shapes: Array<shapeSpec>, hadUnsupported: boolean }`. `hadUnsupported` is true when `walk()` hit elements in `SKIP_TAGS` (gradients, defs, `<use>`, filters) with non-trivial content.

## CSS class resolution (`parseStyleSheet` + `getAttr` in `expand-svg.js`)

Illustrator SVGs use `<style>` blocks with class-based rules (`.st0 { fill: #231f20 }`). `getAttr(el, prop)` resolves in priority order: inline `style=` attribute → CSS class rule → presentation attribute. A module-level `_sheet` variable holds the parsed class map (set at parse start, cleared after) — no threading through all function signatures.

## Path number tokenizer (`parseNums` in `expand-svg.js`)

SVG path data uses implicit separators that `split(/[\s,]+/)` breaks:
- `8.2.4` = two numbers (`8.2` and `0.4`) — second decimal starts a new number
- `-6.5-2.2` = two numbers — sign starts a new number

`parseNums` uses regex `/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g` to tokenize correctly. `parseTfm` (transform attrs) keeps the old split — transform syntax never uses implicit separators.

## Known limitation — sub-pixel rendering seams

Adjacent path elements in an imported group show hairline anti-aliasing gaps at shared edges. This is a browser rendering artifact: each `<path>` is composited independently, so shared edges are anti-aliased twice. It does **not** affect laser cut output (the SVG coordinates are mathematically correct). Options to suppress (stroke overlay, `shape-rendering: crispEdges`, single SVG context) would affect rendering for all shapes — not worth it.
