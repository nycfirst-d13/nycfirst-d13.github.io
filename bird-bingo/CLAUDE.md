# bird-bingo/CLAUDE.md

Bird bingo game — a child app of the nycfirst-d13.github.io GitHub Pages site, served at `/bird-bingo/`.

## Git & Commits

Repo root is the parent directory — `bird-bingo/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `bird-bingo/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add bird-bingo/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(bird-bingo): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
