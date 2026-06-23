# Progress Bar

`progress.js` is a **singleton floating progress bar** for any operation slow enough to feel laggy. One bar at a time, anchored bottom-center above the status bar (same lane as the toast). The host element `#progress` lives in `index.html`; styling is the `.progress*` block in `styles.css` (uses design tokens — `--blue`→`--accent-hi` gradient fill, `--sh-3`, `--r-md`).

**Two text slots:** `label` (operation name, top-left, set once in `show()`) and `detail` (a line *under* the track, `#progress-detail`, describing the current step — update it as phases change). The `%` sits top-right.

## API

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

## Rules

- A determinate bar only animates if the driving loop **yields** — synchronous loops never repaint. Make the op `async` and `await raf()` between work chunks (the exported helper). `progress.update()` from a sync loop is invisible.
- **Gate behind a cost estimate** so the bar shows only for genuinely slow work; flashing it for a 5 ms op is worse than nothing.

## The crawl — animating a blocking tail

Heavy ops end in a synchronous, un-chunkable block (e.g. Clipper `Execute()`, a big re-render). The main thread is frozen there, so width-driven `update()` calls can't animate — the bar parks at its last %. `crawl(from, to, detail, ms)` instead drives the fill with a CSS **`transform: scaleX` animation**, which runs on the **compositor thread** and keeps moving while JS is blocked. It eases from `from`→`to` (never reaches 100% on its own — leave headroom); `done()` snaps the rest once the block returns. Call `crawl()` then `await raf()` *immediately before* the blocking call so the animation is live by the time the thread locks up. `transform:scaleX` is compositor-friendly; `width` is not — that's the whole reason for the two-mode design (`.progress.crawl` vs plain). `update()` and `done()` clear the crawl (`clearCrawl()`); `setDetail()` does not, so use it to change the caption while the crawl keeps running.

## Current use — Offset Path

`runOffset` in `pathops.js` is `async`. It estimates cost via `countLeaves()` (leaf shapes ≈ clipper polygons) and shows the bar only when `totalLeaves >= OFFSET_PROGRESS_MIN` (40). Heavy jobs route through `_offsetShapeAsync` → `_clipperOffsetFromPathsAsync`, which flattens paths in batches of `OFFSET_CHUNK` (12) and `await raf()`s between batches, calling `report(n)` per path. Below threshold it uses the original synchronous `_offsetShape` path.

**Tail reservation + crawl:** the blocking `ClipperOffset.Execute()` and the post-`commit` re-render can't be subdivided. Flattening fills only **0–88%** (`FLATTEN_MAX`, detail "Flattening paths · n / total"); `onFinishing` then starts a `crawl(0.93, 0.99, …, 9000)` ("Computing offset outline…") and paints a frame just before `Execute()`, so the fill keeps creeping while the thread is frozen; `setDetail('Drawing result…')` swaps the caption before `store.commit` *without* killing the crawl; `progress.done('Done')` snaps to 100% **after** the commit returns. General pattern for any progress-barred op: never let counted work reach 100% before the uncounted blocking tail — reserve headroom, drive that tail with `crawl()` (not `update()`), and paint a frame before the blocking call.

## Good candidates (not yet wired)

- Trace to vector (`image-etch-panel.js` — `ImageTracer.imagedataToSVG` is one blocking call, so use an **indeterminate** bar in place of the `Tracing…` toast)
- SVG export of large/many-path docs (`export.js`)
- Raster Etch full-res bake of large images (`processEtchImage` in `image-filters.js`)
- SVG import of complex files (`import-svg.js`)
- Boolean ops on many shapes (`runOp` in `pathops.js`)
