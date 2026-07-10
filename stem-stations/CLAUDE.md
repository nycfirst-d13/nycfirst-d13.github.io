# stem-stations/CLAUDE.md

STEM stations landing page — a child page of the nycfirst-d13.github.io GitHub Pages site, served at `/stem-stations/`.

Data-driven: `index.html` fetches a published Google Sheet (CSV via the gviz endpoint) on load and renders cards from it; `stations.csv` is a baked snapshot used only as a fallback when the live fetch fails (offline / CORS / `file://`). Sheet: https://docs.google.com/spreadsheets/d/1xclY-0sWt70mZ_jQxMDWOr8XtwgaZivqhDlD2_hnBs0/edit

Sheet columns: `title, description, url, tags, difficulty, active, screenshot`. `tags` and `difficulty` are comma-separated multi-values. `active` must be `TRUE` to show. Blank `url` → card renders non-clickable. `screenshot` → hover preview (bare filename resolves under `images/`, or a full `http(s)` URL). Rows deduped by `title`, last row wins.

Two view modes (segmented toggle): "Browse by section" (one section per tag, cards repeat across their tags) and "Filter by tag" (single grid + toggleable tag chips, OR filter). No card icons in this version.

## Community submission form

Floating gradient "+" button (bottom-right) opens a popover form so students/interns/teachers can suggest stations. Submissions POST to a **Google Apps Script Web App** (`submit.gs`, deployed off the same Sheet) which appends a row with `active=FALSE` and emails staff. Wire it up by pasting the deployed `/exec` URL into `SUBMIT_URL` in `index.html`. Custom "add your own" tags are free text — they render on the site immediately; to also appear as a Sheet dropdown-chip option, add them to the Sheet's data-validation list. Screenshots must be a URL in the `screenshot` column (uploads go to Drive via `submit.gs`); in-cell pasted images don't survive CSV export and won't show.

## Git & Commits

Repo root is the parent directory — `stem-stations-2/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `stem-stations-2/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add stem-stations-2/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(stem-stations-2): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
