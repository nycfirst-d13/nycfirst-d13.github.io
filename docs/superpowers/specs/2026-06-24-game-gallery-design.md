# Game Gallery — Design Spec (v2)
**Date:** 2026-06-24
**Status:** Approved

> **v2 changes:** Resolved the static-export vs. live-update contradiction (runtime client lookup via `?id=`). Added an explicit 8bitcn component map. Added loading / error / empty states. Defined the thumbnail strategy. Made the iframe aspect-ratio responsive. Added "Intern" role. Expanded arcade flavor (marquee, XP bar, CRT toggle). Body font → VT323 (≥18px). Added pixelated NYC FIRST logo + MakeCode attribution + Logos & Branding section.

---

## Overview

A NYC FIRST District 13 themed 8-bit virtual arcade at `/game-gallery/` on the GitHub Pages site. Students (grades 3–8), interns, and instructors submit MakeCode Arcade games via Google Form. Teachers approve and publish games through a Google Sheets workflow. The gallery is a Next.js static export — no server, no API keys.

---

## Architecture

```
SUBMIT
  Google Form (student / intern / instructor)
    → Sheet tab: "Submissions"  (auto, all pending)
    → Drive folder: /D13-Games/Pending/  (.mkcd files)

APPROVE (teacher)
    → Review "Submissions" tab in Google Sheet
    → Import .mkcd into D13 Cloud MakeCode account
    → Share from D13 account → copy stable D13-owned URL
    → Paste D13 URL into Sheet row, fill id slug
    → Move row to "Approved" tab

SERVE  (fully client-side — no rebuild on new game)
  Gallery (Next.js static export, /game-gallery/)
    → /game-gallery/          grid: fetch Approved CSV on load → render cards
    → /game-gallery/games/    detail: read ?id= → fetch CSV → find row → iframe d13_url

DEPLOY
  GitHub Actions → next build (static export) → gh-pages branch
  (rebuild only when CODE changes; new approved games appear without a rebuild)
```

No server. No API keys. Teacher workflow is entirely Google Sheets + MakeCode. Gallery is read-only static.

### Why runtime lookup, not `[id]` prerender

`output: 'export'` requires `generateStaticParams` to bake every dynamic route at build time. That would mean a code rebuild for every newly approved game — contradicting "live within ~1 minute."

Instead the game page is **one static page** at `/games/` that reads the game id from the query string (`/games/?id=cool-dino`), fetches the same Approved CSV the grid uses, finds the matching row client-side, and renders the iframe. New approved games go live on the next page load — no rebuild. Trade-off accepted: no per-game server-rendered URL / SEO, which is fine for an internal arcade.

---

## Data Model

### Google Sheet — "Approved" tab (gallery reads this)

| Column | Source | Notes |
|---|---|---|
| `id` | teacher fills | URL-safe slug, **lowercase, unique**, e.g. `cool-dino-game`. Used as the `?id=` lookup key. |
| `game_title` | form | |
| `student_name` | form | |
| `grade` | form | `3, 4, 5, 6, 7, 8, Intern, Instructor` |
| `student_url` | form | Original MakeCode share URL from submitter's account |
| `d13_url` | teacher fills | D13 Cloud MakeCode share URL — drives both the iframe and the card thumbnail |
| `submitted_at` | form | ISO timestamp |
| `session` | teacher fills (optional) | Future grouping e.g. "Spring 2025" — store now, filter later |

### Google Sheet — "Submissions" tab (pending review)

Same columns minus `id`, `d13_url`, `session` — teacher fills those during approval.

**Key:** `student_url` is provenance/reference. `d13_url` is the live source for the iframe **and** the thumbnail. Both preserved permanently. `session` stored now for future filtering UI.

### `id` integrity (teacher-managed, gallery-tolerant)

`id` is filled by hand, so the gallery does not trust it:
- **Lookup** matches the first row whose `id` equals the query param. Duplicates → first wins (no crash).
- **Missing / unknown id** → game page shows an **Empty** state ("Game not found") + back-to-gallery **Button**.
- Grid links are generated from the same `id`, so a typo is self-consistent (the card links to the row it came from).

---

## Submission Flow (Google Form)

Hosted on D13 Cloud Google account. Fields in order:

1. Your name
2. Role / grade (dropdown: `3, 4, 5, 6, 7, 8, Intern, Instructor`)
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
6. In the Sheet: fill `id` (lowercase, unique slug), `d13_url`, optionally `session`
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
- **Fonts:** Press Start 2P (**headings only** — hard to read at body size), VT323 (body/labels — CRT-terminal retro; set at **≥18px** so grades 3–8 can read it, pairs with the CRT toggle)
- **Deployment:** GitHub Actions → `gh-pages` branch → `/game-gallery/`

### 8bitcn Component Map

Which 8bitcn component serves which use case (the rest of the library is unused):

| Use case | Component |
|---|---|
| Game grid cards | **Card** |
| Grade / role badge | **Badge** (color-coded: grades on `--blue` ramp, Intern distinct tint, Instructor `--accent`) |
| Back button, "Submit your game" CTA, retry | **Button** |
| Grid loading (CSV in flight) | **Skeleton** |
| No games yet / no filter match / game-not-found | **Empty** |
| CSV fetch failed | **Alert** + retry **Button** |
| iframe loading | **Spinner** |
| CRT / scanline visual toggle | **Retro Mode Switcher** |
| "N games published" footer counter | **XP Bar** |
| Future session/grade filter | **Toggle Group** (grade) + **Select** (session) — built later, data already stored |

