// =============================================================================
// import-svg.js — SVG file import (button + drag-drop)
// =============================================================================
import { store } from './state.js';
import { uid, inToPx } from './utils.js';
import { tools } from './tools.js';
import { artboard } from './artboard.js';
import { showToast } from './toast.js';
import { parseSVGToShapes, parseSVGDim } from './expand-svg.js';

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

function _commitRawSVG(markup, filename) {
  const id = uid('svg');
  const name = filename ? filename.replace(/\.svg$/i, '') : 'Imported SVG';
  store.commit(st => {
    st.shapes.push({
      id,
      type: 'rawsvg',
      name,
      attrs: { markup, x: 0, y: 0 },
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
}

function importSVG(svgText, filename, dropPt) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    showToast('Invalid SVG file');
    return;
  }
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    showToast('Invalid SVG file');
    return;
  }

  // Natural size: width/height attrs → px, fallback to viewBox, fallback to 96
  const vbParts = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const natW = parseSVGDim(root.getAttribute('width'))  || vbParts[2] * (96 / 72) || 96;
  const natH = parseSVGDim(root.getAttribute('height')) || vbParts[3] * (96 / 72) || 96;

  // initMat: identity — preserve SVG coordinates exactly.
  // For drag-drop on non-matching SVGs, offset so top-left lands at cursor.
  const st = store.get();
  const abW = inToPx(st.artboard.w), abH = inToPx(st.artboard.h);
  const matchesArtboard = Math.abs(natW - abW) < 1 && Math.abs(natH - abH) < 1;
  const tx = (dropPt && !matchesArtboard) ? dropPt.x : 0;
  const ty = (dropPt && !matchesArtboard) ? dropPt.y : 0;
  const initMat = [1, 0, 0, 1, tx, ty];

  const { shapes: extracted, hadUnsupported } = parseSVGToShapes(root, initMat);

  if (!extracted.length) {
    // No parseable shapes — fall back to rawsvg silently
    const markup = extractMarkup(svgText);
    if (markup) _commitRawSVG(markup, filename);
    else showToast('Invalid SVG file');
    return;
  }

  const id = uid('svg');
  const baseName = filename ? filename.replace(/\.svg$/i, '') : 'Imported SVG';
  const groupName = `Group IMPORT ${filename || 'imported.svg'}`;

  store.commit(st => {
    let pathCount = 0, textCount = 0;
    const newShapes = extracted.map(p => {
      const base = {
        fill: p.fill, stroke: p.stroke, strokeWidth: p.strokeWidth,
        processType: 'free', visible: true, locked: false,
        rotation: p.rotation || 0,
      };
      if (p._shapeType === 'text') {
        return { id: uid('xt'), type: 'text', name: `Text ${++textCount}`, attrs: p.attrs, ...base };
      }
      if (p._shapeType === 'image') {
        return { id: uid('img'), type: 'image', name: 'Image', attrs: p.attrs, ...base };
      }
      return { id: uid('xp'), type: 'path', name: `Path ${++pathCount}`, attrs: { d: p.d }, ...base };
    });

    const shape = newShapes.length === 1
      ? { ...newShapes[0], id, name: baseName }
      : {
          id, type: 'group', name: groupName,
          children: newShapes,
          processType: 'free', visible: true, locked: false, rotation: 0,
        };

    st.shapes.push(shape);
    st.selection = [id];
  }, 'shape-create');

  tools.setActive('select');

  if (hadUnsupported) {
    const markup = extractMarkup(svgText);
    showToast('SVG imported. Some elements skipped.', {
      action: {
        label: 'Import raw',
        onClick: () => {
          store.undo();
          if (markup) {
            _commitRawSVG(markup, filename);
            showToast('Imported as raw SVG');
          }
        },
      },
    });
  } else {
    showToast('SVG imported');
  }
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
// button import → top-left placed at canvas origin (0, 0).
function importImage(dataURL, dropPt) {
  const img = new Image();
  img.onload = () => {
    // 1 image pixel = 1 artboard pixel (96 px/in). Scale down to fit 4 inches
    // on longest side, preserving aspect ratio. Button import lands at (0,0);
    // drag-drop centers on cursor.
    let w = img.naturalWidth || 1, h = img.naturalHeight || 1;
    const MAX_PX = 4 * 96; // 384 px = 4 in
    const longest = Math.max(w, h);
    if (longest > MAX_PX) {
      const k = MAX_PX / longest;
      w *= k; h *= k;
    }
    const x = dropPt ? dropPt.x - w / 2 : 0;
    const y = dropPt ? dropPt.y - h / 2 : 0;
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

// ---- Button ----
const fileInput = document.getElementById('import-svg-input');
document.getElementById('import-svg-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importSVG(ev.target.result, file.name);
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
    const dropPt = artboard.screenToArtboard(e.clientX, e.clientY);
    const reader = new FileReader();
    reader.onload = ev => importSVG(ev.target.result, svgFile.name, dropPt);
    reader.readAsText(svgFile);
    return;
  }

  const rasterFile = files.find(isRasterFile);
  if (rasterFile) {
    const dropPt = artboard.screenToArtboard(e.clientX, e.clientY);
    loadImageFile(rasterFile, dropPt);
  }
});
