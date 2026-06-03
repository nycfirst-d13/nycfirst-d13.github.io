# Text Tool Updates — Area Type (Illustrator-style)

## Goal
Replace `prompt()` click with click-drag text box. Text wraps inside frame, paragraph-formatted.

## Current State
- `shapes.js:219` — `prompt()` on mousedown, no drag, no frame
- Text shape has `x/y` but no `width`/`height`
- No word-wrap in rendering

---

## Creation Flow
1. Text tool active → cursor = crosshair
2. Mousedown → record start point
3. Drag → draw live rectangle preview (dashed border)
4. Mouseup → frame locked in, enter edit mode immediately (no prompt)
5. I-beam cursor blinks inside box, ready to type

## Selection States
1. **Unselected** — renders text inside frame
2. **Selected as shape** (select tool) — bounding box handles, move/rotate/resize
3. **Edit mode** (double-click, or text tool + click existing) — text cursor active, handles hidden

## Edit Mode
- Enter: double-click existing text box, or mouseup after drag-create
- Exit: click outside box, or Escape
- Full caret nav: arrows, Home/End, Ctrl+A, Backspace/Delete
- Cursor = I-beam when hovering existing text box with text tool

## Text Frame
- `attrs` needs `width` + `height` added
- Text wraps at frame right edge (word-wrap)
- Frame resize → text reflows to new width (text size unchanged)
- Resize handles on corners + edges (same as rect)

## Paragraph Formatting (relative to frame width, not text width)
- Alignment: left / center / right / justify
- Line height / leading
- Paragraph spacing (space before/after) — stretch goal
- Indent — stretch goal

## Overflow
- **Decision needed:** clip | auto-grow height | overflow indicator (+box)
- Recommendation: auto-grow height (simplest, best UX for laser design)

## Resize Behavior
- **Decision needed:** resize reflows text | resize scales text
- Recommendation: resize reflows (Illustrator behavior, preserves font size)

## SVG Rendering Changes
- Current: single `<text>` element at x/y
- New: `<foreignObject>` with `<div>` (easiest wrapping) OR manual line-break layout with multiple `<tspan>` elements
- `<foreignObject>` risk: export to SVG path conversion may break
- Manual tspan layout: more work but stays pure SVG, convert-to-path still works

## Shape Data Changes
```js
// current
{ x, y, content, size, family, weight, align }

// new
{ x, y, width, height, content, size, family, weight, align, lineHeight, overflow }
```

## Files to Touch
- `modules/shapes.js` — text tool onDown/onMove/onUp, add drag-create
- `modules/shapes.js` — SVG render function for text shape
- `modules/text-panel.js` — expose width/height inputs if needed
- `modules/select.js` — double-click to enter edit mode
- `styles.css` — edit mode cursor, dashed preview rect

## Open Questions
1. Overflow: clip, auto-grow, or indicator?
2. Resize: reflow or scale?
3. SVG render: foreignObject or manual tspan?
