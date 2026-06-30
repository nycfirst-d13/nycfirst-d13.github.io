// =============================================================================
// keys.js — keyboard shortcuts
// =============================================================================
import { store, removeIdsFromGroups } from './state.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { deepClone, deepCloneWithNewIds, inToPx } from './utils.js';
import { nudgeShape } from './select.js';
import { groupSelected, ungroupSelected } from './group.js';
import { convertTextToPath } from './text-panel.js';
import { showToast, selectionBBox } from './toast.js';

let clipboard = [];
let pasteCount = 0;

const PASTE_OFFSET = 40;   // 40 artboard px (= ~5/12 in)
const NUDGE = 10;          // 10 artboard px
const NUDGE_BIG = 40;      // 40 artboard px (shift+arrow)

// Returns a stable reference {x, y} for a shape — used to compute grid-snap nudge delta
function _shapeRefPos(sh) {
  if (sh.type === 'group') return sh.children?.length ? _shapeRefPos(sh.children[0]) : { x: 0, y: 0 };
  switch (sh.type) {
    case 'rect':
    case 'text':
    case 'image':
    case 'rawsvg':  return { x: sh.attrs.x,  y: sh.attrs.y  };
    case 'ellipse':
    case 'polygon':
    case 'star':    return { x: sh.attrs.cx, y: sh.attrs.cy };
    case 'line':    return { x: sh.attrs.x1, y: sh.attrs.y1 };
    case 'path': {
      const m = sh.attrs.d?.match(/[Mm]\s*([-\d.e]+)[,\s]+([-\d.e]+)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    }
    default: return { x: 0, y: 0 };
  }
}

// Returns delta to move val to the next grid line in dir (+1/-1)
function _snapNudgeDelta(val, stepPx, dir) {
  const onGrid = Math.abs(val - Math.round(val / stepPx) * stepPx) < 0.5;
  if (onGrid) return stepPx * dir;
  return dir > 0
    ? Math.ceil(val  / stepPx) * stepPx - val
    : Math.floor(val / stepPx) * stepPx - val;
}

export function doCopy() {
  const sel = store.selectedShapes();
  if (!sel.length) return false;
  clipboard = deepClone(sel);
  pasteCount = 0;
  return true;
}

export function doCut() {
  const sel = store.selectedShapes();
  if (!sel.length) return false;
  clipboard = sel.map(deepCloneWithNewIds);
  pasteCount = 0;
  store.commit(st => {
    const ids = new Set(st.selection);
    st.shapes = st.shapes.filter(s => !ids.has(s.id));
    removeIdsFromGroups(st.shapes, ids);
    st.selection = [];
  }, 'cut');
  return true;
}

export function doPaste() {
  if (!clipboard.length) return false;
  pasteCount++;
  const offset = PASTE_OFFSET * pasteCount;
  const newShapes = clipboard.map(sh => {
    const clone = deepCloneWithNewIds(sh);
    nudgeShape(clone, offset, offset);
    return clone;
  });
  store.commit(st => {
    st.shapes.push(...newShapes);
    st.selection = newShapes.map(s => s.id);
  }, 'paste');
  return true;
}

export function doPasteInPlace() {
  if (!clipboard.length) return false;
  const newShapes = clipboard.map(deepCloneWithNewIds);
  store.commit(st => {
    st.shapes.push(...newShapes);
    st.selection = newShapes.map(s => s.id);
  }, 'paste');
  return true;
}

export function canPaste() { return clipboard.length > 0; }

const TOOL_KEYS = {
  v: 'select',
  a: 'direct',
  m: 'rect',
  l: 'ellipse',
  '\\': 'line',
  p: 'pen',
  t: 'text',
  h: 'hand',
  o: 'reflect',
};

function zOrder(dir, toExtreme) {
  store.commit(s => {
    if (!s.selection.length) return;

    // Route each selected id to its parent array (top-level or group children).
    const arrToSelIds = new Map();
    for (const id of s.selection) {
      const parent = store.findParentGroup(id);
      if (parent === undefined) continue;
      const arr = parent === null ? s.shapes : parent.children;
      if (!arrToSelIds.has(arr)) arrToSelIds.set(arr, []);
      arrToSelIds.get(arr).push(id);
    }

    for (const [arr, selIds] of arrToSelIds) {
      const selSet = new Set(selIds);
      if (toExtreme) {
        const sel = arr.filter(sh => selSet.has(sh.id));
        const rest = arr.filter(sh => !selSet.has(sh.id));
        const result = dir > 0 ? [...rest, ...sel] : [...sel, ...rest];
        arr.splice(0, arr.length, ...result);
      } else {
        const order = dir > 0
          ? [...arr].reverse().filter(sh => selSet.has(sh.id)).map(sh => sh.id)
          : arr.filter(sh => selSet.has(sh.id)).map(sh => sh.id);
        for (const id of order) {
          const i = arr.findIndex(sh => sh.id === id);
          if (i < 0) continue;
          const j = i + dir;
          if (j < 0 || j >= arr.length) continue;
          if (selSet.has(arr[j].id)) continue;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }
    }
  }, 'reorder');
}

window.addEventListener('keydown', (e) => {
  if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;

  const key = e.key.toLowerCase();

  // Group / Ungroup
  if ((e.metaKey || e.ctrlKey) && key === 'g' && !e.shiftKey) {
    e.preventDefault();
    groupSelected();
    requestAnimationFrame(() => showToast('Grouped! 🫂', { bbox: selectionBBox() }));
    return;
  }
  if ((e.metaKey || e.ctrlKey) && key === 'g' && e.shiftKey) {
    e.preventDefault();
    ungroupSelected();
    requestAnimationFrame(() => showToast('Ungrouped! 💨', { bbox: selectionBBox() }));
    return;
  }

  // Convert to Path (Cmd/Ctrl+Shift+O — matches Illustrator "Create Outlines")
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'o') { e.preventDefault(); convertTextToPath(); return; }

  // Undo / Redo
  if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
  if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return; }

  // Copy
  if ((e.metaKey || e.ctrlKey) && key === 'c') {
    const bbox = selectionBBox();
    if (doCopy()) { e.preventDefault(); showToast('Copied! 📋', { bbox }); }
    return;
  }

  // Cut
  if ((e.metaKey || e.ctrlKey) && key === 'x') {
    const bbox = selectionBBox();
    if (doCut()) { e.preventDefault(); showToast('Cut! ✂️', { bbox }); }
    return;
  }

  // Paste in place (Cmd/Ctrl+Shift+V — checked before regular paste)
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'v') {
    if (doPasteInPlace()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted in place! 📌', { bbox: selectionBBox() })); }
    return;
  }

  // Paste
  if ((e.metaKey || e.ctrlKey) && key === 'v') {
    if (doPaste()) { e.preventDefault(); requestAnimationFrame(() => showToast('Pasted! ✨', { bbox: selectionBBox() })); }
    return;
  }

  // Duplicate
  if ((e.metaKey || e.ctrlKey) && key === 'd') {
    const sel = store.selectedShapes();
    if (!sel.length) return;
    e.preventDefault();
    const newShapes = sel.map(sh => {
      const clone = deepCloneWithNewIds(sh);
      nudgeShape(clone, PASTE_OFFSET, PASTE_OFFSET);
      return clone;
    });
    store.commit(st => {
      st.shapes.push(...newShapes);
      st.selection = newShapes.map(s => s.id);
    }, 'duplicate');
    return;
  }

  // Arrow nudge
  if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
    const s = store.get();
    if (!s.selection.length) return;
    e.preventDefault();
    const dirX = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;
    const dirY = key === 'arrowup'   ? -1 : key === 'arrowdown'  ? 1 : 0;
    let dx = 0, dy = 0;
    if (s.grid.snap) {
      const stepPx = inToPx(s.grid.size);
      if (e.shiftKey) {
        dx = dirX * inToPx(1);
        dy = dirY * inToPx(1);
      } else {
        const ref = _shapeRefPos(store.selectedShapes()[0]);
        if (dirX !== 0) dx = _snapNudgeDelta(ref.x, stepPx, dirX);
        if (dirY !== 0) dy = _snapNudgeDelta(ref.y, stepPx, dirY);
      }
    } else {
      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      dx = dirX * step;
      dy = dirY * step;
    }
    store.commit(() => {
      for (const id of store.get().selection) {
        const sh = store.findShape(id);
        if (sh) nudgeShape(sh, dx, dy);
      }
    }, 'nudge');
    return;
  }

  // Z-order: ] = forward, [ = back, } = front, { = back-most
  if ((e.metaKey || e.ctrlKey) && key === ']') { e.preventDefault(); zOrder(+1, false); return; }
  if ((e.metaKey || e.ctrlKey) && key === '[') { e.preventDefault(); zOrder(-1, false); return; }
  if ((e.metaKey || e.ctrlKey) && key === '}') { e.preventDefault(); zOrder(+1, true); return; }
  if ((e.metaKey || e.ctrlKey) && key === '{') { e.preventDefault(); zOrder(-1, true); return; }

  // Zoom
  if ((e.metaKey || e.ctrlKey) && (key === '=' || key === '+')) { e.preventDefault(); artboard.zoomBy(1.25); return; }
  if ((e.metaKey || e.ctrlKey) && key === '-') { e.preventDefault(); artboard.zoomBy(0.8); return; }
  if ((e.metaKey || e.ctrlKey) && key === '0') { e.preventDefault(); artboard.setZoom(1, true); return; }
  if (key === 'f') { e.preventDefault(); artboard.fit(); return; }

  // Shape Builder: Shift+M (matches Illustrator)
  if (key === 'm' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    tools.setActive('shapebuilder');
    return;
  }

  // Tool keys
  if (TOOL_KEYS[key] && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    tools.setActive(TOOL_KEYS[key]);
  }
});

// Undo / Redo buttons
document.getElementById('undo-btn').onclick = () => store.undo();
document.getElementById('redo-btn').onclick = () => store.redo();
