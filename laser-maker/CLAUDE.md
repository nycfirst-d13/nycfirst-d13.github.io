# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose & Audience

Laser Maker is a browser-based vector design tool built for elementary and middle school students at an NYC FIRST STEM center. Students use it to design parts and projects for laser cutting — specifically the **Epilog Fusion Edge 36**.

The app intentionally mirrors Adobe Illustrator's interface but strips it down to the features that matter for this use case: drawing shapes, applying process types, and exporting clean SVGs. The goal is not to replace Illustrator but to give students a structured, approachable entry point before they move on to a full professional vector suite. Features that don't serve the laser-cutting learning objective are excluded by design.

## Laser Cutting Workflow

Designs created in Laser Maker travel through this pipeline before reaching the cutter:

```
Laser Maker (browser app)
        │
        │  Export SVG
        ▼
  SVG file (saved locally)
        │
        │  Import into
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

The SVG export is the handoff point — students save the file, and it gets opened in Illustrator later (typically by a teacher or more advanced student) before being sent to the cutter.

## Process Type Color System

The app uses a strict color-mapping system that maps directly to how the Epilog Fusion driver interprets vector files. Colors are locked per process type and cannot be changed by the student — this eliminates translation errors through the pipeline.

| Process | Code Key | Color | Hex | Stroke | Notes |
|---------|----------|-------|-----|--------|-------|
| Main Cut | `mainCut` | Blue | `#0000FF` | 1pt | Primary cut outline; locked |
| Fold / Score | `fold` | Red | `#FF0000` | 1pt | Score lines for folding; locked |
| Final Cut | `finalCut` | Green | `#00FF00` | 1pt | Final release cut; locked |
| Etch | `etch` | Black | `#000000` | user-set | Fill or stroke can be toggled; color locked to black |
| Free | `free` | any | — | user-set | No process constraints; student controls appearance |

Appearance is resolved at render and export time via `resolveAppearance()` in `process-registry.js`. That function is the single source of truth — never hardcode process colors elsewhere.

## Maintaining This File

Update CLAUDE.md when:
- A new feature or module is added that meaningfully changes the architecture
- An existing module's role, API, or data model changes significantly
- The user explicitly says "add this to CLAUDE.md", "write this down", "note this", or similar
- A key architectural decision is made that isn't obvious from the code

When updating, prefer expanding existing sections over creating new top-level sections. Keep descriptions precise and implementation-focused — the goal is to help a future Claude instance get productive fast, not to document every detail.

After updating CLAUDE.md, commit the change with a message like `docs: update CLAUDE.md — [what changed]`.

## Memory

Memory for this project lives at `.claude/memory/` inside this repo — **not** the default system memory path. Always read from and write to `.claude/memory/` here. When the user says "remember X" or "save this", write the appropriate memory file and update `.claude/memory/MEMORY.md`.

CLAUDE.md and memory serve different purposes:
- **Memory** — user preferences, feedback, project context, external references. Persists across all conversations.
- **CLAUDE.md** — codebase architecture, feature implementation notes, key design decisions. Scoped to this project's code.

When the user asks to "write down key takeaways" or "note important aspects" of a feature, add it to CLAUDE.md (not memory) under the relevant architecture section or a new feature-specific subsection.

## Running the App

No build step. Pure ES modules — must serve over HTTP (not `file://`) due to CORS:

```bash
npx live-server
```

## Architecture

Browser-based SVG vector editor for middle-school students designing laser-cut parts. Mimics Illustrator with a classroom-friendly interface.

**No frameworks. No build pipeline.** Vanilla JS ES modules only. Only runtime deps: `paper.js` (boolean path ops via CDN) and `clipper-lib` (path clipping via CDN).

### State Management

`state.js` is the single source of truth. All modules subscribe to state changes:
- `state.subscribe(callback)` — reactive updates
- `state.patch(delta)` — update without history
- `state.commit(delta)` — update + push to undo stack (80-level)
- `state.undo()` / `state.redo()`

### Tool System

`tools.js` is the tool registry. Each tool is an object with optional `pointerdown`, `pointermove`, `pointerup`, `keydown` handlers. Register with `registerTool(name, handler)`. Active tool routes all pointer events.

Keyboard shortcuts in `keys.js`: V=select, A=direct-select, R=rect, E=ellipse, L=line, P=polygon, B=pen, T=text, H=hand.

### Coordinate System

96 CSS pixels = 1 inch (real-world scale for laser cutting). `utils.js` has `pxToIn()` / `inToPx()`. Artboard coordinates ≠ screen coordinates — use `artboard.js` conversion helpers (`screenToArtboard`, `artboardToScreen`) when implementing pointer interactions.

### Shape Data Model

Shapes stored in `state.shapes` array. Each shape has:
- `id`, `type` (rect/ellipse/line/polygon/path/text/group)
- `x`, `y`, `width`, `height`, `rotation`
- `fill`, `stroke`, `strokeWidth`
- `process` — one of `mainCut`/`fold`/`finalCut`/`etch`/`free` (maps to visual style via `process-registry.js`)
- Type-specific fields (e.g. `points` for polygon, `d` for path, `content`/`font` for text)

### Key Module Roles

| Module | Role |
|--------|------|
| `app.js` | Entry point; initializes all modules |
| `artboard.js` | Viewport (zoom/pan/fit), grid, shape rendering, coordinate conversion |
| `select.js` | Selection, transform handles, marquee, direct anchor editing |
| `pen.js` | Bézier pen tool; click=corner, drag=curve |
| `shapes.js` | Drag-to-create tools: rect, ellipse, line, polygon |
| `properties.js` | Inspector panel: position/size/rotation, fill/stroke, process type |
| `layers.js` | Layers panel: reorder, lock/hide, group/ungroup |
| `pathops.js` | Boolean ops (unite/subtract/intersect) via Paper.js |
| `export.js` | Clean SVG export sized in inches |
| `guides.js` | Smart snap guides: alignment detection with other shapes |
| `text-panel.js` | Text tool + font loading (Google Fonts, custom uploads) |

### Layout

Topbar (56px) | Tool sidebar (56px) | Canvas (flex-fill) | Inspector (280px) | Status bar (30px). CSS variables and design tokens in `styles.css`.
