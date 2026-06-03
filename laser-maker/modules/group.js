// =============================================================================
// group.js — group/ungroup operations and isolation mode
// =============================================================================
import { store } from './state.js';
import { uid } from './utils.js';

let _groupCount = 0;

export function groupSelected() {
  const s = store.get();
  if (s.selection.length < 2) return;

  const selectedIds = new Set(s.selection);
  const activeShapes = s.isolationGroup
    ? (store.findShape(s.isolationGroup)?.children ?? [])
    : s.shapes;
  const toGroup = activeShapes.filter(sh => selectedIds.has(sh.id));
  if (toGroup.length < 2) return;

  // Find topmost index among selected shapes in the active array
  let topIdx = 0;
  for (let i = 0; i < activeShapes.length; i++) {
    if (selectedIds.has(activeShapes[i].id)) topIdx = i;
  }

  const groupId = uid('g');
  const groupShape = {
    id: groupId,
    type: 'group',
    name: `Group ${++_groupCount}`,
    children: toGroup.slice(),
    visible: true,
    locked: false,
    rotation: 0,
  };

  // Capture original array reference before commit mutates it
  const origActive = activeShapes.slice();

  store.commit(st => {
    const parentGroup = st.isolationGroup ? store.findShape(st.isolationGroup) : null;
    const arr = parentGroup ? parentGroup.children : st.shapes;
    const filtered = arr.filter(sh => !selectedIds.has(sh.id));
    let insertAt = 0;
    for (let i = 0; i <= topIdx; i++) {
      if (!selectedIds.has(origActive[i].id)) insertAt++;
    }
    filtered.splice(insertAt, 0, groupShape);
    if (parentGroup) {
      parentGroup.children = filtered;
    } else {
      st.shapes = filtered;
    }
    st.selection = [groupId];
  }, 'group');
}

export function ungroupSelected() {
  const s = store.get();
  if (!s.selection.length) return;

  const groups = s.selection
    .map(id => store.findShape(id))
    .filter(sh => sh?.type === 'group');
  if (!groups.length) return;

  store.commit(st => {
    const newSel = [];
    for (const grp of groups) {
      const children = grp.children.slice();
      const topIdx = st.shapes.findIndex(sh => sh.id === grp.id);
      if (topIdx >= 0) {
        st.shapes.splice(topIdx, 1, ...children);
      } else {
        const parent = _findGroupContaining(st.shapes, grp.id);
        if (parent) {
          const ci = parent.children.findIndex(sh => sh.id === grp.id);
          if (ci >= 0) parent.children.splice(ci, 1, ...children);
        }
      }
      newSel.push(...children.map(c => c.id));
    }
    st.selection = newSel;
    // Exit isolation if the isolated group was just ungrouped
    if (groups.some(g => g.id === st.isolationGroup)) st.isolationGroup = null;
  }, 'ungroup');
}

export function enterIsolation(id) {
  const sh = store.findShape(id);
  if (sh?.type !== 'group') return;
  store.patch(st => {
    st.isolationGroup = id;
    st.selection = [];
  }, 'isolation');
}

export function exitIsolation() {
  const s = store.get();
  const groupId = s.isolationGroup;
  store.patch(st => {
    st.isolationGroup = null;
    if (groupId) st.selection = [groupId];
  }, 'isolation');
}

function _findGroupContaining(shapes, id) {
  for (const sh of shapes) {
    if (sh.type === 'group') {
      if (sh.children.some(c => c.id === id)) return sh;
      const found = _findGroupContaining(sh.children, id);
      if (found) return found;
    }
  }
  return null;
}
