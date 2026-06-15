# Laser Maker

A browser-based vector design tool built for **NYC FIRST** students to create projects for laser cutting. It mirrors the feel of Adobe Illustrator but is scoped specifically to what students need to design and send a file to our laser cutter — the **Epilog Fusion Edge 36**.

---

## Purpose

Laser Maker gives elementary and middle school students a structured, approachable entry point into vector design. Rather than opening full-featured professional software, students learn the applicable concepts — shapes, paths, process types, real-world units — within a focused tool built for this exact use case.

Designs created here are intended to be exported as SVG files and eventually cut or etched at the STEM center. Once students are comfortable with these fundamentals, the skills transfer directly to Adobe Illustrator or any other professional vector suite.

---

## Laser Cutting Workflow

Designs travel through this pipeline from app to machine:

```
Laser Maker (browser)
        │
        │  Export SVG
        ▼
  SVG file (saved locally)
        │
        │  Open in
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

Students handle the design and export steps. The Illustrator → cutter handoff is typically done by a teacher or staff member at the STEM center.

---

## Process Types & Color System

The app uses a strict color-mapping system that maps directly to how the Epilog Fusion driver interprets vector files. Each process type has a locked color — students assign a process to a shape, and the color is set automatically. This eliminates translation errors through the pipeline.

| Process | Color | Stroke | Behavior |
|---------|-------|--------|----------|
| **Main Cut** | Blue `#0000FF` | 1pt | Primary cut outline. Color + stroke locked. |
| **Fold / Score** | Red `#FF0000` | 1pt | Score lines for folding. Color + stroke locked. |
| **Final Cut** | Green `#00FF00` | 1pt | Final release cut. Color + stroke locked. |
| **Etch** | Black `#000000` | user-set | Fill or stroke engraving. Color locked to black; stroke/fill toggleable. |
| **Free** | any | user-set | No process constraint. Student controls all appearance. |

---

## How to Use

Tool keys match Adobe Illustrator exactly — students switching to Illustrator later already know the shortcuts.

| Action | Shortcut |
|---|---|
| Select | `V` |
| Direct Select (anchors) | `A` |
| Rectangle | `M` |
| Ellipse | `L` |
| Line Segment | `\` |
| Pen (Bézier) | `P` |
| Text | `T` |
| Hand / pan | `H` or hold `Space` |
| Reflect | `O` |
| Shape Builder | `Shift+M` |
| Undo / Redo | `⌘Z` / `⇧⌘Z` |
| Zoom in / out / 1:1 | `⌘+` / `⌘−` / `⌘0` |
| Fit to view | `F` |
| Delete | `⌫` |
| Select all | `⌘A` |
| Group / Ungroup | `⌘G` / `⇧⌘G` |
| Copy / Cut / Paste | `⌘C` / `⌘X` / `⌘V` |
| Paste in Place | `⇧⌘V` |
| Duplicate | `⌘D` |
| Bring Forward / Send Back | `⌘]` / `⌘[` |
| Bring to Front / Send to Back | `⌘}` / `⌘{` |

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

### 1:1 Scale

The **1 : 1** button resets zoom to 100%, where one CSS inch equals one design inch (96 CSS pixels per inch — the W3C reference DPI). On a properly calibrated display this matches a real ruler.

### Export

**Export SVG** produces a clean file sized in real inches, ready to import into Illustrator and send to the laser cutter. The SVG `viewBox` is in pixels and `width` / `height` are in `in` units, which preserves physical sizing through the pipeline.

---

## Running the App

No build, no backend. Just serve it over HTTP:

```bash
npx live-server
```

Or any other static server (`npx serve`, Python's `http.server`, etc.).

> Module scripts require an `http://` origin. Opening `index.html` directly from disk will fail due to CORS rules on ES modules.

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
│   ├── process-registry.js # process type definitions + color resolution
│   ├── export.js          # clean SVG export
│   └── keys.js            # keyboard shortcuts
└── README.md
```

### Data flow

A single store (in `state.js`) holds everything: artboard size, viewport, shapes, selection, active tool, defaults. Modules subscribe and re-render on change.

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

## Browser Support

Modern evergreen browsers (Chrome, Edge, Safari, Firefox). Uses ES modules, pointer events, `<input type="color">`, and Canvas2D for rulers.

## License

MIT — built for classroom use at NYC FIRST.
