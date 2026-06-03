# Laser Maker

A browser-based SVG vector editor for middle-school students designing parts for laser cutting machines. Built for **NYC FIRST**.

It feels like a simplified Adobe Illustrator: a paper artboard, rulers, snap-to-grid, real-world inches, and a clean export that's ready for the laser.

---

## Run

No build, no backend. Just open in a browser.

```
# from this directory
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Or any other static server — `npx serve`, `live-server`, etc.)

> Module scripts require an `http://` origin. Opening `index.html` directly from disk will fail because of CORS rules on ES modules.

---

## How to use

| Action | Shortcut |
|---|---|
| Select | `V` |
| Direct Select (anchors) | `A` |
| Rectangle | `R` |
| Ellipse | `E` |
| Line | `L` |
| Polygon | `P` |
| Pen (Bézier) | `B` |
| Text | `T` |
| Hand / pan | `H` or hold `Space` |
| Undo / Redo | `⌘Z` / `⇧⌘Z` |
| Zoom in / out / 1:1 | `⌘+` / `⌘−` / `⌘0` |
| Fit to view | `F` |
| Delete | `⌫` |
| Select all | `⌘A` |

While dragging:

- `Shift` constrains proportions (rectangles → squares, lines → 45°, etc.)
- `Alt` draws from center (rect / ellipse)
- `Shift` while resizing keeps aspect ratio
- `Shift` while rotating snaps to 15°

### Pen tool

- Click to drop a corner anchor.
- Click + drag to drop an anchor with curve handles.
- Click the first anchor again to **close** the path.
- `Enter` finishes an open path. `Esc` cancels.

### Pathfinder

Select two or more shapes and use **Unite / Subtract / Intersect** in the right panel.

### 1:1 scale

The **1 : 1** button resets zoom to 100%, where one CSS inch equals one design inch (96 CSS pixels per inch — the W3C reference DPI). On a properly-calibrated display this matches a real ruler.

### Export

`Export SVG` produces a clean file sized in real inches, ready to send to laser cutter software. The SVG `viewBox` is in pixels and the `width` / `height` are in `in` units, which preserves physical sizing.

---

## Architecture

Modular ES modules. No frameworks. `paper.js` is the only runtime dependency, used solely for boolean path operations.

```
laser-maker/
├── index.html             # shell, panels, toolbar
├── styles.css             # design system
├── app.js                 # entry; wires modules
├── modules/
│   ├── state.js           # single store, subscribe pattern, undo/redo
│   ├── utils.js           # math, dom, id, formatting helpers
│   ├── artboard.js        # viewport (zoom/pan/fit/1:1), grid, render loop
│   ├── rulers.js          # canvas rulers, cursor indicator
│   ├── tools.js           # tool registry + pointer dispatch
│   ├── shapes.js          # rect / ellipse / line / polygon / text tools
│   ├── select.js          # selection, transform handles, marquee, direct-select
│   ├── pen.js             # bezier pen tool
│   ├── pathops.js         # unite / subtract / intersect via paper.js
│   ├── layers.js          # layers panel
│   ├── properties.js      # inspector controls (fill/stroke/transform)
│   ├── export.js          # clean SVG export
│   └── keys.js            # keyboard shortcuts
└── README.md
```

### Data flow

A single `store` (in `state.js`) holds everything: artboard size, viewport, shapes, selection, active tool, defaults. Modules subscribe and re-render on change.

- `store.patch(mut, reason)` — mutation without history (UI state).
- `store.commit(mut, reason)` — mutation with a history snapshot.
- `store.beginTransaction()` / `endTransaction()` — for continuous drags (one snapshot per gesture).

### Coordinate system

- `1 inch = 96 pixels` in artboard units (the CSS/W3C reference DPI).
- All geometry is stored in these pixel units.
- The viewport (`zoom`, `panX`, `panY`) is applied as a CSS transform on the canvas stage.
- `artboard.screenToArtboard(clientX, clientY)` converts a pointer position to artboard pixels.

### Adding a new tool

1. Create a handler with any of `onActivate / onDeactivate / onDown / onMove / onUp`.
2. Register it: `tools.register('myTool', handler)`.
3. Add a button in `index.html` with `data-tool="myTool"` and a CSS mask icon.

### Adding a new shape type

1. Extend `_buildNode` and `_geometryBBox` in `artboard.js`.
2. Add a case in `shapeToSVG` in `export.js`.
3. Add a layers panel icon in `layers.js`.

---

## Browser support

Modern evergreen browsers (Chrome, Edge, Safari, Firefox). Uses ES modules, pointer events, the `<input type="color">` picker, and `Canvas2D` for rulers.

## License

MIT — built for classroom use at NYC FIRST.
