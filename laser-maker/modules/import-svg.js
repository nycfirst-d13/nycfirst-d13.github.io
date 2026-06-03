// =============================================================================
// import-svg.js — SVG file import (button + drag-drop)
// =============================================================================
import { store } from './state.js';
import { uid } from './utils.js';
import { tools } from './tools.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function extractMarkup(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') return null;

  const s = new XMLSerializer();
  let markup = '';
  for (const child of root.childNodes) {
    if (child.nodeType === 8 || child.nodeType === 7) continue; // comments, PIs
    markup += s.serializeToString(child);
  }
  return markup.trim();
}


function importSVG(svgText) {
  const markup = extractMarkup(svgText);
  if (!markup) {
    showToast('Invalid SVG file');
    return;
  }

  const id = uid('svg');

  store.commit(s => {
    s.shapes.push({
      id,
      type: 'rawsvg',
      name: 'Imported SVG',
      attrs: {
        markup,
        x: 0,
        y: 0,
      },
      rotation: 0,
      visible: true,
      locked: false,
      fill: 'none',
      stroke: 'none',
      strokeWidth: 1,
    });
    s.selection = [id];
  }, 'shape-create');

  tools.setActive('select');
  showToast('SVG imported');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- Button ----
const fileInput = document.getElementById('import-svg-input');
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importSVG(ev.target.result);
  reader.readAsText(file);
  fileInput.value = '';
});

// ---- Drag and drop ----
const canvasArea = document.getElementById('canvas-area');
let _dragCount = 0;

function hasSVG(dt) {
  return dt && Array.from(dt.types || []).includes('Files');
}

canvasArea.addEventListener('dragenter', e => {
  if (!hasSVG(e.dataTransfer)) return;
  e.preventDefault();
  _dragCount++;
  canvasArea.classList.add('svg-drag-over');
});

canvasArea.addEventListener('dragleave', () => {
  _dragCount = Math.max(0, _dragCount - 1);
  if (_dragCount === 0) canvasArea.classList.remove('svg-drag-over');
});

canvasArea.addEventListener('dragover', e => {
  if (!hasSVG(e.dataTransfer)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

canvasArea.addEventListener('drop', e => {
  e.preventDefault();
  _dragCount = 0;
  canvasArea.classList.remove('svg-drag-over');

  const file = Array.from(e.dataTransfer.files).find(
    f => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg')
  );
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => importSVG(ev.target.result);
  reader.readAsText(file);
});
