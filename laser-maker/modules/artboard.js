// =============================================================================
// artboard.js — viewport (zoom/pan/fit/1:1), grid, shape rendering, coord math
// =============================================================================
import { store } from './state.js';
import { svgNS, setAttrs, inToPx, pxToIn, clamp, fmtIn, snap as snapVal, applyPathCorners, rotatedCorners, roundedPolygonPath } from './utils.js';
import { resolveAppearance } from './process-registry.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 16;

class Artboard {
  constructor() {
    this.canvasArea  = document.getElementById('canvas-area');
    this.stage       = document.getElementById('canvas-stage');
    this.wrap        = document.getElementById('artboard-wrap');
    this.svg         = document.getElementById('artboard');
    this.svgGrid     = document.getElementById('artboard-grid');
    this.layerRoot   = document.getElementById('layer-root');
    this.overlay     = document.getElementById('overlay');

    this.zoomLevelEl = document.getElementById('zoom-level');
    this.statusZoom  = document.getElementById('status-zoom');
    this.statusAB    = document.getElementById('status-ab');
    this.statusCursor= document.getElementById('status-cursor');

    this._renderListeners = [];
    this._init();
  }

  _init() {
    document.getElementById('zoom-in').onclick  = () => this.zoomBy(1.25);
    document.getElementById('zoom-out').onclick = () => this.zoomBy(0.8);
    document.getElementById('zoom-level').onclick = () => this.setZoom(1, true);
    document.getElementById('fit-btn').onclick  = () => this.fit();
    document.getElementById('actual-btn').onclick = () => this.setZoom(1, true);

    // Artboard size inputs
    const wIn = document.getElementById('ab-w');
    const hIn = document.getElementById('ab-h');
    const applySize = () => {
      const w = clamp(parseFloat(wIn.value) || 1, 0.5, 96);
      const h = clamp(parseFloat(hIn.value) || 1, 0.5, 96);
      store.commit(s => { s.artboard.w = w; s.artboard.h = h; }, 'artboard-resize');
    };
    wIn.onchange = applySize;
    hIn.onchange = applySize;

    document.querySelectorAll('.ac-presets button').forEach(b => {
      b.onclick = () => {
        const [w, h] = b.dataset.preset.split('x').map(Number);
        wIn.value = w; hIn.value = h; applySize();
        this.fit();
      };
    });

    // Grid + snap toggles
    document.getElementById('grid-toggle').onchange = (e) => store.patch(s => s.grid.enabled = e.target.checked, 'grid');
    document.getElementById('snap-toggle').onchange = (e) => store.patch(s => s.grid.snap = e.target.checked, 'snap');
    document.getElementById('guides-toggle').onchange = (e) => store.patch(s => s.guides.enabled = e.target.checked, 'guides');
    document.getElementById('midpoints-toggle').onchange = (e) => store.patch(s => s.midpoints.enabled = e.target.checked, 'midpoints');

    // Wheel zoom + pan
    this.canvasArea.addEventListener('wheel', this._onWheel.bind(this), { passive: false });

    // Spacebar pan
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !this._spaceDown && document.activeElement.tagName !== 'INPUT') {
        this._spaceDown = true;
        this.canvasArea.classList.add('tool-hand');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') {
        this._spaceDown = false;
        if (store.get().activeTool !== 'hand') this.canvasArea.classList.remove('tool-hand');
      }
    });

    // Cursor tracking for status bar
    this.canvasArea.addEventListener('pointermove', e => {
      const p = this.screenToArtboard(e.clientX, e.clientY);
      this.statusCursor.textContent = `${fmtIn(pxToIn(p.x))}, ${fmtIn(pxToIn(p.y))} in`;
    });

    let _prevIsolation = null;
    store.subscribe((s, reason) => {
      wIn.value = s.artboard.w;
      hIn.value = s.artboard.h;
      this._applyArtboard();
      this._applyViewport();
      this._renderGrid();
      this._renderShapes();
      this._updateStatus();
      // Isolation mode visual indicator
      this.canvasArea.classList.toggle('isolation-active', !!s.isolationGroup);
      if (s.isolationGroup && !_prevIsolation) {
        const grp = store.findShape(s.isolationGroup);
        const t = document.getElementById('toast');
        t.textContent = `Editing "${grp?.name || 'Group'}" — Esc to exit`;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
      }
      _prevIsolation = s.isolationGroup;
    });

    window.addEventListener('resize', () => this._applyViewport());

    // Initial render
    this._applyArtboard();
    this.fit();
  }

  // ---------------- Viewport ----------------
  setZoom(z, anchorCenter = true) {
    const s = store.get();
    const newZoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (anchorCenter) {
      const rect = this.canvasArea.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      // Keep the artboard point currently under center fixed
      const ratio = newZoom / s.viewport.zoom;
      store.patch(st => {
        st.viewport.panX = cx - (cx - st.viewport.panX) * ratio;
        st.viewport.panY = cy - (cy - st.viewport.panY) * ratio;
        st.viewport.zoom = newZoom;
      }, 'zoom');
    } else {
      store.patch(st => st.viewport.zoom = newZoom, 'zoom');
    }
  }

  zoomBy(f) { this.setZoom(store.get().viewport.zoom * f, true); }

  zoomAt(clientX, clientY, factor) {
    const s = store.get();
    const newZoom = clamp(s.viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const rect = this.canvasArea.getBoundingClientRect();
    const ax = clientX - rect.left;
    const ay = clientY - rect.top;
    const ratio = newZoom / s.viewport.zoom;
    store.patch(st => {
      st.viewport.panX = ax - (ax - st.viewport.panX) * ratio;
      st.viewport.panY = ay - (ay - st.viewport.panY) * ratio;
      st.viewport.zoom = newZoom;
    }, 'zoom');
  }

  panBy(dx, dy) {
    store.patch(st => { st.viewport.panX += dx; st.viewport.panY += dy; }, 'pan');
  }

  fit() {
    const s = store.get();
    const rect = this.canvasArea.getBoundingClientRect();
    const margin = 60;
    const wPx = inToPx(s.artboard.w);
    const hPx = inToPx(s.artboard.h);
    const z = Math.min((rect.width - margin*2) / wPx, (rect.height - margin*2) / hPx);
    const zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const panX = (rect.width  - wPx * zoom) / 2;
    const panY = (rect.height - hPx * zoom) / 2;
    store.patch(st => { st.viewport.zoom = zoom; st.viewport.panX = panX; st.viewport.panY = panY; }, 'fit');
  }

  _onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
      this.zoomAt(e.clientX, e.clientY, factor);
    } else {
      this.panBy(-e.deltaX, -e.deltaY);
    }
  }

  // ---------------- Coordinate math ----------------
  // Convert screen client coords -> artboard local pixels
  screenToArtboard(clientX, clientY) {
    const rect = this.canvasArea.getBoundingClientRect();
    const s = store.get();
    const x = (clientX - rect.left - s.viewport.panX) / s.viewport.zoom;
    const y = (clientY - rect.top  - s.viewport.panY) / s.viewport.zoom;
    return { x, y };
  }
  // Convert artboard pixels -> screen client offset relative to canvas-area
  artboardToScreen(x, y) {
    const s = store.get();
    return {
      x: x * s.viewport.zoom + s.viewport.panX,
      y: y * s.viewport.zoom + s.viewport.panY,
    };
  }

  snapPoint(pt) {
    const s = store.get();
    if (!s.grid.snap) return pt;
    const stepPx = inToPx(s.grid.size);
    return { x: snapVal(pt.x, stepPx), y: snapVal(pt.y, stepPx) };
  }

  // ---------------- Apply visuals ----------------
  _applyArtboard() {
    const s = store.get();
    const wPx = inToPx(s.artboard.w);
    const hPx = inToPx(s.artboard.h);
    this.wrap.style.width  = wPx + 'px';
    this.wrap.style.height = hPx + 'px';
    this.svg.setAttribute('viewBox', `0 0 ${wPx} ${hPx}`);
    this.svgGrid.setAttribute('viewBox', `0 0 ${wPx} ${hPx}`);
  }

  _applyViewport() {
    const s = store.get();
    this.stage.style.transform = `translate(${s.viewport.panX}px, ${s.viewport.panY}px) scale(${s.viewport.zoom})`;
    this.zoomLevelEl.textContent = Math.round(s.viewport.zoom * 100) + '%';
  }

  _renderGrid() {
    const s = store.get();
    this.svgGrid.replaceChildren();
    if (!s.grid.enabled) return;
    const w = inToPx(s.artboard.w);
    const h = inToPx(s.artboard.h);
    const minor = inToPx(s.grid.size);
    const major = inToPx(1);                // major line every 1"
    const z = s.viewport.zoom;

    const minorStroke = 1 / z;
    const majorStroke = 1.25 / z;
    const minorColor = 'var(--grid)';
    const majorColor = 'var(--grid-major)';

    // Use single <path> per stroke style for perf
    let dMinor = '', dMajor = '';
    for (let x = 0; x <= w + 0.01; x += minor) {
      const isMajor = Math.abs(x % major) < 0.01 || Math.abs(major - (x % major)) < 0.01;
      const seg = `M${x.toFixed(2)} 0 L${x.toFixed(2)} ${h.toFixed(2)} `;
      if (isMajor) dMajor += seg; else dMinor += seg;
    }
    for (let y = 0; y <= h + 0.01; y += minor) {
      const isMajor = Math.abs(y % major) < 0.01 || Math.abs(major - (y % major)) < 0.01;
      const seg = `M0 ${y.toFixed(2)} L${w.toFixed(2)} ${y.toFixed(2)} `;
      if (isMajor) dMajor += seg; else dMinor += seg;
    }
    const mk = (d, color, sw) => {
      const p = svgNS('path');
      setAttrs(p, { d, stroke: color, 'stroke-width': sw, fill: 'none', 'vector-effect': 'non-scaling-stroke' });
      return p;
    };
    if (dMinor) this.svgGrid.appendChild(mk(dMinor, '#E8E3D4', minorStroke));
    if (dMajor) this.svgGrid.appendChild(mk(dMajor, '#D5CEBC', majorStroke));
  }

  // ---------------- Shape rendering ----------------
  onAfterRender(fn) { this._renderListeners.push(fn); }

  _renderShapes() {
    const s = store.get();
    this.layerRoot.replaceChildren();
    for (const sh of s.shapes) {
      if (sh.visible === false) continue;
      const node = this._buildNode(sh);
      if (node) {
        node.dataset.id = sh.id;
        this.layerRoot.appendChild(node);
        if (sh.type !== 'group' && sh.type !== 'rawsvg') {
          this._cacheBBox(sh, node);
          this._applyNodeRotation(sh, node);
        } else if (sh.type === 'rawsvg') {
          this._applyNodeRotation(sh, node);
        }
      }
    }
    // After DOM is built, compute group bboxes (DOM needed for path/text children)
    this._cacheGroupBBoxes(s.shapes);
    // Isolation dim: reduce opacity of top-level nodes not in the isolated group
    if (s.isolationGroup) {
      for (const child of this.layerRoot.children) {
        if (child.dataset.id !== s.isolationGroup) {
          child.setAttribute('opacity', '0.25');
          child.setAttribute('pointer-events', 'none');
        }
      }
      // Dim non-selected siblings within the isolated group
      if (s.selection.length) {
        const selSet = new Set(s.selection);
        const groupNode = this.layerRoot.querySelector(`[data-id="${s.isolationGroup}"]`);
        if (groupNode) {
          for (const child of groupNode.children) {
            if (child.dataset.id && !selSet.has(child.dataset.id)) {
              child.setAttribute('opacity', '0.25');
            }
          }
        }
      }
    }
    for (const fn of this._renderListeners) fn();
  }

  _cacheBBox(sh, node) {
    if (sh.type === 'text' && sh.attrs.width != null) {
      sh._bbox = { x: sh.attrs.x, y: sh.attrs.y, w: sh.attrs.width, h: sh.attrs.height };
    } else if (['path', 'polygon', 'star', 'text'].includes(sh.type)) {
      try {
        const bb = node.children[1].getBBox();
        sh._bbox = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      } catch {}
    }
  }

  _applyNodeRotation(sh, node) {
    if (!sh.rotation) return;
    const b = this._geometryBBox(sh);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    node.setAttribute('transform', `rotate(${sh.rotation} ${cx} ${cy})`);
  }

  _buildGroupNode(sh) {
    const g = svgNS('g');
    g.classList.add('shape-node', 'group-node');
    for (const child of sh.children) {
      if (child.visible === false) continue;
      const node = this._buildNode(child);
      if (node) {
        node.dataset.id = child.id;
        g.appendChild(node);
      }
    }
    return g;
  }

  _cacheGroupBBoxes(shapes) {
    for (const sh of shapes) {
      if (sh.type === 'rawsvg') {
        const outerNode = this.layerRoot.querySelector(`[data-id="${sh.id}"]`);
        if (outerNode) {
          const inner = outerNode.querySelector('.rawsvg-inner');
          if (inner) {
            try {
              const bb = inner.getBBox();
              sh._bbox = { x: (sh.attrs.x || 0) + bb.x, y: (sh.attrs.y || 0) + bb.y, w: bb.width, h: bb.height };
            } catch {}
          }
          if (sh._bbox && sh._bbox.w > 0) {
            const b = sh._bbox;
            const catcher = svgNS('rect');
            setAttrs(catcher, {
              x: b.x, y: b.y, width: b.w, height: b.h,
              fill: 'transparent', stroke: 'none', 'pointer-events': 'all',
              class: 'group-catcher',
            });
            outerNode.insertBefore(catcher, outerNode.firstChild);
          }
        }
        continue;
      }
      if (sh.type !== 'group') continue;
      // Recurse into nested groups first
      this._cacheGroupBBoxes(sh.children);
      // Cache bbox for non-group children (path/polygon/text need DOM)
      for (const child of sh.children) {
        if (child.type === 'group') continue;
        const node = this.layerRoot.querySelector(`[data-id="${child.id}"]`);
        if (node) {
          this._cacheBBox(child, node);
          this._applyNodeRotation(child, node);
        }
      }
      // Compute group's compound bbox from children
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const child of sh.children) {
        const b = this._geometryBBox(child);
        if (child.rotation) {
          for (const p of rotatedCorners(b, child.rotation)) {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
          }
        } else {
          if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y;
          if (b.x + b.w > maxX) maxX = b.x + b.w; if (b.y + b.h > maxY) maxY = b.y + b.h;
        }
      }
      if (minX !== Infinity) sh._bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      // Apply group-level rotation and add background catcher for hit-testing
      const groupNode = this.layerRoot.querySelector(`[data-id="${sh.id}"]`);
      if (groupNode) {
        this._applyNodeRotation(sh, groupNode);
        // Prepend a transparent catcher so the group is clickable in empty areas
        if (sh._bbox) {
          const b = sh._bbox;
          const catcher = svgNS('rect');
          setAttrs(catcher, {
            x: b.x, y: b.y, width: b.w, height: b.h,
            fill: 'transparent', stroke: 'none', 'pointer-events': 'all',
            class: 'group-catcher',
          });
          groupNode.insertBefore(catcher, groupNode.firstChild);
        }
      }
    }
  }

  _buildNode(sh) {
    if (sh.type === 'group') return this._buildGroupNode(sh);
    if (sh.type === 'rawsvg') {
      const outer = svgNS('g');
      outer.classList.add('shape-node');
      const inner = svgNS('g');
      inner.classList.add('rawsvg-inner');
      inner.setAttribute('transform', `translate(${sh.attrs.x || 0},${sh.attrs.y || 0})`);
      inner.innerHTML = sh.attrs.markup || '';
      outer.appendChild(inner);
      return outer;
    }
    const { type, attrs } = sh;
    let el;
    const resolved = resolveAppearance(sh);
    const styleAttrs = {
      fill: resolved.fill,
      stroke: resolved.stroke,
      'stroke-width': resolved.strokeWidth,
      'stroke-linejoin': 'round',
      'stroke-linecap': resolved.strokeLinecap ?? 'round',
      'vector-effect': sh.strokeNonScaling ? 'non-scaling-stroke' : null,
    };
    switch (type) {
      case 'rect': {
        const hasPC = attrs.r_nw || attrs.r_ne || attrs.r_se || attrs.r_sw;
        if (hasPC) {
          const half = Math.min(attrs.w, attrs.h) / 2;
          const r = {
            nw: Math.min(Math.max(0, attrs.r_nw ?? attrs.rx ?? 0), half),
            ne: Math.min(Math.max(0, attrs.r_ne ?? attrs.rx ?? 0), half),
            se: Math.min(Math.max(0, attrs.r_se ?? attrs.rx ?? 0), half),
            sw: Math.min(Math.max(0, attrs.r_sw ?? attrs.rx ?? 0), half),
          };
          const { x, y, w, h } = attrs;
          let d = `M ${x + r.nw} ${y}`;
          d += ` L ${x + w - r.ne} ${y}`;
          if (r.ne > 0) d += ` A ${r.ne} ${r.ne} 0 0 1 ${x + w} ${y + r.ne}`;
          d += ` L ${x + w} ${y + h - r.se}`;
          if (r.se > 0) d += ` A ${r.se} ${r.se} 0 0 1 ${x + w - r.se} ${y + h}`;
          d += ` L ${x + r.sw} ${y + h}`;
          if (r.sw > 0) d += ` A ${r.sw} ${r.sw} 0 0 1 ${x} ${y + h - r.sw}`;
          d += ` L ${x} ${y + r.nw}`;
          if (r.nw > 0) d += ` A ${r.nw} ${r.nw} 0 0 1 ${x + r.nw} ${y}`;
          d += ' Z';
          el = svgNS('path');
          setAttrs(el, { d });
        } else {
          el = svgNS('rect');
          setAttrs(el, { x: attrs.x, y: attrs.y, width: Math.max(0, attrs.w), height: Math.max(0, attrs.h), rx: attrs.rx || 0 });
        }
        break;
      }
      case 'ellipse':
        el = svgNS('ellipse');
        setAttrs(el, { cx: attrs.cx, cy: attrs.cy, rx: Math.max(0, attrs.rx), ry: Math.max(0, attrs.ry) });
        break;
      case 'line':
        el = svgNS('line');
        setAttrs(el, { x1: attrs.x1, y1: attrs.y1, x2: attrs.x2, y2: attrs.y2 });
        styleAttrs.fill = 'none';
        if (!resolved.stroke || resolved.stroke === 'none') styleAttrs.stroke = '#0F1419';
        break;
      case 'polygon': {
        const pts = this._polyPoints(attrs);
        const radii = pts.map((_, i) => attrs.cornerRadii?.[i] ?? attrs.cornerRadius ?? 0);
        if (radii.some(r => r > 0)) {
          el = svgNS('path');
          setAttrs(el, { d: roundedPolygonPath(pts, radii) });
        } else {
          el = svgNS('polygon');
          setAttrs(el, { points: pts.map(p => `${p.x},${p.y}`).join(' ') });
        }
        break;
      }
      case 'star': {
        const pts = this._starPoints(attrs);
        const outerR = attrs.outerCornerR ?? 0;
        const innerR = attrs.innerCornerR ?? 0;
        const radii = pts.map((_, i) => attrs.cornerRadii?.[i] ?? (i % 2 === 0 ? outerR : innerR));
        if (radii.some(r => r > 0)) {
          el = svgNS('path');
          setAttrs(el, { d: roundedPolygonPath(pts, radii) });
        } else {
          el = svgNS('polygon');
          setAttrs(el, { points: pts.map(p => `${p.x},${p.y}`).join(' ') });
        }
        break;
      }
      case 'path':
        el = svgNS('path');
        setAttrs(el, {
          d: attrs.corners ? applyPathCorners(attrs.d, attrs.corners) : attrs.d,
          ...(attrs.fillRule ? { 'fill-rule': attrs.fillRule } : {}),
        });
        break;
      case 'image': {
        const w = Math.max(0, attrs.w), h = Math.max(0, attrs.h);
        const im = svgNS('image');
        setAttrs(im, { x: attrs.x, y: attrs.y, width: w, height: h, preserveAspectRatio: 'none' });
        im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', attrs.href);
        im.setAttribute('href', attrs.href);
        // Transparent rect catcher gives a full-bounds click zone.
        const catcher = svgNS('rect');
        setAttrs(catcher, { x: attrs.x, y: attrs.y, width: w, height: h, fill: 'transparent', stroke: 'none', 'pointer-events': 'all' });
        // Hover highlight — rect outline (images don't render stroke directly).
        const highlight = svgNS('rect');
        setAttrs(highlight, { x: attrs.x, y: attrs.y, width: w, height: h, fill: 'none', stroke: 'white', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' });
        highlight.classList.add('shape-hover-highlight');
        const g = svgNS('g');
        g.classList.add('shape-node');
        g.appendChild(catcher);
        g.appendChild(im);
        g.appendChild(highlight);
        return g;
      }
      case 'text': {
        if (attrs.width != null) {
          // Frame-based text: foreignObject + div for word-wrap
          const lh   = attrs.lineHeight || 1.2;
          const sz   = attrs.size   || 16;
          const fw   = attrs.weight || 500;
          const ff   = attrs.family || 'Geist, sans-serif';
          const al   = attrs.align  || 'left';
          const fill = resolved.fill && resolved.fill !== 'none' ? resolved.fill : '#0F1419';

          const fo = svgNS('foreignObject');
          setAttrs(fo, { x: attrs.x, y: attrs.y, width: attrs.width, height: attrs.height });

          const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
          div.style.cssText = `font-family:${ff};font-size:${sz}px;font-weight:${fw};` +
            `line-height:${lh};text-align:${al};color:${fill};` +
            `white-space:pre-wrap;word-break:break-word;overflow:visible;` +
            `width:100%;height:100%;box-sizing:border-box;pointer-events:none;`;
          div.textContent = attrs.content || '';
          fo.appendChild(div);

          // Transparent rect as click-catcher (foreignObject doesn't support pointer hit)
          const catcher = svgNS('rect');
          setAttrs(catcher, {
            x: attrs.x, y: attrs.y, width: attrs.width, height: attrs.height,
            fill: 'transparent', stroke: 'transparent',
            'stroke-width': 10, 'vector-effect': 'non-scaling-stroke',
            'pointer-events': 'all',
          });

          const g = svgNS('g');
          g.classList.add('shape-node');
          g.appendChild(catcher);
          g.appendChild(fo);

          if (store.get().textEditId === sh.id) {
            g.setAttribute('opacity', '0');
            g.setAttribute('pointer-events', 'none');
          }
          return g; // early return — skip generic catcher/highlight/styleAttrs
        }

        // Legacy single-point text (no frame)
        const anchorMap = { left: 'start', center: 'middle', right: 'end' };
        el = svgNS('text');
        setAttrs(el, {
          x: attrs.x, y: attrs.y,
          'font-family': attrs.family || 'Geist, sans-serif',
          'font-size': attrs.size || 16,
          'font-weight': attrs.weight || 500,
          'text-anchor': anchorMap[attrs.align] || 'start',
          'dominant-baseline': 'text-before-edge',
        });
        el.textContent = attrs.content || '';
        if (!resolved.fill || resolved.fill === 'none') styleAttrs.fill = '#0F1419';
        styleAttrs.stroke = 'none';
        break;
      }
      default: return null;
    }
    // Visually thicken stroke for screen display — export reads from shape data, not DOM
    if (styleAttrs.stroke && styleAttrs.stroke !== 'none') {
      styleAttrs['stroke-width'] = Math.max(3, sh.strokeWidth ?? 1);
      styleAttrs['vector-effect'] = 'non-scaling-stroke';
    }
    if (resolved.strokeDasharray) {
      styleAttrs['stroke-dasharray']  = resolved.strokeDasharray;
      styleAttrs['stroke-dashoffset'] = resolved.strokeDashoffset ?? 0;
    }
    setAttrs(el, styleAttrs);

    // Transparent click-catcher — gives every shape a wide click zone (10px screen-space)
    // so stroke-only shapes are easy to select regardless of zoom level.
    const catcher = el.cloneNode(false);
    setAttrs(catcher, {
      fill: 'transparent',
      stroke: 'transparent',
      'stroke-width': 10,
      'vector-effect': 'non-scaling-stroke',
      'pointer-events': 'all',
    });

    // Hover highlight — thin 1pt difference-blended line reveals precise cut line
    const highlight = el.cloneNode(true);
    setAttrs(highlight, {
      fill: 'none',
      stroke: 'white',
      'stroke-width': 1,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke',
      'pointer-events': 'none',
    });
    if (resolved.strokeDasharray) {
      highlight.removeAttribute('stroke-dasharray');
      highlight.removeAttribute('stroke-dashoffset');
    }
    highlight.classList.add('shape-hover-highlight');

    const g = svgNS('g');
    g.classList.add('shape-node');
    g.appendChild(catcher);
    g.appendChild(el);
    g.appendChild(highlight);

    return g;
  }

  _polyPoints(attrs) {
    const { cx, cy, r, sides } = attrs;
    const n = Math.max(3, sides|0);
    const pts = [];
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = startAngle + (i * 2*Math.PI / n);
      pts.push({ x: cx + r*Math.cos(a), y: cy + r*Math.sin(a) });
    }
    return pts;
  }

  _starPoints(attrs) {
    const { cx, cy, r, points, innerRatio } = attrs;
    const n = Math.max(3, points|0);
    const ri = r * (innerRatio ?? 0.4);
    const pts = [];
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < n * 2; i++) {
      const a = startAngle + (i * Math.PI / n);
      const rad = i % 2 === 0 ? r : ri;
      pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
    }
    return pts;
  }

  // Geometry bbox without rotation (used when applying rotate around bbox center)
  _geometryBBox(sh) {
    switch (sh.type) {
      case 'rect':    return { x: sh.attrs.x, y: sh.attrs.y, w: sh.attrs.w, h: sh.attrs.h };
      case 'image':   return { x: sh.attrs.x, y: sh.attrs.y, w: sh.attrs.w, h: sh.attrs.h };
      case 'ellipse': return { x: sh.attrs.cx - sh.attrs.rx, y: sh.attrs.cy - sh.attrs.ry, w: sh.attrs.rx*2, h: sh.attrs.ry*2 };
      case 'line':    return {
        x: Math.min(sh.attrs.x1, sh.attrs.x2),
        y: Math.min(sh.attrs.y1, sh.attrs.y2),
        w: Math.abs(sh.attrs.x2 - sh.attrs.x1),
        h: Math.abs(sh.attrs.y2 - sh.attrs.y1),
      };
      case 'polygon': {
        const pts = this._polyPoints(sh.attrs);
        const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) };
      }
      case 'star': {
        const pts = this._starPoints(sh.attrs);
        const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) };
      }
      case 'path':
        return sh._bbox || { x: 0, y: 0, w: 0, h: 0 };
      case 'text':
        if (sh.attrs.width != null) {
          return { x: sh.attrs.x, y: sh.attrs.y, w: sh.attrs.width, h: sh.attrs.height };
        }
        return sh._bbox || { x: 0, y: 0, w: 0, h: 0 };
      case 'group':
      case 'rawsvg':
        return sh._bbox || { x: 0, y: 0, w: 0, h: 0 };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  getShapeBBox(sh) { return this._geometryBBox(sh); }

  // Live SVG element by id (after render)
  getShapeNode(id) { return this.layerRoot.querySelector(`[data-id="${id}"]`); }

  _updateStatus() {
    const s = store.get();
    this.statusZoom.textContent = Math.round(s.viewport.zoom * 100) + '%';
    this.statusAB.textContent = `${fmtIn(s.artboard.w)} × ${fmtIn(s.artboard.h)} in`;
  }
}

export const artboard = new Artboard();
