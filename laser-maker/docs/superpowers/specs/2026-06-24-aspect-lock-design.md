# Aspect-Ratio Lock for Transform Dimensions

**Date:** 2026-06-24
**Area:** laser-maker — Inspector → Transform panel

## Purpose

Add an Illustrator-style "Constrain Width & Height Proportions" toggle next to
the W/H fields in the Transform panel. When locked, editing one dimension
scales the other proportionally. When unlocked (default), dimensions distort
freely — the current behavior.

## Illustrator reference

Illustrator's Transform panel places a chain-link toggle to the **right** of
the W/H rows, joined by a bracket spanning both. Closed link = constrained;
open link = free. Default off. It is a panel-level persistent setting (not
per-object) and affects only the panel's W/H number fields — canvas
corner-drag constraint is a separate Shift interaction.

## Scope

- **Single-select only.** `applyTransform` already early-returns when
  `selection.length !== 1`; the lock is only meaningful there.
- **W/H number fields only.** Canvas corner-drag is unchanged (Shift still
  constrains there).
- **Panel-level state.** A module variable in `properties.js`, default
  unlocked. Persists across selections within the session; resets on page
  reload. Not stored per-shape, not saved to the file/state.

## UI / Design Spec

Layout: "Right bracket" (Illustrator). Restructure the W/H portion of the
Transform grid so W and H sit on their own rows on the left and the chain-link
toggle sits to their right, joined by a thin bracket spanning both rows. W and
H `.numeric` fields narrow to make room.

```
Transform
┌─────────────┬─────────────┐
│ X 1.50 in   │ Y 2.00 in   │
├──────────┬──┴──────────┬──┤
│ W 3.0 in │ H 4.0 in    │⛓│   ← chain-link toggle
├──────────┴────────────┴──┘   (bracket joins W + H)
│ R 0 °       [45][-45]…
```

- **Toggle element:** a `.numeric`-adjacent `<button>` (icon button), not a
  form input. Closed-link icon when locked, open-link icon when unlocked.
- **Bracket:** a thin border/pseudo-element connecting the W and H rows to the
  toggle, visually grouping them (Illustrator cue). CSS only.
- **States:**
  - Unlocked (default): open chain glyph, `aria-pressed="false"`,
    `title="Lock aspect ratio"`.
  - Locked: closed chain glyph, `aria-pressed="true"`,
    `title="Unlock aspect ratio"`, button shows active/accent styling.
- **Disabled:** when nothing is selected (or multi-select), the button is
  disabled alongside the X/Y/W/H/R inputs (matches existing
  `[tX,tY,tW,tH,tR].forEach(i => i.disabled = …)` handling).
- Keyboard accessible: focusable, toggles on Enter/Space (native `<button>`).
- Tokens/colors from `styles.css`; active state uses `--blue` accent to match
  `.numeric:focus-within`.

The toggle belongs inside the existing Transform panel only — it does not
introduce a new inspector panel, so the "shape/tool panels below Transform"
rule is unaffected.

## Behavior

1. State: `let lockAspect = false;` in `properties.js`.
2. Toggle handler: flip `lockAspect`, update button glyph + `aria-pressed` +
   title. No state.commit (pure UI).
3. On `t-w` / `t-h` `change` (before `applyTransform` reads the fields):
   - If `!lockAspect`, do nothing new — existing free-distort path.
   - If `lockAspect` and a single shape is selected, read the **current bbox**
     via `artboard.getShapeBBox` to get `ratio = bbox.w / bbox.h`.
     - W changed → set `t-h.value = round(pxToIn(inToPx(newW) / ratio), 2)`,
       i.e. `t-h = newW * (bboxH / bboxW)`.
     - H changed → set `t-w.value = newH * (bboxW / bboxH)`.
   - Then let `applyTransform` run as today (it reads both fields).
4. Implementation seam: add a small `constrainPartner(changed)` step. Either a
   dedicated listener that runs before `applyTransform`, or fold the partner
   computation into the start of `applyTransform` keyed on which input fired.
   Preferred: a wrapper on the W/H `change` listeners that adjusts the partner
   field, then calls `applyTransform` — keeps `applyBBox` untouched.

## Edge cases

- **Degenerate ratio:** if `bbox.w` or `bbox.h` is ~0, skip constraint (guard
  `ratio` finite and > 0) to avoid NaN/Infinity.
- **Text:** `applyBBox` scales text by height only. Lock still works — editing
  W sets H from ratio; `applyBBox` keys font size off the new H. Editing H sets
  W (no visual effect on text size, but W field stays consistent).
- **Rotated shapes:** ratio is taken from the rotation-aware bbox
  (`getShapeBBox`), same basis `applyBBox` already uses. Proportional bbox
  scale is acceptable.
- **Empty input:** `parseFloat || 0` already guards; if changed field is 0,
  partner becomes 0 → `applyTransform` clamps to `0.0001`. Acceptable.

## Out of scope (YAGNI)

- Per-shape lock memory.
- Persisting lock across reloads / into the saved file.
- Constraining canvas corner-drag from this toggle (Shift already does that).
- Multi-select proportional scaling.

## Verification

Manual (user, on live-server):
1. Select a rect 3×4 in. Lock on. Set W=6 → H becomes 8. Set H=2 → W becomes
   1.5. Aspect preserved.
2. Lock off → set W only → H unchanged (free distort).
3. Ellipse, polygon, path, group, text behave proportionally when locked.
4. Toggle disabled with nothing selected; re-enabled on single select.
5. Lock state persists when switching between shapes; resets on reload.
