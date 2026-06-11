// =============================================================================
// import-svg.js — SVG file import (button + drag-drop)
// =============================================================================
import { store } from './state.js';
import { uid, inToPx } from './utils.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';

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
      processType: 'free',
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

// ---- Raster image import (png/jpg/gif/webp/bmp) ----
// Stored as type:'image' with the pixel data embedded as a base64 data URL in
// attrs.href. Export writes it back into the SVG as an <image> element, so the
// raster survives the round-trip into Illustrator → Epilog driver.
const RASTER_RE = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

function isRasterFile(file) {
  return file && (RASTER_RE.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name));
}

// dropPt — optional artboard-space point to center the image on. Omitted for
// button import → centers on the artboard.
function importImage(dataURL, dropPt) {
  const img = new Image();
  img.onload = () => {
    const s = store.get();
    const abW = inToPx(s.artboard.w), abH = inToPx(s.artboard.h);
    // 1 image pixel = 1 artboard pixel (96 px/in). Scale down to fit 90% of the
    // artboard if the image is larger, preserving aspect ratio.
    let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    const maxW = abW * 0.9, maxH = abH * 0.9;
    if (w > maxW || h > maxH) {
      const k = Math.min(maxW / w, maxH / h);
      w *= k; h *= k;
    }
    const cx = dropPt ? dropPt.x : abW / 2;
    const cy = dropPt ? dropPt.y : abH / 2;
    const x = cx - w / 2, y = cy - h / 2;
    const id = uid('img');
    store.commit(st => {
      st.shapes.push({
        id,
        type: 'image',
        name: 'Image',
        attrs: { x, y, w, h, href: dataURL, naturalW: img.naturalWidth, naturalH: img.naturalHeight },
        processType: 'free',
        rotation: 0,
        visible: true,
        locked: false,
        fill: 'none',
        stroke: 'none',
        strokeWidth: 1,
      });
      st.selection = [id];
    }, 'shape-create');
    tools.setActive('select');
    showToast('Image imported');
  };
  img.onerror = () => showToast('Could not load image');
  img.src = dataURL;
}

function loadImageFile(file, dropPt) {
  const reader = new FileReader();
  reader.onload = ev => importImage(ev.target.result, dropPt);
  reader.readAsDataURL(file);
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

// ---- Image button ----
const imgInput = document.getElementById('import-image-input');
if (imgInput) {
  imgInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
    imgInput.value = '';
  });
}

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

  const files = Array.from(e.dataTransfer.files);
  const svgFile = files.find(
    f => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg')
  );
  if (svgFile) {
    const reader = new FileReader();
    reader.onload = ev => importSVG(ev.target.result);
    reader.readAsText(svgFile);
    return;
  }

  const rasterFile = files.find(isRasterFile);
  if (rasterFile) {
    const dropPt = artboard.screenToArtboard(e.clientX, e.clientY);
    loadImageFile(rasterFile, dropPt);
  }
});
