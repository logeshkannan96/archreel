# Contributing

## Setup

```sh
corepack enable          # uses the pnpm version pinned in package.json
pnpm install
pnpm build
```

Node.js 22.12+. Rendering downloads Remotion's headless Chrome on first use.

## Before you open a PR

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm validate:examples
pnpm test:visual         # renders key frames; needed for anything visual
pnpm changeset           # for any user-facing change; pick a bump and describe it for users
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`,
`docs:` …), small and one concern each.

## Rules that keep archreel predictable

- **The spec is a contract.** Within `version: 1`, changes are additive only: new optional fields,
  never renamed or removed ones. Edit `packages/schema/src/spec.ts`, then run `pnpm schema:json`
  and commit `archreel.schema.json` (CI fails on drift).
- **Errors are part of the UX.** Every new validation error gets a test asserting its exact
  message, which says where, what was expected, and how to fix it.
- **Rendering is deterministic.** No `Math.random`, `Date` or `performance.now` in
  `packages/remotion` (lint enforces it); timing derives from the frame number.
- **Dependencies.** Prefer none. Pin exact versions, and justify each new dependency in one line
  in the commit message.

## Visual regression tests

`pnpm test:visual` renders key frames and compares them with the PNGs in
`packages/cli/visual/<platform>/`. Fonts rasterize differently per OS, so each platform has its
own goldens.

- An intended visual change: delete the affected PNGs, run `pnpm test:visual` to write new ones,
  look at them, and commit.
- Linux goldens come from CI: when they're missing, the `render` job writes them and uploads the
  `visual-goldens-linux` artifact. Download it into `packages/cli/visual/linux/` and commit.
- Then re-render the example GIFs:
  `node packages/cli/dist/bin.js render examples/<name>.yaml -o examples/<name>.gif`.

## Agent skills (optional)

If you work with Claude Code or Codex, `skills-lock.json` lists the Remotion and Vitest skills
this repo uses. Restore them with `npx skills experimental_install`. `CLAUDE.md` has the
project's notes for agents.

## Releasing (maintainers)

Merging to `main` runs `.github/workflows/release.yml`: pending changesets open a
"Version packages" PR, and merging that PR publishes to npm with provenance.
