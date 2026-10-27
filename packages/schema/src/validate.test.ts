import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { specJsonSchema } from "./json-schema.js";
import { formatIssues, loadSpec } from "./load.js";
import { formatPath, validateSpec } from "./validate.js";

const examples = new URL("../../../examples/", import.meta.url);

const base = {
  version: 1,
  nodes: [
    { id: "client", label: "Client", icon: "user" },
    { id: "api", label: "API", icon: "server", group: "vpc" },
    { id: "pg", label: "Postgres", icon: "postgres", group: "vpc" },
  ],
  groups: [{ id: "vpc", label: "VPC" }],
  edges: [
    { from: "client", to: "api" },
    { from: "api", to: "pg" },
  ],
};

/** Validate `base` + overrides and return formatted `path: message` strings. */
function problems(overrides: Record<string, unknown>): string[] {
  const result = validateSpec({ ...base, ...overrides });
  return result.ok ? [] : result.issues.map((i) => `${formatPath(i.path)}: ${i.message}`);
}

describe("valid specs", () => {
  const files = readdirSync(examples).filter((f) => f.endsWith(".yaml"));

  it.each(files)("examples/%s validates", (file) => {
    const result = loadSpec(readFileSync(new URL(file, examples), "utf8"));
    expect(result.ok ? [] : formatIssues(file, result.issues)).toEqual([]);
  });

  it("applies defaults", () => {
    const result = validateSpec({ version: 1, nodes: [{ id: "a" }] });
    expect(result).toMatchObject({
      ok: true,
      spec: { theme: "dark", canvas: { width: 1920, height: 1080, fps: 30 }, edges: [], steps: [] },
    });
  });

  it("parses durations to milliseconds", () => {
    const result = validateSpec({
      ...base,
      steps: [
        { reveal: ["client"], duration: "1.5s" },
        { reveal: ["api"], duration: "250ms" },
        { reveal: ["pg"], duration: 2 },
        { pause: "1s" },
      ],
    });
    expect(result.ok && result.spec.steps).toEqual([
      { reveal: ["client"], duration: 1500 },
      { reveal: ["api"], duration: 250 },
      { reveal: ["pg"], duration: 2000 },
      { pause: 1000 },
    ]);
  });

  it("allows a flow to travel an edge in reverse (responses)", () => {
    expect(problems({ steps: [{ flow: { from: "pg", to: "api" } }] })).toEqual([]);
  });

  it("allows revealing a group", () => {
    expect(problems({ steps: [{ reveal: ["vpc"] }] })).toEqual([]);
  });
});

