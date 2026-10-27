import type { Issue, Spec } from "@archreel/schema";
import { SceneError, seconds, type Voiceover } from "./anchors.js";

/** Default step lengths, used when a step has no explicit `duration`. */
export const DEFAULT_MS = { reveal: 800, flow: 1200, highlight: 2000, fail: 1500 } as const;
/** Extra time a step gets when it implicitly reveals what it references. */
export const IMPLICIT_REVEAL_MS = 600;
export const LEAD_IN_MS = 500;
export const TAIL_MS = 1500;

interface Timing {
  /** First frame of the step. */
  start: number;
  /** First frame of the step's action, after any implicit reveal. */
  actionStart: number;
  /** Total frames, including any implicit reveal. */
  frames: number;
}

export type TimedStep = Timing &
  (
    | { kind: "reveal"; targets: string[] }
    | { kind: "flow"; edge: string; reversed: boolean; label?: string }
    | { kind: "highlight"; targets: string[]; caption?: string }
    | { kind: "fail"; target: string; effect: "shake" | "flash"; label?: string }
    | { kind: "pause" }
  );

export interface Timeline {
  steps: TimedStep[];
  /** Frame at which each node, group and edge id becomes visible. */
  appear: Record<string, number>;
  durationInFrames: number;
}

export const edgeId = (from: string, to: string): string => `${from}->${to}`;

/**
 * Visibility rules: with no `reveal` step everything is visible from frame 0.
 * Otherwise a node appears at the first step that references it (revealing a
 * group reveals its members), a group appears with its first member, and an
 * edge appears once both endpoints are visible.
 *
 * An anchored step (`at`) starts when its phrase is spoken: the step before it
 * stretches or shrinks to end there. Throws SceneError if that step would vanish.
 */
export function buildTimeline(spec: Spec, fps: number, voiceover?: Voiceover): Timeline {
  const toFrames = (ms: number): number => Math.max(1, Math.round((ms * fps) / 1000));
  const members = new Map<string, string[]>();
  for (const n of spec.nodes) {
    if (n.group !== undefined) members.set(n.group, [...(members.get(n.group) ?? []), n.id]);
  }
  const groupIds = new Set(spec.groups.map((g) => g.id));
  const expand = (id: string): string[] =>
    groupIds.has(id) ? [id, ...(members.get(id) ?? [])] : [id];

  const staged = spec.steps.some((s) => "reveal" in s);
  const appear: Record<string, number> = {};
  const show = (ids: readonly string[], frame: number): boolean => {
    let any = false;
    for (const id of ids.flatMap(expand)) {
      if (appear[id] === undefined) {
        appear[id] = frame;
        any = true;
      }
    }
    return any;
  };
  if (!staged) show([...spec.nodes.map((n) => n.id), ...groupIds], 0);

  const edges = new Set(spec.edges.map((e) => edgeId(e.from, e.to)));
  const steps: TimedStep[] = [];
  const issues: Issue[] = [];
  let cursor = toFrames(LEAD_IN_MS);

  for (const [index, step] of spec.steps.entries()) {
    const anchorMs = voiceover?.anchors[index];
    if (anchorMs !== undefined) {
      const anchor = Math.round((anchorMs * fps) / 1000);
      const prev = steps.at(-1);
      if (prev === undefined) cursor = anchor;
      else if (anchor > prev.actionStart) {
        prev.frames = anchor - prev.start;
        cursor = anchor;
      } else {
        issues.push({
          path: ["steps", index, "at"],
          message: `"${step.at ?? ""}" is spoken at ${seconds(anchorMs)}, but steps[${index - 1}] can't finish before ${seconds(((prev.actionStart + 1) * 1000) / fps)} — shorten earlier steps or anchor one of them`,
        });
      }
    }
    const start = cursor;
    const timed = (ms: number, referenced: readonly string[]): Timing => {
      const revealFrames = show(referenced, start) ? toFrames(IMPLICIT_REVEAL_MS) : 0;
      return { start, actionStart: start + revealFrames, frames: revealFrames + toFrames(ms) };
    };

    let next: TimedStep;
    if ("reveal" in step) {
      show(step.reveal, start);
      const frames = toFrames(step.duration ?? DEFAULT_MS.reveal);
      next = { kind: "reveal", targets: step.reveal, start, actionStart: start, frames };
    } else if ("flow" in step) {
      const { from, to, label } = step.flow;
      const reversed = !edges.has(edgeId(from, to));
      next = {
        kind: "flow",
        edge: reversed ? edgeId(to, from) : edgeId(from, to),
        reversed,
        ...(label === undefined ? {} : { label }),
        ...timed(step.duration ?? DEFAULT_MS.flow, [from, to]),
      };
    } else if ("highlight" in step) {
      const { nodes, caption } = step.highlight;
      next = {
        kind: "highlight",
        targets: nodes,
        ...(caption === undefined ? {} : { caption }),
        ...timed(step.duration ?? DEFAULT_MS.highlight, nodes),
      };
    } else if ("fail" in step) {
      const { node, effect, label } = step.fail;
      next = {
        kind: "fail",
        target: node,
        effect,
        ...(label === undefined ? {} : { label }),
        ...timed(step.duration ?? DEFAULT_MS.fail, [node]),
      };
    } else {
      const frames = toFrames(step.pause);
      next = { kind: "pause", start, actionStart: start, frames };
    }
    steps.push(next);
    cursor += next.frames;
  }

  // Never-referenced nodes in a staged spec are simply there from the start.
  show(
    spec.nodes.map((n) => n.id),
    0,
  );
  for (const g of groupIds) {
    const first = Math.min(...(members.get(g) ?? []).map((m) => appear[m] ?? 0));
    appear[g] = Math.min(appear[g] ?? Infinity, Number.isFinite(first) ? first : 0);
  }
  for (const e of spec.edges) {
    appear[edgeId(e.from, e.to)] = Math.max(appear[e.from] ?? 0, appear[e.to] ?? 0);
  }

  if (issues.length > 0) throw new SceneError(issues);
  // Let the narration finish, even if it outlasts the steps.
  const end = Math.max(cursor, Math.ceil(((voiceover?.endMs ?? 0) * fps) / 1000));
  return { steps, appear, durationInFrames: end + toFrames(TAIL_MS) };
}
