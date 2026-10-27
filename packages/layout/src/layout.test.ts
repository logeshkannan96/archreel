import { readFileSync } from "node:fs";
import { loadSpec, validateSpec, type Spec, type SpecInput } from "@archreel/schema";
import { describe, expect, it } from "vitest";
import { buildScene, type Scene } from "./layout.js";
import { buildTimeline } from "./timeline.js";

const examples = new URL("../../../examples/", import.meta.url);
const EXAMPLES = ["url-shortener", "rate-limiter", "kafka-fanout", "url-shortener-shorts"];

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

  it("card style matches golden coordinates", async () => {
    const s = example("url-shortener");
    const scene = await buildScene({ ...s, theme: { base: "dark", colors: {}, nodes: "card" } });
    expect(scene.nodeStyle).toBe("card");
    expect(boxes(scene)).toMatchSnapshot();
  });

  it("icon style keeps neighbors clear of each node's label", async () => {
    const scene = await buildScene(example("url-shortener"));
    expect(scene.nodeStyle).toBe("icon");
    // redis sits above pg in the same layer; pg's top must clear redis's label.
    const [redis, pg] = ["redis", "pg"].map((id) => scene.nodes.find((n) => n.id === id));
    const labelBottom = (redis?.y ?? 0) + (redis?.height ?? 0) + 34 * scene.scale;
    expect(pg?.y).toBeGreaterThan(labelBottom);
  });

  it("carries image sources only for declared icons that nodes use", async () => {
    const s = spec({
      icons: { metrics: "bars.svg", unused: "x.svg" },
      nodes: [
        { id: "a", icon: "metrics" },
        { id: "b", icon: "server" },
      ],
    });
    const scene = await buildScene(s, { icons: { metrics: "data:x", unused: "data:y" } });
    expect(scene.icons).toEqual({ metrics: "data:x" });
    await expect(buildScene(s)).rejects.toThrow(
      'icons.metrics: no image source — pass buildScene(spec, { icons: { "metrics": url } })',
    );
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

describe("vertical layout", () => {
  /** An example re-canvased; portrait canvases flow down unless `direction` says otherwise. */
  const sized = (name: string, width: number, height: number, direction?: "right" | "down") => {
    const s = example(name);
    return { ...s, canvas: { ...s.canvas, width, height }, ...(direction ? { direction } : {}) };
  };
  const center = (scene: Scene, id: string) => {
    const n = scene.nodes.find((m) => m.id === id);
    return n ? { x: n.x + n.width / 2, y: n.y + n.height / 2 } : { x: NaN, y: NaN };
  };

  it("flows top to bottom on a portrait canvas, keeping spec order across each row", async () => {
    const scene = await buildScene(sized("url-shortener", 1080, 1920));
    const [client, alb, api, redis, pg] = ["client", "alb", "api", "redis", "pg"].map((id) =>
      center(scene, id),
    );
    expect(client?.y).toBeLessThan(alb?.y ?? 0);
    expect(alb?.y).toBeLessThan(api?.y ?? 0);
    expect(api?.y).toBeLessThan(redis?.y ?? 0);
    expect(redis?.y).toBe(pg?.y);
    expect(redis?.x).toBeLessThan(pg?.x ?? 0);
  });

  it("lets direction override the canvas shape", async () => {
    const down = await buildScene(sized("url-shortener", 1920, 1080, "down"));
    const right = await buildScene(sized("url-shortener", 1080, 1920, "right"));
    expect(center(down, "client").y).toBeLessThan(center(down, "alb").y);
    expect(center(right, "client").x).toBeLessThan(center(right, "alb").x);
  });

  it.for(EXAMPLES.flatMap((name) => [`${name} right`, `${name} down`]))(
    "%s: groups contain their members and edges stay orthogonal",
    async (key) => {
      const [name = "", direction] = key.split(" ");
      const scene = await buildScene({
        ...example(name),
        direction: direction as "right" | "down",
      });
      for (const g of scene.groups) {
        for (const n of scene.nodes.filter((m) => m.group === g.id)) {
          expect(n.x).toBeGreaterThanOrEqual(g.x);
          expect(n.y).toBeGreaterThanOrEqual(g.y);
          expect(n.x + n.width).toBeLessThanOrEqual(g.x + g.width + 0.01);
          expect(n.y + n.height).toBeLessThanOrEqual(g.y + g.height + 0.01);
        }
      }
      for (const e of scene.edges) {
        for (const [i, p] of e.points.slice(1).entries()) {
          const q = e.points[i] ?? p;
          expect(p.x === q.x || p.y === q.y, `${e.id} segment ${i}`).toBe(true);
        }
      }
    },
  );

  it("keeps a 9:16 Short inside YouTube's safe area", async () => {
    const scene = await buildScene(example("url-shortener-shorts"));
    expect(scene.captionBottom).toBe(422.4);
    for (const b of [...scene.nodes, ...scene.groups]) {
      expect(b.y).toBeGreaterThanOrEqual(1920 * 0.1);
      expect(b.y + b.height).toBeLessThanOrEqual(1920 * 0.7);
      expect(b.x).toBeGreaterThanOrEqual(1080 * 0.11);
      expect(b.x + b.width).toBeLessThanOrEqual(1080 * 0.89);
    }
  });

  it("is stable flowing down: adding a node keeps the existing nodes' placement order", async () => {
    const base = example("url-shortener-shorts");
    const grown: Spec = {
      ...base,
      nodes: [...base.nodes, { id: "logs", label: "Logs", icon: "queue" }],
      edges: [...base.edges, { from: "api", to: "logs" }],
    };
    const ids = base.nodes.map((n) => n.id);
    const order = (scene: Scene, axis: "x" | "y"): string[] =>
      scene.nodes
        .filter((n) => ids.includes(n.id))
        .sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id))
        .map((n) => n.id);
    const [before, after] = [await buildScene(base), await buildScene(grown)];
    expect(order(after, "x")).toEqual(order(before, "x"));
    expect(order(after, "y")).toEqual(order(before, "y"));
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
