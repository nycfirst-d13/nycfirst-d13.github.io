// =============================================================================
// select.js — selection, transform handles, marquee, direct-select anchors
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { svgNS, setAttrs, rotatePoint, rotatedCorners, rectToPathData, getPathCornerInfos, getPolyCornerInfos, deepCloneWithNewIds } from './utils.js';
import { computeSnap, computePointSnap, renderGuides, clearGuides } from './guides.js';
import { enterTextEdit } from './shapes.js';
import { enterIsolation, exitIsolation } from './group.js';

const HANDLE_SIZE  = 8;     // CSS px
const ROT_OFFSET   = 22;    // CSS px above bbox
const ANCHOR_SIZE  = 7;
const CW_R         = 3.5;   // corner-widget circle radius, CSS px
const CW_MIN       = 16;    // corner-widget minimum inset from vertex, CSS px

function px(v) { return v / store.get().viewport.zoom; } // convert CSS px -> artboard px

// =============== Marquee + hit testing ==============================

function hitShape(clientX, clientY) {
  const overlayEl = document.getElementById('overlay');
  const nodes = document.elementsFromPoint(clientX, clientY);
  for (const node of nodes) {
    // Skip overlay elements (handles, anchors, CP circles, etc.)
    if (overlayEl && (node === overlayEl || overlayEl.contains(node))) continue;
    let el = node;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.id) return resolveHitId(el.dataset.id);
      el = el.parentNode;
    }
  }
  return null;
}

// Walk up parent groups to find the effective selection target, respecting isolation mode.
function resolveHitId(id) {
  const s = store.get();
  let currentId = id;
  for (;;) {
    const sh = store.findShape(currentId);
    if (!sh || sh.locked) return null;
    const parent = store.findParentGroup(currentId);
    // top-level (null) or not found anywhere (undefined) → return as-is
    if (parent === null || parent === undefined) return currentId;
    if (parent.locked) return null;
    // Stop at the isolation boundary — return the direct child inside isolation
    if (s.isolationGroup === parent.id) return currentId;
    currentId = parent.id;
  }
}

function isInsideIsolationGroup(hitId, isolationGroupId) {
  if (!hitId) return false;
  // Clicking the group's own catcher (returns group id) counts as inside
  if (hitId === isolationGroupId) return true;
  let id = hitId;
  for (;;) {
    const parent = store.findParentGroup(id);
    if (parent === null || parent === undefined) return false;
    if (parent.id === isolationGroupId) return true;
    id = parent.id;
  }
}

