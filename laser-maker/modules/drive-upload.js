// modules/drive-upload.js
// Set this to your deployed Apps Script web app URL.
// Leave empty to disable Drive upload (local download still works).
const DRIVE_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbzVop1eCz_xo3aBKXPHSebB7uXoBIWgwWGnPWj2ATgwTwD5kQeS9NsbtziJindaJyIF/exec';

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

// ---- Drive upload ----

async function _postToDrive(pin, svg, filename) {
  // No Content-Type header — avoids CORS preflight that Apps Script can't handle
  const resp = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    body: JSON.stringify({ pin, svg, filename }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// Returns true on success, false on network/server failure, null if user skipped PIN.
export async function uploadToDrive(svgString, filename) {
  if (!DRIVE_UPLOAD_URL) return false;

  let pin = localStorage.getItem(PIN_KEY);

  if (!pin) {
    pin = await showPinDialog();
    if (!pin) return null; // user skipped
  }

  while (true) {
    let result;
    try {
      result = await _postToDrive(pin, svgString, filename);
    } catch {
      return false;
    }

    if (result.error === 'Invalid PIN') {
      localStorage.removeItem(PIN_KEY);
      pin = await showPinDialog(true);
      if (!pin) return null;
      continue;
    }

    if (result.error) return false;

    localStorage.setItem(PIN_KEY, pin);
    return true;
  }
}
