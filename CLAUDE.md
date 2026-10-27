# archreel — agent notes

- Gate before claiming done: `pnpm typecheck && pnpm lint && pnpm test && pnpm validate:examples`.
- Schema changes: edit `packages/schema/src/spec.ts`, then `pnpm schema:json` and commit `archreel.schema.json`.
- The public spec schema is a contract: additive changes only within `version: 1`.
- Every new validation error needs a test in `validate.test.ts` asserting the exact message.
- TypeScript is pinned to 6.0.x because typescript-eslint doesn't support 7 yet.
- Remotion work (M2+): use the `remotion-best-practices` skill in `.claude/skills/`. Rendering must be
  deterministic — no `Math.random`/`Date` in components.
