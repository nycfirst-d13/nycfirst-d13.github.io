// =============================================================================
// layers.js — layers panel (stacking order, visibility, delete)
// =============================================================================
import { store } from './state.js';
import { enterIsolation } from './group.js';
import { PROCESS_DEFINITIONS } from './process-registry.js';

const list = document.getElementById('layers');

const TYPE_ICON = {
  rect:    `<svg viewBox="0 0 16 16"><rect x="3" y="3.5" width="10" height="9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  ellipse: `<svg viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="5.5" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  line:    `<svg viewBox="0 0 16 16"><path d="M3 13 L13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  polygon: `<svg viewBox="0 0 16 16"><path d="M8 2.5 L13.5 6.5 L11.5 12.5 L4.5 12.5 L2.5 6.5 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  star:    `<svg viewBox="0 0 16 16"><path d="M8 1.5 L9.4 5.9 L14 5.9 L10.3 8.6 L11.7 13 L8 10.3 L4.3 13 L5.7 8.6 L2 5.9 L6.6 5.9 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  path:    `<svg viewBox="0 0 16 16"><path d="M3 12 Q5 4 8 8 T13 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  text:    `<svg viewBox="0 0 16 16"><path d="M3 5 L3 4 L13 4 L13 5 M8 4 L8 13 M6 13 L10 13" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`,
  group:   `<svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="2" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
  rawsvg:  `<svg viewBox="0 0 16 16"><path d="M5 5 L2 8 L5 11 M11 5 L14 8 L11 11 M9 3 L7 13" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  image:   `<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6.5" r="1.1" fill="currentColor"/><path d="M3 12 L6.5 8.5 L9 11 L11 9 L13 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const expandedGroups = new Set();
let _prevIsolationGroup = null;

function render() {
  const s = store.get();
  if (s.isolationGroup) {
    expandedGroups.add(s.isolationGroup);
  } else if (_prevIsolationGroup) {
    expandedGroups.delete(_prevIsolationGroup);
  }
  _prevIsolationGroup = s.isolationGroup;
  list.replaceChildren();
  if (!s.shapes.length) {
    const empty = document.createElement('div');
    empty.className = 'layer-empty';
    empty.textContent = 'No layers yet. Draw something.';
    list.appendChild(empty);
    return;
  }
  renderLayerList(s.shapes, 0, s);
}

function renderLayerList(shapes, depth, s) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const sh = shapes[i];
    const isGroup = sh.type === 'group';
    const isExpanded = isGroup && expandedGroups.has(sh.id);
    const isIsolated = s.isolationGroup === sh.id;
    const li = document.createElement('li');
    li.className = 'layer'
      + (s.selection.includes(sh.id) ? ' selected' : '')
      + (isIsolated ? ' layer-isolated' : '');
    li.dataset.id = sh.id;
    const indent = depth * 14;
    const lockIcon = sh.locked
      ? `<svg viewBox="0 0 16 16" width="12" height="12"><rect x="3.5" y="7" width="9" height="7" rx="1" fill="currentColor"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`
      : `<svg viewBox="0 0 16 16" width="12" height="12"><rect x="3.5" y="7" width="9" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
    const visIcon = sh.visible !== false
      ? `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M1.5 8 C 4 4 12 4 14.5 8 C 12 12 4 12 1.5 8 Z M8 6 a2 2 0 0 1 0 4 a2 2 0 0 1 0 -4" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 8 C 4 5 12 5 14 8 M3 4 L13 12" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;

    if (isGroup) {
      const childCount = sh.children.length;
      li.innerHTML = `
        <span class="layer-indent" style="width:${indent}px;flex-shrink:0"></span>
        <span class="layer-expand" data-expand="${sh.id}">${isExpanded ? '▾' : '▸'}</span>
        <span class="layer-thumb">${TYPE_ICON.group}</span>
        <span class="layer-name">${escapeHtml(layerDisplayName(sh))} <span class="layer-count">(${childCount})</span></span>
        <span class="layer-actions">
          <button data-act="lock" title="Toggle lock" class="${sh.locked ? 'active' : ''}">${lockIcon}</button>
          <button data-act="vis" title="Toggle visibility">${visIcon}</button>
        </span>`;
    } else {
      li.innerHTML = `
        <span class="layer-indent" style="width:${indent + 16}px;flex-shrink:0"></span>
        <span class="layer-thumb">${TYPE_ICON[sh.type] || ''}</span>
        <span class="layer-name">${escapeHtml(layerDisplayName(sh))}</span>
        <span class="layer-actions">
          <button data-act="lock" title="Toggle lock" class="${sh.locked ? 'active' : ''}">${lockIcon}</button>
          <button data-act="vis" title="Toggle visibility">${visIcon}</button>
        </span>`;
    }
    list.appendChild(li);

    if (isGroup && isExpanded && sh.children.length) {
      renderLayerList(sh.children, depth + 1, s);
    }
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function layerDisplayName(sh) {
  if (sh.type === 'group') return sh.name;
  const def = PROCESS_DEFINITIONS[sh.processType ?? 'free'] ?? PROCESS_DEFINITIONS.free;
  return `${def.prefix} — ${sh.name}`;
}

list.addEventListener('click', e => {
  // Toggle group expand/collapse
  const expandEl = e.target.closest('[data-expand]');
  if (expandEl) {
    const id = expandEl.dataset.expand;
    if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id);
    render();
    return;
  }

  const li = e.target.closest('.layer');
  if (!li) return;
  const id = li.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'lock') {
    store.commit(() => {
      const sh = store.findShape(id);
      if (sh) sh.locked = !sh.locked;
    }, 'lock');
    return;
  }
  if (act === 'vis') {
    store.commit(() => {
      const sh = store.findShape(id);
      if (sh) sh.visible = !(sh.visible !== false);
    }, 'visibility');
    return;
  }
  // Select layer
  store.patch(s => {
    if (e.shiftKey) {
      s.selection = s.selection.includes(id) ? s.selection.filter(x => x !== id) : [...s.selection, id];
    } else {
      s.selection = [id];
    }
  }, 'selection');
});