function bboxIntersects(b, a) {
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

// Double-click detection — native dblclick unreliable because _renderShapes()
// rebuilds the DOM between the two clicks, changing the target element.
let _lastDownTime = 0;
let _lastDownId = null;

// =============== Select tool ==============================
tools.register('select', {
  onDown({ raw, event }) {
    const s0 = store.get();

    // Custom double-click: detect before DOM can be rebuilt by the first click's patch
    const preHit = hitShape(event.clientX, event.clientY);
    const now = Date.now();
    if ((now - _lastDownTime) < 400 && preHit && preHit === _lastDownId) {
      _lastDownTime = 0; _lastDownId = null;
      const sh = store.findShape(preHit);
      if (sh?.type === 'group') { enterIsolation(preHit); return; }
      if (sh?.type === 'text') {
        store.patch(st => st.selection = [sh.id], 'selection');
        enterTextEdit(sh.id);
        return;
      }
    }
    _lastDownTime = now;
    _lastDownId = preHit;

    // Exit isolation if click lands outside the isolated group
    if (s0.isolationGroup) {
      const testHit = hitShape(event.clientX, event.clientY);
      if (!isInsideIsolationGroup(testHit, s0.isolationGroup)) {
        exitIsolation();
        // Fall through — existing hit-test logic below re-runs with isolation cleared
      }
    }

    // Corner widget?
    const cwEl = event.target.closest?.('[data-corner-widget]');
    if (cwEl) {
      const [shapeId, cornerName] = cwEl.dataset.cornerWidget.split(':');
      const sh = store.findShape(shapeId);
      if (sh?.type === 'rect') {
        store.beginTransaction();
        this._mode = 'corner-round';
        this._cwShapeId = shapeId;
        this._cwCorner = cornerName;
        this._cwStartPt = raw;
        this._cwOrigRx = sh.attrs[`r_${cornerName}`] ?? sh.attrs.rx ?? 0;
        this._cwMaxRx = Math.min(sh.attrs.w, sh.attrs.h) / 2;
        selectCWActive = cornerName;
      } else if (sh?.type === 'path') {
        const cornerIdx = parseInt(cornerName, 10);
        const info = getPathCornerInfos(sh.attrs.d || '').find(c => c.idx === cornerIdx);
        if (info) {
          store.beginTransaction();
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwOrigRx = sh.attrs.corners?.[cornerIdx] ?? 0;
          this._cwMaxRx = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          selectCWActive = cornerName;
        }
      } else if (sh?.type === 'polygon') {
        const vtxIdx = parseInt(cornerName, 10);
        const info = getPolyCornerInfos(artboard._polyPoints(sh.attrs)).find(c => c.idx === vtxIdx);
        if (info) {
          store.beginTransaction();
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwOrigRx = sh.attrs.cornerRadius ?? 0;
          this._cwMaxRx = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          selectCWActive = cornerName;
        }
      } else if (sh?.type === 'star') {
        const vtxIdx = parseInt(cornerName, 10);
        const info = getPolyCornerInfos(artboard._starPoints(sh.attrs)).find(c => c.idx === vtxIdx);
        if (info) {
          const isOuter = vtxIdx % 2 === 0;
          store.beginTransaction();
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwIsOuter = isOuter;
          this._cwOrigRx = isOuter ? (sh.attrs.outerCornerR ?? 0) : (sh.attrs.innerCornerR ?? 0);
          this._cwMaxRx = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          selectCWActive = cornerName;
        }
      }
      return;
    }

    const hit = hitShape(event.clientX, event.clientY);
    // Was the click on a handle?
    const handleEl = event.target.closest && event.target.closest('[data-handle]');
    if (handleEl) {
      this._beginHandle(handleEl.dataset.handle, raw, event);
      return;
    }

    if (hit) {
      const s = store.get();
      // In isolation mode, clicking the isolated group's background catcher = deselect
      if (s.isolationGroup && hit === s.isolationGroup) {
        if (!event.shiftKey) store.patch(st => st.selection = [], 'selection');
        this._beginMarquee(raw);
      } else if (event.shiftKey) {
        if (s.selection.includes(hit)) {
          store.patch(st => st.selection = st.selection.filter(id => id !== hit), 'selection');
        } else {
          store.patch(st => st.selection = [...st.selection, hit], 'selection');
        }
        this._beginMove(raw, event);
      } else {
        if (!s.selection.includes(hit)) {
          store.patch(st => st.selection = [hit], 'selection');
        }
        this._beginMove(raw, event);
      }
    } else {
      // Empty area → marquee
      if (!event.shiftKey) store.patch(st => st.selection = [], 'selection');
      this._beginMarquee(raw);
    }
  },
  onMove({ raw, event }) {
    if (this._mode === 'move')          this._doMove(raw, event);
    else if (this._mode === 'resize')   this._doResize(raw, event);
    else if (this._mode === 'rotate')   this._doRotate(raw, event);
    else if (this._mode === 'marquee')  this._doMarquee(raw, event);
    else if (this._mode === 'corner-round') this._doCornerRound(raw);
  },
  onUp() {
    if (this._mode && this._mode !== 'marquee') store.endTransaction(this._mode);
    if (this._mode === 'marquee') this._endMarquee();
    if (this._mode === 'corner-round') { selectCWActive = null; renderOverlay(); }
    _isDragging = false;
    clearGuides();
    this._mode = null;
    this._origs = null;
    this._movingBbox = null;
  },
  // ---- Move ----
  _beginMove(raw, event) {
    const s = store.get();
    if (!s.selection.length) return;

    if (event?.altKey) {
      // Clone selected shapes and drag the copies
      const origIds = [...s.selection];
      const clones = origIds.map(id => deepCloneWithNewIds(store.findShape(id)));
      store.commit(st => {
        if (st.isolationGroup) {
          const grp = _findShapeInTree(st.shapes, st.isolationGroup);
          if (grp?.type === 'group') {
            for (const clone of clones) grp.children.push(clone);
          }
        } else {
          for (const clone of clones) st.shapes.push(clone);
        }
        st.selection = clones.map(c => c.id);
      }, 'duplicate');
    }

    _isDragging = true;
    store.beginTransaction();
    this._mode = 'move';
    this._startPt = raw;
    const sel = store.get().selection;
    this._origs = sel.map(id => ({ id, snap: snapshotGeom(store.findShape(id)) }));
    const shapes = sel.map(id => store.findShape(id)).filter(Boolean);
    this._movingBbox = computeCompoundBBox(shapes);
  },
  _doMove(raw, event) {
    const dx = raw.x - this._startPt.x;
    const dy = raw.y - this._startPt.y;
    let sx = dx, sy = dy;
    const s = store.get();
    if (s.guides?.enabled) {
      const result = computeSnap(this._movingBbox, dx, dy);
      sx = result.dx; sy = result.dy;
      renderGuides(result.guides, result.midpointMarkers);
    } else if (s.grid.snap && this._origs.length) {
      clearGuides();
      const first = this._origs[0];
      const ref = referencePoint(first.snap);
      const newRef = artboard.snapPoint({ x: ref.x + dx, y: ref.y + dy });
      sx = newRef.x - ref.x; sy = newRef.y - ref.y;
    } else {
      clearGuides();
    }
    if (event.shiftKey) { // axis lock
      if (Math.abs(sx) > Math.abs(sy)) sy = 0; else sx = 0;
    }
    store.patch(() => {
      for (const o of this._origs) {
        const sh = store.findShape(o.id);
        if (!sh) continue;
        translateShape(sh, o.snap, sx, sy);
      }
    }, 'transform');
  },

  // ---- Handle resize / rotate ----
  _beginHandle(handle, raw, event) {
    const s = store.get();
    const shapes = s.selection.map(id => store.findShape(id)).filter(Boolean);
    if (!shapes.length) return;
    // Rotation only available for single shape
    if (handle === 'rot' && shapes.length !== 1) return;
    store.beginTransaction();
    if (handle === 'rot') {
      const sh = shapes[0];
      this._mode = 'rotate';
      const b = artboard.getShapeBBox(sh);
      this._rotCenter = { x: b.x + b.w/2, y: b.y + b.h/2 };
      this._rotStartAngle = Math.atan2(raw.y - this._rotCenter.y, raw.x - this._rotCenter.x) * 180/Math.PI;
      this._rotOrig = sh.rotation || 0;
      this._target = sh;
    } else if (shapes.length === 1) {
      const sh = shapes[0];
      this._mode = 'resize';
      this._handle = handle;
      this._startPt = raw;
      this._target = sh;
      this._origBBox = artboard.getShapeBBox(sh);
      if (sh.type === 'group') {
        this._orig = null;
        this._origChildren = sh.children.map(c => ({
          snap: snapshotGeom(c),
          bbox: { ...artboard.getShapeBBox(c) },
        }));
      } else {
        this._orig = snapshotGeom(sh);
        this._origChildren = null;
      }
    } else {
      // Multi-select resize
      this._mode = 'resize';
      this._handle = handle;
      this._startPt = raw;
      this._target = null; // signals multi-select
      this._origBBox = computeCompoundBBox(shapes);
      this._origs = shapes.map(sh => ({
        id: sh.id,
        snap: snapshotGeom(sh),
        bbox: { ...artboard.getShapeBBox(sh) },
      }));
    }
  },
  _doResize(raw, event) {
    const b = this._origBBox;
    const h = this._handle;
    const right = b.x + b.w, bottom = b.y + b.h;
    const st = store.get();
    const selSet = new Set(st.selection);

    if (this._target) {
      // Single shape
      const sh = this._target;
      const rot = sh.rotation || 0;
      const cx = b.x + b.w/2, cy = b.y + b.h/2;
      const local = rot ? rotatePoint(raw.x, raw.y, cx, cy, -rot) : raw;
      let snapped;
      if (st.guides?.enabled) {
        const result = computePointSnap(local, selSet);
        snapped = result.pt;
        renderGuides(result.guides, result.midpointMarkers);
      } else {
        clearGuides();
        snapped = artboard.snapPoint(local);
      }

      let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
      if (h.includes('w')) { nx = snapped.x; nw = right - snapped.x; }
      if (h.includes('e')) { nw = snapped.x - b.x; }
      if (h.includes('n')) { ny = snapped.y; nh = bottom - snapped.y; }
      if (h.includes('s')) { nh = snapped.y - b.y; }

      if (event.shiftKey && h.length === 2) {
        const ratio = b.w / b.h;
        if (Math.abs(nw / nh) > ratio) nh = nw / ratio * Math.sign(nh || 1);
        else nw = nh * ratio * Math.sign(nw || 1);
        if (h.includes('w')) nx = right - nw;
        if (h.includes('n')) ny = bottom - nh;
      }
      if (nw < 0) { nx = nx + nw; nw = -nw; }
      if (nh < 0) { ny = ny + nh; nh = -nh; }

      if (sh.type === 'group') {
        // Scale group children proportionally using pre-captured snapshots
        const ob = this._origBBox;
        const gsx = Math.max(0.0001, ob.w) > 0 ? nw / Math.max(0.0001, ob.w) : 1;
        const gsy = Math.max(0.0001, ob.h) > 0 ? nh / Math.max(0.0001, ob.h) : 1;
        store.patch(() => {
          const live = store.findShape(sh.id);
          if (!live) return;
          for (let i = 0; i < (this._origChildren || []).length; i++) {
            const child = live.children[i];
            if (!child) continue;
            const { snap, bbox: cb } = this._origChildren[i];
            setGeomFromBBox(child, snap, {
              x: nx + (cb.x - ob.x) * gsx,
              y: ny + (cb.y - ob.y) * gsy,
              w: Math.max(0.0001, cb.w * gsx),
              h: Math.max(0.0001, cb.h * gsy),
            });
          }
        }, 'transform');
      } else {
        setGeomFromBBox(sh, this._orig, { x: nx, y: ny, w: nw, h: nh });
        store.patch(() => {}, 'transform');
      }
    } else {
      // Multi-select: scale all shapes proportionally within compound bbox
      let snapped;
      if (st.guides?.enabled) {
        const result = computePointSnap(raw, selSet);
        snapped = result.pt;
        renderGuides(result.guides, result.midpointMarkers);
      } else {
        clearGuides();
        snapped = artboard.snapPoint(raw);
      }
      let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
      if (h.includes('w')) { nx = snapped.x; nw = right - snapped.x; }
      if (h.includes('e')) { nw = snapped.x - b.x; }
      if (h.includes('n')) { ny = snapped.y; nh = bottom - snapped.y; }
      if (h.includes('s')) { nh = snapped.y - b.y; }
      if (nw < 0) { nx = nx + nw; nw = -nw; }
      if (nh < 0) { ny = ny + nh; nh = -nh; }
      const nb = { x: nx, y: ny, w: nw, h: nh };
      const sx = nw / Math.max(0.0001, b.w), sy = nh / Math.max(0.0001, b.h);

      store.patch(() => {
        for (const o of this._origs) {
          const sh = store.findShape(o.id);
          if (!sh) continue;
          const newShBBox = {
            x: nb.x + (o.bbox.x - b.x) * sx,
            y: nb.y + (o.bbox.y - b.y) * sy,
            w: Math.max(0.0001, o.bbox.w * sx),
            h: Math.max(0.0001, o.bbox.h * sy),
          };
          setGeomFromBBox(sh, o.snap, newShBBox);
        }
      }, 'transform');
    }
  },
  _doRotate(raw, event) {
    const sh = this._target;
    const ang = Math.atan2(raw.y - this._rotCenter.y, raw.x - this._rotCenter.x) * 180/Math.PI;
    let rot = this._rotOrig + (ang - this._rotStartAngle);
    if (event.shiftKey) rot = Math.round(rot / 15) * 15;
    rot = ((rot % 360) + 360) % 360;
    store.patch(() => {
      const live = store.findShape(sh.id);
      if (live) live.rotation = rot;
    }, 'transform');
  },

  // ---- Marquee ----
  _beginMarquee(raw) {
    this._mode = 'marquee';
    this._marqueeStart = raw;
    this._marqueeRect = makeMarquee();
    this._marqueeBaseSel = new Set(store.get().selection);
  },
  _doMarquee(raw, event) {
    const a = this._marqueeStart, b = raw;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    setAttrs(this._marqueeRect, { x, y, width: w, height: h });

    const s2 = store.get();
    const searchShapes = s2.isolationGroup
      ? (store.findShape(s2.isolationGroup)?.children ?? [])
      : s2.shapes;
    const inside = [];
    for (const sh of searchShapes) {
      if (sh.visible === false) continue;
      const bb = artboard.getShapeBBox(sh);
      let hit = false;
      if (sh.rotation) {
        const corners = rotatedCorners(bb, sh.rotation);
        const mq = { x, y, w, h };
        hit = corners.some(p => p.x >= x && p.x <= x+w && p.y >= y && p.y <= y+h)
           || bboxIntersects({ x: Math.min(...corners.map(p=>p.x)), y: Math.min(...corners.map(p=>p.y)),
                               w: Math.max(...corners.map(p=>p.x)) - Math.min(...corners.map(p=>p.x)),
                               h: Math.max(...corners.map(p=>p.y)) - Math.min(...corners.map(p=>p.y)) }, mq);
      } else {
        hit = bboxIntersects(bb, { x, y, w, h });
      }
      if (hit) inside.push(sh.id);
    }
    const sel = event.shiftKey ? [...this._marqueeBaseSel, ...inside.filter(id => !this._marqueeBaseSel.has(id))] : inside;
    store.patch(st => st.selection = sel, 'selection');
  },
  _endMarquee() {
    if (this._marqueeRect) this._marqueeRect.remove();
    this._marqueeRect = null;
  },

  _doCornerRound(raw) {
    const dx = raw.x - this._cwStartPt.x;
    const dy = raw.y - this._cwStartPt.y;
    const sh = store.findShape(this._cwShapeId);
    if (!sh) return;
    if (sh.type === 'rect') {
      const [sx, sy] = cwInward(this._cwCorner);
      const delta = (dx * sx + dy * sy) / Math.SQRT2;
      const newRx = Math.max(0, Math.min(this._cwMaxRx, this._cwOrigRx + delta));
      store.patch(s => {
        for (const id of s.selection) {
          const sh2 = s.shapes.find(x => x.id === id);
          if (sh2?.type === 'rect') {
            sh2.attrs.rx = Math.max(0, Math.min(Math.min(sh2.attrs.w, sh2.attrs.h) / 2, newRx));
            delete sh2.attrs.r_nw; delete sh2.attrs.r_ne;
            delete sh2.attrs.r_se; delete sh2.attrs.r_sw;
          }
        }
      }, 'transform');
    } else if (sh.type === 'path') {
      const delta = dx * this._cwBisX + dy * this._cwBisY;
      const newR = Math.max(0, Math.min(this._cwMaxRx, this._cwOrigRx + delta));
      const cornerIdx = parseInt(this._cwCorner, 10);
      store.patch(s => {
        const live = s.shapes.find(x => x.id === this._cwShapeId);
        if (!live || live.type !== 'path') return;
        if (!live.attrs.corners) live.attrs.corners = {};
        live.attrs.corners[cornerIdx] = newR;
      }, 'transform');
    } else if (sh.type === 'polygon') {
      const delta = dx * this._cwBisX + dy * this._cwBisY;
      const newR = Math.max(0, Math.min(this._cwMaxRx, this._cwOrigRx + delta));
      store.patch(s => {
        for (const id of s.selection) {
          const sh2 = s.shapes.find(x => x.id === id);
          if (sh2?.type === 'polygon') {
            sh2.attrs.cornerRadius = newR;
            delete sh2.attrs.cornerRadii;
          }
        }
      }, 'transform');
    } else if (sh.type === 'star') {
      const delta = dx * this._cwBisX + dy * this._cwBisY;
      const newR = Math.max(0, Math.min(this._cwMaxRx, this._cwOrigRx + delta));
      const isOuter = this._cwIsOuter;
      store.patch(s => {
        for (const id of s.selection) {
          const sh2 = s.shapes.find(x => x.id === id);
          if (sh2?.type === 'star') {
            if (isOuter) sh2.attrs.outerCornerR = newR;
            else sh2.attrs.innerCornerR = newR;
            delete sh2.attrs.cornerRadii;
          }
        }
      }, 'transform');
    }
  },

  onHover({ raw, event }) {
    const s = store.get();
    const hit = hitShape(event.clientX, event.clientY);
    const newHoverHit = hit ?? null;
    let changed = newHoverHit !== _selectHoverHitId;
    _selectHoverHitId = newHoverHit;

    if (s.selection.length !== 1) {
      if (selectHoveredId !== null) { selectHoveredId = null; changed = true; }
      if (changed) renderOverlay();
      return;
    }
    const selId = s.selection[0];
    const sh = store.findShape(selId);
    const supportsCorners = sh?.type === 'rect'
      || (sh?.type === 'path' && getPathCornerInfos(sh.attrs.d || '').length > 0)
      || sh?.type === 'polygon'
      || sh?.type === 'star';
    if (!supportsCorners) {
      if (selectHoveredId !== null) { selectHoveredId = null; changed = true; }
      if (changed) renderOverlay();
      return;
    }
    const cwEl = event.target.closest?.('[data-corner-widget]');
    const cwShapeId = cwEl ? cwEl.dataset.cornerWidget.split(':')[0] : null;
    const newHover = (hit === selId || cwShapeId === selId) ? selId : null;
    if (newHover !== selectHoveredId) { selectHoveredId = newHover; changed = true; }
    if (changed) renderOverlay();
  },

  onDeactivate() {
    selectHoveredId = null;
    selectCWActive = null;
    _selectHoverHitId = null;
    renderOverlay();
  },
});

// =============== Direct select tool ==============================
let _lastDirectDownTime = 0;
let _lastDirectDownSeg = null; // { shapeId, idx1, idx2 }

tools.register('direct', {
  onDown({ raw, event }) {
    // Bezier control point handle?
    const cpEl = event.target.closest?.('[data-cp]');
    if (cpEl) {
      const parts = cpEl.dataset.cp.split(':');
      const shapeId = parts[0], segIdx = parseInt(parts[1]), role = parts[2];
      this._mode = 'cp';
      this._cpShapeId = shapeId;
      this._cpSegIdx = segIdx;
      this._cpRole = role;
      this._rawStart = raw;
      this._snapStart = artboard.snapPoint(raw);
      const sh = store.findShape(shapeId);
      this._cpOrigSegs = sh?.type === 'path' ? _parseAllPathSegs(sh.attrs.d) : null;
      this._cpOrigRot = sh?.rotation || 0;
      store.beginTransaction();
      return;
    }

    // Corner widget?
    const cwEl = event.target.closest?.('[data-corner-widget]');
    if (cwEl) {
      const [shapeId, cornerName] = cwEl.dataset.cornerWidget.split(':');
      const sh = store.findShape(shapeId);
      if (sh?.type === 'rect') {
        this._mode = 'corner-round';
        this._cwShapeId = shapeId;
        this._cwCorner = cornerName;
        this._cwStartPt = raw;
        this._cwOrigR = sh.attrs[`r_${cornerName}`] ?? sh.attrs.rx ?? 0;
        this._cwMaxR = Math.min(sh.attrs.w, sh.attrs.h) / 2;
        directCWActiveCorner = cornerName;
        store.beginTransaction();
      } else if (sh?.type === 'path') {
        const cornerIdx = parseInt(cornerName, 10);
        const info = getPathCornerInfos(sh.attrs.d || '').find(c => c.idx === cornerIdx);
        if (info) {
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwOrigR = sh.attrs.corners?.[cornerIdx] ?? 0;
          this._cwMaxR = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          directCWActiveCorner = cornerName;
          store.beginTransaction();
        }
      } else if (sh?.type === 'polygon') {
        const vtxIdx = parseInt(cornerName, 10);
        const info = getPolyCornerInfos(artboard._polyPoints(sh.attrs)).find(c => c.idx === vtxIdx);
        if (info) {
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwOrigR = sh.attrs.cornerRadii?.[vtxIdx] ?? sh.attrs.cornerRadius ?? 0;
          this._cwMaxR = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          directCWActiveCorner = cornerName;
          store.beginTransaction();
        }
      } else if (sh?.type === 'star') {
        const vtxIdx = parseInt(cornerName, 10);
        const info = getPolyCornerInfos(artboard._starPoints(sh.attrs)).find(c => c.idx === vtxIdx);
        if (info) {
          const isOuter = vtxIdx % 2 === 0;
          this._mode = 'corner-round';
          this._cwShapeId = shapeId;
          this._cwCorner = cornerName;
          this._cwStartPt = raw;
          this._cwIsOuter = isOuter;
          this._cwOrigR = sh.attrs.cornerRadii?.[vtxIdx] ?? (isOuter ? (sh.attrs.outerCornerR ?? 0) : (sh.attrs.innerCornerR ?? 0));
          this._cwMaxR = info.maxR;
          this._cwBisX = info.bisX;
          this._cwBisY = info.bisY;
          directCWActiveCorner = cornerName;
          store.beginTransaction();
        }
      }
      return;
    }

    const handleEl = event.target.closest && event.target.closest('[data-anchor]');
    if (handleEl) {
      const [shapeId, idxStr] = handleEl.dataset.anchor.split(':');
      const idx = parseInt(idxStr, 10);
      const already = selectedAnchors.findIndex(a => a.shapeId === shapeId && a.idx === idx);

      if (event.shiftKey) {
        if (already >= 0) {
          selectedAnchors = selectedAnchors.filter((_, i) => i !== already);
          renderOverlay();
          return;
        }
        selectedAnchors = [...selectedAnchors, { shapeId, idx }];
      } else {
        if (already < 0) selectedAnchors = [{ shapeId, idx }];
        // already selected — keep all so multi-anchor drag works
      }

      this._mode = 'anchor';
      this._rawStart = raw;
      this._snapStart = artboard.snapPoint(raw);
      store.beginTransaction();

      this._origsByShape = new Map();
      for (const a of selectedAnchors) {
        if (!this._origsByShape.has(a.shapeId)) {
          const sh = store.findShape(a.shapeId);
          if (sh) this._origsByShape.set(a.shapeId, snapshotGeom(sh));
        }
      }
      renderOverlay();
      return;
    }

    const hit = hitShape(event.clientX, event.clientY);

    // Exit isolation if click lands on a shape outside the isolated group
    if (hit && store.get().isolationGroup && !isInsideIsolationGroup(hit, store.get().isolationGroup)) {
      exitIsolation();
      return;
    }

    // In isolation mode, clicking the group's own background catcher = treat as empty space
    const { isolationGroup } = store.get();
    const effectiveHit = (isolationGroup && hit === isolationGroup) ? null : hit;

    // Segment click on already-selected shape body
    if (effectiveHit && store.get().selection[0] === effectiveHit) {
      const sh = store.findShape(effectiveHit);
      const seg = sh ? findNearestSegment(sh, raw) : null;
      if (seg) {
        // Custom double-click detection (event.detail unreliable — DOM rebuilds between clicks)
        const now = Date.now();
        const prev = _lastDirectDownSeg;
        const isDouble = sh.type === 'path'
          && (now - _lastDirectDownTime) < 400
          && prev?.shapeId === effectiveHit
          && prev?.idx1 === seg.idx1
          && prev?.idx2 === seg.idx2;
        _lastDirectDownTime = now;
        _lastDirectDownSeg = { shapeId: effectiveHit, idx1: seg.idx1, idx2: seg.idx2 };
        if (isDouble) {
          _lastDirectDownTime = 0; _lastDirectDownSeg = null;
          _toggleSegmentCurve(effectiveHit, seg.idx1, seg.idx2);
          return;
        }
        hoveredSegment = null;
        selectedAnchors = [
          { shapeId: effectiveHit, idx: seg.idx1 },
          { shapeId: effectiveHit, idx: seg.idx2 },
        ];
        this._mode = 'anchor';
        this._rawStart = raw;
        this._snapStart = artboard.snapPoint(raw);
        store.beginTransaction();
        this._origsByShape = new Map();
        const shNow = store.findShape(effectiveHit);
        if (shNow) this._origsByShape.set(effectiveHit, snapshotGeom(shNow));
        renderOverlay();
        return;
      }
    }

    if (effectiveHit) {
      if (store.get().selection[0] !== effectiveHit) selectedAnchors = [];
      store.patch(st => st.selection = [effectiveHit], 'selection');
    } else if (store.get().selection.length) {
      // Anchor marquee
      this._mode = 'marquee';
      this._marqueeStart = raw;
      this._marqueeRect = makeMarquee();
      this._anchorBase = event.shiftKey ? [...selectedAnchors] : [];
      if (!event.shiftKey) { selectedAnchors = []; renderOverlay(); }
    } else {
      store.patch(st => st.selection = [], 'selection');
    }
  },

  onMove({ raw, event }) {
    if (this._mode === 'corner-round') {
      const dx = raw.x - this._cwStartPt.x;
      const dy = raw.y - this._cwStartPt.y;
      const shLive = store.findShape(this._cwShapeId);
      if (shLive?.type === 'rect') {
        const [sx, sy] = cwInward(this._cwCorner);
        const delta = (dx * sx + dy * sy) / Math.SQRT2;
        const newR = Math.max(0, Math.min(this._cwMaxR, this._cwOrigR + delta));
        store.patch(() => {
          const live = store.findShape(this._cwShapeId);
          if (!live || live.type !== 'rect') return;
          live.attrs[`r_${this._cwCorner}`] = newR;
        }, 'transform');
      } else if (shLive?.type === 'path') {
        const delta = dx * this._cwBisX + dy * this._cwBisY;
        const newR = Math.max(0, Math.min(this._cwMaxR, this._cwOrigR + delta));
        const cornerIdx = parseInt(this._cwCorner, 10);
        store.patch(() => {
          const live = store.findShape(this._cwShapeId);
          if (!live || live.type !== 'path') return;
          if (!live.attrs.corners) live.attrs.corners = {};
          live.attrs.corners[cornerIdx] = newR;
        }, 'transform');
      } else if (shLive?.type === 'polygon') {
        const delta = dx * this._cwBisX + dy * this._cwBisY;
        const newR = Math.max(0, Math.min(this._cwMaxR, this._cwOrigR + delta));
        const vtxIdx = parseInt(this._cwCorner, 10);
        store.patch(() => {
          const live = store.findShape(this._cwShapeId);
          if (!live || live.type !== 'polygon') return;
          if (!live.attrs.cornerRadii) live.attrs.cornerRadii = {};
          live.attrs.cornerRadii[vtxIdx] = newR;
        }, 'transform');
      } else if (shLive?.type === 'star') {
        const delta = dx * this._cwBisX + dy * this._cwBisY;
        const newR = Math.max(0, Math.min(this._cwMaxR, this._cwOrigR + delta));
        const vtxIdx = parseInt(this._cwCorner, 10);
        store.patch(() => {
          const live = store.findShape(this._cwShapeId);
          if (!live || live.type !== 'star') return;
          if (!live.attrs.cornerRadii) live.attrs.cornerRadii = {};
          live.attrs.cornerRadii[vtxIdx] = newR;
        }, 'transform');
      }
      return;
    }
    if (this._mode === 'cp') {
      const s = store.get();
      let dx, dy;
      if (s.guides?.enabled) {
        const snapResult = computePointSnap(raw);
        dx = snapResult.pt.x - this._rawStart.x;
        dy = snapResult.pt.y - this._rawStart.y;
      } else {
        clearGuides();
        const snapped = artboard.snapPoint(raw);
        dx = snapped.x - this._snapStart.x;
        dy = snapped.y - this._snapStart.y;
      }
      let ldx = dx, ldy = dy;
      if (this._cpOrigRot) {
        const sh = store.findShape(this._cpShapeId);
        const ob = sh ? artboard.getShapeBBox(sh) : null;
        if (ob) {
          const ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2;
          const unrot = rotatePoint(ocx + dx, ocy + dy, ocx, ocy, -this._cpOrigRot);
          ldx = unrot.x - ocx; ldy = unrot.y - ocy;
        }
      }
      store.patch(() => {
        const sh = store.findShape(this._cpShapeId);
        if (!sh || !this._cpOrigSegs) return;
        sh.attrs.d = _rebuildPathCP(this._cpOrigSegs, this._cpSegIdx, this._cpRole, ldx, ldy);
      }, 'transform');
      return;
    }
    if (this._mode === 'anchor') {
      const s = store.get();
      let dx, dy;
      if (s.guides?.enabled) {
        const snapResult = computePointSnap(raw);
        dx = snapResult.pt.x - this._rawStart.x;
        dy = snapResult.pt.y - this._rawStart.y;
        renderGuides(snapResult.guides, snapResult.midpointMarkers);
      } else {
        clearGuides();
        const snapped = artboard.snapPoint(raw);
        dx = snapped.x - this._snapStart.x;
        dy = snapped.y - this._snapStart.y;
      }

      const byShape = new Map();
      for (const a of selectedAnchors) {
        if (!byShape.has(a.shapeId)) byShape.set(a.shapeId, []);
        byShape.get(a.shapeId).push(a.idx);
      }

      store.patch(() => {
        for (const [shapeId, idxs] of byShape) {
          const sh = store.findShape(shapeId);
          const orig = this._origsByShape.get(shapeId);
          if (!sh || !orig) continue;
          // For rotated shapes, convert the artboard-space delta to the shape's
          // local (pre-rotation) space before modifying path coordinates.
          let ldx = dx, ldy = dy;
          if (orig.rotation) {
            const ob = artboard.getShapeBBox(sh);
            const ocx = ob.x + ob.w / 2, ocy = ob.y + ob.h / 2;
            const unrot = rotatePoint(ocx + dx, ocy + dy, ocx, ocy, -orig.rotation);
            ldx = unrot.x - ocx;
            ldy = unrot.y - ocy;
          }
          applyAnchorsDelta(sh, orig, idxs, ldx, ldy);
        }
      }, 'transform');
    } else if (this._mode === 'marquee') {
      const a = this._marqueeStart, b = raw;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
      setAttrs(this._marqueeRect, { x, y, width: w, height: h });

      const s = store.get();
      const inRect = [];
      for (const id of s.selection) {
        const sh = store.findShape(id);
        if (!sh) continue;
        const rot = sh.rotation || 0;
        const bb = rot ? artboard.getShapeBBox(sh) : null;
        const rcx = bb ? bb.x + bb.w / 2 : 0, rcy = bb ? bb.y + bb.h / 2 : 0;
        const pts = anchorPoints(sh);
        for (let i = 0; i < pts.length; i++) {
          const p = rot ? rotatePoint(pts[i].x, pts[i].y, rcx, rcy, rot) : pts[i];
          if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) {
            inRect.push({ shapeId: id, idx: i });
          }
        }
      }
      const base = this._anchorBase.filter(a => !inRect.some(b => b.shapeId === a.shapeId && b.idx === a.idx));
      selectedAnchors = [...base, ...inRect];
      renderOverlay();
    }
  },

  onUp() {
    if (this._mode === 'cp') store.endTransaction('cp-move');
    if (this._mode === 'anchor') store.endTransaction('anchor-move');
    if (this._mode === 'corner-round') {
      store.endTransaction('corner-round');
      directCWActiveCorner = null;
    }
    if (this._mode === 'marquee' && this._marqueeRect) { this._marqueeRect.remove(); this._marqueeRect = null; }
    clearGuides();
    this._mode = null;
  },

  onHover({ raw, event }) {
    const s = store.get();
    const selId = s.selection[0];
    if (!selId) {
      const any = hoveredSegment || directHoveredCorner;
      hoveredSegment = null; directHoveredCorner = null;
      if (any) renderOverlay();
      return;
    }
    const hit = hitShape(event.clientX, event.clientY);
    // Segment hover
    let newSeg = null;
    if (hit === selId) {
      const sh = store.findShape(selId);
      const seg = sh ? findNearestSegment(sh, raw) : null;
      if (seg) newSeg = { shapeId: selId, idx1: seg.idx1, idx2: seg.idx2 };
    }
    // Corner hover — nearest corner vertex OR widget position within threshold
    let newCorner = null;
    const sh = store.findShape(selId);
    if (sh?.type === 'rect') {
      const z = s.viewport.zoom;
      const b = artboard.getShapeBBox(sh);
      const rot = sh.rotation || 0;
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      const threshold = 20 / z;
      const cwRadii = {
        nw: sh.attrs.r_nw ?? sh.attrs.rx ?? 0,
        ne: sh.attrs.r_ne ?? sh.attrs.rx ?? 0,
        se: sh.attrs.r_se ?? sh.attrs.rx ?? 0,
        sw: sh.attrs.r_sw ?? sh.attrs.rx ?? 0,
      };
      const candidates = [
        { name: 'nw', x: b.x,       y: b.y       },
        { name: 'ne', x: b.x + b.w, y: b.y       },
        { name: 'se', x: b.x + b.w, y: b.y + b.h },
        { name: 'sw', x: b.x,       y: b.y + b.h },
        ...cwPositions(b, cwRadii, z).map(w => ({ name: w.name, x: w.cx, y: w.cy })),
      ];
      let minDist = Infinity, bestName = null;
      for (const { name, x, y } of candidates) {
        const vp = rot ? rotatePoint(x, y, bcx, bcy, rot) : { x, y };
        const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
        if (d < minDist) { minDist = d; bestName = name; }
      }
      if (minDist <= threshold) newCorner = { shapeId: selId, name: bestName };
    } else if (sh?.type === 'path' && sh.attrs.d) {
      const z = s.viewport.zoom;
      const b = artboard.getShapeBBox(sh);
      const rot = sh.rotation || 0;
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      const threshold = 20 / z;
      const infos = getPathCornerInfos(sh.attrs.d);
      let minDist = Infinity, bestName = null;
      for (const info of infos) {
        const radius = sh.attrs.corners?.[info.idx] ?? 0;
        const inset = Math.max(CW_MIN / z, radius);
        const wx = info.x + info.bisX * inset, wy = info.y + info.bisY * inset;
        for (const pos of [{ x: info.x, y: info.y }, { x: wx, y: wy }]) {
          const vp = rot ? rotatePoint(pos.x, pos.y, bcx, bcy, rot) : pos;
          const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
          if (d < minDist) { minDist = d; bestName = String(info.idx); }
        }
      }
      if (minDist <= threshold) newCorner = { shapeId: selId, name: bestName };
    } else if (sh?.type === 'polygon') {
      const z = s.viewport.zoom;
      const b = artboard.getShapeBBox(sh);
      const rot = sh.rotation || 0;
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      const threshold = 20 / z;
      const infos = getPolyCornerInfos(artboard._polyPoints(sh.attrs));
      let minDist = Infinity, bestName = null;
      for (const info of infos) {
        const radius = sh.attrs.cornerRadii?.[info.idx] ?? sh.attrs.cornerRadius ?? 0;
        const inset = Math.max(CW_MIN / z, radius);
        const wx = info.x + info.bisX * inset, wy = info.y + info.bisY * inset;
        for (const pos of [{ x: info.x, y: info.y }, { x: wx, y: wy }]) {
          const vp = rot ? rotatePoint(pos.x, pos.y, bcx, bcy, rot) : pos;
          const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
          if (d < minDist) { minDist = d; bestName = String(info.idx); }
        }
      }
      if (minDist <= threshold) newCorner = { shapeId: selId, name: bestName };
    } else if (sh?.type === 'star') {
      const z = s.viewport.zoom;
      const b = artboard.getShapeBBox(sh);
      const rot = sh.rotation || 0;
      const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
      const threshold = 20 / z;
      const infos = getPolyCornerInfos(artboard._starPoints(sh.attrs));
      let minDist = Infinity, bestName = null;
      for (const info of infos) {
        const isOuter = info.idx % 2 === 0;
        const radius = sh.attrs.cornerRadii?.[info.idx] ?? (isOuter ? (sh.attrs.outerCornerR ?? 0) : (sh.attrs.innerCornerR ?? 0));
        const inset = Math.max(CW_MIN / z, radius);
        const wx = info.x + info.bisX * inset, wy = info.y + info.bisY * inset;
        for (const pos of [{ x: info.x, y: info.y }, { x: wx, y: wy }]) {
          const vp = rot ? rotatePoint(pos.x, pos.y, bcx, bcy, rot) : pos;
          const d = Math.hypot(raw.x - vp.x, raw.y - vp.y);
          if (d < minDist) { minDist = d; bestName = String(info.idx); }
        }
      }
      if (minDist <= threshold) newCorner = { shapeId: selId, name: bestName };
    }
    const segChanged = newSeg?.idx1 !== hoveredSegment?.idx1
                    || newSeg?.idx2 !== hoveredSegment?.idx2
                    || newSeg?.shapeId !== hoveredSegment?.shapeId;
    const cornerChanged = newCorner?.name !== directHoveredCorner?.name
                       || newCorner?.shapeId !== directHoveredCorner?.shapeId;
    if (segChanged || cornerChanged) {
      hoveredSegment = newSeg;
      directHoveredCorner = newCorner;
      renderOverlay();
    }
  },

  onDeactivate() {
    hoveredSegment = null;
    directHoveredCorner = null;
    directCWActiveCorner = null;
    renderOverlay();
  },
});

