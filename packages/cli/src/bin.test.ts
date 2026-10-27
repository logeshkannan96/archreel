import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("embeds declared icon files and reports unreadable ones at their key", async () => {
    expect((await run("validate", "examples/custom-icons.yaml")).code).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "archreel-icons-"));
    writeFileSync(join(dir, "fake.png"), "not a png");
    writeFileSync(
      join(dir, "s.yaml"),
      "version: 1\nicons: { a: missing.svg, b: fake.png }\nnodes:\n  - { id: n, icon: a }\n",
    );
    const r = await run("validate", join(dir, "s.yaml"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("s.yaml icons.a: cannot read missing.svg (ENOENT)");
    expect(r.stderr).toContain("s.yaml icons.b: fake.png is not a valid PNG file");
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

  it("prints its version", async () => {
    const r = await run("--version");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("prints help", async () => {
    const r = await run("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("validate <file...>");
  });
});

describe("archreel init", () => {
  it("writes a starter spec that validates, and won't overwrite it", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "archreel-init-")), "archreel.yaml");
    expect((await run("init", file)).code).toBe(0);
    expect((await run("validate", file)).stdout).toContain("4 nodes, 3 edges, 7 steps");

    const again = await run("init", file);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("already exists; pass --force to overwrite it");
    expect((await run("init", file, "--force")).code).toBe(0);
  });

  it("converts a Mermaid flowchart with --from, reporting what it skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archreel-init-"));
    writeFileSync(join(dir, "d.mmd"), "graph BT\n  a[Web] --> b[(Orders)]\n");
    const r = await run("init", join(dir, "s.yaml"), "--from", join(dir, "d.mmd"));
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("d.mmd:1 warning: direction BT is drawn top to bottom");
    expect(readFileSync(join(dir, "s.yaml"), "utf8")).toContain(
      "  - { id: b, label: Orders, icon: database }",
    );
    expect((await run("validate", join(dir, "s.yaml"))).code).toBe(0);
  });

  it("exits 1 with a located error for an unsupported diagram", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archreel-init-"));
    writeFileSync(join(dir, "d.mmd"), "sequenceDiagram\n");
    const r = await run("init", join(dir, "s.yaml"), "--from", join(dir, "d.mmd"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("d.mmd:1 expected");
  });
});
