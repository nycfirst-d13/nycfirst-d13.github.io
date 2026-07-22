# Game Gallery — "Add your own game" submission backend + form

Goal: let students submit their MakeCode Arcade games from the site (no Google
Form), staff review/publish from a single Google Sheet, and the gallery read
that sheet live. Mirrors the **stem-stations** pattern exactly: one tab, an
`active` boolean gate, an Apps Script Web App (owned by the `d13-internal@`
automation account) for writes, gviz for
reads. No server, no API keys, no secret in any public file.

Same **hard rule** as stem-stations: no private key / secret ever goes in a
GitHub Pages file. Secrets live only in the Apps Script backend.

---

## What changes vs. today

Today `app.js` reads a local `dev-games.csv` fixture (`CSV_URL`), read-only.
After this: the gallery reads the live sheet (gviz) with the fixture as
offline fallback, and a new `submit.html` page writes pending rows to that same
sheet via Apps Script.

The **D13 re-host workflow from the design spec is kept**: a submitted row is
NOT publishable until staff import the `.mkcd` into the D13 MakeCode account,
paste the resulting `d13_url`, assign an `id` slug, and flip `active`.

---

## Data model — one tab, one gate

Single sheet tab (like stem-stations `stations`). Header row, in this exact
column order (order matters — `doPost` appends positionally):

| # | Column | Filled by | Notes |
|---|--------|-----------|-------|
| A | `id` | staff | lowercase unique slug; the `?id=` lookup key. Blank until approved. |
| B | `game_title` | form | required |
| C | `student_name` | form | required |
| D | `grade` | form | dropdown: `3,4,5,6,7,8,Intern,Instructor` |
| E | `student_url` | form | student's MakeCode share URL (provenance) |
| F | `d13_url` | staff | D13-account share URL — drives iframe + auto-thumbnail. Blank until re-hosted. |
| G | `submitted_at` | backend | ISO timestamp, set server-side in `doPost` |
| H | `session` | staff | optional grouping, e.g. "Spring 2026" |
| I | `active` | staff | **boolean checkbox** (column validated as checkbox, like stem-stations col F). Submissions land `FALSE`. |
| J | `screenshot` | form (optional) | Drive thumbnail URL if a screenshot was uploaded/pasted |
| K | `mkcd_url` | form (optional) | Drive link to the archived `.mkcd` file |

**Publish gate (gallery-side filter):** a row shows in the gallery only when
`active` is truthy **AND** `d13_url` is non-empty **AND** `id` is non-empty.
All three gate together because `active` alone can't guarantee the row is
playable/linkable (staff might tick it before finishing the re-host). This is
the one place game-gallery differs from stem-stations, which gates on `active`
alone.

`active` exports from gviz as the text `TRUE`/`FALSE` — parse case-insensitively
(`/^true$/i`).

---

## Flow

```
SUBMIT  (student, on submit.html)
  form POSTs FormData → Apps Script /exec
    → appendRow: title, name, grade, student_url set;
      id / d13_url / session BLANK; active=false (boolean);
      screenshot + mkcd_url = Drive links (or blank)
    → optional .mkcd  → Drive /D13-Games/mkcd/
    → optional image  → Drive /D13-Games/screenshots/
    → email staff (from sc-d13-accounts@): "new game submitted, not yet live"

APPROVE  (staff, in the Sheet)
  play student_url to review
  → import mkcd (from J link or Drive) into D13 MakeCode account
  → share from D13 account → paste URL into d13_url (F)
  → assign id slug (A), optional session (H)
  → tick active (I)
  → LIVE on next gallery load (~1 min, no rebuild)

SERVE  (gallery, unchanged client-side except source + filter)
  index.html grid: gviz CSV → parse → filter publish-gate → cards
  games.html?id=: gviz CSV → findGame → iframe d13_url
```

---

## Backend — `submit.gs` (adapt stem-stations `submit.gs`)

Near-clone of `stem-stations/submit.gs`. Own it with the **same internal
automation account** stem-stations uses — `d13-internal@nycfirst.org` (a shared
Workspace account that runs all D13 internal automation; not a personal
account, not a GCP service account). The Sheet + Apps Script + Drive folders
live under that account so emails/files aren't tied to any individual. Simplest
path: create the game-gallery Sheet under `d13-internal@nycfirst.org` and bind
the script to it. Deploy: New deployment → Web app → Execute as **Me** (=
`d13-internal@`), Who has access **Anyone**. Verify the `/exec` URL loads with
no login prompt in incognito.

Staff notifications go **to** `sc-d13-accounts@nycfirst.org` (`STAFF_EMAIL`) —
that is the recipient, distinct from the executing account.

> Note: this is "Option A" from `stem-stations/plans/bot-submission-plan.md`,
> where the "bot" is the `d13-internal@` Workspace account. There is no GCP
> service-account bot in play (that was the unused Option B).

`doPost(e)` changes from the stem-stations version:

- Read params: `game_title` (required), `student_name`, `grade`, `student_url`.
- `submitted_at`: set server-side — `new Date().toISOString()`. (Don't trust a
  client timestamp.)
- Normalize `student_url` like stem-stations (`https://` prefix if scheme
  missing); reject if present-but-not-a-URL.
