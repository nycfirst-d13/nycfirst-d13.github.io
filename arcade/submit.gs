/**
 * Arcade — submission endpoint (Google Apps Script Web App).
 * Adapted from stem-stations/submit.gs. One tab, an `active` checkbox gate.
 *
 * SETUP (one time, signed in as d13-internal@nycfirst.org):
 *   1. Create the arcade Sheet under d13-internal@ with this header row:
 *        id | game_title | student_name | grade | student_url | d13_url |
 *        submitted_at | session | active | screenshot | mkcd_url
 *      Set column I (active) data-validation to a checkbox.
 *   2. Sheet → Extensions → Apps Script. Paste this file. Edit CONFIG below.
 *   3. Deploy → New deployment → type "Web app":
 *        - Execute as: Me  (= d13-internal@nycfirst.org, which owns the Sheet
 *          + the two Drive folders)
 *        - Who has access: Anyone
 *      Copy the /exec URL → paste into SUBMIT_URL in submit.html.
 *   4. First run asks for permissions (Sheet + Drive + Gmail) — approve.
 *
 * Owner/executor: d13-internal@nycfirst.org. STAFF_EMAIL is the notification
 * RECIPIENT (sc-d13-accounts@), not the executing account.
 *
 * The form POSTs FormData. Every submission is appended as active=false with
 * id / d13_url / session BLANK (staff fill those during the D13 re-host, then
 * tick active to publish) and emails STAFF_EMAIL.
 */

// ── CONFIG ────────────────────────────────────────────────
var SHEET_ID = 'PASTE_ARCADE_SHEET_ID';
var SHEET_NAME = 'games';                    // the tab the gallery reads
var SCREENSHOT_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID';   // uploaded screenshots
var MKCD_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID';         // archived .mkcd project files
var STAFF_EMAIL = 'sc-d13-accounts@nycfirst.org';
var MAX_LEN = 500;                           // per-field length cap

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var title = clean(p.game_title);
    if (!title) return json({ ok: false, error: 'Missing game title' });

    var student = clean(p.student_name);
    var grade = clean(p.grade);
    var studentUrl = normUrl(clean(p.student_url));
    var submittedAt = new Date().toISOString();   // server-side, don't trust client

    // Optional screenshot: uploaded file → Drive, else a pasted URL. Sheet stores
    // a URL string (the site reads the column as CSV text).
    var screenshot = '';
    if (p.imageData) {
      screenshot = saveToDrive(SCREENSHOT_FOLDER_ID, p.imageData, p.imageName || (title + '.png'), p.imageType || 'image/png');
    } else if (p.imageUrl) {
      screenshot = clean(p.imageUrl);
    }

    // Optional .mkcd (MakeCode project file) → Drive archive.
    var mkcdUrl = '';
    if (p.mkcdData) {
      mkcdUrl = saveToDrive(MKCD_FOLDER_ID, p.mkcdData, p.mkcdName || (title + '.mkcd'), 'application/octet-stream');
    }

    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    // Column order must match the header exactly:
    // id, game_title, student_name, grade, student_url, d13_url, submitted_at, session, active, screenshot, mkcd_url
    // Blanks = staff-filled (id/d13_url/session). active: boolean false → unchecked box.
    sheet.appendRow(['', title, student, grade, studentUrl, '', submittedAt, '', false, screenshot, mkcdUrl]);

    notify(title, student, grade, studentUrl, screenshot, mkcdUrl);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function clean(v) {
  return (v == null ? '' : String(v)).trim().slice(0, MAX_LEN);
}

// Accept bare hosts like "makecode.com/..." — prepend https:// if no scheme.
function normUrl(v) {
  return (v && !/^https?:\/\//i.test(v)) ? 'https://' + v : v;
}

function saveToDrive(folderId, b64, name, type) {
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, type, name);
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Reliable hotlink for <img> (screenshots) and a plain view link (.mkcd):
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}

function notify(title, student, grade, studentUrl, screenshot, mkcdUrl) {
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
  var body =
    'A new game was submitted (NOT live yet — import the .mkcd into the D13 MakeCode\n' +
    'account, fill d13_url + id, then tick active to publish):\n\n' +
    'Game: ' + title + '\n' +
    'By: ' + (student || '(none)') + ' (' + (grade || '?') + ')\n' +
    'Student MakeCode URL: ' + (studentUrl || '(none)') + '\n' +
    'Screenshot: ' + (screenshot || '(none)') + '\n' +
    '.mkcd file: ' + (mkcdUrl || '(none)') + '\n\n' +
    'Review + publish here: ' + sheetUrl;
  MailApp.sendEmail(STAFF_EMAIL, 'New game submitted: ' + title, body);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
