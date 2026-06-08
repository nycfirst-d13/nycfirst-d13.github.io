// =============================================================================
// keys.js — keyboard shortcuts
// =============================================================================
import { store } from './state.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { deepClone, uid } from './utils.js';
import { nudgeShape } from './select.js';
import { groupSelected, ungroupSelected } from './group.js';

function _removeIdsFromGroupsKeys(shapes, ids) {
  for (const sh of shapes) {
    if (sh.type === 'group' && sh.children) {
      sh.children = sh.children.filter(c => !ids.has(c.id));
      _removeIdsFromGroupsKeys(sh.children, ids);
    }
  }
}

let clipboard = [];
let pasteCount = 0;

// Deep clone a shape tree, assigning fresh IDs to every shape including group children
function deepCloneWithNewIds(sh) {
  const clone = deepClone(sh);
  clone.id = uid();
  if (clone.type === 'group' && clone.children) {
    clone.children = clone.children.map(deepCloneWithNewIds);
  }
  return clone;
}
const PASTE_OFFSET = 10 / 96;  // 10px in artboard units (inches)
const NUDGE = 1 / 96;          // 1px
const NUDGE_BIG = 10 / 96;     // 10px (shift+arrow)

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
    if (toExtreme) {
      const sel = s.shapes.filter(sh => s.selection.includes(sh.id));
      const rest = s.shapes.filter(sh => !s.selection.includes(sh.id));
      s.shapes = dir > 0 ? [...rest, ...sel] : [...sel, ...rest];
    } else {
      const order = dir > 0
        ? [...s.shapes].reverse().filter(sh => s.selection.includes(sh.id)).map(sh => sh.id)
        : s.shapes.filter(sh => s.selection.includes(sh.id)).map(sh => sh.id);
      for (const id of order) {
        const i = s.shapes.findIndex(sh => sh.id === id);
        const j = i + dir;
        if (j < 0 || j >= s.shapes.length) continue;
        if (s.selection.includes(s.shapes[j].id)) continue;
        [s.shapes[i], s.shapes[j]] = [s.shapes[j], s.shapes[i]];
      }
    }
  }, 'reorder');
}

window.addEventListener('keydown', (e) => {
  if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;

  const key = e.key.toLowerCase();

  // Group / Ungroup
  if ((e.metaKey || e.ctrlKey) && key === 'g' && !e.shiftKey) { e.preventDefault(); groupSelected(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 'g' && e.shiftKey)  { e.preventDefault(); ungroupSelected(); return; }

  // Undo / Redo
  if ((e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
  if ((e.metaKey || e.ctrlKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return; }

  // Copy
  if ((e.metaKey || e.ctrlKey) && key === 'c') {
    const sel = store.selectedShapes();
    if (!sel.length) return;
    e.preventDefault();
    clipboard = deepClone(sel);
    pasteCount = 0;
    return;
  }

  // Cut
  if ((e.metaKey || e.ctrlKey) && key === 'x') {
    const sel = store.selectedShapes();
    if (!sel.length) return;
    e.preventDefault();
    clipboard = sel.map(deepCloneWithNewIds);
    pasteCount = 0;
    store.commit(st => {
      const ids = new Set(st.selection);
      st.shapes = st.shapes.filter(s => !ids.has(s.id));
      _removeIdsFromGroupsKeys(st.shapes, ids);
      st.selection = [];
    }, 'cut');
    return;
  }

  // Paste in place (Cmd/Ctrl+Shift+V — checked before regular paste)
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'v') {
    if (!clipboard.length) return;
    e.preventDefault();
    const newShapes = clipboard.map(deepCloneWithNewIds);
    store.commit(st => {
      st.shapes.push(...newShapes);
      st.selection = newShapes.map(s => s.id);
    }, 'paste');
    return;
  }

  // Paste
  if ((e.metaKey || e.ctrlKey) && key === 'v') {
    if (!clipboard.length) return;
    e.preventDefault();
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
    if (!store.get().selection.length) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
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
