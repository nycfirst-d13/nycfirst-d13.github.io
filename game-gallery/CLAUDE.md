# game-gallery/CLAUDE.md

NYC FIRST District 13 game gallery — 8-bit virtual arcade for student MakeCode Arcade games.

**Design spec:** `../docs/superpowers/specs/2026-06-24-game-gallery-design.md`

## Stack

- Next.js static export (`output: 'export'`)
- 8bitcn.com pixel-art components (copy-pasted, owned — not a live dependency)
- Fonts: Press Start 2P (headings), Geist (body)
- Deployed to `/game-gallery/` on GitHub Pages via GitHub Actions

## Key Config

```js
// next.config.js
output: 'export'
basePath: '/game-gallery'
trailingSlash: true
```

## Data Source

Gallery reads a published Google Sheet CSV at load time. No API key needed.

Sheet columns (Approved tab): `id`, `game_title`, `student_name`, `grade`, `student_url`, `d13_url`, `submitted_at`, `session`

- `d13_url` — D13 Cloud MakeCode share URL, used for iframes
- `student_url` — original student submission URL, shown on game page as provenance

## Routes

- `/game-gallery/` — game grid
- `/game-gallery/games/[id]` — individual game page with iframe

## Brand Palette

```css
--bg: #0A0E1A;
--surface: #141929;
--accent: #E0241B;    /* NYC FIRST red */
--accent-hi: #FF3B30;
--blue: #2563EB;
--ink: #F0F4FF;
--ink-2: #9DA8C4;
```

## Git & Commits

Repo root is the parent directory. Always commit from there:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add game-gallery/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "..."
```
