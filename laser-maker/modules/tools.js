// =============================================================================
// tools.js — tool registry + pointer event dispatch
// =============================================================================
import { store } from './state.js';
import { artboard } from './artboard.js';
import { computeDrawSnap, renderGuides, clearGuides, renderSnapHighlight, clearSnapHighlight } from './guides.js';

const SMART_SNAP_TOOLS = new Set(['rect', 'ellipse', 'line', 'polygon', 'text']);

const TOOL_LABELS = {
  select:       'Select',
  direct:       'Direct Select',
  rect:         'Rectangle',
  ellipse:      'Ellipse',
  line:         'Line',
  polygon:      'Polygon',
  pen:          'Pen',
  text:         'Text',
  hand:         'Hand',
  shapebuilder: 'Shape Builder',
  reflect:      'Reflect',
};

class Tools {
  constructor() {
    this.handlers = new Map();
    this.area = document.getElementById('canvas-area');
    this.statusTool = document.getElementById('status-tool');
    this._panning = null;
    this._activeHandler = null;
    this._wire();
  }

  register(name, handler) { this.handlers.set(name, handler); }

  setActive(name) {
    const s = store.get();
    if (s.activeTool === name) return;
    const prev = this.handlers.get(s.activeTool);
    if (prev?.onDeactivate) prev.onDeactivate();
    clearGuides();
    clearSnapHighlight();
    store.patch(st => st.activeTool = name, 'tool');
    const next = this.handlers.get(name);
    if (next?.onActivate) next.onActivate();
    this._updateUI();
  }

  _updateUI() {
    const s = store.get();
    document.querySelectorAll('.tool').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === s.activeTool);
    });
    // Preserve isolation-active class — only swap the tool- class
    const isolated = this.area.classList.contains('isolation-active');
    this.area.className = 'canvas-area tool-' + s.activeTool + (isolated ? ' isolation-active' : '');
    this.statusTool.textContent = TOOL_LABELS[s.activeTool] || s.activeTool;
  }

  _wire() {
    document.querySelectorAll('.tool').forEach(b => {
      b.onclick = () => this.setActive(b.dataset.tool);
    });

    store.subscribe((_, reason) => {
      if (reason === 'tool' || reason === 'undo' || reason === 'redo') this._updateUI();
    });

    // Pointer dispatch
    this.area.addEventListener('pointerdown', this._onDown.bind(this));
    window.addEventListener('pointermove',   this._onMove.bind(this));
    window.addEventListener('pointerup',     this._onUp.bind(this));

    this._updateUI();
  }

  _isPanGesture(e) {
    return e.button === 1 || (e.button === 0 && (e.code === 'Space' || store.get().activeTool === 'hand' || e.shiftKey && false))
      || (e.button === 0 && this.area.classList.contains('tool-hand'));
  }

  _onDown(e) {
    // Pan if hand tool active or spacebar held
    const handMode = store.get().activeTool === 'hand' || this.area.classList.contains('tool-hand');
    if (e.button === 1 || (handMode && e.button === 0)) {
      this._panning = { x: e.clientX, y: e.clientY };
      this.area.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const pt = artboard.screenToArtboard(e.clientX, e.clientY);
    const name = store.get().activeTool;
    let snapped = artboard.snapPoint(pt);

    if (SMART_SNAP_TOOLS.has(name) && store.get().guides.enabled) {
      const { pt: sPt, guides, snapAnchor, midpointMarkers } = computeDrawSnap(pt);
      snapped = sPt;
      renderGuides(guides, midpointMarkers);
      if (snapAnchor) renderSnapHighlight(snapAnchor);
      else clearSnapHighlight();
    }

    const h = this.handlers.get(name);
    this._activeHandler = h || null;
    if (h?.onDown) h.onDown({ raw: pt, snap: snapped, event: e });
  }

  _onMove(e) {
    if (this._panning) {
      const dx = e.clientX - this._panning.x;
      const dy = e.clientY - this._panning.y;
      this._panning.x = e.clientX;
      this._panning.y = e.clientY;
      artboard.panBy(dx, dy);
      return;
    }
    const pt = artboard.screenToArtboard(e.clientX, e.clientY);
    const name = store.get().activeTool;
    let snapped = artboard.snapPoint(pt);

    if (SMART_SNAP_TOOLS.has(name) && store.get().guides.enabled) {
      const excludeIds = this._activeHandler ? new Set(store.get().selection) : new Set();
      const { pt: sPt, guides, snapAnchor, midpointMarkers } = computeDrawSnap(pt, excludeIds);
      snapped = sPt;
      renderGuides(guides, midpointMarkers);
      if (snapAnchor) renderSnapHighlight(snapAnchor);
      else clearSnapHighlight();
    } else if (!SMART_SNAP_TOOLS.has(name)) {
      clearSnapHighlight();
    }

    if (this._activeHandler?.onMove) this._activeHandler.onMove({ raw: pt, snap: snapped, event: e });
    else {
      const h = this.handlers.get(name);
      if (h?.onHover) h.onHover({ raw: pt, snap: snapped, event: e });
    }
  }

  _onUp(e) {
    if (this._panning) {
      this._panning = null;
      this.area.classList.remove('panning');
      return;
    }
    const pt = artboard.screenToArtboard(e.clientX, e.clientY);
    const snapped = artboard.snapPoint(pt);
    if (SMART_SNAP_TOOLS.has(store.get().activeTool)) {
      clearGuides();
      clearSnapHighlight();
    }
    if (this._activeHandler?.onUp) this._activeHandler.onUp({ raw: pt, snap: snapped, event: e });
    this._activeHandler = null;
  }
}

export const tools = new Tools();
