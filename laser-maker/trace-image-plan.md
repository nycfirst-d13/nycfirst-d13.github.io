# Plan: Raster-to-Vector Image Tracing (imagetracerjs)

## Context
App has zero raster/image support. User wants to import a bitmap image, trace it to vector paths using imagetracerjs, and land the result as editable `path` shapes on the artboard — useful for laser cutting silhouettes and multi-color designs.

## Approach

### 1. Load imagetracerjs via CDN — `index.html`
Add script tag alongside Paper.js and Clipper.js:
```html
<script src="https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js"></script>
```

### 2. Inspector panel HTML — `index.html`
Add before the Pathfinder panel:
```html
<div class="panel" id="trace-panel">
  <header class="panel-h"><span>Trace Image</span></header>
  <div class="prop-row">
    <label class="prop-label">Mode</label>
    <select id="trace-mode" class="prop-select">
      <option value="outline">Outline (B&W)</option>
      <option value="posterize">Posterize</option>
      <option value="detailed">Detailed</option>
    </select>
  </div>
  <div class="prop-row">
    <label class="btn ghost" id="trace-btn" for="trace-input" style="flex:1;cursor:pointer;text-align:center">
      Choose Image…
    </label>
    <input type="file" id="trace-input" accept="image/*"
           style="position:absolute;width:0;height:0;opacity:0;pointer-events:none" />
  </div>
</div>
```

### 3. New module — `modules/trace.js`

**Full flow:**
1. File input → `FileReader.readAsDataURL` → `<img>` → draw to temp `<canvas>` → `ctx.getImageData()`
2. Compute `traceScale = min(8*96 / imgW, 8*96 / imgH)` — scales to fit 8 inches max
3. Call `ImageTracer.imagedataToSVG(imageData, { scale: traceScale, ...modeOptions })`
4. `DOMParser` the returned SVG string → extract each `<path>` with its `d` and `fill`
5. Compute `ox = artboardPxW/2 - imgW*traceScale/2`, `oy = artboardPxH/2 - imgH*traceScale/2`
6. Translate each path's `d` by `(ox, oy)` using `translatePathD(d, dx, dy)` (see below)
7. `store.commit(...)` adding a `group` shape with `path` children, then select it

**`translatePathD(d, dx, dy)`** — works on imagetracerjs output (only uses `M`, `L`, `Q`, `Z`):
```js
function translatePathD(d, dx, dy) {
  const tokens = d.match(/[MLQZ]|[-+]?[\d.]+(?:e[-+]?\d+)?/gi) || [];
  let out = ''; let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === 'Z') { out += 'Z'; i++; }
    else if (t === 'M' || t === 'L') {
      out += t + (parseFloat(tokens[i+1])+dx).toFixed(2) + ',' + (parseFloat(tokens[i+2])+dy).toFixed(2) + ' ';
      i += 3;
    } else if (t === 'Q') {
      out += 'Q' + (parseFloat(tokens[i+1])+dx).toFixed(2) + ',' + (parseFloat(tokens[i+2])+dy).toFixed(2)
           + ' '  + (parseFloat(tokens[i+3])+dx).toFixed(2) + ',' + (parseFloat(tokens[i+4])+dy).toFixed(2) + ' ';
      i += 5;
    } else { i++; }
  }
  return out.trim();
}
```

**Mode → imagetracerjs options mapping:**
```js
const MODES = {
  outline:   { numberofcolors: 2,  colorsampling: 0, strokewidth: 0 },
  posterize: { numberofcolors: 4,  colorsampling: 1, strokewidth: 0 },
  detailed:  { numberofcolors: 16, colorsampling: 2, strokewidth: 0 },
};
```

**Group shape created:**
```js
{
  id, type: 'group', name: 'Traced Image',
  visible: true, locked: false, rotation: 0,
  children: paths.map(({ d, fill }) => ({
    id: uid(), type: 'path', name: 'Path',
    fill, stroke: 'none', strokeWidth: 1,
    visible: true, locked: false, rotation: 0,
    attrs: { d }
  }))
}
```

**Also**: filter out paths with fill matching the background (near-white) for the `outline` mode, so only the dark trace lands on the artboard.

### 4. Wire module — `app.js`
```js
import './modules/trace.js';
```

### 5. Layer icon — `modules/layers.js`
No change needed — `path` and `group` icons already exist.

### 6. Export — `modules/export.js`
No change needed — `group` + `path` shapes already serialize correctly.

## Critical files
- `index.html` — CDN script + panel HTML
- `modules/trace.js` — new file (entire feature)
- `app.js` — one import line

## No changes needed
- `artboard.js` — already renders `path` and `group`
- `state.js` — group + path shapes already valid types
- `export.js` — already handles these types
- `layers.js` — already shows path/group icons
- `properties.js` — selection of traced paths works with existing fill/stroke controls

## Verification
1. Open app via local HTTP server
2. Inspector shows "Trace Image" panel
3. Choose a PNG/JPG → traced paths appear centered on artboard as a group
4. Select individual paths inside group → fill color matches traced regions
5. Export SVG → paths serialize correctly, no raster data
6. Outline mode on a simple logo → single dark path, white background filtered out
