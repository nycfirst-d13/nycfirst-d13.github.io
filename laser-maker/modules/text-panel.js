// =============================================================================
// text-panel.js — font picker, text property controls
// =============================================================================
import { store } from './state.js';
import { uid } from './utils.js';
import * as fontkit from 'https://esm.sh/fontkit@2.0.4';

const FONTS = [
  // Sans-serif
  { family: 'Inter',              category: 'Sans-serif',  weights: [100,200,300,400,500,600,700,800,900] },
  { family: 'Roboto',             category: 'Sans-serif',  weights: [100,300,400,500,700,900] },
  { family: 'Montserrat',         category: 'Sans-serif',  weights: [100,200,300,400,500,600,700,800,900] },
  { family: 'Poppins',            category: 'Sans-serif',  weights: [100,200,300,400,500,600,700,800,900] },
  { family: 'Nunito',             category: 'Sans-serif',  weights: [200,300,400,500,600,700,800,900] },
  { family: 'Outfit',             category: 'Sans-serif',  weights: [100,200,300,400,500,600,700,800,900] },
  { family: 'DM Sans',            category: 'Sans-serif',  weights: [100,200,300,400,500,600,700,800,900] },
  { family: 'Open Sans',          category: 'Sans-serif',  weights: [300,400,500,600,700,800] },
  // Serif
  { family: 'Playfair Display',   category: 'Serif',       weights: [400,500,600,700,800,900] },
  { family: 'Merriweather',       category: 'Serif',       weights: [300,400,700,900] },
  { family: 'Lora',               category: 'Serif',       weights: [400,500,600,700] },
  { family: 'EB Garamond',        category: 'Serif',       weights: [400,500,600,700,800] },
  { family: 'Cormorant Garamond', category: 'Serif',       weights: [300,400,500,600,700] },
  { family: 'Libre Baskerville',  category: 'Serif',       weights: [400,700] },
  // Display
  { family: 'Bebas Neue',         category: 'Display',     weights: [400] },
  { family: 'Righteous',          category: 'Display',     weights: [400] },
  { family: 'Abril Fatface',      category: 'Display',     weights: [400] },
  { family: 'Fredoka',            category: 'Display',     weights: [300,400,500,600,700] },
  { family: 'Titan One',          category: 'Display',     weights: [400] },
  { family: 'Boogaloo',           category: 'Display',     weights: [400] },
  // Handwriting
  { family: 'Dancing Script',     category: 'Handwriting', weights: [400,500,600,700] },
  { family: 'Pacifico',           category: 'Handwriting', weights: [400] },
  { family: 'Caveat',             category: 'Handwriting', weights: [400,500,600,700] },
  { family: 'Sacramento',         category: 'Handwriting', weights: [400] },
  { family: 'Great Vibes',        category: 'Handwriting', weights: [400] },
  { family: 'Satisfy',            category: 'Handwriting', weights: [400] },
  { family: 'Kaushan Script',     category: 'Handwriting', weights: [400] },
  // Monospace
  { family: 'Roboto Mono',        category: 'Monospace',   weights: [100,200,300,400,500,600,700] },
  { family: 'Space Mono',         category: 'Monospace',   weights: [400,700] },
  { family: 'Source Code Pro',    category: 'Monospace',   weights: [200,300,400,500,600,700,800,900] },
  { family: 'JetBrains Mono',     category: 'Monospace',   weights: [100,200,300,400,500,600,700,800] },
  { family: 'Fira Code',          category: 'Monospace',   weights: [300,400,500,600,700] },
  // Fun
  { family: 'Permanent Marker',   category: 'Fun',         weights: [400] },
  { family: 'Bangers',            category: 'Fun',         weights: [400] },
  { family: 'Press Start 2P',     category: 'Fun',         weights: [400] },
  { family: 'Comfortaa',          category: 'Fun',         weights: [300,400,500,600,700] },
  { family: 'Lobster',            category: 'Fun',         weights: [400] },
  { family: 'Bubblegum Sans',     category: 'Fun',         weights: [400] },
  { family: 'Fredoka One',        category: 'Fun',         weights: [400] },
];

const WEIGHT_LABELS = {
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular',
  500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
};

const loadedFonts = new Set();
const customFonts = [];
const fontBufferCache = new Map();

