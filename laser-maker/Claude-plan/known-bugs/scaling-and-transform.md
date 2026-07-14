# Known Bugs & Audit — Scaling / Transform (Select tool)

_Last updated: 2026-07-14. Scope: `laser-maker/modules/select.js` resize pipeline,
with `modules/utils.js` (`scalePathD`), `modules/properties.js` (`lockAspect`),
`modules/expand-svg.js` / `modules/import-svg.js` (import round-trip)._

This file is the durable record of the scaling/transform work so a future session
with zero memory can pick up instantly. It covers: the resize architecture, the
numbered audit findings, what's fixed (with commit hashes), what's still open, and
concrete suggestions.

---

## 1. Resize architecture (read this first)

All resize logic lives in the `select` tool's `_doResize(raw, event)` in
`modules/select.js`. There are **three** distinct code paths:

| Selection | Branch | `this._target` | Applies via |
|-----------|--------|----------------|-------------|
| 1 non-group shape | single-shape | the shape | `setGeomFromBBox(sh, this._orig, box)` |
| 1 group | single-shape (group sub-branch) | the group | inline loop over `this._origChildren` |
| 2+ shapes (any mix) | multi-select | `null` | loop → `setGeomFromBBox(sh, o.snap, box)` per member |

Single vs multi is decided purely by `s.selection.length === 1` in `_beginHandle`
(`select.js` ~line 324). **A group counts as one shape**, so `group + rect` = 2 =
multi-select branch.

### Shared helpers (added during this work)
- **`_resizeBBox(h, b, p, {shift, alt})`** — the single source of truth for turning
  a handle drag into a new bbox `{nx,ny,nw,nh}`. Both single-shape and multi-select
  branches call it. `h` = handle name (`'nw'|'n'|'e'|'se'|...`), `b` = original
  bbox, `p` = snapped cursor point.
- **`_shiftConstrainBBox(h, b, box, alt)`** — aspect-ratio constrain. Corner handles
  anchor the opposite corner; edge handles grow the perpendicular dim about center.
  `alt=true` keeps everything centered.
- **`snapshotGeom(sh)`** — recursive geometry snapshot taken at drag start. For a
  group it recurses children AND stores the group's original `_bbox` (this was added
  yesterday; see #A below). Snapshots are the drag-start truth — **never re-read live
  state mid-drag** (that was the compounding bug).
- **`setGeomFromBBox(sh, snap, nb)`** — writes a shape's geometry to fit bbox `nb`,
  using the original `snap`. Per-shape-type branches; the `group` case recurses.

### Key invariant
Everything downstream (single/multi/group) consumes `_resizeBBox`'s output. Fix the
box math once → all three paths benefit. Shift and Alt are handled entirely inside
`_resizeBBox`, so they work uniformly across single/multi/group by construction.

---

## 2. Prior fixes that this audit builds on (context)

These landed 2026-07-13 and are the foundation; do not regress them.

- **#A — Nested-group resize compounding** — `commit 22b3f78`
  `setGeomFromBBox`'s `group` case used to re-read live `sh._bbox` + live child
  bboxes + re-snapshot already-scaled children every pointermove, so scale
  **compounded frame-to-frame** (nested/imported groups grew instead of shrank,
  diverged in rate/direction). Fixed by driving from the drag-start snapshot;
  `snapshotGeom` now also stores each group level's original `_bbox`.

- **#B — Arc collapse on move/scale** — `commit 80262bc`
  `translatePathD` (`select.js`) and `scalePathD` (`utils.js`) zipped every path
  command's numbers into (x,y) pairs. Wrong for `A` (arc): its 7 args are
  `rx ry x-rot large-flag sweep-flag x y`. Flags got scaled into multi-digit
  tokens → malformed SVG → parser bailed → shape collapsed to a single line. Fixed
  by special-casing `A/a`: scale radii, map endpoint, leave rotation+flags raw.
  Native in-app rounded polygons store straight `d` + `corners` (arcs baked at
  render), so only IMPORTED paths with baked arcs were affected.
  - `ponytail:` note in both functions — the correct arc-aware transform already
    exists as `applyMatrixToD` in `expand-svg.js`; dedup into a shared
    `transformPathD(d, matrix)` if a third copy appears. Deliberately NOT done to
    avoid destabilizing the working import path.

