# stem-stations/CLAUDE.md

STEM stations landing page — a child page of the nycfirst-d13.github.io GitHub Pages site, served at `/stem-stations/`.

## Git & Commits

Repo root is the parent directory — `stem-stations/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `stem-stations/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add stem-stations/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "docs(stem-stations): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