describe("invalid specs", () => {
  it.each([
    [
      "unknown flow target, suggested by label",
      { steps: [{ flow: { from: "api", to: "postgres" } }] },
      ['steps[0].flow.to: unknown node "postgres" — did you mean "pg"?'],
    ],
    [
      "unknown flow source, suggested by edit distance",
      { steps: [{ flow: { from: "clinet", to: "api" } }] },
      ['steps[0].flow.from: unknown node "clinet" — did you mean "client"?'],
    ],
    [
      "no far-fetched suggestion for short ids",
      { nodes: [{ id: "a" }], edges: [{ from: "a", to: "api" }] },
      ['edges[0].to: unknown node "api"'],
    ],
    [
      "flow without an edge",
      { steps: [{ flow: { from: "client", to: "pg" } }] },
      ['steps[0].flow: no edge between "client" and "pg" — add { from: client, to: pg } to edges'],
    ],
    [
      "misspelled step kind",
      { steps: [{ higlight: { nodes: ["pg"] } }] },
      [
        'steps[0]: unknown step; expected one of reveal, flow, highlight, fail, pause — did you mean "highlight"?',
      ],
    ],
    [
      "two actions in one step",
      { steps: [{ reveal: ["pg"], pause: 1 }] },
      ["steps[0]: a step must have exactly one action, found reveal and pause"],
    ],
    [
      "duration nested inside the action",
      { steps: [{ flow: { from: "client", to: "api", duration: "1s" } }] },
      [
        'steps[0].flow.duration: unknown key "duration" in flow — move it up one level, next to "flow:"',
      ],
    ],
    [
      "bad duration",
      { steps: [{ pause: "1 sec" }] },
      ['steps[0].pause: must be a duration like "1.2s" or "500ms"'],
    ],
    ["zero duration", { steps: [{ pause: "0s" }] }, ["steps[0].pause: must be greater than 0"]],
    [
      "unknown fail effect",
      { steps: [{ fail: { node: "pg", effect: "shak" } }] },
      [
        'steps[0].fail.effect: expected one of "shake", "flash", got "shak" — did you mean "shake"?',
      ],
    ],
    [
      "empty highlight",
      { steps: [{ highlight: { nodes: [] } }] },
      ["steps[0].highlight.nodes: must not be empty"],
    ],
    [
      "unknown reveal target",
      { steps: [{ reveal: ["vcp"] }] },
      ['steps[0].reveal[0]: unknown node or group "vcp" — did you mean "vpc"?'],
    ],
    [
      "misspelled key",
      { nodes: [{ id: "a", lable: "A" }], edges: [] },
      ['nodes[0].lable: unknown key "lable" — did you mean "label"?'],
    ],
    [
      "unknown icon",
      { nodes: [{ id: "a", icon: "postgress" }], edges: [] },
      ['nodes[0].icon: expected a built-in icon, got "postgress" — did you mean "postgres"?'],
    ],
    [
      "unknown group",
      { nodes: [{ id: "a", group: "vpcc" }], groups: [{ id: "vpc" }], edges: [] },
      ['nodes[0].group: unknown group "vpcc" — did you mean "vpc"?'],
    ],
    [
      "duplicate ids across nodes and groups",
      { nodes: [{ id: "vpc" }], groups: [{ id: "vpc" }], edges: [] },
      ['nodes[0].id: duplicate id "vpc" (already used at groups[0].id)'],
    ],
    [
      "duplicate edge",
      { edges: [...base.edges, { from: "api", to: "pg" }] },
      ['edges[2]: duplicate edge from "api" to "pg"'],
    ],
    [
      "self edge",
      { edges: [{ from: "api", to: "api" }] },
      ['edges[0]: edge connects "api" to itself'],
    ],
    [
      "odd canvas dimension",
      { canvas: { width: 1921 } },
      ["canvas.width: must be even (H.264 video requires even dimensions)"],
    ],
    ["fps too high", { canvas: { fps: 120 } }, ["canvas.fps: must be <= 60"]],
    ["wrong version", { version: 2 }, ["version: expected 1, got 2"]],
    ["missing nodes", { nodes: undefined }, ["nodes: required (expected array)"]],
    [
      "bad id",
      { nodes: [{ id: "1st" }], edges: [] },
      ["nodes[0].id: must start with a letter and contain only letters, digits, - or _"],
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(problems(overrides)).toEqual(expected);
  });

  it("reports structural and reference problems in one run", () => {
    expect(
      problems({
        nodes: [{ id: "api", icon: "sever" }, { id: "pg" }],
        edges: [{ from: "api", to: "pg" }],
        steps: [{ higlight: { nodes: ["pg"] } }, { flow: { from: "api", to: "postgres" } }],
      }),
    ).toEqual([
      'nodes[0].icon: expected a built-in icon, got "sever" — did you mean "server"?',
      'steps[0]: unknown step; expected one of reveal, flow, highlight, fail, pause — did you mean "highlight"?',
      'steps[1].flow.to: unknown node "postgres"',
    ]);
  });
});

describe("loadSpec", () => {
  it("locates issues at file:line:col, sorted by position", () => {
    const source = readFileSync(new URL("invalid/typo.yaml", examples), "utf8");
    const result = loadSpec(source);
    expect(result.ok ? "" : formatIssues("typo.yaml", result.issues)).toMatchInlineSnapshot(`
      "typo.yaml:7:34 nodes[1].icon: expected a built-in icon, got "sever" — did you mean "server"?
      typo.yaml:16:46 steps[1].flow.duration: unknown key "duration" in flow — move it up one level, next to "flow:"
      typo.yaml:17:28 steps[2].flow.to: unknown node "postgres" — did you mean "pg"?
      typo.yaml:18:5 steps[3]: unknown step; expected one of reveal, flow, highlight, fail, pause — did you mean "highlight"?"
    `);
  });

  it("points a missing key at its parent", () => {
    const result = loadSpec("version: 1\nnodes:\n  - label: A\n");
    expect(result.ok ? [] : result.issues).toEqual([
      { path: ["nodes", 0, "id"], message: "required (expected string)", line: 3, col: 5 },
    ]);
  });

  it("reports YAML syntax errors with a location", () => {
    const result = loadSpec("version: 1\nnodes: [\n");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]).toMatchObject({ line: expect.any(Number) as number });
    expect(!result.ok && result.issues[0]?.message).toMatch(/^invalid YAML/);
  });

  it("rejects duplicate YAML keys", () => {
    const result = loadSpec("version: 1\nversion: 1\nnodes: [{ id: a }]\n");
    expect(!result.ok && result.issues[0]?.message).toMatch(/^invalid YAML/);
  });

  it("accepts JSON", () => {
    expect(loadSpec(JSON.stringify(base)).ok).toBe(true);
  });
});

describe("JSON Schema", () => {
  it("matches the committed archreel.schema.json (run `pnpm schema:json` to update)", () => {
    const committed: unknown = JSON.parse(
      readFileSync(new URL("../archreel.schema.json", import.meta.url), "utf8"),
    );
    expect(specJsonSchema()).toEqual(committed);
  });
});
