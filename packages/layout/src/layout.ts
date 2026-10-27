import type { Spec } from "@archreel/schema";
import elkModule, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import { buildTimeline, edgeId, type TimedStep } from "./timeline.js";

export interface Point {
  x: number;
  y: number;
}
/** Top-left corner and size, in canvas pixels. */
export interface Box extends Point {
  width: number;
  height: number;
}
export interface SceneNode extends Box {
  id: string;
  label: string;
  icon?: string;
  group?: string;
}
export interface SceneGroup extends Box {
  id: string;
  label?: string;
}
export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  /** Polyline from `from` to `to`. */
  points: Point[];
  label?: { text: string; x: number; y: number };
}
/** Everything a renderer needs: plain JSON, a pure function of the spec. */
export interface Scene {
  width: number;
  height: number;
  fps: number;
  theme: "dark" | "light";
  /** Layout units → canvas pixels; renderers scale text and icons by it. */
  scale: number;
  durationInFrames: number;
  nodes: SceneNode[];
  groups: SceneGroup[];
  edges: SceneEdge[];
  steps: TimedStep[];
  appear: Record<string, number>;
}

// Layout units (pre-fit). Text sizes assume the renderer's 20px label font.
export const NODE_HEIGHT = 120;
const NODE_MIN_WIDTH = 150;
const NODE_MAX_WIDTH = 260;
const CHAR_WIDTH = 11;
const NODE_PADDING_X = 40;
const LABEL_HEIGHT = 24;
const GROUP_PADDING = { top: 52, side: 28, bottom: 28 };

// Canvas margins; the bottom band is reserved for captions.
const MARGIN = { top: 80, side: 100, bottom: 190 };
const MAX_SCALE = 1.25;

// ELK options don't inherit into compound nodes, so groups get these too.
const SHARED: Record<string, string> = {
  "elk.spacing.nodeNode": "60",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.spacing.edgeNode": "30",
  // Stability: each layer is ordered by the y-hints we pass (= spec order), so adding
  // a node doesn't reshuffle the rest. Root and groups must share this processor.
  "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
  // Centers fan-in/fan-out sources; changes less globally than NETWORK_SIMPLEX.
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
};

const ELK_OPTIONS: Record<string, string> = {
  ...SHARED,
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.randomSeed": "1", // same input → same output
  "elk.edgeLabels.placement": "CENTER",
  "elk.json.shapeCoords": "ROOT",
  "elk.json.edgeCoords": "ROOT",
};

// elkjs is CommonJS with an ESM-style .d.ts: at runtime the default import *is* the constructor.
const ELK = elkModule as unknown as typeof elkModule.default;

const textWidth = (text: string): number => text.length * CHAR_WIDTH;

export function nodeWidth(label: string): number {
  return Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, textWidth(label) + NODE_PADDING_X));
}

