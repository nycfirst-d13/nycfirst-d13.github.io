// =============================================================================
// rulers.js — horizontal + vertical rulers (canvas, DPR-aware)
// =============================================================================
import { store } from './state.js';
import { inToPx } from './utils.js';
import { artboard } from './artboard.js';

const RULER_BG    = '#E2DDD0';
const RULER_BG_2  = '#ECE7DA';
const TICK_COLOR  = '#A8A294';
const TICK_MAJOR  = '#6C6F76';
const LABEL_COLOR = '#3A3E45';
const CURSOR_COLOR= '#E0241B';
const ABBAND      = '#F4F0E6';   // band representing the artboard span

class Rulers {
  constructor() {
    this.h = document.getElementById('ruler-h');
    this.v = document.getElementById('ruler-v');
    this.cornerEl = document.getElementById('ruler-corner');
    this.ctxH = this.h.getContext('2d');
    this.ctxV = this.v.getContext('2d');
    this._cursor = { x: null, y: null };
    this._resize();
    this._wire();
  }

  _wire() {
    window.addEventListener('resize', () => { this._resize(); this.draw(); });
    const ro = new ResizeObserver(() => { this._resize(); this.draw(); });
    ro.observe(this.h);
    ro.observe(this.v);
    // Belt-and-suspenders: if CSS wasn't applied when the constructor ran,
    // _resize() set a 1×1 buffer. RAF guarantees layout is available.
    requestAnimationFrame(() => { this._resize(); this.draw(); });
    store.subscribe(() => this.draw());
    document.getElementById('canvas-area').addEventListener('pointermove', e => {
      const p = artboard.screenToArtboard(e.clientX, e.clientY);
      this._cursor = p;
      this.draw();
    });
    document.getElementById('canvas-area').addEventListener('pointerleave', () => {
      this._cursor = { x: null, y: null };
      this.draw();
    });
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.h, this.v]) {
      const rect = c.getBoundingClientRect();
      c.width  = Math.max(1, Math.floor(rect.width  * dpr));
      c.height = Math.max(1, Math.floor(rect.height * dpr));
    }
    this.ctxH.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctxV.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw() {
    this._drawH();
    this._drawV();
  }

  _tickStep(zoom) {
    // Decide tick frequency based on zoom (avoid clutter)
    const pxPerInch = inToPx(1) * zoom;
    if (pxPerInch >= 240) return { minor: 1/16, mid: 1/4, major: 1 };
    if (pxPerInch >= 140) return { minor: 1/8,  mid: 1/2, major: 1 };
    if (pxPerInch >= 80)  return { minor: 1/4,  mid: 1/2, major: 1 };
    if (pxPerInch >= 36)  return { minor: 1/2,  mid: 1,   major: 2 };
    if (pxPerInch >= 18)  return { minor: 1,    mid: 2,   major: 4 };
    return { minor: 2, mid: 4, major: 8 };
  }

  _drawH() {
    const ctx = this.ctxH;
    const rect = this.h.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const s = store.get();
    const z = s.viewport.zoom;
    const panX = s.viewport.panX;

    ctx.clearRect(0, 0, w, h);
    // Background
    ctx.fillStyle = RULER_BG; ctx.fillRect(0, 0, w, h);
    // Artboard band
    const abStart = panX;
    const abEnd   = panX + inToPx(s.artboard.w) * z;
    ctx.fillStyle = ABBAND;
    ctx.fillRect(abStart, 0, abEnd - abStart, h);
    // Top hairline
    ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(0, h-1, w, 1);

    const { minor, mid, major } = this._tickStep(z);

    // Determine inch range visible
    const startIn = -panX / (inToPx(1) * z);
    const endIn   = (w - panX) / (inToPx(1) * z);
    const firstTick = Math.floor(startIn / minor) * minor;

    ctx.font = `500 9.5px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';

    for (let i = firstTick; i <= endIn + minor; i += minor) {
      const x = panX + inToPx(i) * z;
      const isMajor = Math.abs(i % major) < 1e-6;
      const isMid   = Math.abs(i % mid)   < 1e-6;
      const tickH = isMajor ? h * 0.66 : isMid ? h * 0.45 : h * 0.28;
      ctx.fillStyle = isMajor ? TICK_MAJOR : TICK_COLOR;
      ctx.fillRect(Math.round(x) + 0.5, h - tickH, 1, tickH);

      if (isMajor && i !== 0) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(this._fmt(i), Math.round(x) + 3, h - tickH + 2);
      } else if (i === 0) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText('0', Math.round(x) + 3, h - tickH + 2);
      }
    }

    // Cursor indicator
    if (this._cursor.x !== null) {
      const cx = panX + this._cursor.x * z;
      if (cx >= 0 && cx <= w) {
        ctx.fillStyle = CURSOR_COLOR;
        ctx.fillRect(Math.round(cx), 0, 1, h);
      }
    }
  }

  _drawV() {
    const ctx = this.ctxV;
    const rect = this.v.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const s = store.get();
    const z = s.viewport.zoom;
    const panY = s.viewport.panY;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = RULER_BG; ctx.fillRect(0, 0, w, h);
    const abStart = panY;
    const abEnd   = panY + inToPx(s.artboard.h) * z;
    ctx.fillStyle = ABBAND;
    ctx.fillRect(0, abStart, w, abEnd - abStart);
    ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(w-1, 0, 1, h);

    const { minor, mid, major } = this._tickStep(z);
    const startIn = -panY / (inToPx(1) * z);
    const endIn   = (h - panY) / (inToPx(1) * z);
    const firstTick = Math.floor(startIn / minor) * minor;

    ctx.font = `500 9.5px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    for (let i = firstTick; i <= endIn + minor; i += minor) {
      const y = panY + inToPx(i) * z;
      const isMajor = Math.abs(i % major) < 1e-6;
      const isMid   = Math.abs(i % mid)   < 1e-6;
      const tickW = isMajor ? w * 0.66 : isMid ? w * 0.45 : w * 0.28;
      ctx.fillStyle = isMajor ? TICK_MAJOR : TICK_COLOR;
      ctx.fillRect(w - tickW, Math.round(y) + 0.5, tickW, 1);

      if (isMajor) {
        ctx.save();
        ctx.translate(w / 2, Math.round(y) + 8);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(this._fmt(i), 0, 0);
        ctx.restore();
      }
    }

    if (this._cursor.y !== null) {
      const cy = panY + this._cursor.y * z;
      if (cy >= 0 && cy <= h) {
        ctx.fillStyle = CURSOR_COLOR;
        ctx.fillRect(0, Math.round(cy), w, 1);
      }
    }
  }

  _fmt(i) {
    if (Math.abs(i) < 1e-6) return '0';
    if (Math.abs(i - Math.round(i)) < 1e-6) return String(Math.round(i));
    // fractional inches: show as decimal
    return i.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
}

export const rulers = new Rulers();