Pagination is intentionally **not** used yet (YAGNI; flat grid is fine at current volume — add **Pagination** only if the grid gets unwieldy).

### Brand Palette (8-bit arcade, NYC FIRST colors)

```css
--bg:           #0A0E1A;   /* dark navy — arcade cabinet */
--surface:      #141929;   /* card background */
--border:       #1E2D4A;
--accent:       #E0241B;   /* NYC FIRST red — marquee, CTAs, Instructor badge */
--accent-hi:    #FF3B30;
--blue:         #2563EB;   /* grade badges, secondary accents */
--ink:          #F0F4FF;   /* primary text */
--ink-2:        #9DA8C4;   /* muted text */
```

### Thumbnails

Live iframes on the grid are **not** used — N simulators would overwhelm a classroom Chromebook. Instead each card shows a static thumbnail:

- Parse the MakeCode `shareId` from `d13_url`.
- Card `<img src="https://makecode.com/api/{shareId}/thumb">` (MakeCode cloud thumbnail convention).
- `onError` → fall back to a built-in pixel-art placeholder (optionally tinted by grade).
- Always set `alt` = game title.

> **Implementation check:** confirm the `/api/{shareId}/thumb` URL resolves against a real D13 share URL before relying on it. The `onError` placeholder makes a miss non-fatal regardless.

### Logos & Branding

- **NYC FIRST logo:** auto-pixelated from the existing flat-color `logo.svg` (master FIRST mark — blue/red/black, no gradients, pixelates cleanly). One-time build step: render `logo.svg` → downscale to ~64px nearest-neighbor → save `public/nycfirst-pixel.png`, display with `image-rendering: pixelated`. Used in the marquee header. (Upgrade path if ever wanted: SVG `<rect>` pixel-grid for crisp/themeable scaling.)
- **MakeCode:** no asset in repo and it is Microsoft's trademark — **not** pixelated. Shown as text attribution "Made with MakeCode Arcade" (footer + game page), optionally linking to MakeCode Arcade.
- **micro:bit / other logos:** out of scope (Arcade ≠ micro:bit).
- **Trademark note:** the FIRST mark belongs to *FIRST*; pixelating it for this internal educational gallery is low-risk but acknowledged. Leave the MakeCode mark unmodified.

### `/game-gallery/` — Main Grid Page

- Full-width 8-bit **animated marquee** header: pixelated NYC FIRST logo + "GAME GALLERY" in Press Start 2P, red on dark (marquee shimmer effect).
- Responsive grid: 3 cols desktop / 2 tablet / 1 mobile.
- Each card: thumbnail (see above) + game title + submitter name + grade/role **Badge**; pixel borders, chunky box-shadow; hover = red glow + shadow shift ("press" feel). Min 44px tap targets.
- **Footer XP Bar:** "N games published" using the count of approved rows.
- States: **Skeleton** grid while CSV loads → grid on success; **Alert** + retry on fetch failure; **Empty** state when zero approved games.
- Each card links to `/games/?id={id}`.

### `/game-gallery/games/` — Game Page (single static route)

- Reads `?id=` from the URL, fetches the Approved CSV, finds the matching row.
- **Responsive iframe** of `d13_url` in a wrapper that preserves the MakeCode Arcade **160:120 aspect ratio** (centered, scales to viewport — not stretched).
- **Spinner** while the iframe loads.
- Below/beside: game title, submitter name, grade/role, "Original submission →" link (`student_url`).
- Back **Button** → gallery.
- Unknown/missing id → **Empty** ("Game not found") + back button.
- Same 8-bit chrome as the gallery page.

### Arcade Flavor (full)

- Animated marquee header (above).
- Footer XP bar = published-game count.
- **CRT / scanline toggle** via 8bitcn **Retro Mode Switcher** — default **off**, choice persisted in `localStorage` so it survives navigation. Toggle lives in the header.

### Accessibility

- Press Start 2P restricted to headings; VT323 for body/label text at **≥18px** (terminal-pixel but legible at that size).
- Minimum 44px interactive tap targets (grade-3 friendly, mobile).
- `alt` text on all thumbnails; visible focus states on cards/buttons.

### Organization

- Now: flat grid, newest approved first (sort by `submitted_at` desc).
- Future: session/grade filter (**Toggle Group** + **Select**; data fields already stored).

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

Both `/` (grid) and `/games/` (detail) are plain static pages — no `generateStaticParams`, because game identity comes from the runtime `?id=` query, not the route.

### GitHub Actions

Workflow triggers on push to `main` when files under `game-gallery/` change:

```yaml
- cd game-gallery && npm ci && npm run build
- copy out/ into gh-pages branch under /game-gallery/
- push gh-pages
```

Rebuilds happen on **code** changes only. Newly approved games appear without a rebuild (client fetches the live CSV). Existing GitHub Pages setup for the repo root is unaffected — the static export lands alongside the other HTML files on `gh-pages`.

---

## Out of Scope (for now)

- Teacher dashboard built into the site (use Google Sheets)
- Session/event/grade filter UI (data model ready, build later)
- Student accounts or login
- Game ratings, comments, or social features
- Automated MakeCode API snapshot (teacher manually imports .mkcd)
- Pagination (flat grid until volume demands it)
- Per-game server-rendered URLs / SEO (runtime `?id=` lookup instead)