- **Import round-trip fixes (same day):** raster `<image>` re-import (`6eb2f83`),
  process-type detection on import via `data-lm-process` + color fallback
  (`c2da7a8`), `fill-rule` preserved on import (`cd5d9cc`), trace holes via even-odd
  nest union (`519c543`). Not scaling, but same session — see CLAUDE.md.

---

## 3. Scaling audit — numbered findings

Audit done 2026-07-14. **None of these were introduced by the 07-13 changes** —
they are pre-existing gaps. The 07-13 work touched the nested-group `setGeomFromBBox`
path, `snapshotGeom`, and the arc transforms only.

### #1 — Multi-select: Shift did nothing — ✅ FIXED (`commit d98f09f`)
The multi-select branch had zero `shiftKey` handling; it always scaled
non-uniformly. Now routes through `_resizeBBox`, so Shift constrains proportion.

### #4 — Shift only worked on corner handles, not edges — ✅ FIXED (`commit d98f09f`)
Old code gated on `h.length === 2`. Edge handles (`n/s/e/w`) ignored Shift.
`_shiftConstrainBBox` now handles edges: grows the perpendicular dim about center.

### ALT / Option — scale from center — ✅ ADDED (`commit 9e24b02`)
New feature (Illustrator parity). Hold Option/Alt during a handle drag → symmetric
scale about the original center. Composes with Shift (Alt+Shift = proportional from
center). Works across single / multi / group via `_resizeBBox`. Unit-verified.

### #2 — Lock-proportions TOGGLE (chain icon) never affects canvas dragging — ❌ OPEN
`lockAspect` lives only in `properties.js:31`, read only by the W/H **numeric field**
handler (`constrainPartner`, `properties.js:808`). `_doResize` reads only
`event.shiftKey`. Toggling the lock then dragging a handle does nothing.
- **Risk: HIGHEST.** `lockAspect` is module-private in properties.js; select.js can't
  see it. Putting it in the store risks the undo-snapshot/UI-state contract
  (CLAUDE.md: UI state must NOT enter the canvas snapshot). Changes the default drag
  behavior globally. Undefined semantics: lock + Shift interaction? edge handles?
  multi (lock is currently disabled for multi)?
- **Suggested approach if tackled:** expose `lockAspect` via a shared non-store
  module (small `ui-state.js` singleton, or a getter exported from properties.js
  that select.js imports). In `_doResize`, treat `alt`/`shift`/`lock` as:
  `const constrain = event.shiftKey || lockAspect()` and pass as `shift` to
  `_resizeBBox`. Decide Shift-while-locked = release (Illustrator) if desired.

### #3 — Lock-proportions for multi-select (numeric fields) — ❌ OPEN (it's a feature, not a fix)
Numeric W/H editing is **single-selection by design**: `applyTransform` bails when
`selection.length !== 1` (`properties.js:727`), and the lock toggle is explicitly
`disabled` for multi (`properties.js:382`). `constrainPartner` also early-returns on
multi (`:811`). "Fixing" = building multi numeric resize (scale a whole selection by
typed W/H) — a new capability, not a guard tweak.
- **Risk: MEDIUM-HIGH.** New feature; touches `applyTransform`, panel enable logic,
  compound-bbox scaling. Would reuse the multi-select scaling math from `_doResize`.