export async function buildScene(spec: Spec): Promise<Scene> {
  const { width, height, fps } = spec.canvas;
  const elk = new ELK();

  const specIndex = new Map(spec.nodes.map((n, i) => [n.id, i]));
  const toElkNode = (n: Spec["nodes"][number]): ElkNode => ({
    id: n.id,
    // INTERACTIVE crossing minimization orders each layer by these hints = spec order.
    x: 0,
    y: (specIndex.get(n.id) ?? 0) * NODE_HEIGHT,
    width: nodeWidth(n.label ?? n.id),
    height: NODE_HEIGHT,
  });
  // Children follow spec order (a group sits where its first member is) so
  // ELK's model-order constraints track what the author wrote.
  const children: ElkNode[] = [];
  const placedGroups = new Set<string>();
  for (const n of spec.nodes) {
    if (n.group === undefined) {
      children.push(toElkNode(n));
    } else if (!placedGroups.has(n.group)) {
      placedGroups.add(n.group);
      children.push({
        id: n.group,
        layoutOptions: {
          ...SHARED,
          "elk.padding": `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.side},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.side}]`,
        },
        children: spec.nodes.filter((m) => m.group === n.group).map(toElkNode),
      });
    }
  }
  // Empty groups still get a (small) box.
  for (const g of spec.groups) {
    if (!placedGroups.has(g.id))
      children.push({ id: g.id, width: NODE_MIN_WIDTH, height: NODE_HEIGHT });
  }
  const edges: ElkExtendedEdge[] = spec.edges.map((e) => ({
    id: edgeId(e.from, e.to),
    sources: [e.from],
    targets: [e.to],
    ...(e.label === undefined
      ? {}
      : { labels: [{ text: e.label, width: textWidth(e.label) * 0.8, height: LABEL_HEIGHT }] }),
  }));

  const root = await elk.layout({ id: "root", layoutOptions: ELK_OPTIONS, children, edges });

  // Collect absolute layout-unit geometry.
  const boxes = new Map<string, Box>();
  const visit = (n: ElkNode): void => {
    boxes.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 });
    n.children?.forEach(visit);
  };
  root.children?.forEach(visit);

  const routed = new Map<string, { points: Point[]; label?: Point }>();
  for (const e of root.edges) {
    const s = e.sections?.[0];
    if (!s) continue;
    const label = e.labels?.[0];
    routed.set(e.id, {
      points: [s.startPoint, ...(s.bendPoints ?? []), s.endPoint],
      ...(label
        ? {
            label: {
              x: (label.x ?? 0) + (label.width ?? 0) / 2,
              y: (label.y ?? 0) + (label.height ?? 0) / 2,
            },
          }
        : {}),
    });
  }

  // Fit the diagram into the canvas, centered in the area above the caption band.
  const all: Box[] = [
    ...boxes.values(),
    ...[...routed.values()].flatMap((r) => r.points.map((p) => ({ ...p, width: 0, height: 0 }))),
  ];
  const minX = Math.min(...all.map((b) => b.x));
  const minY = Math.min(...all.map((b) => b.y));
  const maxX = Math.max(...all.map((b) => b.x + b.width));
  const maxY = Math.max(...all.map((b) => b.y + b.height));
  const availW = width - 2 * MARGIN.side;
  const availH = height - MARGIN.top - MARGIN.bottom;
  const scale = Math.min(availW / (maxX - minX), availH / (maxY - minY), MAX_SCALE);
  const offsetX = MARGIN.side + (availW - (maxX - minX) * scale) / 2;
  const offsetY = MARGIN.top + (availH - (maxY - minY) * scale) / 2;
  const pt = (p: Point): Point => ({
    x: round(offsetX + (p.x - minX) * scale),
    y: round(offsetY + (p.y - minY) * scale),
  });
  const box = (b: Box): Box => ({
    ...pt(b),
    width: round(b.width * scale),
    height: round(b.height * scale),
  });

  const nodes: SceneNode[] = spec.nodes.map((n) => {
    const b = box(boxes.get(n.id) ?? { x: 0, y: 0, width: 0, height: 0 });
    if (n.position) {
      // Manual override: `position` is the node's center in canvas pixels.
      b.x = round(n.position.x - b.width / 2);
      b.y = round(n.position.y - b.height / 2);
    }
    return {
      id: n.id,
      label: n.label ?? n.id,
      ...b,
      ...(n.icon === undefined ? {} : { icon: n.icon }),
      ...(n.group === undefined ? {} : { group: n.group }),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const moved = new Set(spec.nodes.filter((n) => n.position).map((n) => n.id));

  const groups: SceneGroup[] = spec.groups.map((g) => {
    const label = g.label === undefined ? {} : { label: g.label };
    const inner = nodes.filter((n) => n.group === g.id);
    if (!inner.some((n) => moved.has(n.id))) {
      return { id: g.id, ...label, ...box(boxes.get(g.id) ?? { x: 0, y: 0, width: 0, height: 0 }) };
    }
    // A member was moved by hand: wrap the members' final boxes instead.
    const x = Math.min(...inner.map((n) => n.x)) - GROUP_PADDING.side * scale;
    const y = Math.min(...inner.map((n) => n.y)) - GROUP_PADDING.top * scale;
    const right = Math.max(...inner.map((n) => n.x + n.width)) + GROUP_PADDING.side * scale;
    const bottom = Math.max(...inner.map((n) => n.y + n.height)) + GROUP_PADDING.bottom * scale;
    return {
      id: g.id,
      ...label,
      x: round(x),
      y: round(y),
      width: round(right - x),
      height: round(bottom - y),
    };
  });

  const sceneEdges: SceneEdge[] = spec.edges.map((e) => {
    const id = edgeId(e.from, e.to);
    const r = routed.get(id);
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    let points: Point[];
    let labelAt: Point | undefined;
    if (r && !moved.has(e.from) && !moved.has(e.to)) {
      points = r.points.map(pt);
      labelAt = r.label && pt(r.label);
    } else if (from && to) {
      // Straight line between the borders of hand-placed nodes.
      points = [clipToBorder(from, center(to)), clipToBorder(to, center(from))];
      labelAt = midpoint(points[0] ?? center(from), points[1] ?? center(to));
    } else {
      points = [];
    }
    return {
      id,
      from: e.from,
      to: e.to,
      points,
      ...(e.label !== undefined && labelAt ? { label: { text: e.label, ...labelAt } } : {}),
    };
  });

  const timeline = buildTimeline(spec, fps);
  return {
    width,
    height,
    fps,
    theme: spec.theme,
    scale: round(scale),
    durationInFrames: timeline.durationInFrames,
    nodes,
    groups,
    edges: sceneEdges,
    steps: timeline.steps,
    appear: timeline.appear,
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;
const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const midpoint = (a: Point, b: Point): Point => ({
  x: round((a.x + b.x) / 2),
  y: round((a.y + b.y) / 2),
});

/** Where the ray from the center of `b` toward `target` leaves the box. */
function clipToBorder(b: Box, target: Point): Point {
  const c = center(b);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const t = Math.min(
    dx === 0 ? Infinity : b.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : b.height / 2 / Math.abs(dy),
  );
  return { x: round(c.x + dx * t), y: round(c.y + dy * t) };
}
