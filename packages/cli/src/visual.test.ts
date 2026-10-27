import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScene, type Scene } from "@archreel/layout";
import { loadSpec } from "@archreel/schema";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { renderFrames } from "./render.js";

// Run with `pnpm test:visual`. Goldens are per platform because font
// rasterization differs between macOS and Linux. A missing golden is written
// and the test skipped; commit it (CI uploads Linux goldens as an artifact).

const root = fileURLToPath(new URL("../../../", import.meta.url));
const goldens = join(root, "packages/cli/visual", process.platform);
const SCALE = 0.5;
/** pixelmatch per-pixel color threshold, and the share of pixels allowed to differ. */
const PIXEL_THRESHOLD = 0.1;
const MAX_DIFF_RATIO = 0.002;
const TIMEOUT_MS = 180_000;

async function scene(name: string): Promise<Scene> {
  const result = loadSpec(readFileSync(join(root, "examples", `${name}.yaml`), "utf8"));
  if (!result.ok) throw new Error(`${name} is invalid`);
  return buildScene(result.spec);
}

/** One frame in the middle of each interesting step's action. */
function keyFrames(s: Scene): number[] {
  const pick = (kind: string): number[] =>
    s.steps
      .filter((step) => step.kind === kind)
      .slice(0, 1)
      .map((step) => Math.round((step.actionStart + step.start + step.frames) / 2));
  return [...pick("flow"), ...pick("fail"), ...pick("highlight")];
}

const read = (file: string): PNG => PNG.sync.read(readFileSync(file));

describe.skipIf(!process.env.ARCHREEL_VISUAL)("visual regression", () => {
  const tmp = mkdtempSync(join(tmpdir(), "archreel-visual-"));

  it.for(["url-shortener", "rate-limiter", "kafka-fanout"])(
    "%s key frames match goldens",
    { timeout: TIMEOUT_MS },
    async (name, ctx) => {
      const s = await scene(name);
      const frames = keyFrames(s);
      await renderFrames(s, frames, (f) => join(tmp, `${name}-${f}.png`), SCALE);

      const missing: string[] = [];
      for (const f of frames) {
        const golden = join(goldens, `${name}-${f}.png`);
        const actual = read(join(tmp, `${name}-${f}.png`));
        if (!existsSync(golden)) {
          mkdirSync(goldens, { recursive: true });
          writeFileSync(golden, PNG.sync.write(actual));
          missing.push(golden);
          continue;
        }
        const expected = read(golden);
        expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
        const diff = pixelmatch(actual.data, expected.data, null, actual.width, actual.height, {
          threshold: PIXEL_THRESHOLD,
        });
        const ratio = diff / (actual.width * actual.height);
        expect(ratio, `${name} frame ${f}: ${diff} pixels differ`).toBeLessThanOrEqual(
          MAX_DIFF_RATIO,
        );
      }
      if (missing.length > 0) ctx.skip(`wrote new goldens: ${missing.join(", ")}`);
    },
  );

  it("renders the same frame byte-identically twice", { timeout: TIMEOUT_MS }, async () => {
    const s = await scene("url-shortener");
    const [frame = 0] = keyFrames(s);
    await renderFrames(s, [frame], () => join(tmp, "a.png"), SCALE);
    await renderFrames(s, [frame], () => join(tmp, "b.png"), SCALE);
    expect(readFileSync(join(tmp, "a.png")).equals(readFileSync(join(tmp, "b.png")))).toBe(true);
  });
});
