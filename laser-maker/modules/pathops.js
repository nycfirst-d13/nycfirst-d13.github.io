// =============================================================================
// pathops.js — boolean operations via paper.js (unite / subtract / intersect)
//              + offset path
// =============================================================================
import { store } from './state.js';
import { toast } from './toast.js';
import { uid, PX_PER_INCH, rectToPathData, applyPathCorners, polygonPoints, starPoints } from './utils.js';
import { artboard } from './artboard.js';
import { progress, raf } from './progress.js';

let paperReady = false;
function ensurePaper() {
  if (paperReady) return true;
  if (typeof paper === 'undefined') return false;
  paper.setup(new paper.Size(1, 1));
  paperReady = true;
  return true;
}

function shapeToPaper(sh) {
  let p;
  const a = sh.attrs;
  switch (sh.type) {
    case 'rect':    p = new paper.Path(rectToPathData(a)); break;
    case 'ellipse': p = new paper.Path.Ellipse({ center: [a.cx, a.cy], radius: [a.rx, a.ry] }); break;
    case 'polygon': {
      const pts = polygonPoints(a);
      p = new paper.Path({ segments: pts.map(pt => [pt.x, pt.y]), closed: true });
      break;
    }
    case 'star': {
      const pts = starPoints(a);
      p = new paper.Path({ segments: pts.map(pt => [pt.x, pt.y]), closed: true });
      break;
    }
    case 'line':    p = new paper.Path({ segments: [[a.x1, a.y1], [a.x2, a.y2]], closed: false }); break;
    case 'path':    p = new paper.CompoundPath(a.corners ? applyPathCorners(a.d, a.corners) : a.d); break;
    default: return null;
  }
  if (sh.rotation) {
    const b = artboard.getShapeBBox(sh);
    p.rotate(sh.rotation, new paper.Point(b.x + b.w/2, b.y + b.h/2));
  }
  return p;
}

// Boolean-op input: one paper PathItem per selected shape. Groups (and nested
// groups, e.g. expanded/ungrouped text) collapse to their combined geometry via
// collectPaperPaths, so unite/subtract/intersect work on them like any path.
function shapeToPaperItem(sh) {
  const parts = [];
  collectPaperPaths(sh, parts);
  if (!parts.length) return null;
  let acc = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const next = acc.unite(parts[i]);
    acc.remove(); parts[i].remove();
    acc = next;
  }
  return acc;
}


function runOp(op) {
  if (!ensurePaper()) { toast('Path engine still loading…'); return; }
  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  if (sel.length < 2) { toast('Select 2+ shapes'); return; }

  const paths = sel.map(shapeToPaperItem).filter(Boolean);
  if (paths.length < 2) { toast('Shapes not compatible'); return; }

  let result;
  try {
    if (op === 'unite') {
      result = paths.reduce((acc, p) => acc.unite(p));
    } else if (op === 'subtract') {
      result = paths[0];
      for (let i = 1; i < paths.length; i++) result = result.subtract(paths[i]);
    } else if (op === 'intersect') {
      result = paths.reduce((acc, p) => acc.intersect(p));
    }
  } catch (e) {
    console.error(e);
    toast('Operation failed');
    cleanup(paths);
    return;
  }

  const d = result?.pathData;
  cleanup(paths);
  if (result) result.remove();

  if (!d) { toast('No result'); return; }

  // Take appearance from first selected; process type from top shape (highest z-order)
  const first = sel[0];
  const selIds = new Set(s.selection);
  const topShape = [...s.shapes].reverse().find(sh => selIds.has(sh.id)) ?? first;
  const id = uid('po');
  store.commit(st => {
    // remove originals
    st.shapes = st.shapes.filter(sh => !st.selection.includes(sh.id));
    st.shapes.push({
      id, type: 'path',
      name: `${op[0].toUpperCase()+op.slice(1)} ${st.shapes.length+1}`,
      attrs: { d, fillRule: 'evenodd' },
      fill: first.fill, stroke: first.stroke, strokeWidth: first.strokeWidth,
      processType: topShape.processType ?? 'free',
      visible: true, locked: false, rotation: 0,
    });
    st.selection = [id];
  }, 'pathop');
}

// =============================================================================
// Offset Path
// =============================================================================

// Count leaf (non-group) shapes — a proxy for offset cost (each leaf becomes one
// clipper polygon). Used to decide whether the job is heavy enough for a bar.
function countLeaves(sh) {
  if (sh.type === 'group') return (sh.children || []).reduce((n, c) => n + countLeaves(c), 0);
  return 1;
}

// Show the progress bar only above this many leaf paths — below it the op is
// instant and a bar would just flicker.
const OFFSET_PROGRESS_MIN = 40;

