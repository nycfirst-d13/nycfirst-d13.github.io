// =============================================================================
// text-panel.js — font picker, text property controls
// =============================================================================
import { store } from './state.js';
import { uid } from './utils.js';
import * as fontkit from 'https://esm.sh/fontkit@2.0.4';

let FONTS = [
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
const collapsedCategories = new Set();
const knownCategories = new Set();

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

// ---- Bunny Fonts loading ----

function loadBunnyFont(family, weights) {
  const key = family + ':' + weights.join(',');
  if (loadedFonts.has(key)) return;
  loadedFonts.add(key);
  const fontEntry = [...FONTS, ...customFonts].find(f => f.family === family);
  const slug = fontEntry?.slug || family.toLowerCase().replace(/\s+/g, '-');
  const wStr = weights.join(',');
  const url = `https://fonts.bunny.net/css?family=${encodeURIComponent(slug)}:${wStr}&display=swap`;
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

  // New categories default to collapsed
  for (const cat of categories) {
    if (!knownCategories.has(cat)) {
      knownCategories.add(cat);
      collapsedCategories.add(cat);
    }
  }

  // When filtering, expand all matching categories
  if (filterLower) {
    for (const cat of categories) collapsedCategories.delete(cat);
  }

  for (const cat of categories) {
    const collapsed = collapsedCategories.has(cat);

    const header = document.createElement('div');
    header.className = 'font-category' + (collapsed ? ' collapsed' : '');
    header.textContent = cat;
    fontList.appendChild(header);

    const itemsWrapper = document.createElement('div');
    itemsWrapper.className = 'font-category-items';
    if (collapsed) itemsWrapper.hidden = true;

    header.addEventListener('click', () => {
      const isNowCollapsed = !itemsWrapper.hidden;
      itemsWrapper.hidden = isNowCollapsed;
      header.classList.toggle('collapsed', isNowCollapsed);
      if (isNowCollapsed) collapsedCategories.add(cat);
      else collapsedCategories.delete(cat);
    });

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
      itemsWrapper.appendChild(item);
    }

    fontList.appendChild(itemsWrapper);
  }

  // Lazy-load fonts as items scroll into view
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const family = entry.target.dataset.family;
        if (family) loadBunnyFont(family, [400]);
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
  if (font) loadBunnyFont(family, font.weights);

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

  // Fetch font file directly from Bunny's predictable URL pattern
  const fontEntry = allFonts().find(f => f.family === cleanFamily || f.family === family);
  const slug = fontEntry?.slug || cleanFamily.toLowerCase().replace(/\s+/g, '-');
  const availableWeights = fontEntry?.weights || [400];
  const snappedWeight = availableWeights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best, availableWeights[0]);
  const fontUrl = `https://fonts.bunny.net/${slug}/files/${slug}-latin-${snappedWeight}-normal.woff2`;

  const fontResp = await fetch(fontUrl);
  if (!fontResp.ok) throw new Error(`Font file not found for "${cleanFamily}" (${snappedWeight})`);
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

    const font = fontkit.create(new Uint8Array(rawBuffer));

    const size       = sh.attrs.size       || 28;
    const text       = sh.attrs.content    || '';
    const align      = sh.attrs.align      || 'left';
    const lineHeight = (sh.attrs.lineHeight || 1.2) * size;
    const frameW     = sh.attrs.width      ?? null;
    const scale      = size / font.unitsPerEm;
    // For frame text: measure the exact CSS baseline offset from the container top via DOM.
    // A zero-height inline-block with vertical-align:baseline sits with its top edge ON the baseline,
    // so (spanRect.top - divRect.top) = distance from container top to first baseline — no metric guesswork.
    // For single-point SVG text: dominant-baseline:text-before-edge puts attrs.y at the ascender line,
    // so baseline = attrs.y + fontkit ascent (no leading).
    let firstBaselineOffset;
    if (frameW) {
      const _d = document.createElement('div');
      _d.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;left:-9999px;top:0;` +
        `font-family:"${family}",sans-serif;font-size:${size}px;` +
        `font-weight:${weight};line-height:${sh.attrs.lineHeight || 1.2};`;
      _d.innerHTML = '<span style="display:inline-block;height:0;vertical-align:baseline;"></span>';
      document.body.appendChild(_d);
      firstBaselineOffset = _d.querySelector('span').getBoundingClientRect().top
                          - _d.getBoundingClientRect().top;
      document.body.removeChild(_d);
    } else {
      firstBaselineOffset = (font.ascent || font.unitsPerEm * 0.8) * scale;
    }
    const ascender = firstBaselineOffset; // kept as `ascender` for use below

    // CSS tab-size default = 8 × space advance
    const spaceAdv = (font.layout(' ').positions[0]?.xAdvance ?? font.unitsPerEm * 0.25) * scale;
    const tabWidth = 8 * spaceAdv;

    // Layout a single line with CSS-accurate tab stops (measured from relX=0 = frame left).
    // Splits text at \t boundaries so each plain-text run goes through font.layout separately.
    // Returns { segments:[{run,relX}], lineW } — relX is offset from frame left.
    function layoutLine(lineText) {
      let relX = 0;
      const segments = [];
      let buf = '';
      for (const ch of lineText) {
        if (ch === '\t') {
          if (buf) {
            const run = font.layout(buf);
            segments.push({ run, relX, buf });
            relX += run.positions.reduce((s, p) => s + p.xAdvance, 0) * scale;
            buf = '';
          }
          // Jump to next tab stop (never stay in place — add at least 1 unit)
          relX = Math.ceil((relX + 0.001) / tabWidth) * tabWidth;
        } else {
          buf += ch;
        }
      }
      if (buf) {
        const run = font.layout(buf);
        segments.push({ run, relX, buf });
        relX += run.positions.reduce((s, p) => s + p.xAdvance, 0) * scale;
      }
      return { segments, lineW: relX };
    }

    // Build visual lines: respect \n, word-wrap using tab-aware widths
    const visualLines = [];
    for (const para of text.split('\n')) {
      if (!frameW || para === '') {
        visualLines.push(para);
      } else {
        let cur = '';
        for (const word of para.split(' ')) {
          const candidate = cur ? cur + ' ' + word : word;
          const { lineW: w } = layoutLine(candidate);
          if (cur && w > frameW) { visualLines.push(cur); cur = word; }
          else cur = candidate;
        }
        visualLines.push(cur);
      }
    }

    const letterPaths = []; // per-glyph { char, d }

    for (let li = 0; li < visualLines.length; li++) {
      const line = visualLines[li];
      if (!line) continue; // blank line — li still increments for Y spacing

      const { segments, lineW } = layoutLine(line);

      let alignOffset = 0;
      if (frameW) {
        if (align === 'center') alignOffset = (frameW - lineW) / 2;
        else if (align === 'right') alignOffset = frameW - lineW;
      } else {
        if (align === 'center') alignOffset = -lineW / 2;
        else if (align === 'right') alignOffset = -lineW;
      }

      const baselineY = sh.attrs.y + ascender + li * lineHeight;
      if (frameW && sh.attrs.height != null && li * lineHeight >= sh.attrs.height) break;

      for (const seg of segments) {
        let curX = sh.attrs.x + seg.relX + alignOffset;

        for (let i = 0; i < seg.run.glyphs.length; i++) {
          const glyph = seg.run.glyphs[i];
          const pos   = seg.run.positions[i];

          // Skip .notdef (missing-glyph box) — advance X but draw nothing
          if (glyph.id === 0) { curX += pos.xAdvance * scale; continue; }

          const tx = curX + pos.xOffset * scale;
          const ty = baselineY - pos.yOffset * scale;

          const cmds = [];
          for (const cmd of (glyph.path.commands || [])) {
            const a = cmd.args;
            switch (cmd.command) {
              case 'moveTo':
                cmds.push(`M${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)}`);
                break;
              case 'lineTo':
                cmds.push(`L${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)}`);
                break;
              case 'quadraticCurveTo':
                cmds.push(`Q${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)} ${(tx + a[2]*scale).toFixed(2)} ${(ty - a[3]*scale).toFixed(2)}`);
                break;
              case 'bezierCurveTo':
                cmds.push(`C${(tx + a[0]*scale).toFixed(2)} ${(ty - a[1]*scale).toFixed(2)} ${(tx + a[2]*scale).toFixed(2)} ${(ty - a[3]*scale).toFixed(2)} ${(tx + a[4]*scale).toFixed(2)} ${(ty - a[5]*scale).toFixed(2)}`);
                break;
              case 'closePath':
                cmds.push('Z');
                break;
            }
          }

          if (cmds.length) {
            // Name by source characters — handles ligatures (e.g. "ff") naturally
            const si = seg.run.stringIndices;
            const charName = si
              ? seg.buf.slice(si[i], si[i + 1] ?? seg.buf.length)
              : (glyph.name || 'glyph');
            letterPaths.push({ name: charName || glyph.name || 'glyph', d: cmds.join(' ') });
          }

          curX += pos.xAdvance * scale;
        }
      }
    }

    if (!letterPaths.length) { toast('Nothing to convert — try a different font'); return; }

    const groupId = uid('g');
    const children = letterPaths.map(({ name, d }) => ({
      id: uid('p'),
      type: 'path',
      name,
      attrs: { d, fillRule: 'nonzero' },
      fill: sh.fill || '#0F1419',
      stroke: 'none',
      strokeWidth: 0,
      visible: true,
      locked: false,
      rotation: 0,
      _bbox: null,
    }));

    store.commit(st => {
      const idx = st.shapes.findIndex(x => x.id === sh.id);
      if (idx === -1) return;
      const group = {
        id: groupId,
        type: 'group',
        textOutline: true,
        name: sh.name + ' outline',
        children,
        visible: sh.visible,
        locked: sh.locked,
        rotation: sh.rotation || 0,
        _bbox: null,
      };
      if (frameW && sh.attrs.height != null) {
        group.clipRect = { x: sh.attrs.x, y: sh.attrs.y, w: frameW, h: sh.attrs.height };
      }
      st.shapes.splice(idx, 1, group);
      st.selection = [groupId];
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

// ---- Bunny Fonts catalog ----

async function loadBunnyFontList() {
  fontList.innerHTML = '';
  const loading = document.createElement('div');
  loading.style.cssText = 'padding:12px 10px;font-size:12px;color:var(--muted);text-align:center';
  loading.textContent = 'Loading fonts…';
  fontList.appendChild(loading);

  const CATEGORY_ORDER = ['Sans-serif', 'Serif', 'Display', 'Handwriting', 'Monospace'];
  const CATEGORY_LABELS = {
    'sans-serif': 'Sans-serif', 'serif': 'Serif',
    'display': 'Display', 'handwriting': 'Handwriting', 'monospace': 'Monospace',
  };

  try {
    const resp = await fetch('https://fonts.bunny.net/list');
    if (!resp.ok) throw new Error('fetch failed');
    const data = await resp.json();

    FONTS = Object.entries(data)
      .map(([slug, info]) => {
        const family = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const rawCat = (info.category || 'sans-serif').toLowerCase();
        const category = CATEGORY_LABELS[rawCat] || rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
        const weights = (info.weights || ['400'])
          .filter(w => /^\d+$/.test(String(w)))
          .map(Number)
          .sort((a, b) => a - b);
        return { family, slug, category, weights: weights.length ? weights : [400] };
      })
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category);
        const bi = CATEGORY_ORDER.indexOf(b.category);
        const catCmp = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return catCmp !== 0 ? catCmp : a.family.localeCompare(b.family);
      });
  } catch (e) {
    console.warn('Bunny Fonts list fetch failed, using built-in list', e);
  }

  buildFontList(fontSearch.value);
}

// ---- Init ----

store.subscribe(syncFromStore);
loadBunnyFontList();

export { fetchFontBuffer, fontkit, convertTextToPath };
