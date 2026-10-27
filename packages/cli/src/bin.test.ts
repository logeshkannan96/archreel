import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

// Runs the built CLI (`pnpm test` builds first).
const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [bin, ...args], { cwd: root });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

describe("archreel validate", () => {
  it("exits 0 for valid specs", async () => {
    const r = await run("validate", "examples/url-shortener.yaml", "examples/kafka-fanout.yaml");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("✓ examples/url-shortener.yaml — 5 nodes, 4 edges, 10 steps");
  });

  it("exits 1 with located problems for an invalid spec", async () => {
    const r = await run("validate", "examples/invalid/typo.yaml");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      'examples/invalid/typo.yaml:17:24 steps[2].flow.to: unknown node "postgres" — did you mean "pg"?',
    );
    expect(r.stderr).toContain("✗ examples/invalid/typo.yaml — 4 problems");
  });

  it("checks voiceover anchors against the captions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archreel-vo-"));
    const narrated = join(root, "examples/narrated");
    copyFileSync(join(narrated, "captions.json"), join(dir, "captions.json"));
    const spec = readFileSync(join(narrated, "url-shortener.yaml"), "utf8");
    writeFileSync(join(dir, "s.yaml"), spec.replace("at: checks redis", "at: checks redsi"));

    const r = await run("validate", join(dir, "s.yaml"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      `s.yaml:41:5 steps[3].at: "checks redsi" isn't in the voiceover captions — did you mean "redis"?`,
    );
  });

  it("exits 1 for a missing file", async () => {
    const r = await run("validate", "nope.yaml");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("nope.yaml: cannot read file (ENOENT)");
  });

  it("exits 2 on usage errors", async () => {
    expect((await run()).code).toBe(2);
    expect((await run("validate")).code).toBe(2);
    expect((await run("frobnicate")).stderr).toContain('unknown command "frobnicate"');
  });

  it("prints help", async () => {
    const r = await run("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("validate <file...>");
  });
});