const sizeInput    = document.getElementById('text-size');
const weightSelect = document.getElementById('text-weight');
const alignGroup   = document.getElementById('text-align-group');
const fontSearch   = document.getElementById('font-search');
const fontList     = document.getElementById('font-list');
const uploadBtn      = document.getElementById('upload-font-btn');
const uploadInput    = document.getElementById('upload-font-input');
const convertBtn     = document.getElementById('convert-to-path-btn');

let observer = null;
let syncing = false;
let searchDebounce = null;

// ---- Google Fonts loading ----

function loadGoogleFont(family, weights) {
  const key = family + ':' + weights.join(',');
  if (loadedFonts.has(key)) return;
  loadedFonts.add(key);
  const wStr = weights.join(';');
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${wStr}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

// ---- Font list rendering ----

function allFonts() {
  return [...FONTS, ...customFonts];
}

function buildFontList(filter) {
  // Disconnect old observer
  if (observer) { observer.disconnect(); observer = null; }

  const filterLower = (filter || '').toLowerCase().trim();
  const fonts = allFonts().filter(f =>
    !filterLower || f.family.toLowerCase().includes(filterLower)
  );

  // Group by category preserving insertion order
  const categories = [];
  const byCategory = {};
  for (const f of fonts) {
    if (!byCategory[f.category]) {
      byCategory[f.category] = [];
      categories.push(f.category);
    }
    byCategory[f.category].push(f);
  }

  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  const currentFamily = (sel.length === 1 && sel[0].type === 'text') ? sel[0].attrs.family : null;

  fontList.innerHTML = '';

  if (fonts.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:12px 10px;font-size:12px;color:var(--muted);text-align:center';
    empty.textContent = 'No fonts found';
    fontList.appendChild(empty);
    return;
  }

  for (const cat of categories) {
    const header = document.createElement('div');
    header.className = 'font-category';
    header.textContent = cat;
    fontList.appendChild(header);

    for (const font of byCategory[cat]) {
      const item = document.createElement('div');
      item.className = 'font-item' + (font.family === currentFamily ? ' selected' : '');
      item.dataset.family = font.family;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', font.family === currentFamily ? 'true' : 'false');

      const nameEl = document.createElement('span');
      nameEl.className = 'font-item-name';
      nameEl.textContent = font.family;
      nameEl.style.fontFamily = `'${font.family}', sans-serif`;

      const sampleEl = document.createElement('span');
      sampleEl.className = 'font-item-sample';
      sampleEl.textContent = 'Aa';
      sampleEl.style.fontFamily = `'${font.family}', sans-serif`;

      item.appendChild(nameEl);
      item.appendChild(sampleEl);
      item.addEventListener('click', () => applyFontFamily(font.family));
      fontList.appendChild(item);
    }
  }

  // Lazy-load fonts as items scroll into view
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const family = entry.target.dataset.family;
        if (family) loadGoogleFont(family, [400]);
      }
    }
  }, { root: fontList, threshold: 0.1 });

  fontList.querySelectorAll('.font-item').forEach(el => observer.observe(el));
}

// ---- Weight dropdown ----

function updateWeightDropdown(family, currentWeight) {
  const font = allFonts().find(f => f.family === family);
  const weights = font ? font.weights : [400];

  weightSelect.innerHTML = '';
  for (const w of weights) {
    const opt = document.createElement('option');
    opt.value = w;
    opt.textContent = `${w} — ${WEIGHT_LABELS[w] || ''}`;
    weightSelect.appendChild(opt);
  }

  // Select closest available weight
  if (currentWeight != null) {
    const available = weights;
    const closest = available.reduce((best, w) => Math.abs(w - currentWeight) < Math.abs(best - currentWeight) ? w : best, available[0]);
    weightSelect.value = closest;
  }
}

// ---- Apply functions ----