// =============== Corner-widget helpers ==============================
// Returns inward unit direction [sx, sy] for a named corner
function cwInward(name) {
  return name === 'nw' ? [1,1] : name === 'ne' ? [-1,1] : name === 'se' ? [-1,-1] : [1,-1];
}

// Returns [{name, cx, cy}] corner widget positions for a bbox + per-corner radii
function cwPositions(b, radii, z) {
  const rawMin = CW_MIN / z;
  const min = Math.min(rawMin, b.w / 4, b.h / 4);
  const r = typeof radii === 'number'
    ? { nw: radii, ne: radii, se: radii, sw: radii }
    : (radii || {});
  return [
    { name: 'nw', cx: b.x       + Math.max(r.nw || 0, min), cy: b.y       + Math.max(r.nw || 0, min) },
    { name: 'ne', cx: b.x + b.w - Math.max(r.ne || 0, min), cy: b.y       + Math.max(r.ne || 0, min) },
    { name: 'se', cx: b.x + b.w - Math.max(r.se || 0, min), cy: b.y + b.h - Math.max(r.se || 0, min) },
    { name: 'sw', cx: b.x       + Math.max(r.sw || 0, min), cy: b.y + b.h - Math.max(r.sw || 0, min) },
  ];
}


// =============== Overlay rendering ==============================
const overlay = document.getElementById('overlay');
let selectedAnchors = []; // [{shapeId, idx}] — direct select anchor state
let hoveredSegment = null; // {shapeId, idx1, idx2} | null
let selectHoveredId = null;     // select-tool: shape id under cursor (corner widget visibility)
let selectCWActive = null;      // corner name being dragged in select tool
let directCWActiveCorner = null; // corner name being dragged in direct select tool
let directHoveredCorner = null; // { shapeId, name } | null — nearest corner under cursor in direct tool
let _altHeld = false;           // whether Alt is currently pressed
let _selectHoverHitId = null;   // shape id under cursor in select tool (any shape, not just selected)
let _isDragging = false;        // true while a move drag is in progress