list.addEventListener('dblclick', e => {
  const expandEl = e.target.closest('[data-expand]');
  if (expandEl) return; // handled by click
  const li = e.target.closest('.layer');
  if (!li) return;
  const id = li.dataset.id;
  const sh = store.findShape(id);
  if (!sh) return;
  if (sh.type === 'group') {
    enterIsolation(id);
    return;
  }
  const newName = prompt('Rename layer:', sh.name);
  if (newName != null && newName.trim()) {
    store.commit(() => {
      const x = store.findShape(id);
      if (x) x.name = newName.trim();
    }, 'rename');
  }
});

// Layer order + delete buttons
document.getElementById('layer-up').onclick = () => moveSel(+1);
document.getElementById('layer-down').onclick = () => moveSel(-1);
document.getElementById('layer-del').onclick = () => deleteSel();

function moveSel(dir) {
  store.commit(s => {
    if (!s.selection.length) return;

    // Route each selected id to its actual parent array (top-level or group children).
    // Children selected from the layers panel move within their group regardless of
    // whether isolation mode is active.
    const arrToSelIds = new Map();
    for (const id of s.selection) {
      const parent = store.findParentGroup(id);
      if (parent === undefined) continue; // id not found anywhere
      const arr = parent === null ? s.shapes : parent.children;
      if (!arrToSelIds.has(arr)) arrToSelIds.set(arr, []);
      arrToSelIds.get(arr).push(id);
    }

    for (const [arr, selIds] of arrToSelIds) {
      const selSet = new Set(selIds);
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
  }, 'reorder');
}

function deleteSel() {
  store.commit(s => {
    const ids = new Set(s.selection);
    s.shapes = s.shapes.filter(sh => !ids.has(sh.id));
    _removeIdsFromGroupsLayers(s.shapes, ids);
    s.selection = [];
    if (ids.has(s.isolationGroup)) s.isolationGroup = null;
  }, 'delete');
}

function _removeIdsFromGroupsLayers(shapes, ids) {
  for (const sh of shapes) {
    if (sh.type === 'group') {
      sh.children = sh.children.filter(c => !ids.has(c.id));
      _removeIdsFromGroupsLayers(sh.children, ids);
    }
  }
}

store.subscribe(render);
render();
