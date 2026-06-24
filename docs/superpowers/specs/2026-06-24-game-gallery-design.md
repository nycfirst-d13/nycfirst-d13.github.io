# Game Gallery — Design Spec
**Date:** 2026-06-24  
**Status:** Approved

---

## Overview

A NYC FIRST District 13 themed 8-bit virtual arcade at `/game-gallery/` on the GitHub Pages site. Students (grades 3–8) and instructors submit MakeCode Arcade games via Google Form. Teachers approve and publish games through a Google Sheets workflow. The gallery is a Next.js static export — no server, no API keys.

---

## Architecture

```
SUBMIT
  Google Form (student/instructor)
    → Sheet tab: "Submissions"  (auto, all pending)
    → Drive folder: /D13-Games/Pending/  (.mkcd files)

APPROVE (teacher)
    → Review "Submissions" tab in Google Sheet
    → Import .mkcd into D13 Cloud MakeCode account
    → Share from D13 account → copy stable D13-owned URL
    → Paste D13 URL into Sheet row
    → Move row to "Approved" tab

SERVE
  Gallery (Next.js static, /game-gallery/)
    → fetches published "Approved" CSV on page load
    → renders game grid
    → game page iframes D13-owned MakeCode URL

DEPLOY
  GitHub Actions → next build (static export) → gh-pages branch
```

No server. No API keys. Teacher workflow is entirely Google Sheets + MakeCode. Gallery is read-only static.

---

## Data Model

### Google Sheet — "Approved" tab (gallery reads this)

| Column | Source | Notes |
|---|---|---|
| `id` | teacher fills | URL-safe slug, e.g. `cool-dino-game` |
| `game_title` | form | |
| `student_name` | form | |
| `grade` | form | 3, 4, 5, 6, 7, 8, Instructor |
| `student_url` | form | Original MakeCode share URL from student's account |
| `d13_url` | teacher fills | D13 Cloud MakeCode share URL — what the iframe uses |
| `submitted_at` | form | ISO timestamp |
| `session` | teacher fills (optional) | Future grouping e.g. "Spring 2025" — store now, filter later |

### Google Sheet — "Submissions" tab (pending review)

Same columns minus `id`, `d13_url`, `session` — teacher fills those during approval.

**Key:** `student_url` is provenance/reference. `d13_url` is the live source for the iframe. Both preserved permanently. `session` field stored now for future filtering UI.

---

## Submission Flow (Google Form)

Hosted on D13 Cloud Google account. Fields in order:

1. Your name
2. Grade (dropdown: 3, 4, 5, 6, 7, 8, Instructor)
3. Game title
4. MakeCode share URL *(paste from your MakeCode account)*
5. Upload your .mkcd file *(export from MakeCode → upload here)*

On submit:
- Row created in "Submissions" tab automatically
- `.mkcd` file saved to `/D13-Games/Pending/` in D13 Cloud Drive
- Teacher receives email notification (native Google Forms feature)

---

## Teacher Approval Workflow

1. Open "Submissions" tab in Google Sheet
2. Review game (open `student_url` to play it)
3. Download `.mkcd` from Drive `/D13-Games/Pending/`
4. Go to MakeCode Arcade, import the `.mkcd` file into the D13 Cloud account
5. Share from D13 account → copy the new share URL
6. In the Sheet: fill `id`, `d13_url`, optionally `session`
7. Move row from "Submissions" tab to "Approved" tab
8. Gallery updates automatically within ~1 minute (CSV re-fetch on next page load)

Two preservation layers:
- `.mkcd` file in Drive — permanent archive, not tied to any account
- D13 Cloud MakeCode account — live iframe source, school-controlled

---

## Gallery UI

### Tech Stack

- **Framework:** Next.js with `output: 'export'` (fully static)
- **Components:** 8bitcn.com (shadcn-based pixel art components), copy-pasted and owned
- **Fonts:** Press Start 2P (headings), Geist (body/labels — readable for grades 3–8)
- **Deployment:** GitHub Actions → `gh-pages` branch → `/game-gallery/`

### Brand Palette (8-bit arcade, NYC FIRST colors)

```css
--bg:           #0A0E1A;   /* dark navy — arcade cabinet */
--surface:      #141929;   /* card background */
--border:       #1E2D4A;
--accent:       #E0241B;   /* NYC FIRST red — marquee, CTAs */
--accent-hi:    #FF3B30;
--blue:         #2563EB;   /* grade badges, secondary accents */
--ink:          #F0F4FF;   /* primary text */
--ink-2:        #9DA8C4;   /* muted text */
```

### `/game-gallery/` — Main Grid Page

- Full-width 8-bit arcade header: D13 logo + "GAME GALLERY" in Press Start 2P, red on dark
- Responsive grid: 3 cols desktop / 2 tablet / 1 mobile
- Each card: MakeCode auto-generated preview thumbnail + game title + student name + grade badge
- 8bitcn pixel borders, chunky box-shadow; hover = red glow + shadow shift ("press" feel)
- On load: fetch published Sheet CSV → parse → render grid

### `/game-gallery/games/[id]` — Game Page

- Large iframe of `d13_url` (D13-owned MakeCode share URL), fills most of viewport
- Below/beside: game title, student name, grade, "Original submission →" link (student_url)
- Back button → gallery
- Same 8-bit chrome as gallery page

### Organization

- Now: flat grid, newest approved first
- Future: session/event filter (data field already stored, filter UI added later)

---

## Deployment

### Next.js Config

```js
// next.config.js
module.exports = {
  output: 'export',
  basePath: '/game-gallery',
  trailingSlash: true,
}
```

### GitHub Actions

Workflow triggers on push to `main` when files under `game-gallery/` change:

```yaml
- cd game-gallery && npm ci && npm run build
- copy out/ into gh-pages branch under /game-gallery/
- push gh-pages
```

Existing GitHub Pages setup for the repo root is unaffected — the static export lands alongside the other HTML files on `gh-pages`.

---

## Out of Scope (for now)

- Teacher dashboard built into the site (use Google Sheets)
- Session/event filter UI (data model ready, build later)
- Student accounts or login
- Game ratings, comments, or social features
- Automated MakeCode API snapshot (teacher manually imports .mkcd)