- Optional `.mkcd`: base64 → `saveToDrive` into an mkcd folder →
  `mkcd_url`. (Same `saveToDrive` helper; `.mkcd` is fine as an arbitrary
  binary blob — set type `application/octet-stream` if none given.)
- Optional screenshot: same `imageData`/`imageUrl` handling stem-stations
  already has → `screenshot`.
- `appendRow([ '', game_title, student_name, grade, student_url, '',
  submitted_at, '', false, screenshot, mkcd_url ])` — blanks for staff-filled
  columns; `false` (boolean, not `'FALSE'`) so column I renders unchecked.
- Reuse `clean()` (length cap), `json()`, and the staff `notify()` email
  (reworded for games; link the Sheet).

CONFIG constants: new `SHEET_ID`, `SHEET_NAME`, two Drive folder ids
(`MKCD_FOLDER_ID`, `SCREENSHOT_FOLDER_ID`), `STAFF_EMAIL` =
`sc-d13-accounts@nycfirst.org`.

---

## Front end

### `submit.html` (new, standalone page)

Own page at `/game-gallery/submit.html`, linked from the gallery header/footer
("+ Add your game") and from the help popover. Reuses `style.css` (8-bit theme,
big legible controls per game-gallery CLAUDE.md styling rules) and the
`help.js` header injection.

Fields (all big tap targets, VT323 ≥18px labels):

1. **Your name** — text, required.
2. **Grade / role** — chip group or select: `3,4,5,6,7,8,Intern,Instructor`.
3. **Game title** — text, required.
4. **MakeCode share URL** — text, required. Bare-host normalize + validate like
   stem-stations `normUrl`/`urlOk`.
5. **Game file (.mkcd)** — *optional* file input, with inline
   **"How to export from MakeCode"** instructions:
   > In MakeCode Arcade, click the ⚙ gear (top-right) → **Save As / Download**
   > → you get a `.mkcd` file. Upload it here so we can keep a permanent copy.
   (Confirm exact menu wording against current MakeCode UI when building.)
6. **Screenshot** — *optional* upload or paste-URL (same control as
   stem-stations), "we'll use a MakeCode picture if you skip this."

Submit logic: copy the stem-stations `form.submit` handler verbatim — build
`FormData`, POST to `SUBMIT_URL`, JSON `{ok}` check, and the `no-cors`
fire-and-forget fallback with its ponytail-commented ceiling. Success panel:
"Sent for review — a teacher will publish it after adding it to the D13 arcade."
`fileToB64` reused for both `.mkcd` and screenshot.

`SUBMIT_URL` const at top, pasted after deploying `submit.gs`. Until pasted,
disable submit with "Submissions aren't set up yet — ask a staff member" (same
guard stem-stations uses).

### `app.js` (data layer changes)

- Replace `const CSV_URL = 'dev-games.csv'` with the stem-stations two-source
  pattern: `GVIZ_CSV` (live) with `dev-games.csv` as offline/CORS fallback in a
  `loadCSV()` that tries gviz then falls back.
- `parseGamesCsv`: change the `.filter(g => g.id)` to the full **publish gate** —
  `active` truthy (`/^true$/i`) AND `d13_url` AND `id`.
- Add `active`, `screenshot`, `mkcd_url` to the tolerated columns (header-driven
  map already handles unknown columns; just use them).
- Thumbnail precedence in the card renderer: uploaded `screenshot` → else
  MakeCode `thumbUrl(extractShareId(d13_url))` → else pixel placeholder
  (`onError`). `screenshot` + `extractShareId` already exist.
- Extend the `?selftest=1` self-check: a row with `active=FALSE` (or blank
  `d13_url`/`id`) is filtered OUT; a fully-approved row is kept; `TRUE`/`true`
  both parse truthy.

### `dev-games.csv` fixture

Add the `active`, `screenshot`, `mkcd_url` columns and set `active=TRUE` +
`d13_url`/`id` on the existing fixture rows so local dev still renders. This is
also the offline fallback.

---

## Deferred — play counts / XP (future pass, not built now)

Footer XP bar currently just counts published rows. A real per-play counter
would POST to Apps Script on each kiosk play to increment a `plays` column.
Concerns to design then, not now:

- **Write volume + quota:** one POST per play hits Apps Script daily execution
  quotas fast in a busy kiosk; batch or debounce.
- **Race conditions:** concurrent `doPost` read-modify-write on the same cell
  can lose increments — needs `LockService` or an append-only "plays log" tab
  summed on read.
- **gviz read lag:** counts won't reflect instantly.

Leave the XP bar as published-count until this is worth a dedicated plan.

---

## Build order

1. Create the Sheet (under `sc-d13-accounts@nycfirst.org`) with the 11-column header; validate column I as a
   checkbox. Add two Drive folders.
2. Adapt + deploy `submit.gs`; grab the `/exec` URL; verify incognito no-login.
3. Update `app.js` (gviz source + publish-gate filter + thumbnail precedence +
   self-check) and `dev-games.csv`. Test locally with `?selftest=1`.
4. Build `submit.html`; paste `SUBMIT_URL`; link it from gallery + help.
5. End-to-end: submit a test game → `active=FALSE` row + Drive files + staff
   email → staff fill `d13_url`/`id`, tick `active` → appears in gallery.

Each step commits separately, scoped to `game-gallery/`, per repo CLAUDE.md.
