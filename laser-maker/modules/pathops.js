// =============================================================================
// pathops.js — boolean operations via paper.js (unite / subtract / intersect)
//              + offset path
// =============================================================================
import { store } from './state.js';
import { uid, PX_PER_INCH, rectToPathData, applyPathCorners } from './utils.js';
import { artboard } from './artboard.js';

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
      const pts = polyPoints(a);
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

function polyPoints(a) {
  const pts = [];
  const start = -Math.PI / 2;
  for (let i = 0; i < a.sides; i++) {
    const ang = start + i * 2 * Math.PI / a.sides;
    pts.push({ x: a.cx + a.r * Math.cos(ang), y: a.cy + a.r * Math.sin(ang) });
  }
  return pts;
}

function runOp(op) {
  if (!ensurePaper()) { toast('Path engine still loading…'); return; }
  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  if (sel.length < 2) { toast('Select 2+ shapes'); return; }

  const paths = sel.map(shapeToPaper).filter(Boolean);
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

function runOffset(amountIn) {
  if (!ensurePaper()) { toast('Path engine still loading…'); return; }
  const s = store.get();
  const sel = s.selection.map(id => s.shapes.find(x => x.id === id)).filter(Boolean);
  if (sel.length === 0) { toast('Select a shape first'); return; }

  const amount = amountIn * PX_PER_INCH;
  const pairs = [];

  for (const sh of sel) {
    if (sh.type === 'text' || sh.type === 'line') continue;
    const result = _offsetShape(sh, amount);
    if (result) pairs.push({ source: sh, offset: result });
  }

  if (pairs.length === 0) { toast('Offset failed — check amount'); return; }

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

  // polygon / path — use Clipper for robust offset with round joins
  const d = _clipperOffset(sh, amount);
  if (!d) return null;
  return { ...base, type: 'path', name: 'Offset Path', rotation: 0, attrs: { d, fillRule: 'evenodd' } };
}

const CLIPPER_SCALE = 1000;

function _clipperOffset(sh, amount) {
  if (!window.ClipperLib) { toast('Clipper not loaded yet — try again'); return null; }

  const pp = shapeToPaper(sh);
  if (!pp) return null;

  const clipperPaths = [];

  function addPath(p) {
    p.flatten(0.25);
    const pts = p.segments.map(s => ({
      X: Math.round(s.point.x * CLIPPER_SCALE),
      Y: Math.round(s.point.y * CLIPPER_SCALE),
    }));
    if (pts.length >= 3) clipperPaths.push(pts);
  }

  if (pp.children) {
    for (const child of pp.children) addPath(child);
  } else {
    addPath(pp);
  }
  pp.remove();

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

// =============================================================================

function cleanup(paths) { for (const p of paths) p.remove(); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1600);
}

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
