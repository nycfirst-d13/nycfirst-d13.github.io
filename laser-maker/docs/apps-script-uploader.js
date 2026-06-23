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