function _drawAltCloneIndicator(s) {
  if (!_altHeld || !_selectHoverHitId || s.activeTool !== 'select' || _isDragging) return;
  const hsh = store.findShape(_selectHoverHitId);
  if (!hsh) return;
  // If hovering a selected shape, center '+' on compound bbox of entire selection
  let hcx, hcy;
  if (s.selection.includes(_selectHoverHitId) && s.selection.length > 1) {
    const shapes = s.selection.map(id => store.findShape(id)).filter(Boolean);
    const cb = computeCompoundBBox(shapes);
    hcx = cb.x + cb.w / 2; hcy = cb.y + cb.h / 2;
  } else {
    const hb = artboard.getShapeBBox(hsh);
    hcx = hb.x + hb.w / 2; hcy = hb.y + hb.h / 2;
  }
  const z = s.viewport.zoom;
  const arm = 6 / z, sw = 1.5 / z;
  const h = svgNS('line');
  setAttrs(h, { x1: hcx - arm, y1: hcy, x2: hcx + arm, y2: hcy,
    stroke: '#888', 'stroke-width': sw, 'pointer-events': 'none' });
  const v = svgNS('line');
  setAttrs(v, { x1: hcx, y1: hcy - arm, x2: hcx, y2: hcy + arm,
    stroke: '#888', 'stroke-width': sw, 'pointer-events': 'none' });
  overlay.appendChild(h);
  overlay.appendChild(v);
}

function renderOverlay() {
  overlay.replaceChildren();
  const s = store.get();

  if (!s.selection.length) {
    _drawAltCloneIndicator(s);
    return;
  }

  if (s.activeTool === 'direct' && s.selection.length === 1) {
    drawAnchors(s.selection[0]);
    return;
  }

  // Bounding box (multi or single)
  const bboxes = s.selection.map(id => {
    const sh = store.findShape(id);
    const b = artboard.getShapeBBox(sh);
    return { sh, b };
  }).filter(x => x.sh);

  if (s.selection.length === 1) {
    drawSingleSelection(bboxes[0].sh, bboxes[0].b);
  } else {
    drawMultiSelection(bboxes);
  }

  _drawAltCloneIndicator(s);
}