async function runOffset(amountIn) {
  if (!ensurePaper()) { toast('Path engine still loading…'); return; }
  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  if (sel.length === 0) { toast('Select a shape first'); return; }

  const amount = amountIn * PX_PER_INCH;
  const targets = sel.filter(sh => sh.type !== 'text' && sh.type !== 'line' && sh.type !== 'image');

  const totalLeaves = targets.reduce((n, sh) => n + countLeaves(sh), 0);
  const heavy = totalLeaves >= OFFSET_PROGRESS_MIN;
  const pairs = [];

  if (heavy) {
    progress.show('Offset Path', { determinate: true, detail: 'Preparing geometry…' });
    await raf();
    let done = 0;
    // Flattening fills 0–88%. The blocking Clipper Execute() and the final
    // re-render are uncounted tail work — reserve the top 12% for them so the
    // bar doesn't sit at 100% while those run.
    const FLATTEN_MAX = 0.88;
    const report = (inc) => { done += inc; progress.update((done / totalLeaves) * FLATTEN_MAX, `Flattening paths · ${done} / ${totalLeaves}`); };
    // Right before the blocking Execute(): start a compositor crawl (93→99%)
    // that keeps moving while the thread is frozen, then paint a frame so it's
    // live before the lock-up. Long duration ≈ expect a slow op.
    const onFinishing = async () => { progress.crawl(0.93, 0.99, 'Computing offset outline…', 9000); await raf(); };
    for (const sh of targets) {
      const result = await _offsetShapeAsync(sh, amount, report, onFinishing);
      if (result) pairs.push({ source: sh, offset: result });
    }
  } else {
    for (const sh of targets) {
      const result = _offsetShape(sh, amount);
      if (result) pairs.push({ source: sh, offset: result });
    }
  }

  if (pairs.length === 0) {
    if (heavy) progress.hide();
    toast('Offset failed — check amount');
    return;
  }

  // Keep the same crawl running into the render — just swap the detail text
  // (update() would kill the crawl; setDetail() leaves it animating).
  if (heavy) { progress.setDetail('Drawing result…'); await raf(); }

  store.commit(st => {
    const newSel = [];
    for (const { source, offset } of pairs) {
      const idx = st.shapes.findIndex(sh => sh.id === source.id);
      const groupId = uid('g');
      const grp = {
        id: groupId,
        type: 'group',
        name: 'Offset Group',
        children: [source, offset],
        visible: true,
        locked: false,
        rotation: 0,
      };
      if (idx >= 0) {
        st.shapes.splice(idx, 1, grp);
      } else {
        st.shapes.push(grp);
      }
      newSel.push(groupId);
    }
    st.selection = newSel;
  }, 'offset-path');

  if (heavy) progress.done('Done');
}

function _offsetShape(sh, amount) {
  const a = sh.attrs;
  const id = uid('op');
  const base = {
    id, fill: 'none', stroke: '#000000', strokeWidth: 1,
    visible: true, locked: false, rotation: sh.rotation || 0,
  };

  // Analytical offset for rect and ellipse — preserves shape type and rotation
  if (sh.type === 'rect') {
    const x = a.x - amount, y = a.y - amount;
    const w = a.w + amount * 2, h = a.h + amount * 2;
    if (w <= 0 || h <= 0) return null;
    return { ...base, type: 'rect', name: 'Offset Rect', attrs: { x, y, w, h, rx: Math.max(0, (a.rx || 0) + amount) } };
  }

  if (sh.type === 'ellipse') {
    const rx = a.rx + amount, ry = a.ry + amount;
    if (rx <= 0 || ry <= 0) return null;
    return { ...base, type: 'ellipse', name: 'Offset Ellipse', attrs: { cx: a.cx, cy: a.cy, rx, ry } };
  }

  // group / polygon / path / star — use Clipper for robust offset with round joins.
  // Groups offset as one combined outline around all descendant geometry.
  const paperPaths = [];
  collectPaperPaths(sh, paperPaths);
  if (!paperPaths.length) { for (const p of paperPaths) p.remove(); return null; }
  const d = _clipperOffsetFromPaths(paperPaths, amount);
  if (!d) return null;
  return { ...base, type: 'path', name: 'Offset Path', rotation: 0, attrs: { d, fillRule: 'evenodd' } };
}

// Async twin of _offsetShape: same logic, but routes clipper work through the
// chunked/yielding path so the progress bar can repaint. `report(n)` is called
// with the number of leaf paths consumed.
async function _offsetShapeAsync(sh, amount, report, onFinishing) {
  const a = sh.attrs;
  const id = uid('op');
  const base = {
    id, fill: 'none', stroke: '#000000', strokeWidth: 1,
    visible: true, locked: false, rotation: sh.rotation || 0,
  };

  // Analytical shapes are instant — count them and return synchronously.
  if (sh.type === 'rect' || sh.type === 'ellipse') {
    report(1);
    return _offsetShape(sh, amount);
  }

  const paperPaths = [];
  collectPaperPaths(sh, paperPaths);
  if (!paperPaths.length) { for (const p of paperPaths) p.remove(); report(countLeaves(sh)); return null; }
  const d = await _clipperOffsetFromPathsAsync(paperPaths, amount, report, onFinishing);
  if (!d) return null;
  return { ...base, type: 'path', name: 'Offset Path', rotation: 0, attrs: { d, fillRule: 'evenodd' } };
}

