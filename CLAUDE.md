# archreel — agent notes

- Gate before claiming done: `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:examples`.
- Schema changes: edit `packages/schema/src/spec.ts`, then `pnpm schema:json` and commit `archreel.schema.json`.
- The public spec schema is a contract: additive changes only within `version: 1`.
- Every new validation error needs a test in `validate.test.ts` asserting the exact message.
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support 7 yet.
- Remotion work (M2+): use the `remotion-best-practices` skill in `.claude/skills/`. Rendering must be
  deterministic — no `Math.random`/`Date` in components.
- Rendering: `pnpm test:visual` compares key frames to `packages/cli/visual/<platform>/` goldens.
  A missing golden is written and skipped; Linux goldens come from the CI `visual-goldens-linux` artifact.
- Layout (elkjs 0.12): `considerModelOrder` on group nodes crashes ELK; stability comes from
  INTERACTIVE crossing minimization fed spec-order y-hints. Root and groups must share that strategy.
- Re-render example GIFs after visual changes: `node packages/cli/dist/bin.js render examples/<n>.yaml -o examples/<n>.gif`.
- Mermaid import is a hand-written parser for the flowchart subset (`packages/mermaid`); unsupported
  syntax must fail with its line, styling lines warn. Keep it dependency-free.
- `@archreel/remotion` is embedded by host Remotion projects (`examples/embed`): keep remotion/react
  as peer deps, never import font assets from Node-side code (use `@archreel/remotion/id`), and
  run `pnpm clean && pnpm build` before packing — `tsc -b` leaves renamed files in dist.
- Vertical (`direction: down`, default on portrait canvases) is the left-to-right ELK layout
  transposed (sizes in, coordinates out). Don't switch ELK to DOWN: with INTERACTIVE crossing
  minimization it misplaces group members and drops edge corners. A 9:16 canvas gets Shorts safe margins.
