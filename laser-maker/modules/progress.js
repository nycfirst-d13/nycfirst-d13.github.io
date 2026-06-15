// =============================================================================
// progress.js — reusable global progress bar.
//
// A single floating bar (bottom-center, above the status bar — same lane as the
// toast). Use it for any operation that can take long enough to feel laggy:
// heavy path math, image tracing, big exports, etc.
//
//   import { progress, raf } from './progress.js';
//
//   progress.show('Offset Path', { detail: 'Preparing…' });  // determinate, 0%
//   progress.update(0.4, 'Flattening · 12 / 30 paths');       // fraction + detail line
//   progress.crawl(0.93, 0.99, 'Computing outline…');         // compositor crawl (see below)
//   progress.done('Done');                                     // snap 100% then auto-hide
//   // or progress.hide() to dismiss immediately
//
//   progress.show('Tracing…', { determinate: false }); // animated barber-pole (unknown dur.)
//
// Two text slots:
//   • label — the operation name, top-left (set once via show()).
//   • detail — a line UNDER the track describing the current step; update it as
//     phases change (2nd arg to update()/crawl()/done(), or setDetail()).
//
// The crawl (for blocking tails)
//   Heavy ops end in a synchronous, un-chunkable block (e.g. a Clipper Execute()
//   or a re-render). The main thread is frozen there, so JS width updates can't
//   animate — the bar would just sit at its last %. crawl() instead drives the
//   fill with a CSS `transform: scaleX` animation, which runs on the compositor
//   thread and KEEPS MOVING while JS is blocked. Call crawl(from,to,detail) and
//   then await raf() right before the blocking call so the animation is live by
//   the time the thread locks up. It eases toward `to` (never reaches 100% on
//   its own); done() snaps the rest once the block returns.
//
// Notes
//  • Singleton — one bar at a time. A second show() reuses the same element.
//  • Determinate bars MUST be driven from an async/chunked loop; a synchronous
//    loop never repaints, so update() calls are invisible. Yield via await raf()
//    between chunks. See pathops.runOffset.
//  • Only show it for genuinely slow work — flashing a bar for a 5ms op is worse
//    than no bar. Gate behind a cost estimate (e.g. path count > threshold).
// =============================================================================

let el, labelEl, pctEl, fillEl, detailEl;
let hideTimer = null;

function ensure() {
  if (el) return;
  el       = document.getElementById('progress');
  labelEl  = document.getElementById('progress-label');
  pctEl    = document.getElementById('progress-pct');
  fillEl   = document.getElementById('progress-fill');
  detailEl = document.getElementById('progress-detail');
}

// Drop any active compositor crawl and return the fill to plain width-driven mode.
function clearCrawl() {
  el.classList.remove('crawl');
  fillEl.style.transform = '';
  void fillEl.offsetWidth; // commit the reset before any new width transition
}

function setDetail(text) {
  ensure();
  if (text != null) detailEl.textContent = text;
}

function show(label = 'Working…', { determinate = true, detail = '' } = {}) {
  ensure();
  clearTimeout(hideTimer);
  clearCrawl();
  labelEl.textContent = label;
  detailEl.textContent = detail;
  el.classList.toggle('indeterminate', !determinate);
  el.setAttribute('aria-hidden', 'false');
  if (determinate) {
    fillEl.style.width = '0%';
    pctEl.textContent = '0%';
    pctEl.style.display = '';
  } else {
    pctEl.style.display = 'none';
  }
  void el.offsetWidth; // reflow so the entrance transition runs from hidden
  el.classList.add('show');
}

function update(fraction, detail) {
  ensure();
  if (!el.classList.contains('show')) return;
  clearCrawl();
  const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
  fillEl.style.width = pct.toFixed(1) + '%';
  pctEl.textContent = Math.round(pct) + '%';
  if (detail != null) detailEl.textContent = detail;
}

// Compositor-driven slow crawl for a blocking tail. Eases the fill from `from`
// toward `to` (fractions 0..1) over `ms`, via transform:scaleX so it animates
// even while the main thread is blocked. pct shows '…' (can't update mid-block).
function crawl(from, to, detail, ms = 7000) {
  ensure();
  if (!el.classList.contains('show')) return;
  const f = Math.max(0.001, Math.min(1, from)) * 100;
  const t = Math.max(f / 100, Math.min(1, to)) * 100;
  el.classList.remove('crawl');
  void el.offsetWidth;                 // restart the keyframe animation
  fillEl.style.width = f.toFixed(1) + '%';
  fillEl.style.setProperty('--crawl-scale', (t / f).toFixed(4));
  fillEl.style.setProperty('--crawl-ms', ms + 'ms');
  pctEl.textContent = '…';
  if (detail != null) detailEl.textContent = detail;
  void el.offsetWidth;
  el.classList.add('crawl');
}

// Snap to 100%, hold a beat, then fade out.
function done(detail) {
  ensure();
  if (!el.classList.contains('show')) return;
  clearCrawl();
  fillEl.style.width = '100%';
  pctEl.textContent = '100%';
  if (detail != null) detailEl.textContent = detail;
  hideTimer = setTimeout(hide, 320);
}

function hide() {
  ensure();
  clearTimeout(hideTimer);
  clearCrawl();
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
}

// Yield to the browser so the bar can repaint between work chunks.
export const raf = () => new Promise(r => requestAnimationFrame(r));

export const progress = { show, update, crawl, setDetail, done, hide };