### #5 — Single group + Shift already works — ✅ N/A
A lone group routes through the single-shape branch, so Shift on a corner already
constrained it (even before the audit). If group-shift *seems* broken, the user is
likely testing a 2+ multi-selection (#1) or expecting the lock toggle (#2).

---

## 4. OPEN / UNRESOLVED reports

### #6 — "Multi-select Shift doesn't work when one of the selected is a GROUP" — ❓ UNREPRODUCED
Reported 2026-07-14. **Could not reproduce from the code.** Traced the full multi
path and unit-tested it end-to-end (compound bbox → per-member scale → the group's
child-scaling), including a group member under Shift and a rotated group. The math
is provably correct: Shift forces `sx == sy`, group scales uniformly, children stay
aligned in the group's new bbox. Test: `scratchpad/shift.mjs` (see §6) — passes.
- **Two hypotheses:**
  1. Tested against a stale/cached build before `22b3f78` + `d98f09f` landed →
     hard-reload (Cmd+Shift+R) and retry.
  2. A real integration failure the isolated trace misses.
- **Need a concrete repro to proceed** (do NOT guess-fix):
  - Selection contents (e.g. "1 rect + 1 group of 3 paths")?
  - Which handle (corner vs edge)?
  - Exact symptom: group doesn't scale / collapses / distorts / flies off / scales at
    a different rate than siblings?
- **Symptom → likely cause map:**
  - "distorts / different rate" → deferred polygon-min-axis or rotation-skew (#7/#8).
  - "collapses / vanishes" → stale/missing group `_bbox` at drag start (snapshot has
    no `_bbox`; `setGeomFromBBox` group case falls back to `{w:1}` → gsx explodes or
    →0). Check `snapshotGeom` group `_bbox` capture and `getShapeBBox(group)`.

### #7 — Polygon/star collapse to min-axis under NON-uniform group scale — ❌ OPEN (deferred)
`setGeomFromBBox` polygon/star case: `sh.attrs.r = Math.min(nb.w, nb.h) / 2`
(`select.js` ~line 2264 region). Under a non-proportional group/multi scale
(`gsx != gsy`), polygon/star have a single radius and collapse to the smaller axis
while sibling rects/paths scale per-axis → "children scale at different rates." Rect
corner radii and path corners have the same `Math.min` collapse.
- **Fix options:** (a) bake polygon/star to a path when `gsx != gsy` so it scales
  per-axis (loses parametric editability); (b) accept uniform-only and document.
- **Risk: MEDIUM.** Only bites on non-proportional scaling.

### #8 — Rotation skew in group/multi child scaling — ❌ OPEN (deferred)
`getShapeBBox` returns the UNROTATED bbox; child scaling positions by axis-aligned
offsets and `setGeomFromBBox` never touches `rotation`. A rotated child (or rotated
nested group) under non-uniform scale skews / drifts. Note: under UNIFORM (Shift)
scale, rotation is fine (verified) — this only bites non-uniform.
- **Real fix = matrix-based group transform** (the "Option 3" full rewrite): apply a
  single affine from a drag-start baseline, compose with each child's rotation, and
  bake parametric/rotated children to paths when the affine isn't representable.
  Subsumes #7 and #8. **Risk: HIGH** (touches the transform core).

---

## 5. Priority / risk ranking for remaining work

Riskiness and effort run together here (riskiest ≈ hardest):

1. **#8 / Option 3 (matrix group transform)** — highest risk, biggest payoff (fixes
   #7 + #8 + rotation). Full rewrite of the child-scaling core.
2. **#2 (lock toggle → canvas drag)** — high risk: cross-module state + store/undo
   contract + global behavior change + undefined Shift/lock/multi semantics.
3. **#3 (lock for multi numeric)** — medium-high: new feature (multi numeric resize).
4. **#7 (polygon/star min-axis)** — medium, isolated; may be mooted by #8.

Low-risk items (#1, #4, Alt) are DONE.

---

## 6. Verification / test notes

Unit checks were written as standalone Node scripts in the session scratchpad
(ephemeral — NOT committed; re-create if needed):
- `shift.mjs` — asserts `_shiftConstrainBBox` + `_resizeBBox`: corner/edge ratio,
  Alt center, Alt+Shift, and the multi-select-with-group end-to-end math.
- `pathd.mjs` — asserts arc survives `translatePathD`/`scalePathD` (flags stay 0/1,
  no commands dropped, endpoints/radii correct).
- `regions.mjs` — even-odd trace nest grouping (from the trace fix).

`utils.js` touches `document` at module load, so importing it under Node needs a
stub: `globalThis.document = { createElement: () => ({ getContext: () => ({}) }),
createElementNS: () => ({}) };` before `await import(...)`.

**No in-repo test harness exists.** These are throwaway asserts (ponytail style: one
runnable check per non-trivial logic). Resize is pointer/DOM-driven, so full behavior
must be verified manually in-browser (`npx live-server`).

### Manual test checklist
- Single shape: Shift corner + Shift edge → proportional; Alt → from center;
  Alt+Shift → proportional from center; plain drag → free stretch.
- Multi-select (2+ shapes): same as above; spacing preserved under Shift/Alt.
- Group (single): same.
- Regression: nested/imported group scale-down shrinks uniformly (no growth);
  imported rounded shape move/scale keeps its shape (no collapse to a line).

---

## 7. Commit trail (all on `main`, pushed to origin)

```
9e24b02 feat(laser-maker): Option/Alt scales from center (single, multi, group)
d98f09f fix(laser-maker): shift-constrain proportions on edge handles and multi-select
80262bc fix(laser-maker): keep arc commands intact when moving/scaling a path
22b3f78 fix(laser-maker): stop nested-group resize from compounding scale
```
