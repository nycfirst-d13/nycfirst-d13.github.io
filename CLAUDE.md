# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Repository Overview

This is the **nycfirst-d13.github.io** GitHub Pages site for the NYC FIRST District 13 STEM center. The repo root is the site root — everything here is served at the GitHub Pages URL. Child directories are standalone apps or pages within the site.

**Git repo root:** `/Users/avigoldman/Desktop/nycfirst-d13.github.io`

## Child Directories

Each child directory is a self-contained app or page. Current children:

| Directory | Purpose |
|-----------|---------|
| `laser-maker/` | Browser-based vector design tool for laser cutting |
| `game-gallery/` | 8-bit arcade gallery for student MakeCode games (Next.js static export) |
| `stem-stations/` | STEM stations landing page |
| `bird-bingo/` | Bird bingo game |
| `hello-waves/` | Hello waves app |

## Git & Commits

The git repo is always the **parent directory**, regardless of which child directory Claude Code is invoked from. There are no nested git repos — child directories are plain subdirectories.

**Always commit from the parent:**

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add <path>
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "..."
```

Do not ask for permission to commit from the parent directory — this is always correct.

**Scope each commit to one child directory + one logical change.** Stage by path — never bare `git add .` that sweeps multiple apps into one commit:

```bash
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io add laser-maker/         # one app only
git -C /Users/avigoldman/Desktop/nycfirst-d13.github.io commit -m "feat(laser-maker): ..."
```

- Conventional prefix scoped to the area: `feat(game-gallery): …`, `docs(stem-stations): …`.
- Run `git status` to verify what's staged before committing.
- Touched two apps? Make two commits, one per app.

**When working in a child directory that has its own `CLAUDE.md`:** that file should document the same `git -C` commit formula so future Claude instances invoked from within that child know where to commit.

**When adding a new child directory:** create a `CLAUDE.md` inside it that includes a Git & Commits section with the parent-dir commit instructions.
