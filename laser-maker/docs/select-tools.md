# Select Tools and Corner Rounding

## Select Tool (V) vs Direct Select Tool (A)

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

## Corner Rounding — Rule for All Shape Types

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