// Recursively gather paper paths in world coords. Group children store absolute
// coords; group rotation is applied on top, around the group's bbox center.
function collectPaperPaths(sh, out) {
  if (sh.type === 'group') {
    const tmp = [];
    for (const child of sh.children || []) collectPaperPaths(child, tmp);
    if (sh.rotation) {
      const b = artboard.getShapeBBox(sh);
      const center = new paper.Point(b.x + b.w / 2, b.y + b.h / 2);
      for (const p of tmp) p.rotate(sh.rotation, center);
    }
    out.push(...tmp);
    return;
  }
  const p = shapeToPaper(sh); // applies sh.rotation around its own bbox center
  if (p) out.push(p);
}

const CLIPPER_SCALE = 1000;

function _clipperOffsetFromPaths(paperPaths, amount) {
  if (!window.ClipperLib) { toast('Clipper not loaded yet — try again'); for (const p of paperPaths) p.remove(); return null; }

  const clipperPaths = [];

  function addPath(p) {
    p.flatten(0.25);
    const pts = p.segments.map(s => ({
      X: Math.round(s.point.x * CLIPPER_SCALE),
      Y: Math.round(s.point.y * CLIPPER_SCALE),
    }));
    if (pts.length >= 3) clipperPaths.push(pts);
  }

  for (const pp of paperPaths) {
    if (pp.children) {
      for (const child of pp.children) addPath(child);
    } else {
      addPath(pp);
    }
    pp.remove();
  }

  if (!clipperPaths.length) return null;

  const co = new ClipperLib.ClipperOffset(2, 0.5 * CLIPPER_SCALE);
  co.AddPaths(clipperPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const solution = new ClipperLib.Paths();
  co.Execute(solution, amount * CLIPPER_SCALE);

  if (!solution || !solution.length) return null;

  return solution.map(poly =>
    poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.X / CLIPPER_SCALE).toFixed(2)} ${(p.Y / CLIPPER_SCALE).toFixed(2)}`).join(' ') + ' Z'
  ).join(' ');
}

// Chunked twin of _clipperOffsetFromPaths. The flatten/convert loop is the heavy
// part for image-traced groups (hundreds of paths) — process it in batches,
// yielding to the event loop so the progress bar repaints. The final Execute()
// is one blocking call we can't subdivide; report it as the tail.
const OFFSET_CHUNK = 12;  // paths per yield

async function _clipperOffsetFromPathsAsync(paperPaths, amount, report, onFinishing) {
  if (!window.ClipperLib) { toast('Clipper not loaded yet — try again'); for (const p of paperPaths) p.remove(); return null; }

  const clipperPaths = [];

  function addPath(p) {
    p.flatten(0.25);
    const pts = p.segments.map(s => ({
      X: Math.round(s.point.x * CLIPPER_SCALE),
      Y: Math.round(s.point.y * CLIPPER_SCALE),
    }));
    if (pts.length >= 3) clipperPaths.push(pts);
  }

  let processed = 0;
  for (const pp of paperPaths) {
    if (pp.children) { for (const child of pp.children) addPath(child); }
    else addPath(pp);
    pp.remove();
    if (report) report(1);
    if (++processed % OFFSET_CHUNK === 0) await raf();
  }

  if (!clipperPaths.length) return null;

  if (onFinishing) await onFinishing();   // paint a frame before the blocking Execute

  const co = new ClipperLib.ClipperOffset(2, 0.5 * CLIPPER_SCALE);
  co.AddPaths(clipperPaths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

  const solution = new ClipperLib.Paths();
  co.Execute(solution, amount * CLIPPER_SCALE);

  if (!solution || !solution.length) return null;

  return solution.map(poly =>
    poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.X / CLIPPER_SCALE).toFixed(2)} ${(p.Y / CLIPPER_SCALE).toFixed(2)}`).join(' ') + ' Z'
  ).join(' ');
}

// =============================================================================

function cleanup(paths) { for (const p of paths) p.remove(); }


// Wire pathfinder buttons
document.querySelectorAll('.pf').forEach(b => {
  b.onclick = () => runOp(b.dataset.op);
});

// Wire offset apply button
document.getElementById('offset-apply').addEventListener('click', () => {
  const amountIn = parseFloat(document.getElementById('offset-amount').value) || 0;
  runOffset(amountIn);
});

export const pathops = { runOp, runOffset };
