# hello-waves/CLAUDE.md

Hello waves app — a child app of the nycfirst-d13.github.io GitHub Pages site, served at `/hello-waves/`.

## Git & Commits

Repo root is the parent directory — `hello-waves/` is a plain subdir, not a separate repo. Always commit from the parent. Scope each commit to one app + one logical change; stage `hello-waves/` paths only, never bare `git add .`:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add hello-waves/<path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(hello-waves): ..."
```

Conventional prefix scoped to the area. Run `git status` to verify staging before committing. Don't ask permission to commit from the parent.
