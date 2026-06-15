# Laser Maker — Review & Testing Guide

## Reviewer

- **Name:** ___________________________
- **Date:** ___________________________
- **Browser / OS:** ___________________________

---

## Overview

Laser Maker is a browser-based vector design tool built for NYC FIRST students to create files for laser cutting. It mirrors the feel of Adobe Illustrator but is scoped to what students actually need: drawing shapes, assigning process types, and exporting a clean SVG. Your job today is to walk through a few guided projects and then check individual features for correctness and any rough edges.

---

## Getting Started

1. Open your browser and go to the app URL (it should already be running — ask if you don't have it).
2. You should see the Laser Maker interface load. Here's the layout at a glance:

| Area | Location | What it does |
|---|---|---|
| Topbar | Top strip | File name, export button, import button, zoom controls |
| Tool sidebar | Left edge | Drawing tools and selection tools |
| Canvas | Center | Your artboard — where you draw |
| Inspector | Right panel | Shape properties, process type, offset path, layers |
| Status bar | Bottom strip | Cursor coordinates, selected shape info |

3. Try pressing `F` to fit the artboard to the window before starting.

**First impressions — answer before diving in:**

- Does the interface feel approachable for a middle schooler? ___________________________
- Is it clear what to do first without any instruction? ___________________________
- Anything confusing or intimidating at a glance? ___________________________

**Quick tool shortcuts** (same keys as Adobe Illustrator):

| Key | Tool |
|---|---|
| V | Select |
| A | Direct Select (anchors) |
| M | Rectangle |
| L | Ellipse |
| \ | Line Segment |
| P | Pen (Bezier) |
| T | Text |
| H | Hand / Pan |
| O | Reflect |
| Shift+M | Shape Builder |

---

## Guided Projects

### Project A: Name Tag

Design a simple name tag with a border, a text label, and a hole for string.

1. Press `M` to activate the Rectangle tool.
2. Drag to draw a rectangle roughly 4 inches wide and 2 inches tall.
3. In the Inspector (right panel), find the **Process** section. Set it to **Main Cut**. The shape should turn blue.
4. With the shape still selected, hover over a corner — a small round handle should appear. Drag it inward to round the corners.
5. Press `T` to activate the Text tool. Click on the canvas and type your name.
6. In the Inspector, set the text process to **Etch**. It should turn black.
7. Press `L` to activate the Ellipse tool. Hold `Shift` and drag a small circle near the top of the tag (for a string hole).
8. Set the circle's process to **Final Cut**. It should turn green.
9. Click the rounded rectangle to select it.
10. In the Inspector, scroll to **Offset Path**. Enter a small positive value (e.g. `5`) and apply. A second outline should appear around the tag.
11. Click **Export SVG** in the topbar. Open the downloaded file in a browser and verify: blue outline, black text, green hole, offset border.

**What to check:**
- [ ] Process colors applied correctly (blue / green / black)
- [ ] Corner rounding worked
- [ ] Offset Path created a visible border around the shape
- [ ] Exported SVG shows correct colors when opened

---

### Project B: Import and Image Trace

Bring in a raster image, adjust it for etching, then convert it to vector paths.

1. Find any PNG or JPG on your computer (a logo, a photo, anything).
2. Drag and drop it onto the canvas. It should appear as an image shape.
3. With the image selected, set its process to **Etch** in the Inspector. The process dropdown should hide Main Cut / Fold / Final Cut — only Etch and Free should be available.
4. A **Raster Etch** panel should appear in the Inspector. Try the following:
   - Adjust **Brightness** — the image should update.
   - Adjust **Contrast**.
   - Enable **Threshold** — the image should become black and white.
5. Click the **Trace to vector** button in the Raster Etch panel.
6. A progress indicator should appear briefly. The image should be replaced by black vector paths.
7. With the traced paths selected, change the process to **Main Cut**. The paths should turn blue.

**What to check:**
- [ ] Image imported and displayed on canvas
- [ ] Process dropdown correctly limited to Etch / Free for images
- [ ] Raster Etch sliders visibly updated the image
- [ ] Threshold produced a black-and-white preview
- [ ] Trace to vector replaced the image with editable paths
- [ ] Process type changed successfully on traced result

---

### Project C: WalkBot Fold Box

Design a simple flat pattern that could be cut from cardboard and folded into a 3D box — the same idea behind parts like the WalkBot chassis.

**Concept:** A flat cross-shaped layout — a center base rectangle with flaps on each side separated by fold lines.

1. Press `M` and draw a rectangle for the center base (about 3 x 3 inches). Set process to **Main Cut** (blue).
2. Draw four more rectangles, one attached to each side of the base, for the folding flaps. Set all to **Main Cut** (blue).
3. Press `\` to activate the Line tool. Draw lines along the inside edges where the flaps meet the base — these are fold lines. Set each line's process to **Fold / Score** (red).
4. Draw a rectangle around the entire flat pattern as the final outer cut. Set its process to **Final Cut** (green).
5. Look at your design: blue = cut, red = fold, green = final release cut.
6. Click **Export SVG**. Open the file in a browser and confirm all three colors are present and correct.

**What to check:**
- [ ] Main Cut shapes are blue
- [ ] Fold / Score lines are red
- [ ] Final Cut shape is green
- [ ] All three process colors visible in the exported SVG
- [ ] Line tool worked for the fold lines

---

## Feature Testing Checklist

Work through each item. Check it off if it works as expected; leave a note in the Bug Log if something seems off.

### Drawing Tools
- [ ] Rectangle tool — draws a rectangle; Shift constrains to square
- [ ] Ellipse tool — draws an ellipse; Shift constrains to circle
- [ ] Line tool — draws a straight line; Shift snaps to 45 degrees
- [ ] Polygon tool — draws a polygon; try changing the number of sides in the Inspector
- [ ] Pen tool — click to drop corner points; click and drag to add curves; click first anchor to close
- [ ] Text tool — click to place text; type content; font and size adjust in Inspector

### Selection and Transform
- [ ] Select tool (V) — click to select a shape
- [ ] Move — drag a selected shape to reposition
- [ ] Resize — drag a handle; Shift maintains aspect ratio
- [ ] Rotate — drag the rotation handle above the bounding box; Shift snaps to 15 degrees
- [ ] Direct Select (A) — click a shape to see its anchors; drag an anchor to move it
- [ ] Corner rounding — hover a corner in select mode; a round widget appears; drag it inward

### Canvas Navigation
- [ ] Zoom in — Cmd + (or scroll)
- [ ] Zoom out — Cmd -
- [ ] Fit to view — F key
- [ ] Pan — H key or hold Space, then drag

### Process Types
- [ ] Main Cut assigns blue stroke, 1pt, no fill
- [ ] Fold / Score assigns red stroke, 1pt, no fill
- [ ] Final Cut assigns green stroke, 1pt, no fill
- [ ] Etch assigns black; fill/stroke options appear
- [ ] Free allows custom fill and stroke colors

### History
- [ ] Undo — Cmd Z reverses the last action
- [ ] Redo — Shift Cmd Z reapplies it
- [ ] Multiple undos work in sequence

### Layers Panel
- [ ] Layers panel shows all shapes
- [ ] Drag a layer row to reorder shapes
- [ ] Lock icon prevents a shape from being selected or moved
- [ ] Eye icon hides a shape on the canvas

### Pathfinder
- [ ] Select two overlapping shapes
- [ ] Unite merges them into one shape
- [ ] Subtract removes the top shape from the bottom
- [ ] Intersect keeps only the overlapping area

### Offset Path
- [ ] Select a shape and expand the Offset Path section in the Inspector
- [ ] Positive value expands the shape outward
- [ ] Negative value contracts the shape inward
- [ ] Works on a group (e.g. a traced image group)

### Image Import
- [ ] Drag and drop a PNG or JPG onto the canvas — it appears
- [ ] Use the Import Image button in the topbar — file picker opens, image appears
- [ ] Image can be moved and resized like any shape

### Raster Etch
- [ ] Setting an image to Etch shows the Raster Etch panel
- [ ] Brightness slider updates the preview
- [ ] Contrast slider updates the preview
- [ ] Threshold toggle converts the image to black and white
- [ ] Trace to vector converts the image to paths

### Export & Full Pipeline Verification

Test the complete path from Laser Maker all the way to the laser cutter:

**Step 1 — Export from Laser Maker**
- [ ] Export SVG button downloads a file
- [ ] Open the SVG in a browser — shapes and colors look correct
- [ ] Process colors match locked values: blue (Main Cut), red (Fold), green (Final Cut), black (Etch)

**Step 2 — Import into Adobe Illustrator**
- [ ] File opens in Illustrator without errors or missing elements
- [ ] Colors are preserved exactly (blue, red, green, black — no shifts)
- [ ] Stroke weights are present (1pt cut/fold lines)
- [ ] Artboard size matches what was set in Laser Maker
- [ ] No stray paths, empty groups, or unexpected objects

**Step 3 — Send to Epilog Fusion Job Manager**
- [ ] File → Print opens the Epilog print driver
- [ ] Job Manager recognizes the color-mapped layers correctly
- [ ] Cut / score / etch settings map to the right colors
- [ ] Job appears in the Epilog Fusion Edge 36 queue

**Notes on the pipeline:**

&nbsp;

### Smart Guides
- [ ] While moving a shape, alignment guides appear when edges or centers line up with other shapes

---

## Bug Log

| # | Description | Steps to Reproduce | Severity | Notes |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

**Severity scale:** Low = cosmetic or minor annoyance | Med = feature partially broken | High = feature doesn't work or causes data loss

---

## General Notes & Suggestions

_Use this space for anything that doesn't fit above — impressions, suggestions, questions, observations about the student experience._

&nbsp;

&nbsp;

&nbsp;

&nbsp;

&nbsp;
