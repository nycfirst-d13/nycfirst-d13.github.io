# STEM Stations — submission backend, owned by the D13 automation account

Goal: submissions should be written by a shared **automation identity**, not
tied to a personal account. The form (`index.html`) POSTs FormData; the backend
appends a row (`active=FALSE`), saves any screenshot, and emails staff.

> **Deployed reality:** this went with **Option A**, owned by
> **`d13-internal@nycfirst.org`** — the shared Workspace account that runs all
> D13 internal automation. Staff notifications are sent *to*
> `sc-d13-accounts@nycfirst.org` (`STAFF_EMAIL`), which is the recipient, not
> the executing account. The `stem-bot@` name below was a placeholder from
> planning; the real account is `d13-internal@`.

Two ways to get there. **Option A** (bot-owned Apps Script) is recommended — same
behavior, near-zero new infra. **Option B** (Cloud Function + service account) is a
"true" GCP bot, more moving parts, only worth it if you need to decouple from
Workspace or expect big scale.

**Hard rule for both:** no private key / secret ever goes in `index.html` — it's a
public GitHub Pages file. Secrets live only in the backend.

---

## Option A — Bot-owned Apps Script (recommended)

Reuses the existing `submit.gs` unchanged. Only the *owner* and deployment change.

### Steps
1. **Use the automation account** — `d13-internal@nycfirst.org` (the shared
   Workspace account that runs D13 internal automation). Emails and Drive files
   belong to it.
2. **Transfer ownership** of the Google Sheet to `d13-internal@` (Share → make it
   the Owner), or create the Sheet under it from the start. Give yourself Editor.
3. **Create a Drive folder** under `d13-internal@` for screenshots; put its id in `DRIVE_FOLDER_ID`.
4. **Move the Apps Script to the account:** sign in as `d13-internal@`, open the
   Sheet → Extensions → Apps Script, paste `submit.gs`. (Script is bound to the
   Sheet, so it follows the Sheet's owner.)
5. **Deploy** (as `d13-internal@`): New deployment → Web app →
   - Execute as: **Me** (= `d13-internal@`)
   - Who has access: **Anyone**
6. **Wire the URL:** copy the `/exec` URL into `SUBMIT_URL` in `index.html`, commit, push.
7. **Verify:** open the `/exec` URL in an incognito window — must load with **no login
   prompt**. Then submit a test station from the site → confirm `active=FALSE` row,
   screenshot link, and the staff email (now sent *from* `d13-internal@`).

### Pros / cons
- ➕ No GCP project, no keys, no second deploy target. Code already written.
- ➕ Identity fully decoupled from your personal account.
- ➖ Bot must be a real Google/Workspace account (a seat / license).
- ➖ Apps Script quotas (email/day, execution time) — fine at this volume.

---

## Option B — Cloud Function + service account (true GCP bot)

Static form → HTTPS Cloud Function → Sheets API + Drive API, authenticated as a GCP
**service account** (the bot). No human account involved.

### Steps
1. **GCP project** — create/select one. Enable **Google Sheets API** + **Google Drive API**.
2. **Service account** — create it; download... no: prefer **no key** — Cloud Functions
   run *as* a service account automatically. Assign that runtime SA instead of minting a
   JSON key (avoids key handling entirely).
3. **Grant access** — share the Sheet (Editor) and the Drive screenshot folder (Content
   manager) with the service account's email (`...@...iam.gserviceaccount.com`).
4. **Write the function** (`functions/submit/`, Node 20 example):
   - Deps: `googleapis` (or `@googleapis/sheets` + `@googleapis/drive`).
   - Auth: `new GoogleAuth({ scopes: [sheets, drive.file] })` — picks up the runtime SA.
   - Parse multipart FormData (e.g. `busboy`), read title/description/url/tags/difficulty
     + optional image.
   - Image → `drive.files.create` in the folder, set permission anyone-reader, build the
     `https://drive.google.com/thumbnail?id=...&sz=w1000` URL.
   - `sheets.spreadsheets.values.append` a row: `[title, description, url, tags,
     difficulty, 'FALSE', screenshotUrl]`.
   - Email staff: SA can't send Gmail directly — use one of: SendGrid/Mailgun API key
     (stored as a Secret), or drop email and rely on Sheet's built-in
     Tools → Notification settings, or a scheduled digest.
   - **CORS:** return `Access-Control-Allow-Origin: *` and handle `OPTIONS` preflight
     (needed because the browser reads the JSON response cross-origin).
5. **Deploy** — `gcloud functions deploy submit --runtime nodejs20 --trigger-http
   --allow-unauthenticated --region ...` (or Cloud Run). Bind the runtime service account.
6. **Secrets** — any mail-provider key goes in **Secret Manager**, referenced by the
   function. Never in the repo.
7. **Wire + verify** — put the function URL in `SUBMIT_URL`; the front-end already sends
   FormData and reads a JSON `{ok}` (the no-cors fallback becomes unnecessary once CORS
   is correct). Submit a test → confirm row + Drive file + notification.

### Pros / cons
- ➕ No human/Workspace seat; pure machine identity; scales high; standard GCP IAM.
- ➕ With runtime SA (no JSON key) there's no long-lived secret to leak/rotate.
- ➖ New infra: GCP project, 2 APIs, a deployed function, CORS handling, and a *separate*
   path for staff email (Gmail-from-SA isn't available).
- ➖ More to maintain than Apps Script for identical end behavior at this scale.

---

## Recommendation

Take **Option A**. It gives the bot identity you want with the code that already exists
and one redeploy. Choose **Option B** only if you must avoid a Workspace seat entirely,
want GCP-native IAM/logging, or expect volume beyond Apps Script quotas — and if so,
use the **runtime service account (no JSON key)** and move email to a mail API or the
Sheet's native notifications.