function drawSingleSelection(sh, b) {
  const z = store.get().viewport.zoom;
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  const g = svgNS('g');
  if (sh.rotation) g.setAttribute('transform', `rotate(${sh.rotation} ${cx} ${cy})`);
  // Box
  const box = svgNS('rect');
  const boxClass = sh.type === 'group' ? 'sel-box sel-box-group' : 'sel-box';
  setAttrs(box, { x: b.x, y: b.y, width: b.w, height: b.h, class: boxClass });
  g.appendChild(box);
  // Handles at 8 positions
  const hs = HANDLE_SIZE / z;
  const positions = [
    ['nw', b.x,           b.y],
    ['n',  b.x + b.w/2,   b.y],
    ['ne', b.x + b.w,     b.y],
    ['e',  b.x + b.w,     b.y + b.h/2],
    ['se', b.x + b.w,     b.y + b.h],
    ['s',  b.x + b.w/2,   b.y + b.h],
    ['sw', b.x,           b.y + b.h],
    ['w',  b.x,           b.y + b.h/2],
  ];
  for (const [name, x, y] of positions) {
    const r = svgNS('rect');
    setAttrs(r, { x: x - hs/2, y: y - hs/2, width: hs, height: hs, class: `handle ${name}` });
    r.dataset.handle = name;
    g.appendChild(r);
  }
  // Rotation handle
  const rot = svgNS('circle');
  const rotY = b.y - (ROT_OFFSET / z);
  setAttrs(rot, { cx: b.x + b.w/2, cy: rotY, r: hs * 0.6, class: 'handle handle-rot' });
  rot.dataset.handle = 'rot';
  const arm = svgNS('line');
  setAttrs(arm, { x1: b.x + b.w/2, y1: b.y, x2: b.x + b.w/2, y2: rotY, class: 'sel-box' });
  g.appendChild(arm);
  g.appendChild(rot);

  // Corner widgets — visible on hover or while dragging
  if (selectHoveredId === sh.id || selectCWActive !== null) {
    const cwr = CW_R / z;
    if (sh.type === 'rect') {
      const cwRadii = {
        nw: sh.attrs.r_nw ?? sh.attrs.rx ?? 0,
        ne: sh.attrs.r_ne ?? sh.attrs.rx ?? 0,
        se: sh.attrs.r_se ?? sh.attrs.rx ?? 0,
        sw: sh.attrs.r_sw ?? sh.attrs.rx ?? 0,
      };
      for (const w of cwPositions(b, cwRadii, z)) {
        const isActive = selectCWActive === w.name;
        const c = svgNS('circle');
        setAttrs(c, { cx: w.cx, cy: w.cy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
        c.dataset.cornerWidget = `${sh.id}:${w.name}`;
        g.appendChild(c);
      }
    } else if (sh.type === 'path' && sh.attrs.d) {
      for (const info of getPathCornerInfos(sh.attrs.d)) {
        const radius = sh.attrs.corners?.[info.idx] ?? 0;
        const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
        const inset = Math.max(CW_MIN / z, fitInset, radius);
        // g already has rotation transform applied, so use pre-rotation coords
        const wcx = info.x + info.bisX * inset;
        const wcy = info.y + info.bisY * inset;
        const strIdx = String(info.idx);
        const isActive = selectCWActive === strIdx;
        const c = svgNS('circle');
        setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
        c.dataset.cornerWidget = `${sh.id}:${info.idx}`;
        g.appendChild(c);
      }
    } else if (sh.type === 'polygon') {
      for (const info of getPolyCornerInfos(artboard._polyPoints(sh.attrs))) {
        const radius = sh.attrs.cornerRadii?.[info.idx] ?? sh.attrs.cornerRadius ?? 0;
        const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
        const inset = Math.max(CW_MIN / z, fitInset, radius);
        const wcx = info.x + info.bisX * inset;
        const wcy = info.y + info.bisY * inset;
        const strIdx = String(info.idx);
        const isActive = selectCWActive === strIdx;
        const c = svgNS('circle');
        setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
        c.dataset.cornerWidget = `${sh.id}:${info.idx}`;
        g.appendChild(c);
      }
    } else if (sh.type === 'star') {
      for (const info of getPolyCornerInfos(artboard._starPoints(sh.attrs))) {
        const isOuter = info.idx % 2 === 0;
        const radius = sh.attrs.cornerRadii?.[info.idx] ?? (isOuter ? (sh.attrs.outerCornerR ?? 0) : (sh.attrs.innerCornerR ?? 0));
        const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
        const inset = Math.max(CW_MIN / z, fitInset, radius);
        const wcx = info.x + info.bisX * inset;
        const wcy = info.y + info.bisY * inset;
        const strIdx = String(info.idx);
        const isActive = selectCWActive === strIdx;
        const c = svgNS('circle');
        setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
        c.dataset.cornerWidget = `${sh.id}:${info.idx}`;
        g.appendChild(c);
      }
    }
  }

  overlay.appendChild(g);

  updateStatusSel();
}

function computeCompoundBBox(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const sh of shapes) {
    const b = artboard.getShapeBBox(sh);
    if (sh.rotation) {
      for (const p of rotatedCorners(b, sh.rotation)) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
    } else {
      if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w; if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawMultiSelection(items) {
  const z = store.get().viewport.zoom;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { sh, b } of items) {
    // account for rotation by using rotated corners
    if (sh.rotation) {
      const corners = rotatedCorners(b, sh.rotation);
      for (const p of corners) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    } else {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    // per-shape outline (thin)
    const o = svgNS('rect');
    setAttrs(o, { x: b.x, y: b.y, width: b.w, height: b.h, class: 'sel-box' });
    if (sh.rotation) {
      const cx = b.x + b.w/2, cy = b.y + b.h/2;
      o.setAttribute('transform', `rotate(${sh.rotation} ${cx} ${cy})`);
    }
    overlay.appendChild(o);
  }

  if (minX === Infinity) { updateStatusSel(); return; }
  const gb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const hs = HANDLE_SIZE / z;

  // Compound bbox
  const box = svgNS('rect');
  setAttrs(box, { x: gb.x, y: gb.y, width: gb.w, height: gb.h, class: 'sel-box' });
  overlay.appendChild(box);

  // 8 resize handles (no rotation handle for multi-select)
  const positions = [
    ['nw', gb.x,           gb.y],
    ['n',  gb.x + gb.w/2,  gb.y],
    ['ne', gb.x + gb.w,    gb.y],
    ['e',  gb.x + gb.w,    gb.y + gb.h/2],
    ['se', gb.x + gb.w,    gb.y + gb.h],
    ['s',  gb.x + gb.w/2,  gb.y + gb.h],
    ['sw', gb.x,           gb.y + gb.h],
    ['w',  gb.x,           gb.y + gb.h/2],
  ];
  for (const [name, x, y] of positions) {
    const r = svgNS('rect');
    setAttrs(r, { x: x - hs/2, y: y - hs/2, width: hs, height: hs, class: `handle ${name}` });
    r.dataset.handle = name;
    overlay.appendChild(r);
  }

  updateStatusSel();
}

function drawAnchors(id) {
  const sh = store.findShape(id);
  if (!sh) return;
  const z = store.get().viewport.zoom;
  const hs = ANCHOR_SIZE / z;
  const rot = sh.rotation || 0;
  const b = artboard.getShapeBBox(sh);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const pts = anchorPoints(sh);

  // Hovered segment highlight — draw before anchors so anchors render on top
  if (hoveredSegment && hoveredSegment.shapeId === id) {
    if (sh.type === 'path' && sh.attrs.d) {
      const segD = _getHoverSegPath(sh, hoveredSegment.idx1, hoveredSegment.idx2, cx, cy, rot);
      if (segD) {
        const pathEl = svgNS('path');
        setAttrs(pathEl, { d: segD, class: 'seg-hover' });
        overlay.appendChild(pathEl);
      }
    } else {
      const p1 = pts[hoveredSegment.idx1];
      const p2 = pts[hoveredSegment.idx2] || pts[0];
      if (p1 && p2) {
        const vp1 = rot ? rotatePoint(p1.x, p1.y, cx, cy, rot) : p1;
        const vp2 = rot ? rotatePoint(p2.x, p2.y, cx, cy, rot) : p2;
        const line = svgNS('line');
        setAttrs(line, { x1: vp1.x, y1: vp1.y, x2: vp2.x, y2: vp2.y, class: 'seg-hover' });
        overlay.appendChild(line);
      }
    }
  }

  // Corner widgets for path shapes
  if (sh.type === 'path' && sh.attrs.d) {
    const cwr = CW_R / z;
    for (const info of getPathCornerInfos(sh.attrs.d)) {
      const strIdx = String(info.idx);
      if (directCWActiveCorner !== null) {
        if (directCWActiveCorner !== strIdx) continue;
      } else {
        const isSelected = selectedAnchors.some(a => a.shapeId === id && a.idx === info.idx);
        const isHovCorner = directHoveredCorner?.shapeId === id && directHoveredCorner.name === strIdx;
        const isSegEnd = hoveredSegment?.shapeId === id
                      && (hoveredSegment.idx1 === info.idx || hoveredSegment.idx2 === info.idx);
        if (!isSelected && !isHovCorner && !isSegEnd) continue;
      }
      const radius = sh.attrs.corners?.[info.idx] ?? 0;
      const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
      const inset = Math.max(CW_MIN / z, fitInset, radius);
      let wcx = info.x + info.bisX * inset;
      let wcy = info.y + info.bisY * inset;
      if (rot) { const rp = rotatePoint(wcx, wcy, cx, cy, rot); wcx = rp.x; wcy = rp.y; }
      const isActive = directCWActiveCorner === strIdx;
      const c = svgNS('circle');
      setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
      c.dataset.cornerWidget = `${id}:${info.idx}`;
      overlay.appendChild(c);
    }
  }

  // Corner widgets — selective visibility per corner (rect)
  if (sh.type === 'rect') {
    const cwr = CW_R / z;
    const cnames = ['nw', 'ne', 'se', 'sw'];
    const cwb = { x: sh.attrs.x, y: sh.attrs.y, w: sh.attrs.w, h: sh.attrs.h };
    const cwcx = cwb.x + cwb.w / 2, cwcy = cwb.y + cwb.h / 2;
    const cwRadii = {
      nw: sh.attrs.r_nw ?? sh.attrs.rx ?? 0,
      ne: sh.attrs.r_ne ?? sh.attrs.rx ?? 0,
      se: sh.attrs.r_se ?? sh.attrs.rx ?? 0,
      sw: sh.attrs.r_sw ?? sh.attrs.rx ?? 0,
    };
    for (const w of cwPositions(cwb, cwRadii, z)) {
      const anchorIdx = cnames.indexOf(w.name);
      if (directCWActiveCorner) {
        // During active corner drag: only show the dragged corner
        if (directCWActiveCorner !== w.name) continue;
      } else {
        // Show if: selected anchor, hovered corner, or hovered-segment endpoint
        const isSelected = selectedAnchors.some(a => a.shapeId === id && a.idx === anchorIdx);
        const isHovCorner = directHoveredCorner?.shapeId === id && directHoveredCorner.name === w.name;
        const isSegEnd    = hoveredSegment?.shapeId === id
                         && (hoveredSegment.idx1 === anchorIdx || hoveredSegment.idx2 === anchorIdx);
        if (!isSelected && !isHovCorner && !isSegEnd) continue;
      }
      const isActive = directCWActiveCorner === w.name
        || selectedAnchors.some(a => a.shapeId === id && a.idx === anchorIdx);
      let { cx: wcx, cy: wcy } = w;
      if (rot) { const rp = rotatePoint(wcx, wcy, cwcx, cwcy, rot); wcx = rp.x; wcy = rp.y; }
      const c = svgNS('circle');
      setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
      c.dataset.cornerWidget = `${id}:${w.name}`;
      overlay.appendChild(c);
    }
  }

  // Corner widgets for polygon
  if (sh.type === 'polygon') {
    const cwr = CW_R / z;
    const infos = getPolyCornerInfos(artboard._polyPoints(sh.attrs));
    for (const info of infos) {
      const strIdx = String(info.idx);
      if (directCWActiveCorner !== null) {
        if (directCWActiveCorner !== strIdx) continue;
      } else {
        const isSelected = selectedAnchors.some(a => a.shapeId === id && a.idx === info.idx);
        const isHovCorner = directHoveredCorner?.shapeId === id && directHoveredCorner.name === strIdx;
        const isSegEnd = hoveredSegment?.shapeId === id
          && (hoveredSegment.idx1 === info.idx || hoveredSegment.idx2 === info.idx);
        if (!isSelected && !isHovCorner && !isSegEnd) continue;
      }
      const radius = sh.attrs.cornerRadii?.[info.idx] ?? sh.attrs.cornerRadius ?? 0;
      const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
      const inset = Math.max(CW_MIN / z, fitInset, radius);
      let wcx = info.x + info.bisX * inset, wcy = info.y + info.bisY * inset;
      if (rot) { const rp = rotatePoint(wcx, wcy, cx, cy, rot); wcx = rp.x; wcy = rp.y; }
      const isActive = directCWActiveCorner === strIdx;
      const c = svgNS('circle');
      setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
      c.dataset.cornerWidget = `${id}:${info.idx}`;
      overlay.appendChild(c);
    }
  }

  // Corner widgets for star (outer tips and inner valleys independently)
  if (sh.type === 'star') {
    const cwr = CW_R / z;
    const infos = getPolyCornerInfos(artboard._starPoints(sh.attrs));
    for (const info of infos) {
      const strIdx = String(info.idx);
      if (directCWActiveCorner !== null) {
        if (directCWActiveCorner !== strIdx) continue;
      } else {
        const isSelected = selectedAnchors.some(a => a.shapeId === id && a.idx === info.idx);
        const isHovCorner = directHoveredCorner?.shapeId === id && directHoveredCorner.name === strIdx;
        const isSegEnd = hoveredSegment?.shapeId === id
          && (hoveredSegment.idx1 === info.idx || hoveredSegment.idx2 === info.idx);
        if (!isSelected && !isHovCorner && !isSegEnd) continue;
      }
      const isOuter = info.idx % 2 === 0;
      const radius = sh.attrs.cornerRadii?.[info.idx] ?? (isOuter ? (sh.attrs.outerCornerR ?? 0) : (sh.attrs.innerCornerR ?? 0));
      const fitInset = info.sinHalf > 0.01 ? CW_R / (z * info.sinHalf) : CW_MIN / z;
      const inset = Math.max(CW_MIN / z, fitInset, radius);
      let wcx = info.x + info.bisX * inset, wcy = info.y + info.bisY * inset;
      if (rot) { const rp = rotatePoint(wcx, wcy, cx, cy, rot); wcx = rp.x; wcy = rp.y; }
      const isActive = directCWActiveCorner === strIdx;
      const c = svgNS('circle');
      setAttrs(c, { cx: wcx, cy: wcy, r: cwr, class: isActive ? 'corner-widget corner-widget-active' : 'corner-widget' });
      c.dataset.cornerWidget = `${id}:${info.idx}`;
      overlay.appendChild(c);
    }
  }


  for (let i = 0; i < pts.length; i++) {
    // Rotate anchor to its visual (post-rotation) position
    const p = rot ? rotatePoint(pts[i].x, pts[i].y, cx, cy, rot) : pts[i];
    const isSelected = selectedAnchors.some(a => a.shapeId === id && a.idx === i);
    const isHovered = hoveredSegment?.shapeId === id && (hoveredSegment.idx1 === i || hoveredSegment.idx2 === i);
    const r = svgNS('rect');
    const cls = isSelected ? 'anchor selected' : isHovered ? 'anchor hovered' : 'anchor';
    setAttrs(r, { x: p.x - hs/2, y: p.y - hs/2, width: hs, height: hs, class: cls });
    r.dataset.anchor = `${id}:${i}`;
    overlay.appendChild(r);
  }

  // Bezier control point handles for selected path anchors
  if (sh.type === 'path' && sh.attrs.d) {
    const selIdxs = selectedAnchors.filter(a => a.shapeId === id).map(a => a.idx);
    if (selIdxs.length) {
      const cpHs = (ANCHOR_SIZE * 0.7) / z;
      const cpList = getPathCPs(sh.attrs.d, selIdxs);
      for (const cp of cpList) {
        let px = cp.x, py = cp.y, lax = cp.ax, lay = cp.ay;
        if (rot) {
          const rp = rotatePoint(px, py, cx, cy, rot); px = rp.x; py = rp.y;
          const ra = rotatePoint(lax, lay, cx, cy, rot); lax = ra.x; lay = ra.y;
        }
        const line = svgNS('line');
        setAttrs(line, { x1: lax, y1: lay, x2: px, y2: py, class: 'anchor-handle-line', 'pointer-events': 'none' });
        overlay.appendChild(line);
        const c = svgNS('circle');
        setAttrs(c, { cx: px, cy: py, r: cpHs, class: 'anchor-handle' });
        c.dataset.cp = `${id}:${cp.segIdx}:${cp.role}`;
        overlay.appendChild(c);
      }
    }
  }
}

function rectToPath(sh) {
  const d = rectToPathData(sh.attrs);
  sh.type = 'path';
  sh.attrs = { d };
}

function applyAnchorsDelta(sh, orig, idxs, dx, dy) {
  switch (sh.type) {
    case 'rect': {
      // Anchors: 0=nw, 1=ne, 2=se, 3=sw  (matches anchorPoints order)
      const o = orig.attrs;
      const isSimple = !o.rx && !o.r_nw && !o.r_ne && !o.r_se && !o.r_sw;
      // Single corner drag, or adjacent-segment drag on a simple rect → convert to free-form path
      const s2 = idxs.length === 2 && [...idxs].sort((a, b) => a - b);
      const isAdjacentSegment = s2 && (s2[1] - s2[0] === 1 || (s2[0] === 0 && s2[1] === 3));
      if ((idxs.length === 1 || isAdjacentSegment) && isSimple) {
        const origSegs = _parseAllPathSegs(rectToPathData(o));
        sh.type = 'path';
        sh.attrs = { d: _rebuildPath(origSegs, idxs, dx, dy) };
        break;
      }
      const right = o.x + o.w, bottom = o.y + o.h;
      const moveN = idxs.includes(0) || idxs.includes(1);
      const moveS = idxs.includes(2) || idxs.includes(3);
      const moveW = idxs.includes(0) || idxs.includes(3);
      const moveE = idxs.includes(1) || idxs.includes(2);
      let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
      if (moveN && moveS) { ny = o.y + dy; }
      else if (moveN)     { ny = o.y + dy; nh = bottom - ny; }
      else if (moveS)     { nh = o.h + dy; }
      if (moveW && moveE) { nx = o.x + dx; }
      else if (moveW)     { nx = o.x + dx; nw = right - nx; }
      else if (moveE)     { nw = o.w + dx; }
      if (nw < 0) { nx += nw; nw = -nw; }
      if (nh < 0) { ny += nh; nh = -nh; }
      sh.attrs.x = nx; sh.attrs.y = ny; sh.attrs.w = nw; sh.attrs.h = nh;
      const half = Math.min(nw, nh) / 2;
      if (sh.attrs.rx) sh.attrs.rx = Math.min(sh.attrs.rx, half);
      for (const k of ['r_nw', 'r_ne', 'r_se', 'r_sw']) {
        if (sh.attrs[k] != null) sh.attrs[k] = Math.min(sh.attrs[k], half);
      }
      break;
    }
    case 'line': {
      const o = orig.attrs;
      if (idxs.includes(0)) { sh.attrs.x1 = o.x1 + dx; sh.attrs.y1 = o.y1 + dy; }
      if (idxs.includes(1)) { sh.attrs.x2 = o.x2 + dx; sh.attrs.y2 = o.y2 + dy; }
      break;
    }
    case 'path': {
      const origD = orig.type === 'rect' ? rectToPathData(orig.attrs) : orig.attrs.d;
      const origSegs = _parseAllPathSegs(origD);
      sh.attrs.d = _rebuildPath(origSegs, idxs, dx, dy);
      break;
    }
    case 'ellipse': {
      // Drag cardinal points to resize rx/ry (bezier distortion not supported)
      const o = orig.attrs;
      if (idxs.includes(0)) sh.attrs.ry = Math.max(0.01, o.ry - dy); // top
      if (idxs.includes(1)) sh.attrs.rx = Math.max(0.01, o.rx + dx); // right
      if (idxs.includes(2)) sh.attrs.ry = Math.max(0.01, o.ry + dy); // bottom
      if (idxs.includes(3)) sh.attrs.rx = Math.max(0.01, o.rx - dx); // left
      break;
    }
  }
}

function anchorPoints(sh) {
  switch (sh.type) {
    case 'line': return [{ x: sh.attrs.x1, y: sh.attrs.y1 }, { x: sh.attrs.x2, y: sh.attrs.y2 }];
    case 'path': return parsePathPoints(sh.attrs.d);
    case 'rect': {
      const { x, y, w, h } = sh.attrs;
      return [{ x, y }, { x: x+w, y }, { x: x+w, y: y+h }, { x, y: y+h }];
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = sh.attrs;
      return [{ x: cx, y: cy - ry }, { x: cx + rx, y: cy }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy }];
    }
    case 'polygon': return artboard._polyPoints(sh.attrs);
    case 'star': return artboard._starPoints(sh.attrs);
  }
  return [];
}

// Parse all SVG path segments — returns anchor points (non-Z) with rawSegment stored.
// Each point: { x, y, cmd, rawSegment, isAbs, nums, _segIdx }
function parsePathPoints(d) {
  const allSegs = _parseAllPathSegs(d);
  const pts = [];
  for (let i = 0; i < allSegs.length; i++) {
    if (!allSegs[i].isZ) pts.push({ ...allSegs[i], _segIdx: i });
  }
  return pts;
}

// Parse ALL segments including Z. Used internally for curve-preserving reconstruction.
function _parseAllPathSegs(d) {
  const segs = [];
  const segRe = /([MmLlCcSsQqTtAaHhVvZz])([^MmLlCcSsQqTtAaHhVvZz]*)/g;
  let lx = 0, ly = 0, mx = 0, my = 0;
  let m;
  while ((m = segRe.exec(d)) !== null) {
    const cmd = m[1];
    if (cmd === 'Z' || cmd === 'z') {
      segs.push({ isZ: true, rawSegment: cmd });
      lx = mx; ly = my;
      continue;
    }
    const isAbs = cmd === cmd.toUpperCase();
    const rawArgs = m[2].trim();
    const nums = rawArgs ? rawArgs.split(/[\s,]+/).filter(Boolean).map(Number) : [];
    let ax = lx, ay = ly;
    switch (cmd.toUpperCase()) {
      case 'M':
        ax = isAbs ? nums[0] : lx + nums[0];
        ay = isAbs ? nums[1] : ly + nums[1];
        mx = ax; my = ay;
        break;
      case 'L': case 'T':
        ax = isAbs ? nums[0] : lx + nums[0];
        ay = isAbs ? nums[1] : ly + nums[1];
        break;
      case 'H':
        ax = isAbs ? nums[0] : lx + nums[0];
        ay = ly;
        break;
      case 'V':
        ax = lx;
        ay = isAbs ? nums[0] : ly + nums[0];
        break;
      case 'C':
        ax = isAbs ? nums[4] : lx + nums[4];
        ay = isAbs ? nums[5] : ly + nums[5];
        break;
      case 'S': case 'Q':
        ax = isAbs ? nums[2] : lx + nums[2];
        ay = isAbs ? nums[3] : ly + nums[3];
        break;
      case 'A':
        ax = isAbs ? nums[5] : lx + nums[5];
        ay = isAbs ? nums[6] : ly + nums[6];
        break;
    }
    segs.push({ x: ax, y: ay, cmd, rawSegment: cmd + (rawArgs ? ' ' + rawArgs : ''), isAbs, nums });
    lx = ax; ly = ay;
  }
  return segs;
}

// Rebuild path from all-segments array, moving only the endpoint of affected anchors.
// Preserves all control points and curve commands for non-moved segments.
function _rebuildPath(origSegs, anchorIdxs, dx, dy) {
  // anchorIdxs are indices into the NON-Z subset (from parsePathPoints).
  // Map anchor index → segment index in origSegs.
  let anchorCount = 0;
  const anchorToSeg = new Map();
  for (let i = 0; i < origSegs.length; i++) {
    if (!origSegs[i].isZ) { anchorToSeg.set(anchorCount, i); anchorCount++; }
  }
  const movedSegs = new Set(anchorIdxs.map(i => anchorToSeg.get(i)).filter(i => i != null));

  let d = '';
  let prevX = 0, prevY = 0;
  for (let si = 0; si < origSegs.length; si++) {
    const s = origSegs[si];
    if (s.isZ) { d += ' Z'; continue; }
    if (!movedSegs.has(si)) {
      d += ' ' + s.rawSegment;
      prevX = s.x; prevY = s.y;
      continue;
    }
    // Move only the endpoint of this segment; preserve control points.
    // H/V are promoted to L so both axes move freely.
    const nums = [...s.nums];
    const ucmd = s.cmd.toUpperCase();
    switch (ucmd) {
      case 'M': case 'L': case 'T': nums[0] += dx; nums[1] += dy; break;
      case 'H': {
        const nx = (s.isAbs ? nums[0] : prevX + nums[0]) + dx;
        const ny = prevY + dy;
        d += ' L ' + nx.toFixed(3) + ' ' + ny.toFixed(3);
        prevX = s.x; prevY = s.y;
        continue;
      }
      case 'V': {
        const nx2 = prevX + dx;
        const ny2 = (s.isAbs ? nums[0] : prevY + nums[0]) + dy;
        d += ' L ' + nx2.toFixed(3) + ' ' + ny2.toFixed(3);
        prevX = s.x; prevY = s.y;
        continue;
      }
      case 'C': nums[4] += dx; nums[5] += dy; break;
      case 'S': case 'Q': nums[2] += dx; nums[3] += dy; break;
      case 'A': nums[5] += dx; nums[6] += dy; break;
    }
    d += ' ' + s.cmd + ' ' + nums.map(n => n.toFixed(3)).join(' ');
    prevX = s.x; prevY = s.y;
  }
  return d.trim();
}

// Toggle a path segment between straight (L) and cubic bezier (C).
// Double-click on L segment → C with collinear handles at 1/3 and 2/3 (ready to drag).
// Double-click on C segment → L (strips handles).
// Z-close segment (idx1=n-1, idx2=0) is handled by inserting an explicit C before Z.
function _toggleSegmentCurve(shapeId, idx1, idx2) {
  const sh = store.findShape(shapeId);
  if (!sh || sh.type !== 'path') return;

  const allSegs = _parseAllPathSegs(sh.attrs.d);
  let anchorCount = 0;
  const anchorToSeg = new Map();
  for (let i = 0; i < allSegs.length; i++) {
    if (!allSegs[i].isZ) { anchorToSeg.set(anchorCount, i); anchorCount++; }
  }
  const n = anchorCount;

  const segSX = [], segSY = [];
  let lx = 0, ly = 0;
  for (let i = 0; i < allSegs.length; i++) {
    segSX[i] = lx; segSY[i] = ly;
    if (!allSegs[i].isZ) { lx = allSegs[i].x; ly = allSegs[i].y; }
  }

  const closed = /z/i.test(sh.attrs.d);

  // Z-close segment (straight line implied by Z, no explicit segment)
  if (idx2 === 0 && closed && idx1 === n - 1) {
    const lastSi = anchorToSeg.get(n - 1);
    const m0si   = anchorToSeg.get(0);
    if (lastSi == null || m0si == null) return;
    const x0 = allSegs[lastSi].x, y0 = allSegs[lastSi].y;
    const mx = allSegs[m0si].x,   my = allSegs[m0si].y;
    const cp1x = x0 + (mx - x0) / 3, cp1y = y0 + (my - y0) / 3;
    const cp2x = x0 + (mx - x0) * 2/3, cp2y = y0 + (my - y0) * 2/3;
    let d = '', inserted = false;
    for (let i = 0; i < allSegs.length; i++) {
      if (allSegs[i].isZ && !inserted) {
        d += ` C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)} ${cp2x.toFixed(3)} ${cp2y.toFixed(3)} ${mx.toFixed(3)} ${my.toFixed(3)} Z`;
        inserted = true;
      } else if (allSegs[i].isZ) {
        d += ' Z';
      } else {
        d += ' ' + allSegs[i].rawSegment;
      }
    }
    store.commit(s => { const live = store.findShape(shapeId); if (live) live.attrs.d = d.trim(); }, 'toggle-curve');
    selectedAnchors = [{ shapeId, idx: n - 1 }, { shapeId, idx: n }];
    renderOverlay();
    return;
  }

  const si = anchorToSeg.get(idx2);
  if (si == null) return;
  const seg = allSegs[si];
  const ucmd = seg.cmd.toUpperCase();
  const sx = segSX[si], sy = segSY[si];

  let newRaw;
  if (ucmd === 'C') {
    newRaw = `L ${seg.x.toFixed(3)} ${seg.y.toFixed(3)}`;
  } else if (ucmd === 'L' || ucmd === 'H' || ucmd === 'V') {
    const ex = seg.x, ey = seg.y;
    const cp1x = sx + (ex - sx) / 3, cp1y = sy + (ey - sy) / 3;
    const cp2x = sx + (ex - sx) * 2/3, cp2y = sy + (ey - sy) * 2/3;
    newRaw = `C ${cp1x.toFixed(3)} ${cp1y.toFixed(3)} ${cp2x.toFixed(3)} ${cp2y.toFixed(3)} ${ex.toFixed(3)} ${ey.toFixed(3)}`;
  } else {
    return; // M, Q, S, A — not handled
  }

  let d = '';
  for (let i = 0; i < allSegs.length; i++) {
    if (allSegs[i].isZ) { d += ' Z'; continue; }
    d += ' ' + (i === si ? newRaw : allSegs[i].rawSegment);
  }
  store.commit(s => { const live = store.findShape(shapeId); if (live) live.attrs.d = d.trim(); }, 'toggle-curve');
  selectedAnchors = [{ shapeId, idx: idx1 }, { shapeId, idx: idx2 }];
  renderOverlay();
}

// Returns SVG `d` string (in artboard/screen space) for the segment between anchor idx1→idx2.
function _getHoverSegPath(sh, idx1, idx2, cx, cy, rot) {
  const allSegs = _parseAllPathSegs(sh.attrs.d);
  let anchorCount = 0;
  const anchorToSeg = new Map();
  for (let i = 0; i < allSegs.length; i++) {
    if (!allSegs[i].isZ) { anchorToSeg.set(anchorCount, i); anchorCount++; }
  }
  const segSX = [], segSY = [];
  let lx = 0, ly = 0;
  for (let i = 0; i < allSegs.length; i++) {
    segSX[i] = lx; segSY[i] = ly;
    if (!allSegs[i].isZ) { lx = allSegs[i].x; ly = allSegs[i].y; }
  }
  const rp = (x, y) => {
    const pt = rot ? rotatePoint(x, y, cx, cy, rot) : { x, y };
    return `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
  };
  const n = anchorCount;
  // Closing segment: straight line back to anchor 0
  if (idx1 === n - 1 && idx2 === 0) {
    const s0 = anchorToSeg.get(n - 1), s1 = anchorToSeg.get(0);
    if (s0 == null || s1 == null) return null;
    return `M ${rp(allSegs[s0].x, allSegs[s0].y)} L ${rp(allSegs[s1].x, allSegs[s1].y)}`;
  }
  const si = anchorToSeg.get(idx2);
  if (si == null) return null;
  const seg = allSegs[si];
  const sx = segSX[si], sy = segSY[si];
  const ucmd = seg.cmd.toUpperCase();
  const start = `M ${rp(sx, sy)}`;
  if (ucmd === 'C') {
    const cp1x = seg.isAbs ? seg.nums[0] : sx + seg.nums[0];
    const cp1y = seg.isAbs ? seg.nums[1] : sy + seg.nums[1];
    const cp2x = seg.isAbs ? seg.nums[2] : sx + seg.nums[2];
    const cp2y = seg.isAbs ? seg.nums[3] : sy + seg.nums[3];
    return `${start} C ${rp(cp1x, cp1y)} ${rp(cp2x, cp2y)} ${rp(seg.x, seg.y)}`;
  } else if (ucmd === 'Q') {
    const cpx = seg.isAbs ? seg.nums[0] : sx + seg.nums[0];
    const cpy = seg.isAbs ? seg.nums[1] : sy + seg.nums[1];
    return `${start} Q ${rp(cpx, cpy)} ${rp(seg.x, seg.y)}`;
  }
  return `${start} L ${rp(seg.x, seg.y)}`;
}

// Returns bezier control points for rendering, for the given selected anchor indices.
// Each entry: { segIdx, role, x, y, ax, ay } where (x,y) is the CP position in shape-local
// space and (ax,ay) is the anchor end for the handle line.
function getPathCPs(d, selectedAnchorIdxs) {
  const allSegs = _parseAllPathSegs(d);
  let anchorCount = 0;
  const anchorToSeg = new Map();
  for (let i = 0; i < allSegs.length; i++) {
    if (!allSegs[i].isZ) { anchorToSeg.set(anchorCount, i); anchorCount++; }
  }
  // Pre-compute start point of each segment (= endpoint of previous non-Z seg)
  const segSX = [], segSY = [];
  let lx = 0, ly = 0;
  for (let i = 0; i < allSegs.length; i++) {
    segSX[i] = lx; segSY[i] = ly;
    if (!allSegs[i].isZ) { lx = allSegs[i].x; ly = allSegs[i].y; }
  }

  const cps = [];
  const seen = new Set();

  const addCP = (si, role) => {
    const key = `${si}:${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    const seg = allSegs[si];
    const sx = segSX[si], sy = segSY[si];
    const ucmd = seg.cmd.toUpperCase();
    let cpx, cpy, ax, ay;
    if (ucmd === 'C') {
      if (role === 'cp1') {
        cpx = seg.isAbs ? seg.nums[0] : sx + seg.nums[0];
        cpy = seg.isAbs ? seg.nums[1] : sy + seg.nums[1];
        ax = sx; ay = sy;
      } else {
        cpx = seg.isAbs ? seg.nums[2] : sx + seg.nums[2];
        cpy = seg.isAbs ? seg.nums[3] : sy + seg.nums[3];
        ax = seg.x; ay = seg.y;
      }
    } else if (ucmd === 'Q' && role === 'cp1') {
      cpx = seg.isAbs ? seg.nums[0] : sx + seg.nums[0];
      cpy = seg.isAbs ? seg.nums[1] : sy + seg.nums[1];
      ax = sx; ay = sy;
    } else {
      return;
    }
    cps.push({ segIdx: si, role, x: cpx, y: cpy, ax, ay });
  };

  for (const ai of selectedAnchorIdxs) {
    const si = anchorToSeg.get(ai);
    if (si == null) continue;
    const ucmd = allSegs[si].cmd.toUpperCase();
    if (ucmd === 'C') { addCP(si, 'cp1'); addCP(si, 'cp2'); }
    else if (ucmd === 'Q') { addCP(si, 'cp1'); }
    // Outgoing handle: cp1 of next non-Z segment
    let nextSi = si + 1;
    while (nextSi < allSegs.length && allSegs[nextSi].isZ) nextSi++;
    if (nextSi < allSegs.length) {
      const nc = allSegs[nextSi].cmd.toUpperCase();
      if (nc === 'C') addCP(nextSi, 'cp1');
      else if (nc === 'Q') addCP(nextSi, 'cp1');
    }
  }
  return cps;
}

// Rebuild path moving a single bezier control point by (dx, dy).
function _rebuildPathCP(origSegs, segIdx, role, dx, dy) {
  let d = '';
  for (let si = 0; si < origSegs.length; si++) {
    const s = origSegs[si];
    if (s.isZ) { d += ' Z'; continue; }
    if (si !== segIdx) { d += ' ' + s.rawSegment; continue; }
    const nums = [...s.nums];
    const ucmd = s.cmd.toUpperCase();
    if (ucmd === 'C') {
      if (role === 'cp1')      { nums[0] += dx; nums[1] += dy; }
      else if (role === 'cp2') { nums[2] += dx; nums[3] += dy; }
    } else if (ucmd === 'Q' && role === 'cp1') {
      nums[0] += dx; nums[1] += dy;
    }
    d += ' ' + s.cmd + ' ' + nums.map(n => n.toFixed(3)).join(' ');
  }
  return d.trim();
}

// =============== Segment hit helpers ==============================

function distToCubicBezier(p, p0, cp1, cp2, p1, samples = 24) {
  let minDist = Infinity, prev = p0;
  for (let k = 1; k <= samples; k++) {
    const t = k / samples, mt = 1 - t;
    const x = mt*mt*mt*p0.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p1.x;
    const y = mt*mt*mt*p0.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p1.y;
    const cur = { x, y };
    const d = distToSegment(p, prev, cur);
    if (d < minDist) minDist = d;
    prev = cur;
  }
  return minDist;
}

function distToQuadBezier(p, p0, cp, p1, samples = 16) {
  let minDist = Infinity, prev = p0;
  for (let k = 1; k <= samples; k++) {
    const t = k / samples, mt = 1 - t;
    const x = mt*mt*p0.x + 2*mt*t*cp.x + t*t*p1.x;
    const y = mt*mt*p0.y + 2*mt*t*cp.y + t*t*p1.y;
    const cur = { x, y };
    const d = distToSegment(p, prev, cur);
    if (d < minDist) minDist = d;
    prev = cur;
  }
  return minDist;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function findNearestSegment(sh, raw) {
  if (sh.type === 'ellipse') return null;
  if (sh.type === 'rect') {
    const anyRound = (sh.attrs.rx || 0) > 0
      || (sh.attrs.r_nw || 0) > 0 || (sh.attrs.r_ne || 0) > 0
      || (sh.attrs.r_se || 0) > 0 || (sh.attrs.r_sw || 0) > 0;
    if (anyRound) return null;
  }
  if (sh.type === 'path' && sh.attrs.d) return _findNearestPathSegment(sh, raw);

  const pts = anchorPoints(sh);
  if (pts.length < 2) return null;

  const rot = sh.rotation || 0;
  let visPts = pts;
  if (rot) {
    const b = artboard.getShapeBBox(sh);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    visPts = pts.map(p => rotatePoint(p.x, p.y, cx, cy, rot));
  }

  const closed = sh.type === 'rect' || sh.type === 'polygon' || sh.type === 'star' || /z/i.test(sh.attrs.d || '');
  const n = visPts.length;
  const pairs = [];
  for (let i = 0; i < n - 1; i++) pairs.push([i, i + 1]);
  if (closed) pairs.push([n - 1, 0]);

  const threshold = 10 / store.get().viewport.zoom;
  let minDist = Infinity, bestI = -1, bestJ = -1;
  for (const [i, j] of pairs) {
    const d = distToSegment(raw, visPts[i], visPts[j]);
    if (d < minDist) { minDist = d; bestI = i; bestJ = j; }
  }
  if (minDist > threshold) return null;
  return bestI >= 0 ? { idx1: bestI, idx2: bestJ } : null;
}

function _findNearestPathSegment(sh, raw) {
  const d = sh.attrs.d;
  const allSegs = _parseAllPathSegs(d);
  const rot = sh.rotation || 0;
  let cx = 0, cy = 0;
  if (rot) { const b = artboard.getShapeBBox(sh); cx = b.x + b.w/2; cy = b.y + b.h/2; }
  const rp = (x, y) => rot ? rotatePoint(x, y, cx, cy, rot) : { x, y };

  let anchorCount = 0;
  const anchorToSeg = new Map();
  for (let i = 0; i < allSegs.length; i++) {
    if (!allSegs[i].isZ) { anchorToSeg.set(anchorCount, i); anchorCount++; }
  }
  const n = anchorCount;
  if (n < 2) return null;

  const segSX = [], segSY = [];
  let lx = 0, ly = 0;
  for (let i = 0; i < allSegs.length; i++) {
    segSX[i] = lx; segSY[i] = ly;
    if (!allSegs[i].isZ) { lx = allSegs[i].x; ly = allSegs[i].y; }
  }

  const closed = /z/i.test(d);
  const threshold = 10 / store.get().viewport.zoom;
  let minDist = Infinity, bestI = -1, bestJ = -1;

  for (let ai = 1; ai < n; ai++) {
    const si = anchorToSeg.get(ai);
    const seg = allSegs[si];
    const ucmd = seg.cmd.toUpperCase();
    if (ucmd === 'M') continue;
    const sx = segSX[si], sy = segSY[si];
    const p0 = rp(sx, sy), p1 = rp(seg.x, seg.y);
    let dist;
    if (ucmd === 'C') {
      const cp1 = rp(seg.isAbs ? seg.nums[0] : sx + seg.nums[0], seg.isAbs ? seg.nums[1] : sy + seg.nums[1]);
      const cp2 = rp(seg.isAbs ? seg.nums[2] : sx + seg.nums[2], seg.isAbs ? seg.nums[3] : sy + seg.nums[3]);
      dist = distToCubicBezier(raw, p0, cp1, cp2, p1);
    } else if (ucmd === 'Q') {
      const cp = rp(seg.isAbs ? seg.nums[0] : sx + seg.nums[0], seg.isAbs ? seg.nums[1] : sy + seg.nums[1]);
      dist = distToQuadBezier(raw, p0, cp, p1);
    } else {
      dist = distToSegment(raw, p0, p1);
    }
    if (dist < minDist) { minDist = dist; bestI = ai - 1; bestJ = ai; }
  }

  if (closed) {
    const p0 = rp(allSegs[anchorToSeg.get(n-1)].x, allSegs[anchorToSeg.get(n-1)].y);
    const p1 = rp(allSegs[anchorToSeg.get(0)].x, allSegs[anchorToSeg.get(0)].y);
    const dist = distToSegment(raw, p0, p1);
    if (dist < minDist) { minDist = dist; bestI = n - 1; bestJ = 0; }
  }

  if (minDist > threshold) return null;
  return bestI >= 0 ? { idx1: bestI, idx2: bestJ } : null;
}

// =============== Geometry helpers ==============================
function snapshotGeom(sh) {
  if (sh.type === 'group') {
    return { type: 'group', rotation: sh.rotation || 0, children: sh.children.map(c => snapshotGeom(c)) };
  }
  const s = JSON.parse(JSON.stringify({ type: sh.type, attrs: sh.attrs, rotation: sh.rotation }));
  if (sh._bbox) s._bbox = { ...sh._bbox };
  return s;
}

function referencePoint(snap) {
  switch (snap.type) {
    case 'rect':    return { x: snap.attrs.x, y: snap.attrs.y };
    case 'ellipse': return { x: snap.attrs.cx - snap.attrs.rx, y: snap.attrs.cy - snap.attrs.ry };
    case 'line':    return { x: snap.attrs.x1, y: snap.attrs.y1 };
    case 'polygon':
    case 'star':    return { x: snap.attrs.cx, y: snap.attrs.cy };
    case 'path':    return { x: 0, y: 0 };
    case 'text':    return { x: snap.attrs.x, y: snap.attrs.y };
    case 'image':   return { x: snap.attrs.x, y: snap.attrs.y };
    case 'rawsvg':  return { x: snap._bbox?.x ?? snap.attrs.x, y: snap._bbox?.y ?? snap.attrs.y };
  }
  return { x: 0, y: 0 };
}

function translateShape(sh, snap, dx, dy) {
  if (sh.type === 'group') {
    for (let i = 0; i < sh.children.length; i++) {
      translateShape(sh.children[i], snap.children[i], dx, dy);
    }
    return;
  }
  const a = sh.attrs;
  switch (sh.type) {
    case 'rect':    a.x = snap.attrs.x + dx; a.y = snap.attrs.y + dy; break;
    case 'ellipse': a.cx = snap.attrs.cx + dx; a.cy = snap.attrs.cy + dy; break;
    case 'line':
      a.x1 = snap.attrs.x1 + dx; a.y1 = snap.attrs.y1 + dy;
      a.x2 = snap.attrs.x2 + dx; a.y2 = snap.attrs.y2 + dy;
      break;
    case 'polygon':
    case 'star':    a.cx = snap.attrs.cx + dx; a.cy = snap.attrs.cy + dy; break;
    case 'text':    a.x = snap.attrs.x + dx; a.y = snap.attrs.y + dy; break;
    case 'image':   a.x = snap.attrs.x + dx; a.y = snap.attrs.y + dy; break;
    case 'path':    a.d = translatePathD(snap.attrs.d, dx, dy); break;
    case 'rawsvg':  a.x = snap.attrs.x + dx; a.y = snap.attrs.y + dy; break;
  }
}

function translatePathD(d, dx, dy) {
  // Translate absolute commands by (dx,dy). Re-emit numbers.
  return d.replace(/([MLCSQTAHVZmlcsqtahvz])([^MLCSQTAHVZmlcsqtahvz]*)/g, (m, cmd, args) => {
    const isAbs = cmd === cmd.toUpperCase();
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'Z' || cmd === 'z') return cmd;
    // For each command, certain coordinate pairs need translation. For absolute, every (x,y) pair shifts.
    let out = cmd;
    if (cmd === 'H' || cmd === 'h') {
      const offset = isAbs ? dx : 0;
      out += ' ' + nums.map(n => (n + offset).toFixed(3)).join(' ');
    } else if (cmd === 'V' || cmd === 'v') {
      const offset = isAbs ? dy : 0;
      out += ' ' + nums.map(n => (n + offset).toFixed(3)).join(' ');
    } else {
      const shifted = nums.map((n, i) => {
        if (!isAbs) return n;
        return (i % 2 === 0) ? n + dx : n + dy;
      });
      out += ' ' + shifted.map(n => n.toFixed(3)).join(' ');
    }
    return out;
  });
}

export function nudgeShape(sh, dx, dy) {
  if (sh.type === 'group') {
    for (const child of sh.children) nudgeShape(child, dx, dy);
    return;
  }
  switch (sh.type) {
    case 'rect':    sh.attrs.x += dx; sh.attrs.y += dy; break;
    case 'ellipse': sh.attrs.cx += dx; sh.attrs.cy += dy; break;
    case 'line':
      sh.attrs.x1 += dx; sh.attrs.y1 += dy;
      sh.attrs.x2 += dx; sh.attrs.y2 += dy;
      break;
    case 'polygon':
    case 'star':    sh.attrs.cx += dx; sh.attrs.cy += dy; break;
    case 'text':    sh.attrs.x += dx; sh.attrs.y += dy; break;
    case 'image':   sh.attrs.x += dx; sh.attrs.y += dy; break;
    case 'path':    sh.attrs.d = translatePathD(sh.attrs.d, dx, dy); break;
    case 'rawsvg':  sh.attrs.x += dx; sh.attrs.y += dy; break;
  }
}

function setGeomFromBBox(sh, snap, nb) {
  switch (sh.type) {
    case 'rect': {
      sh.attrs.x = nb.x; sh.attrs.y = nb.y; sh.attrs.w = nb.w; sh.attrs.h = nb.h;
      const half = Math.min(nb.w, nb.h) / 2;
      const rsx = (snap.attrs.w || 0) > 0 ? nb.w / snap.attrs.w : 1;
      const rsy = (snap.attrs.h || 0) > 0 ? nb.h / snap.attrs.h : 1;
      const rsc = Math.min(rsx, rsy);
      if (snap.attrs.rx != null) sh.attrs.rx = Math.min(snap.attrs.rx * rsc, half);
      for (const k of ['r_nw', 'r_ne', 'r_se', 'r_sw']) {
        if (snap.attrs[k] != null) sh.attrs[k] = Math.min(snap.attrs[k] * rsc, half);
      }
      break;
    }
    case 'image':
      sh.attrs.x = nb.x; sh.attrs.y = nb.y; sh.attrs.w = nb.w; sh.attrs.h = nb.h;
      break;
    case 'ellipse':
      sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2;
      sh.attrs.rx = nb.w/2; sh.attrs.ry = nb.h/2;
      break;
    case 'line': {
      const ob = { x: Math.min(snap.attrs.x1, snap.attrs.x2), y: Math.min(snap.attrs.y1, snap.attrs.y2),
                   w: Math.abs(snap.attrs.x2 - snap.attrs.x1), h: Math.abs(snap.attrs.y2 - snap.attrs.y1) };
      // Guard zero-dimension axes (horizontal/vertical lines) — preserve the fixed axis
      const sx = ob.w > 0 ? nb.w / ob.w : 1;
      const sy = ob.h > 0 ? nb.h / ob.h : 1;
      sh.attrs.x1 = ob.w > 0 ? nb.x + (snap.attrs.x1 - ob.x) * sx : nb.x + (snap.attrs.x1 - ob.x);
      sh.attrs.y1 = ob.h > 0 ? nb.y + (snap.attrs.y1 - ob.y) * sy : nb.y + (snap.attrs.y1 - ob.y);
      sh.attrs.x2 = ob.w > 0 ? nb.x + (snap.attrs.x2 - ob.x) * sx : nb.x + (snap.attrs.x2 - ob.x);
      sh.attrs.y2 = ob.h > 0 ? nb.y + (snap.attrs.y2 - ob.y) * sy : nb.y + (snap.attrs.y2 - ob.y);
      break;
    }
    case 'polygon':
    case 'star': {
      sh.attrs.cx = nb.x + nb.w/2; sh.attrs.cy = nb.y + nb.h/2;
      sh.attrs.r = Math.min(nb.w, nb.h) / 2;
      break;
    }
    case 'text': {
      sh.attrs.x = nb.x; sh.attrs.y = nb.y;
      if (sh.attrs.width != null) {
        // Frame text: reflow — change frame size, preserve font size
        sh.attrs.width  = nb.w;
        sh.attrs.height = nb.h;
      } else {
        // Legacy single-point text: scale font size
        const orig = sh._lastBBox || { w: nb.w, h: nb.h };
        const scale = nb.h / Math.max(1, orig.h);
        sh.attrs.size = Math.max(2, (snap.attrs.size || 16) * scale);
      }
      break;
    }
    case 'path': {
      const ob = snap._bbox || sh._bbox || { x: 0, y: 0, w: 1, h: 1 };
      sh.attrs.d = scalePathD(snap.attrs.d, ob, nb);
      if (snap.attrs.corners) {
        const psx = ob.w > 0 ? nb.w / ob.w : 1;
        const psy = ob.h > 0 ? nb.h / ob.h : 1;
        const psc = Math.min(psx, psy);
        const scaled = {};
        for (const [k, v] of Object.entries(snap.attrs.corners)) scaled[k] = v * psc;
        sh.attrs.corners = scaled;
      }
      break;
    }
    case 'group': {
      // Scale children proportionally using their current bboxes relative to group bbox
      const ob = sh._bbox || { x: 0, y: 0, w: 1, h: 1 };
      const gsx = ob.w > 0 ? nb.w / ob.w : 1;
      const gsy = ob.h > 0 ? nb.h / ob.h : 1;
      for (const child of sh.children) {
        const cb = artboard.getShapeBBox(child);
        const childSnap = snapshotGeom(child);
        setGeomFromBBox(child, childSnap, {
          x: nb.x + (cb.x - ob.x) * gsx,
          y: nb.y + (cb.y - ob.y) * gsy,
          w: Math.max(0.0001, cb.w * gsx),
          h: Math.max(0.0001, cb.h * gsy),
        });
      }
      break;
    }
  }
}

function scalePathD(d, ob, nb) {
  const sx = nb.w / Math.max(0.0001, ob.w);
  const sy = nb.h / Math.max(0.0001, ob.h);
  return d.replace(/([MLCSQTAHVZmlcsqtahvz])([^MLCSQTAHVZmlcsqtahvz]*)/g, (m, cmd, args) => {
    if (cmd === 'Z' || cmd === 'z') return cmd;
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const isAbs = cmd === cmd.toUpperCase();
    let scaled;
    if (cmd === 'H' || cmd === 'h') scaled = nums.map(n => (isAbs ? nb.x + (n - ob.x) * sx : n * sx));
    else if (cmd === 'V' || cmd === 'v') scaled = nums.map(n => (isAbs ? nb.y + (n - ob.y) * sy : n * sy));
    else scaled = nums.map((n, i) => {
      if (i % 2 === 0) return isAbs ? nb.x + (n - ob.x) * sx : n * sx;
      else            return isAbs ? nb.y + (n - ob.y) * sy : n * sy;
    });
    return cmd + ' ' + scaled.map(n => n.toFixed(3)).join(' ');
  });
}

function _findShapeInTree(shapes, id) {
  for (const sh of shapes) {
    if (sh.id === id) return sh;
    if (sh.type === 'group' && sh.children) {
      const found = _findShapeInTree(sh.children, id);
      if (found) return found;
    }
  }
  return null;
}

// =============== Status / wiring ==============================
function updateStatusSel() {
  const el = document.getElementById('status-sel');
  const s = store.get();
  if (!s.selection.length) { el.textContent = '—'; return; }
  if (s.selection.length === 1) {
    const sh = store.findShape(s.selection[0]);
    el.textContent = sh ? sh.name : '—';
  } else {
    el.textContent = `${s.selection.length} items`;
  }
}

// Make sure overlay updates on every store change
store.subscribe((s, reason) => {
  if (reason === 'undo' || reason === 'redo') { selectedAnchors = []; directHoveredCorner = null; }
  // Cache text/path bbox after render — needed for resize calc (recurse through groups)
  for (const sh of store.allShapes()) {
    if ((sh.type === 'text' || sh.type === 'path') && sh._bbox) {
      sh._lastBBox = { ...sh._bbox };
    }
  }
  renderOverlay();
  updateStatusSel();
});

// keyboard delete
window.addEventListener('keydown', e => {
  const editingText = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if ((e.key === 'Delete' || e.key === 'Backspace') && !editingText) {
    const s = store.get();
    if (!s.selection.length) return;
    e.preventDefault();
    store.commit(st => {
      const ids = new Set(st.selection);
      // Remove from top-level shapes
      st.shapes = st.shapes.filter(sh => !ids.has(sh.id));
      // Also remove from group children (covers isolation mode selection)
      _removeIdsFromGroups(st.shapes, ids);
      st.selection = [];
      if (ids.has(st.isolationGroup)) st.isolationGroup = null;
    }, 'delete');
  }
  // Select all — respects isolation mode
  if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !editingText) {
    e.preventDefault();
    store.patch(st => {
      if (st.isolationGroup) {
        const grp = store.findShape(st.isolationGroup);
        st.selection = grp ? grp.children.map(c => c.id) : [];
      } else {
        st.selection = st.shapes.map(sh => sh.id);
      }
    }, 'selection');
  }
  // Escape — exit isolation first, then clear anchors, then deselect
  if (e.key === 'Escape' && !editingText) {
    if (store.get().isolationGroup) {
      exitIsolation();
    } else if (selectedAnchors.length) {
      selectedAnchors = [];
      renderOverlay();
    } else {
      store.patch(s => s.selection = [], 'selection');
    }
  }
});


// Alt key tracking for clone-drag indicator
window.addEventListener('keydown', e => {
  if (e.key === 'Alt' && !_altHeld) { _altHeld = true; renderOverlay(); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Alt' && _altHeld) { _altHeld = false; renderOverlay(); }
});

function _removeIdsFromGroups(shapes, ids) {
  for (const sh of shapes) {
    if (sh.type === 'group') {
      sh.children = sh.children.filter(c => !ids.has(c.id));
      _removeIdsFromGroups(sh.children, ids);
    }
  }
}

// Marquee element factory
function makeMarquee() {
  const r = svgNS('rect');
  setAttrs(r, { class: 'marquee', x: 0, y: 0, width: 0, height: 0 });
  overlay.appendChild(r);
  return r;
}
