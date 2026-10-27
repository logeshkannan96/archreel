import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { specJsonSchema } from "./json-schema.js";
import { loadCaptions } from "./captions.js";
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

  it("accepts a custom theme and a voiceover with anchored steps", () => {
    const result = validateSpec({
      ...base,
      theme: { base: "light", colors: { packet: "#22d3ee", groupFill: "#3b82f610" } },
      voiceover: { captions: "narration/captions.json", audio: "narration/vo.mp3" },
      steps: [
        { reveal: ["client"], at: "a user" },
        { pause: "1s", at: "then" },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      spec: { theme: { base: "light", colors: { packet: "#22d3ee", groupFill: "#3b82f610" } } },
    });
  });

  it("allows revealing, highlighting and failing a group", () => {
    expect(
      problems({
        steps: [{ reveal: ["vpc"] }, { highlight: { nodes: ["vpc"] } }, { fail: { node: "vpc" } }],
      }),
    ).toEqual([]);
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

  // Regressions from the M1 schema review.
  it.each([
    [
      "duration over the cap hints at ms",
      { steps: [{ reveal: ["pg"], duration: 500 }] },
      ['steps[0].duration: must be at most 60s (bare numbers are seconds — did you mean "500ms"?)'],
    ],
    [
      "infinite duration",
      { steps: [{ pause: "99999999999999999999999999s" }] },
      ["steps[0].pause: must be at most 60s"],
    ],
    [
      "non-duration types get the duration message",
      { steps: [{ reveal: ["pg"], duration: true }] },
      ['steps[0].duration: expected a duration like "1.2s" or "500ms", got true'],
    ],
    [
      "pause with a sibling duration",
      { steps: [{ pause: "1s", duration: "2s" }] },
      ['steps[0].duration: "pause" takes its duration as its value, e.g. "- pause: 2s"'],
    ],
    [
      "action field at step level",
      { steps: [{ fail: { node: "pg" }, label: "down" }] },
      [
        'steps[0].label: unknown key "label" next to "fail:" — move it inside, e.g. "fail: { label: … }"',
      ],
    ],
    [
      "known key in the wrong place",
      { nodes: [{ id: "a", caption: "x" }], edges: [] },
      ['nodes[0].caption: "caption" is not allowed here'],
    ],
    [
      "unknown key that may be from a newer version",
      { nodes: [{ id: "a", shadow: true }], edges: [] },
      [
        'nodes[0].shadow: unknown key "shadow" — check the spelling, or it may need a newer archreel',
      ],
    ],
    [
      "control characters in keys are escaped",
      { nodes: [{ id: "a", "\u001b[31mX": 1 }], edges: [] },
      [
        'nodes[0].\u001b[31mX: unknown key "\\u001b[31mX" — check the spelling, or it may need a newer archreel',
      ],
    ],
    [
      "flow from a node to itself",
      { steps: [{ flow: { from: "api", to: "api" } }] },
      ["steps[0].flow: a flow needs two different nodes"],
    ],
    [
      "id length is bounded",
      { nodes: [{ id: "a".repeat(65) }], edges: [] },
      ["nodes[0].id: must be <= 64"],
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(problems(overrides)).toEqual(expected);
  });

  it.each([
    [
      '"custom" points at the object form',
      { theme: "custom" },
      [
        'theme: expected "dark", "light", or { base, colors }, got "custom" — for a custom theme use { base: dark, colors: { packet: "#22d3ee" } }',
      ],
    ],
    [
      "misspelled theme name",
      { theme: "drak" },
      ['theme: expected "dark", "light", or { base, colors }, got "drak" — did you mean "dark"?'],
    ],
    [
      "non-hex colors are rejected (no url() fetches mid-render)",
      { theme: { colors: { background: "url(http://example.com/x.png)" } } },
      ['theme.colors.background: must be a hex color like "#38bdf8" or "#38bdf880"'],
    ],
    [
      "misspelled color key",
      { theme: { colors: { pakcet: "#fff" } } },
      ['theme.colors.pakcet: unknown key "pakcet" — did you mean "packet"?'],
    ],
    [
      "at without a voiceover",
      { steps: [{ reveal: ["api"], at: "the api" }] },
      ["steps[0].at: needs a voiceover to anchor to — add voiceover: { captions: captions.json }"],
    ],
    [
      "at inside the action",
      {
        voiceover: { captions: "c.json" },
        steps: [{ flow: { from: "client", to: "api", at: "x" } }],
      },
      ['steps[0].flow.at: unknown key "at" in flow — move it up one level, next to "flow:"'],
    ],
    [
      "voiceover files must stay in the spec's folder",
      { voiceover: { captions: "../secret.json", audio: "/etc/passwd" } },
      [
        `voiceover.captions: must not contain ".." (files must be inside the spec's folder)`,
        "voiceover.audio: must be a relative path",
      ],
    ],
    [
      "a broken voiceover doesn't also flag every at",
      { voiceover: { captions: "C:\\c.json" }, steps: [{ reveal: ["api"], at: "x" }] },
      ["voiceover.captions: must be a relative path"],
    ],
  ])("theme and voiceover: %s", (_name, overrides, expected) => {
    expect(problems(overrides)).toEqual(expected);
  });

  it("still checks references when edges, groups or canvas are broken", () => {
    expect(
      problems({
        canvas: { width: 1921 },
        groups: [{ id: "vpc", lable: "VPC" }],
        edges: [{ from: "client", to: "api", lable: "x" }],
        steps: [{ flow: { from: "client", to: "postgres" } }],
      }),
    ).toEqual([
      "canvas.width: must be even (H.264 video requires even dimensions)",
      'groups[0].lable: unknown key "lable" — did you mean "label"?',
      'edges[0].lable: unknown key "lable" — did you mean "label"?',
      'steps[0].flow.to: unknown node "postgres" — did you mean "pg"?',
    ]);
  });

  it("stays fast on many unknown references", () => {
    const n = 500;
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${"x".repeat(60)}${i}` }));
    const edges = nodes.map((node) => ({ from: node.id, to: `u${"y".repeat(60)}` }));
    const started = performance.now();
    const issues = problems({ nodes, edges: edges.slice(0, 2000) });
    expect(issues).toHaveLength(n);
    expect(performance.now() - started).toBeLessThan(2000);
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
      "typo.yaml:7:28 nodes[1].icon: expected a built-in icon, got "sever" — did you mean "server"?
      typo.yaml:16:36 steps[1].flow.duration: unknown key "duration" in flow — move it up one level, next to "flow:"
      typo.yaml:17:24 steps[2].flow.to: unknown node "postgres" — did you mean "pg"?
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

  it("never throws on an alias bomb", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x, x]",
      "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
      "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
    ].join("\n");
    const result = loadSpec(bomb);
    expect(!result.ok && result.issues[0]?.message).toMatch(/^invalid YAML: Excessive alias count/);
  });

  it("rejects oversized input before parsing", () => {
    const result = loadSpec(`# ${"x".repeat(1_000_001)}`);
    expect(!result.ok && result.issues[0]?.message).toBe("spec is larger than 1 MB");
  });

  it("treats numeric labels as text, keeping their source form", () => {
    const result = loadSpec(
      "version: 1\nnodes: [{ id: a, label: 429 }, { id: b, label: 1.0 }]\nsteps:\n  - highlight: { nodes: [a], caption: 404 }\n",
    );
    expect(result.ok && result.spec.nodes.map((n) => n.label)).toEqual(["429", "1.0"]);
    expect(result.ok && result.spec.steps[0]).toEqual({
      highlight: { nodes: ["a"], caption: "404" },
    });
  });

  it("hints at quoting when a flow map value contains a colon", () => {
    const result = loadSpec("version: 1\nnodes: [{ id: a, label: Retry-After: 30 }]\n");
    expect(!result.ok && result.issues.map((i) => i.message).join("\n")).toContain(
      'wrap it in quotes, e.g. label: "Retry-After: 30"',
    );
  });

  it("allows a $schema key for editors", () => {
    expect(loadSpec('$schema: "./archreel.schema.json"\nversion: 1\nnodes: [{ id: a }]\n').ok).toBe(
      true,
    );
  });

  it("accepts JSON", () => {
    expect(loadSpec(JSON.stringify(base)).ok).toBe(true);
  });
});

describe("loadCaptions", () => {
  it("accepts Remotion captions, dropping extra fields", () => {
    const source = '[{"text":" Hi","startMs":0,"endMs":300,"timestampMs":150,"confidence":0.9}]';
    expect(loadCaptions(source)).toEqual({
      ok: true,
      captions: [{ text: " Hi", startMs: 0, endMs: 300 }],
    });
  });

  it.each([
    ["not JSON", "nope", `invalid JSON: Unexpected token 'o', "nope" is not valid JSON`],
    [
      "not an array",
      "{}",
      "Invalid input: expected array, received object (expected an array of { text, startMs, endMs })",
    ],
    [
      "wrong field type",
      '[{"text":"hi","startMs":"0","endMs":5}]',
      "Invalid input: expected number, received string",
    ],
  ])("rejects %s", (_name, source, message) => {
    const result = loadCaptions(source);
    expect(result.ok ? [] : result.issues.map((i) => i.message)).toEqual([message]);
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
