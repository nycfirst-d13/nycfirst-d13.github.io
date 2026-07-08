# STEM Stations — Migration & Dynamic Backend Plan

**Status:** Draft  
**Owner:** NYC FIRST D13  
**Sheet:** https://docs.google.com/spreadsheets/d/1VvPJTRwOd1Jar9HxLUtjbhSvmdLK7arcxrHY23skoS4/edit?usp=sharing

---

## Goal

1. Move stem-stations from a subdirectory of `nycfirst-d13.github.io` into its own standalone GitHub repository.
2. Replace the hardcoded station cards in `index.html` with data fetched dynamically from a Google Sheet via the Stein API.

The live URL stays the same: `https://nycfirst-d13.github.io/stem-stations/`

---

## Part 1 — Repo Copy (Subdirectory → Standalone Repo)

### Why
Create a full copy of the stem-stations directory as its own standalone GitHub repo for isolated development and testing, without affecting the live site.

### Steps

1. **Create new repo** on GitHub under the `nycfirst-d13` org:
   - Name: `stem-station-test`
   - Visibility: Public
   - Do NOT initialize with README

2. **Copy current files** from `nycfirst-d13.github.io/stem-stations/` into the new repo:
   ```
   index.html
   images/
     image1.png
     image2.png
   stem-stations-plan.md        ← this file
   stem-stations-review.md
   ```

3. **Do NOT set up GitHub Pages** on the new repo. The parent repo `nycfirst-d13.github.io` is the GitHub Pages site. GitHub Pages is already handled there — no configuration needed in `stem-station-test`.

4. **Do NOT remove or modify the existing `stem-stations` folder** in the parent repo. The live site stays untouched.

5. **Do NOT run git commands from inside any subdirectory** of `nycfirst-d13.github.io`. All commits to the live site must be made from the parent repo root — running git in a subdirectory will break the site.

---

## Part 2 — Google Sheets Backend via Stein

### What is Stein
[Stein](https://steinhq.com) is a free API wrapper that turns any public Google Sheet into a REST endpoint. No backend code required — the page fetches JSON from Stein at load time and renders cards from it.

### Sheet Schema

The Google Sheet (one tab, suggested name: **`stations`**) should have the following column headers in row 1:

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Unique slug (no spaces) | `makecode-arcade` |
| `title` | Card title | `MakeCode Arcade` |
| `description` | Card description (1–2 sentences, student-facing) | `Make games using drag-and-drop coding.` |
| `url` | Full URL the card links to | `https://arcade.makecode.com/` |
| `category` | Matches section ID | `coding` |
| `difficulty` | Badge text | `⭐ Beginner–Advanced` |
| `icon` | SVG path `d=` string (inline icon), or leave blank for default | `M8 8l-4 4 4 4M16...` |
| `active` | `TRUE` or `FALSE` — set FALSE to hide a card without deleting the row | `TRUE` |
| `preview_image` | URL of a screenshot shown as hover overlay on the card; leave blank to show no preview | `https://...` |

**Categories** (must match exactly):

| Value | Section |
|-------|---------|
| `robotics` | Robotics & Engineering |
| `coding` | Coding & Computer Science |
| `design` | 2D Design |
| `modeling` | 3D Design |
| `science` | Science & Physics |
| `math` | Learning Math |
| `creative` | Creative & Music |

### Stein Setup

1. Go to [steinhq.com](https://steinhq.com) and sign in with Google.
2. Click **Add Store** → paste the Google Sheet URL.
3. Copy the generated **API base URL**, which will look like:
   ```
   https://api.steinhq.com/v1/storages/<stein-id>
   ```
4. The sheet tab becomes an endpoint:
   ```
   GET https://api.steinhq.com/v1/storages/<stein-id>/stations
   ```
   This returns an array of row objects matching the column headers.

5. Make sure the Google Sheet is shared as **"Anyone with the link can view"** — Stein requires public read access.

### index.html Refactor

Replace the static `<section>` blocks with a single JS fetch that:

1. Calls the Stein endpoint on page load.
2. Filters rows where `active === "TRUE"`.
3. Groups rows by `category`.
4. Renders section HTML and card HTML dynamically, injecting `title`, `description`, `url`, `difficulty`, and `icon` from each row.

**Skeleton fetch logic:**

```js
const STEIN_URL = 'https://api.steinhq.com/v1/storages/<stein-id>/stations';

async function loadStations() {
  const res = await fetch(STEIN_URL);
  const rows = await res.json();
  const active = rows.filter(r => r.active === 'TRUE');

  // group by category
  const grouped = {};
  active.forEach(r => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });

  // render each section in defined order
  SECTION_ORDER.forEach(cat => {
    if (!grouped[cat]) return;
    renderSection(cat, grouped[cat]);
  });
}
```

The `SECTION_ORDER` array and `renderSection()` / `renderCard()` helpers replace the current hardcoded HTML.

### Category metadata (kept in JS, not in sheet)

Tab labels, colors, and emojis are UI constants — they don't belong in the sheet. Keep them as a JS object:

```js
const CATEGORIES = {
  robotics: { label: 'Robotics & Engineering', emoji: '🤖', color: '#F97316', light: '#FFF7ED' },
  coding:   { label: 'Coding & CS',            emoji: '🖥',  color: '#8B5CF6', light: '#F5F3FF' },
  design:   { label: '2D Design',              emoji: '🎨', color: '#EC4899', light: '#FDF2F8' },
  modeling: { label: '3D Design',              emoji: '🧱', color: '#10B981', light: '#ECFDF5' },
  science:  { label: 'Science & Physics',      emoji: '🔬', color: '#06B6D4', light: '#ECFEFF' },
  math:     { label: 'Learning Math',          emoji: '➗', color: '#F59E0B', light: '#FFFBEB' },
  creative: { label: 'Creative & Music',       emoji: '🎵', color: '#D946EF', light: '#FDF4FF' },
};
```

### Loading & Error States

- Show a subtle loading spinner or skeleton until fetch resolves.
- If the fetch fails, fall back to a static error message ("Stations couldn't load — try refreshing.") rather than a blank page.

---

## Part 3 — Adding & Editing Stations

Once live, any authorized person can add or edit a station by editing the Google Sheet directly — no code changes needed:

- **Add a station:** Add a new row with all required columns and set `active` to `TRUE`.
- **Hide a station:** Set `active` to `FALSE`.
- **Edit a station:** Update the cell in place.
- Changes go live the next time a visitor loads the page (Stein fetches fresh on each load).

---

## Open Questions

- [ ] Who should have edit access to the Google Sheet? (Staff only, or broader?)
- [ ] Should the `icon` column use a preset name (e.g. `"gamepad"`, `"globe"`) mapped to SVG in JS, rather than a raw SVG path string? (More maintainable for non-technical editors.)
- [ ] Do we want a `sort_order` column so items within a category can be reordered from the sheet?
- [ ] Cache strategy: Stein free tier has rate limits — consider a `sessionStorage` cache with a short TTL if the page is used heavily in a lab setting.

---

## Implementation Order

1. Create the `stem-station-test` repo on GitHub (no Pages setup).
2. Copy current files from the `stem-stations` subdirectory into it.
3. Populate the Google Sheet with the current 20 stations (migrate from `index.html`).
4. Set up Stein store and verify the API endpoint returns data.
5. Refactor `index.html` in `stem-station-test` to fetch from Stein and render dynamically.
6. Test locally (open `index.html` directly — CORS on Stein is open).
7. Once validated, copy the updated `index.html` back into the parent repo's `stem-stations/` folder and commit from the parent repo root.
