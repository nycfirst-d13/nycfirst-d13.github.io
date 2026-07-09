# CLAUDE.md

Guidance for Claude Code working in `bed-maker/`.

## Purpose

Bed Maker is a teacher/admin tool that merges a whole day's exported **Laser Maker**
SVGs onto one **36 × 24 in** laser bed (the **Epilog Fusion Edge 36**), so many students'
parts cut in a single job. It imports SVGs, auto-arranges them, lets the user drag pieces
to fine-tune, and exports one clean 36×24 SVG that drops into the existing Illustrator →
Epilog pipeline.

Sibling of `laser-maker/`. Same stack: **no build step, vanilla ES modules served over
HTTP** (`npx live-server`). No runtime dependencies.

## Architecture

| File | Role |
|------|------|
| `index.html` | Layout + all inspector markup. Loads `../styles.css` (shared design system) then `./styles.css`. |
| `styles.css` | Page-specific only: `.bed`, `.bed-stage`, `.piece`, drop-hint. |
| `app.js` | Entry: wires inspector controls, inits modules, status bar. |
| `modules/state.js` | Plain store (`state`, `subscribe`, `render`) + `PX_PER_INCH`/`inToPx`/`pxToIn`. No undo. |
| `modules/import.js` | File-picker + drag-drop → parse SVG → make Piece → `arrange()`. |
| `modules/raster.js` | SVG string → PNG data-URL snapshot for display. |
| `modules/arrange.js` | grid / brick / compact-shelf layout + size cap + gap + row-flip. |
| `modules/bed.js` | Render pieces as `<img>`, zoom/pan, select, drag, keyboard ops. |
| `modules/export.js` | Merge pieces into one 36×24 SVG via nested `<svg>` per piece. |

### Key decisions

- **Display raster, export vector.** Pieces render on-screen as PNG snapshots
  (`raster.js`) for cheap dragging. Export re-embeds each piece's **original vector
  markup** as a nested `<svg>` (`export.js`), so process colors (blue cut / red score /
  green final / black etch) and paths survive untouched. `buildMergedSVG()` namespaces
  each piece's internal ids (`p{i}_`) to avoid clip/gradient collisions when merging.
- **Nested `<svg>` embed** (not path re-serialization): the nested `viewBox` auto-scales
  content into the placed box — zero geometry math, exact fidelity.
- **96 px = 1 in** everywhere, same as laser-maker. Bed = 3456 × 2304 px.
- **DOM, not canvas**, for the bed: `<img>` per piece + one CSS transform for zoom/pan.
- **ponytail ceilings**: `compact` is shelf/next-fit packing by bbox, not true irregular
  nesting (upgrade to a polygon nester only if scrap matters); `raster.js` can't load
  external resources (fine — laser-maker exports are self-contained); this dir's CSS is
  coupled to `../styles.css`.

### Deferred (Phase 2)

Google Drive integration — auto-load a day's SVGs by date + upload the merged bed back —
is planned separately. Reuses `../modules/drive-upload.js` and the Apps Script in
`../docs/apps-script-uploader.js` (needs a `doGet` list/fetch endpoint added).

## Git & Commits

Repo root is the parent `/Users/avigoldman/Desktop/nycfirst-d13.github.io`. **Always commit
from the parent**, scope to `bed-maker/` only:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/bed-maker/
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(bed-maker): ..."
```

Do not ask permission to commit from the parent — this is always correct.