function applyFontFamily(family) {
  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean)
    .filter(sh => sh.type === 'text');
  if (!sel.length) return;

  store.commit(st => {
    for (const id of st.selection) {
      const sh = st.shapes.find(x => x.id === id);
      if (!sh || sh.type !== 'text') continue;
      sh.attrs.family = family;
    }
  }, 'text-family');

  const font = allFonts().find(f => f.family === family);
  if (font) loadGoogleFont(family, font.weights);

  // Update list highlight without full rebuild
  fontList.querySelectorAll('.font-item').forEach(el => {
    const active = el.dataset.family === family;
    el.classList.toggle('selected', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // Scroll selected item into view
  const selectedEl = fontList.querySelector('.font-item.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });

  const currentWeight = sel[0].attrs.weight;
  updateWeightDropdown(family, currentWeight);
}

function applyFontSize(size) {
  const v = parseInt(size, 10);
  if (!v || v < 1) return;
  store.commit(st => {
    for (const id of st.selection) {
      const sh = st.shapes.find(x => x.id === id);
      if (!sh || sh.type !== 'text') continue;
      sh.attrs.size = v;
    }
  }, 'text-size');
}

function applyFontWeight(weight) {
  const v = parseInt(weight, 10);
  store.commit(st => {
    for (const id of st.selection) {
      const sh = st.shapes.find(x => x.id === id);
      if (!sh || sh.type !== 'text') continue;
      sh.attrs.weight = v;
    }
  }, 'text-weight');
}

function applyAlign(align) {
  store.commit(st => {
    for (const id of st.selection) {
      const sh = st.shapes.find(x => x.id === id);
      if (!sh || sh.type !== 'text') continue;
      sh.attrs.align = align;
    }
  }, 'text-align');

  alignGroup.querySelectorAll('[data-align]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.align === align);
  });
}

// ---- Custom font upload ----

async function handleCustomFontUpload(file) {
  if (!file) return;
  const buffer = await file.arrayBuffer();

  // Derive font name from filename
  let name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()).trim();

  // Deduplicate name
  const existing = customFonts.filter(f => f.family.startsWith(name));
  if (existing.length > 0) name += ` ${existing.length + 1}`;

  try {
    const fontFace = new FontFace(name, buffer);
    await fontFace.load();
    document.fonts.add(fontFace);
    loadedFonts.add(name + ':400');

    customFonts.push({ family: name, category: 'Custom', weights: [400], buffer });
    fontBufferCache.set(`${name}:400`, buffer);
    buildFontList(fontSearch.value);
    applyFontFamily(name);

    // Scroll the custom font item into view
    const item = fontList.querySelector(`[data-family="${CSS.escape(name)}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });

    toast(`Font "${name}" added`);
  } catch (e) {
    console.warn('Failed to load custom font:', e);
    toast('Failed to load font — try TTF or OTF');
  }
}

// ---- Toast ----

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---- Convert text to path ----

async function fetchFontBuffer(family, weight) {
  // Strip CSS fallbacks: "Geist, sans-serif" -> "Geist"
  const cleanFamily = family.split(',')[0].trim().replace(/['"]/g, '');
  const key = `${cleanFamily}:${weight}`;
  if (fontBufferCache.has(key)) return fontBufferCache.get(key);

  // Check custom fonts first
  const custom = customFonts.find(f => f.family === family || f.family === cleanFamily);
  if (custom && custom.buffer) {
    fontBufferCache.set(key, custom.buffer);
    return custom.buffer;
  }

  // Fetch CSS from Google Fonts to get the actual font file URL
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanFamily)}:wght@${weight}&display=swap`;
  const cssResp = await fetch(cssUrl);
  if (!cssResp.ok) throw new Error(`Font CSS not found for "${cleanFamily}"`);
  const css = await cssResp.text();

  // Extract font file URL — last match is typically the basic Latin subset
  const matches = [...css.matchAll(/url\(([^)]+)\)/g)];
  if (!matches.length) throw new Error(`No font URL in CSS for "${cleanFamily}"`);
  const fontUrl = matches[matches.length - 1][1].replace(/['"]/g, '');

  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Failed to download font file for "${cleanFamily}"`);
  const buffer = await fontResp.arrayBuffer();

  fontBufferCache.set(key, buffer);
  return buffer;
}

async function convertTextToPath() {
  if (!fontkit) { toast('Font engine not loaded yet — try again'); return; }

  const s = store.get();
  const sh = s.selection.length === 1
    ? s.shapes.find(x => x.id === s.selection[0])
    : null;
  if (!sh || sh.type !== 'text') return;

  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting…';

  try {
    const family = sh.attrs.family || 'Geist';
    const weight = sh.attrs.weight || 400;
    const rawBuffer = await fetchFontBuffer(family, weight);

    // fontkit handles woff2/woff/ttf/otf natively — no pre-decoding needed
    const font = fontkit.create(new Uint8Array(rawBuffer));

    const size = sh.attrs.size || 28;
    const text = sh.attrs.content || '';
    const scale = size / font.unitsPerEm;

    // dominant-baseline:text-before-edge → y is top of em ≈ ascender above baseline
    const ascender = (font.ascent || font.unitsPerEm * 0.8) * scale;
    const baselineY = sh.attrs.y + ascender;

    // Layout applies GPOS kerning automatically
    const glyphRun = font.layout(text);

    // Advance width for alignment offset
    const textWidth = glyphRun.positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale;

    let curX = sh.attrs.x;
    const align = sh.attrs.align || 'left';
    if (align === 'center') curX -= textWidth / 2;
    else if (align === 'right') curX -= textWidth;

    // Build SVG path: font units are Y-up from baseline; SVG is Y-down
    const parts = [];
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const glyph = glyphRun.glyphs[i];
      const pos   = glyphRun.positions[i];
      const tx = curX + pos.xOffset * scale;
      const ty = baselineY - pos.yOffset * scale;

      for (const cmd of (glyph.path.commands || [])) {
        const a = cmd.args;
        switch (cmd.command) {
          case 'moveTo':
            parts.push(`M${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)}`);
            break;
          case 'lineTo':
            parts.push(`L${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)}`);
            break;
          case 'quadraticCurveTo':
            parts.push(`Q${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)} ${(tx + a[2]*scale).toFixed(2)} ${(ty - a[3]*scale).toFixed(2)}`);
            break;
          case 'bezierCurveTo':
            parts.push(`C${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)} ${(tx + a[2]*scale).toFixed(2)} ${(ty - a[3]*scale).toFixed(2)} ${(tx + a[4]*scale).toFixed(2)} ${(ty - a[5]*scale).toFixed(2)}`);
            break;
          case 'closePath':
            parts.push('Z');
            break;
        }
      }
      curX += pos.xAdvance * scale;
    }

    const d = parts.join(' ');
    if (!d.trim()) { toast('Nothing to convert — try a different font'); return; }

    const newId = uid('p');

    store.commit(st => {
      const idx = st.shapes.findIndex(x => x.id === sh.id);
      if (idx === -1) return;
      st.shapes.splice(idx, 1, {
        id: newId,
        type: 'path',
        name: sh.name + ' outline',
        attrs: { d, fillRule: 'nonzero' },
        fill: sh.fill || '#0F1419',
        stroke: 'none',
        strokeWidth: 0,
        visible: sh.visible,
        locked: sh.locked,
        rotation: sh.rotation || 0,
        _bbox: null,
      });
      st.selection = [newId];
    }, 'convert-text');

    toast('Converted to path');
  } catch (err) {
    console.error('Convert to path failed:', err);
    toast('Conversion failed — ' + err.message);
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = 'Convert to Path';
  }
}

// ---- Sync from store ----

function syncFromStore() {
  if (syncing) return;
  syncing = true;

  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  const sh = sel.length === 1 && sel[0].type === 'text' ? sel[0] : null;

  if (sh) {
    sizeInput.value = sh.attrs.size || 28;
    updateWeightDropdown(sh.attrs.family, sh.attrs.weight);

    const align = sh.attrs.align || 'left';
    alignGroup.querySelectorAll('[data-align]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === align);
    });

    // Update selected highlight in font list
    const family = sh.attrs.family;
    fontList.querySelectorAll('.font-item').forEach(el => {
      const active = el.dataset.family === family;
      el.classList.toggle('selected', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const selectedEl = fontList.querySelector('.font-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  syncing = false;
}

// ---- Event wiring ----

sizeInput.addEventListener('change', () => {
  if (syncing) return;
  applyFontSize(sizeInput.value);
});

sizeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') applyFontSize(sizeInput.value);
});

weightSelect.addEventListener('change', () => {
  if (syncing) return;
  applyFontWeight(weightSelect.value);
});

alignGroup.addEventListener('click', e => {
  const btn = e.target.closest('[data-align]');
  if (btn) applyAlign(btn.dataset.align);
});

fontSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => buildFontList(fontSearch.value), 150);
});

uploadInput.addEventListener('change', () => {
  handleCustomFontUpload(uploadInput.files[0]);
  uploadInput.value = '';
});

convertBtn.addEventListener('click', convertTextToPath);

// ---- Init ----

store.subscribe(syncFromStore);
buildFontList('');

export { fetchFontBuffer, fontkit };
