# game-gallery/CLAUDE.md

NYC FIRST District 13 game gallery — 8-bit virtual arcade for student MakeCode Arcade games.

**Design spec:** `../docs/superpowers/specs/2026-06-24-game-gallery-design.md` (reference only; the Next.js stack it describes was replaced — see below).

## Stack

Plain static HTML/CSS/JS. **No build step, no framework, no node_modules.** Files are served as-is by GitHub Pages at `/game-gallery/`. Edit and commit directly.

| File | Role |
|------|------|
| `index.html` | Grid page — fetches CSV, renders cards, loading/error/empty states, XP footer |
| `games.html` | Detail page — reads `?id=`, iframes the game, shows provenance |
| `app.js` | Shared data layer — CSV fetch/parse, sort-newest, `findGame`, thumbnail URLs |
| `style.css` | 8-bit arcade theme, minimal black & white (Press Start 2P + VT323, Google Fonts) |
| `dev-games.csv` | Committed fixture of real public MakeCode games (made-up student names) |

> History: previously a Next.js static-export app in `game-gallery-src/`. Dropped — a static CSV-driven gallery didn't need React or a build pipeline. Source is still in git history (commit `12e9ea8`) if ever needed.

## Data Source

`CSV_URL` at the top of `app.js` picks the data source. Defaults to the local `dev-games.csv` fixture. To go live, set it to the published "Approved" Google Sheet CSV:

```
https://docs.google.com/spreadsheets/d/<id>/pub?gid=<n>&single=true&output=csv
```

Sheet columns (Approved tab): `id`, `game_title`, `student_name`, `grade`, `student_url`, `d13_url`, `submitted_at`, `session`

- `d13_url` — D13 Cloud MakeCode share URL, used for the iframe
- `student_url` — original student submission URL, shown on the game page as provenance

New approved rows go live on refresh — no rebuild, no redeploy.

## Routes

- `/game-gallery/` → `index.html` — game grid
- `/game-gallery/games.html?id=<slug>` — single game; reads `?id=`, iframes `d13_url`

## Testing

`app.js` has a built-in parser self-check (quoted-comma fields, newest-first sort, case-insensitive lookup). Run it by loading any page with `?selftest=1` and watching the console, or in node.

## Git & Commits

Repo root is the parent directory — `game-gallery/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `game-gallery/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add game-gallery/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(game-gallery): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
