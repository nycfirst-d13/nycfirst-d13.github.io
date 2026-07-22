/**
 * STEM Stations — submission endpoint (Google Apps Script Web App).
 *
 * SETUP (one time):
 *   1. Open the Google Sheet → Extensions → Apps Script.
 *   2. Paste this file's contents. Edit the CONFIG constants below.
 *   3. Deploy → New deployment → type "Web app":
 *        - Execute as: Me  (= d13-internal@nycfirst.org, the shared D13
 *          automation account that must own the Sheet + this script)
 *        - Who has access: Anyone
 *      Copy the /exec URL and paste it into SUBMIT_URL in index.html.
 *   4. First run asks for permissions (Sheet + Drive + Gmail) — approve.
 *
 * Owner/executor: d13-internal@nycfirst.org. STAFF_EMAIL below is the
 * notification RECIPIENT (sc-d13-accounts@), not the executing account.
 *
 * The form POSTs FormData; every submission is appended as active=FALSE and
 * emails STAFF_EMAIL. Staff flip active to TRUE in the Sheet to publish.
 */

// ── CONFIG ────────────────────────────────────────────────
var SHEET_ID = '1xclY-0sWt70mZ_jQxMDWOr8XtwgaZivqhDlD2_hnBs0';
var SHEET_NAME = 'stations';               // tab the site reads
var DRIVE_FOLDER_ID = '12vJ8z2J2BEIXBabRvT_E2GwWBB7doVex';   // Drive folder for uploaded screenshots
var STAFF_EMAIL = 'sc-d13-accounts@nycfirst.org';
var MAX_LEN = 500;                         // per-field length cap

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var title = clean(p.title);
    if (!title) return json({ ok: false, error: 'Missing title' });

    var description = clean(p.description);
    var url = clean(p.url);
    var tags = clean(p.tags);
    var difficulty = clean(p.difficulty);

    // Screenshot: uploaded file → Drive, else a pasted URL. Sheet stores a URL string
    // (the site reads the column as CSV text; embedded in-cell images don't export).
    var screenshot = '';
    if (p.imageData) {
      screenshot = saveToDrive(p.imageData, p.imageName || (title + '.png'), p.imageType || 'image/png');
    } else if (p.imageUrl) {
      screenshot = clean(p.imageUrl);
    }

    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    // Column order must match the header row: title, description, url, tags, difficulty, active, screenshot
    // active: boolean false → renders as an unchecked checkbox (column F is checkbox-validated).
    // String 'FALSE' would land as plain text instead.
    sheet.appendRow([title, description, url, tags, difficulty, false, screenshot]);

    notify(title, description, url, tags, difficulty, screenshot);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function clean(v) {
  return (v == null ? '' : String(v)).trim().slice(0, MAX_LEN);
}

function saveToDrive(b64, name, type) {
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, type, name);
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Reliable hotlink for <img> tags:
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
}

function notify(title, description, url, tags, difficulty, screenshot) {
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit';
  var body =
    'A new STEM station was submitted (currently NOT ACTIVE — set active=TRUE to publish):\n\n' +
    'Name: ' + title + '\n' +
    'Description: ' + description + '\n' +
    'URL: ' + (url || '(none)') + '\n' +
    'Tags: ' + (tags || '(none)') + '\n' +
    'Difficulty: ' + (difficulty || '(none)') + '\n' +
    'Screenshot: ' + (screenshot || '(none)') + '\n\n' +
    'Review it here: ' + sheetUrl;
  MailApp.sendEmail(STAFF_EMAIL, 'New STEM station submitted: ' + title, body);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
