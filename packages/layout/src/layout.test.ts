import { readFileSync } from "node:fs";
import { loadSpec, validateSpec, type Spec, type SpecInput } from "@archreel/schema";
import { describe, expect, it } from "vitest";
import { buildScene, type Scene } from "./layout.js";
import { buildTimeline } from "./timeline.js";

const examples = new URL("../../../examples/", import.meta.url);
const EXAMPLES = ["url-shortener", "rate-limiter", "kafka-fanout"];

function example(name: string): Spec {
  const result = loadSpec(readFileSync(new URL(`${name}.yaml`, examples), "utf8"));
  if (!result.ok) throw new Error(`${name} is invalid`);
  return result.spec;
}

function spec(input: Omit<SpecInput, "version">): Spec {
  const result = validateSpec({ version: 1, ...input });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

const boxes = (scene: Scene): Record<string, number[]> =>
  Object.fromEntries(
    [...scene.nodes, ...scene.groups].map((b) => [b.id, [b.x, b.y, b.width, b.height]]),
  );

describe("layout", () => {
  it.each(EXAMPLES)("%s matches golden coordinates", async (name) => {
    expect(boxes(await buildScene(example(name)))).toMatchSnapshot();
  });

  it.each(EXAMPLES)("%s is deterministic", async (name) => {
    expect(await buildScene(example(name))).toEqual(await buildScene(example(name)));
  });

  it.each(EXAMPLES)("%s fits inside the canvas", async (name) => {
    const scene = await buildScene(example(name));
    for (const b of [...scene.nodes, ...scene.groups]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(scene.width);
      expect(b.y + b.height).toBeLessThanOrEqual(scene.height);
    }
  });

  it("is stable: adding a node keeps the existing nodes' relative placement", async () => {
    const base = example("url-shortener");
    const grown: Spec = {
      ...base,
      nodes: [...base.nodes, { id: "logs", label: "Logs", icon: "queue" }],
      edges: [...base.edges, { from: "api", to: "logs" }],
    };
    const before = await buildScene(base);
    const after = await buildScene(grown);
    const ids = base.nodes.map((n) => n.id);
    // Compare orderings, not pixels: the fit-to-canvas step may rescale.
    const order = (scene: Scene, axis: "x" | "y"): string[] =>
      scene.nodes
        .filter((n) => ids.includes(n.id))
        .sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id))
        .map((n) => n.id);
    expect(order(after, "x")).toEqual(order(before, "x"));
    expect(order(after, "y")).toEqual(order(before, "y"));
  });

  it("applies a manual position as the node's center and draws its edges straight", async () => {
    const scene = await buildScene(
      spec({
        nodes: [{ id: "a" }, { id: "b", position: { x: 1500, y: 300 } }],
        edges: [{ from: "a", to: "b" }],
      }),
    );
    const b = scene.nodes.find((n) => n.id === "b");
    expect(b && [b.x + b.width / 2, b.y + b.height / 2]).toEqual([1500, 300]);
    expect(scene.edges[0]?.points).toHaveLength(2);
  });

  it("wraps a group around a hand-placed member", async () => {
    const scene = await buildScene(
      spec({
        nodes: [
          { id: "a", group: "g" },
          { id: "b", group: "g", position: { x: 1700, y: 900 } },
        ],
        groups: [{ id: "g" }],
      }),
    );
    const [g] = scene.groups;
    const b = scene.nodes.find((n) => n.id === "b");
    expect(g && b && g.x + g.width).toBeGreaterThan(b?.x ?? 0);
    expect(g && b && g.y + g.height).toBeGreaterThan((b?.y ?? 0) + (b?.height ?? 0));
  });
});

describe("timeline", () => {
  const base = {
    nodes: [{ id: "a" }, { id: "b", group: "g" }, { id: "c" }],
    groups: [{ id: "g" }],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
  };

  it("shows everything from frame 0 when there is no reveal step", () => {
    const t = buildTimeline(spec({ ...base, steps: [{ flow: { from: "a", to: "b" } }] }), 30);
    expect(t.appear).toEqual({ a: 0, b: 0, c: 0, g: 0, "a->b": 0, "b->c": 0 });
  });

  it("reveals implicitly on first reference and delays the action", () => {
    const t = buildTimeline(
      spec({ ...base, steps: [{ reveal: ["a"] }, { flow: { from: "a", to: "b" } }] }),
      30,
    );
    // lead-in 15f, reveal 24f, then the flow starts at 39 and reveals b + its group.
    expect(t.appear).toMatchObject({ a: 15, b: 39, g: 39, "a->b": 39, c: 0 });
    expect(t.steps[1]).toMatchObject({ kind: "flow", start: 39, actionStart: 57, frames: 54 });
  });

  it("revealing a group reveals its members", () => {
    const t = buildTimeline(spec({ ...base, steps: [{ reveal: ["g"] }] }), 30);
    expect(t.appear).toMatchObject({ g: 15, b: 15 });
  });

  it("resolves a reversed flow to the existing edge", () => {
    const t = buildTimeline(spec({ ...base, steps: [{ flow: { from: "c", to: "b" } }] }), 30);
    expect(t.steps[0]).toMatchObject({ kind: "flow", edge: "b->c", reversed: true });
  });

  it("uses explicit durations and sums the total", () => {
    const t = buildTimeline(
      spec({
        ...base,
        steps: [{ flow: { from: "a", to: "b" }, duration: "2s" }, { pause: "500ms" }],
      }),
      30,
    );
    expect(t.steps.map((s) => [s.start, s.frames])).toEqual([
      [15, 60],
      [75, 15],
    ]);
    expect(t.durationInFrames).toBe(15 + 60 + 15 + 45);
  });
});
