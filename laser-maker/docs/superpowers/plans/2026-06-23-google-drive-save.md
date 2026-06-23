# Google Drive Save Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After exporting an SVG, automatically upload it to the STEM Center's Google Drive, organized into date-named folders, gated by a shared PIN cached in `localStorage`.

**Architecture:** A Google Apps Script web app (runs as teacher's Google account, no OAuth/service-account needed) accepts POST requests with `{ pin, svg, filename }`, validates the PIN from Script Properties, creates/finds a `MM-DD-YY` folder in a configured root folder, and saves the file. A new client module `drive-upload.js` handles the PIN dialog, localStorage caching, posting, and error toasts. The existing `download()` function in `export.js` is minimally modified to return the SVG string so `drive-upload.js` can reuse it.

**Tech Stack:** Vanilla JS ES modules (no build step), Google Apps Script (GAS), Google Drive API (via GAS DriveApp), `localStorage`, `fetch()`

## Global Constraints

- No frameworks, no build pipeline — vanilla JS ES modules only
- No new npm dependencies
- `DRIVE_UPLOAD_URL` empty string = feature silently disabled; export works as today
- PIN never appears in client JS source — lives only in Apps Script Script Properties
- Date folder format: `MM-DD-YY`, timezone `America/New_York`
- Duplicate filenames in Drive are allowed (Drive keeps both)
- Always commit from parent: `git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `laser-maker/docs/apps-script-uploader.js` | Create | Apps Script source + setup instructions (teacher copy-pastes this) |
| `laser-maker/modules/drive-upload.js` | Create | PIN dialog, localStorage cache, Drive POST, error toast |
| `laser-maker/index.html` | Modify | Add PIN dialog markup + persistent error toast element |
| `laser-maker/modules/export.js` | Modify | `download()` returns SVG string; confirm handler calls `uploadToDrive` |
| `laser-maker/styles.css` | Modify | Add `.toast-error` + `.toast-error-close` styles |

---

### Task 1: Apps Script source file

**Files:**
- Create: `laser-maker/docs/apps-script-uploader.js`

**Interfaces:**
- Produces: nothing (teacher copy-pastes, not imported by any module)

- [ ] **Step 1: Create the file**

```javascript
// ============================================================
// LASER MAKER — Google Drive Uploader
// Google Apps Script — paste this into script.google.com
// ============================================================
//
// SETUP (one-time, teacher):
//
// 1. Open Google Drive → create a folder named "Laser Maker Exports"
//    → right-click → Get link → copy the folder ID from the URL
//    (URL looks like: drive.google.com/drive/folders/FOLDER_ID_HERE)
//
// 2. Go to script.google.com → New project → paste this entire file
//
// 3. Click the gear icon (Project Settings) → Script Properties → Add:
//      DRIVE_PIN       →  your chosen PIN (e.g. "stemcenter2026")
//      ROOT_FOLDER_ID  →  the folder ID from step 1
//
// 4. Click Deploy → New deployment → Web app:
//      Execute as:    Me
//      Who has access: Anyone
//    → Click Deploy → copy the Web app URL
//
// 5. In laser-maker/modules/drive-upload.js, set:
//      const DRIVE_UPLOAD_URL = 'paste-your-web-app-url-here';
//    Commit and push.
//
// TO CHANGE THE PIN: update DRIVE_PIN in Script Properties only.
// No redeploy needed. Old cached PINs are rejected immediately.
// Tell students the new PIN; their laptops will re-prompt and cache it.
// ============================================================

function doPost(e) {
  var body, pin, svg, filename;

  try {
    body     = JSON.parse(e.postData.contents);
    pin      = body.pin;
    svg      = body.svg;
    filename = body.filename;
  } catch (err) {
    return _json({ error: 'Bad request' });
  }

  var props = PropertiesService.getScriptProperties();

  if (!pin || pin !== props.getProperty('DRIVE_PIN')) {
    return _json({ error: 'Invalid PIN' });
  }

  var rootId = props.getProperty('ROOT_FOLDER_ID');
  if (!rootId) {
    return _json({ error: 'ROOT_FOLDER_ID not configured' });
  }

  var root = DriveApp.getFolderById(rootId);
  var today = Utilities.formatDate(new Date(), 'America/New_York', 'MM-dd-yy');

  var existing = root.getFoldersByName(today);
  var dateFolder = existing.hasNext() ? existing.next() : root.createFolder(today);

  dateFolder.createFile(filename, svg, MimeType.PLAIN_TEXT);

  return _json({ ok: true });
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/docs/apps-script-uploader.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(drive): add Apps Script uploader source with setup instructions"
```

---

### Task 2: Persistent error toast styles

**Files:**
- Modify: `laser-maker/styles.css` (after `.toast-action:hover` block, around line 1054)

**Interfaces:**
- Produces: `.toast-error` class, `.toast-error-close` class — used by `drive-upload.js`

- [ ] **Step 1: Add styles after the `.toast-action:hover` rule (line ~1054)**

Find this block in `styles.css`:
```css
.toast-action:hover { background: rgba(255,255,255,0.12); }
```

Add immediately after it:
```css
/* Drive save — persistent error toast */
.toast-error {
  background: #c62828;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  white-space: normal;
  text-align: left;
  line-height: 1.35;
}
.toast-error-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 15px;
  line-height: 1;
  opacity: 0.75;
  flex-shrink: 0;
}
.toast-error-close:hover { opacity: 1; }
```

- [ ] **Step 2: Manually verify styles look correct**

Open `index.html` in a browser (via `npx live-server`). Open DevTools console and run:

```javascript
const el = document.createElement('div');
el.className = 'toast toast-error show';
el.innerHTML = '<span>Drive save failed — file downloaded locally</span><button class="toast-error-close">✕</button>';
document.body.appendChild(el);
```

Expected: red pill-shaped toast appears bottom-center with a ✕ button. Click ✕ — nothing happens yet (JS not wired). Remove with `el.remove()` in console.

- [ ] **Step 3: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/styles.css
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "style(drive): add persistent error toast styles"
```

---

### Task 3: PIN dialog markup

**Files:**
- Modify: `laser-maker/index.html` (add after the export dialog block, before `<div class="ctx-menu"`)

**Interfaces:**
- Produces: `#pin-backdrop`, `#pin-input`, `#pin-error-msg`, `#pin-confirm-btn`, `#pin-cancel-btn` — used by `drive-upload.js`

- [ ] **Step 1: Add PIN dialog markup**

Find this comment in `index.html`:
```html
  <div class="ctx-menu" id="ctx-menu" hidden>
```

Insert the following block immediately before it:

```html
  <!-- Drive PIN dialog -->
  <div id="pin-backdrop" class="export-backdrop" hidden>
    <div class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title">
      <h3 class="export-dialog-title" id="pin-dialog-title">STEM Center PIN</h3>
      <p style="margin:0;font-size:13px;color:var(--ink-2)">Enter the PIN to save your file to the STEM Center Drive. You'll only need to do this once on this device.</p>
      <div class="export-dialog-fields">
        <div class="export-field">
          <label class="export-field-label" for="pin-input">PIN</label>
          <input class="export-field-input" type="password" id="pin-input" placeholder="Enter PIN" autocomplete="off" />
        </div>
      </div>
      <p class="export-error-msg" id="pin-error-msg" hidden>Incorrect PIN — try again.</p>
      <div class="export-dialog-actions">
        <button class="btn ghost" id="pin-cancel-btn">Skip</button>
        <button class="btn primary" id="pin-confirm-btn">Unlock Drive</button>
      </div>
    </div>
  </div>

```

- [ ] **Step 2: Verify dialog renders**

In a running `npx live-server` session, open DevTools console and run:

```javascript
document.getElementById('pin-backdrop').hidden = false;
```

Expected: PIN dialog appears centered over a dark backdrop, matching the export dialog style. Has "STEM Center PIN" heading, a password input, "Skip" and "Unlock Drive" buttons.

Run `document.getElementById('pin-backdrop').hidden = true;` to close.

- [ ] **Step 3: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/index.html
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(drive): add PIN dialog markup"
```

---

### Task 4: `drive-upload.js` module

**Files:**
- Create: `laser-maker/modules/drive-upload.js`

**Interfaces:**
- Consumes: `#pin-backdrop`, `#pin-input`, `#pin-error-msg`, `#pin-confirm-btn`, `#pin-cancel-btn` from Task 3; `.toast-error`, `.toast-error-close` from Task 2
- Produces: `uploadToDrive(svgString, filename): Promise<void>` — consumed by Task 5 (`export.js`)

- [ ] **Step 1: Create the module**

```javascript
// modules/drive-upload.js
// Set this to your deployed Apps Script web app URL.
// Leave empty to disable Drive upload (local download still works).
const DRIVE_UPLOAD_URL = '';

const PIN_KEY = 'laserMakerDrivePin';

// ---- PIN dialog ----

const _pinBackdrop  = document.getElementById('pin-backdrop');
const _pinInput     = document.getElementById('pin-input');
const _pinErrorMsg  = document.getElementById('pin-error-msg');
const _pinConfirmBtn = document.getElementById('pin-confirm-btn');
const _pinCancelBtn = document.getElementById('pin-cancel-btn');

function _closePinDialog() {
  _pinBackdrop.hidden = true;
}

// Returns a Promise that resolves to the entered PIN string, or null if skipped.
// Pass showError=true to show "Incorrect PIN" on open (after a failed attempt).
function showPinDialog(showError = false) {
  return new Promise(resolve => {
    _pinInput.value = '';
    _pinInput.classList.remove('export-field-input--error');
    if (showError) {
      _pinErrorMsg.hidden = false;
      void _pinInput.offsetWidth;
      _pinInput.classList.add('export-field-input--error');
    } else {
      _pinErrorMsg.hidden = true;
    }
    _pinBackdrop.hidden = false;
    _pinInput.focus();

    function onConfirm() {
      const pin = _pinInput.value.trim();
      if (!pin) {
        _pinInput.focus();
        return;
      }
      cleanup();
      _closePinDialog();
      resolve(pin);
    }

    function onCancel() {
      cleanup();
      _closePinDialog();
      resolve(null);
    }

    function onKey(e) {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    }

    function cleanup() {
      _pinConfirmBtn.removeEventListener('click', onConfirm);
      _pinCancelBtn.removeEventListener('click', onCancel);
      _pinInput.removeEventListener('keydown', onKey);
      _pinBackdrop.removeEventListener('click', onBackdropClick);
    }

    function onBackdropClick(e) {
      if (e.target === _pinBackdrop) onCancel();
    }

    _pinConfirmBtn.addEventListener('click', onConfirm);
    _pinCancelBtn.addEventListener('click', onCancel);
    _pinInput.addEventListener('keydown', onKey);
    _pinBackdrop.addEventListener('click', onBackdropClick);
  });
}

// ---- Persistent error toast ----

function toastError(msg) {
  document.getElementById('drive-error-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'drive-error-toast';
  el.className = 'toast toast-error show';
  el.innerHTML = `<span>${msg}</span><button class="toast-error-close" aria-label="Dismiss">✕</button>`;
  el.querySelector('.toast-error-close').addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

// ---- Drive upload ----

async function _postToDrive(pin, svg, filename) {
  const resp = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, svg, filename }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function uploadToDrive(svgString, filename) {
  if (!DRIVE_UPLOAD_URL) return;

  let pin = localStorage.getItem(PIN_KEY);

  // PIN not cached — prompt
  if (!pin) {
    pin = await showPinDialog();
    if (!pin) return; // user skipped
  }

  // Attempt upload; re-prompt on wrong PIN (unlimited retries)
  while (true) {
    let result;
    try {
      result = await _postToDrive(pin, svgString, filename);
    } catch {
      toastError('Drive save failed — file downloaded locally');
      return;
    }

    if (result.error === 'Invalid PIN') {
      localStorage.removeItem(PIN_KEY);
      pin = await showPinDialog(true); // true = show "Incorrect PIN" error
      if (!pin) return; // user skipped after wrong PIN
      continue;
    }

    if (result.error) {
      toastError('Drive save failed — file downloaded locally');
      return;
    }

    // Success
    localStorage.setItem(PIN_KEY, pin);
    const t = document.getElementById('toast');
    t.textContent = 'Saved to Drive';
    t.classList.add('show');
    clearTimeout(t._driveT);
    t._driveT = setTimeout(() => t.classList.remove('show'), 1600);
    return;
  }
}
```

- [ ] **Step 2: Manual smoke test (feature disabled)**

Before wiring into export.js, open DevTools console on the running app and run:

```javascript
import('/modules/drive-upload.js').then(m => {
  m.uploadToDrive('<svg/>', 'test.svg');
});
```

Expected: nothing happens (DRIVE_UPLOAD_URL is empty, function returns immediately). No errors in console.

- [ ] **Step 3: Manual smoke test (PIN dialog)**

Temporarily set `DRIVE_UPLOAD_URL` to a non-empty dummy string like `'http://localhost:9999'`, save, and run:

```javascript
import('/modules/drive-upload.js').then(m => {
  m.uploadToDrive('<svg/>', 'test.svg');
});
```

Expected: PIN dialog appears. Click "Skip" → dialog closes, nothing else happens. Reload and repeat → enter a PIN, click "Unlock Drive" → fetch fails (localhost:9999 unreachable) → persistent red error toast appears with ✕ button. Click ✕ → toast dismisses.

Revert `DRIVE_UPLOAD_URL` to `''` before committing.

- [ ] **Step 4: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/drive-upload.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(drive): add drive-upload module with PIN dialog and error toast"
```

---

### Task 5: Wire into `export.js`

**Files:**
- Modify: `laser-maker/modules/export.js`

**Interfaces:**
- Consumes: `uploadToDrive(svgString, filename): Promise<void>` from Task 4
- Modifies: `download(filename)` to return the SVG string

- [ ] **Step 1: Add import at top of `export.js`**

Find the first line of `export.js` (it starts with imports or the `store` import). Add at the very top:

```javascript
import { uploadToDrive } from './drive-upload.js';
```

- [ ] **Step 2: Modify `download()` to return the SVG string**

Find in `download()` (around line 307):
```javascript
  const svg = buildSVG(pathMap);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'laser.svg';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  toast('SVG exported');
}
```

Replace with:
```javascript
  const svg = buildSVG(pathMap);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'laser.svg';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  toast('SVG exported');
  return svg;
}
```

- [ ] **Step 3: Call `uploadToDrive` from confirm handler**

Find in the confirm button handler (around line 413):
```javascript
  _closeDialog();
  await download(filename);
});
```

Replace with:
```javascript
  _closeDialog();
  const svg = await download(filename);
  uploadToDrive(svg, filename);
});
```

Note: `uploadToDrive` is intentionally not awaited — it runs in the background so the export dialog doesn't block on the Drive upload.

- [ ] **Step 4: End-to-end test**

With `DRIVE_UPLOAD_URL = ''` (default), click Export, fill name+project, click Export button. Expected: SVG downloads locally, toast "SVG exported" appears, no PIN dialog, no errors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/modules/export.js
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(drive): wire uploadToDrive into export flow"
```

---

## Verification Checklist

Once all tasks are committed, test end-to-end with a real Apps Script deployment:

1. Set `DRIVE_UPLOAD_URL` in `drive-upload.js` to your deployed Apps Script URL
2. **Feature disabled:** Leave URL empty → export works exactly as before, no PIN dialog
3. **Wrong PIN:** Export → PIN dialog appears → enter wrong PIN → dialog shows "Incorrect PIN — try again", input shakes, stays open → enter correct PIN → file appears in Drive, "Saved to Drive" toast
4. **PIN cached:** Export again → no PIN dialog → "Saved to Drive" toast silently
5. **Network failure:** Disconnect WiFi, export → persistent red toast "Drive save failed — file downloaded locally" → ✕ dismisses it → local file downloaded
6. **PIN rotation:** Change `DRIVE_PIN` in Apps Script Script Properties → next export: server returns Invalid PIN → `localStorage` cleared → PIN dialog re-appears
7. **Drive folder:** Open Google Drive → "Laser Maker Exports" → today's `MM-DD-YY` folder → SVG file present with correct name
8. **Duplicate export:** Export same design twice → Drive folder has two files with same name (both kept by Drive)
