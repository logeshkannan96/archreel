import type { z } from "zod";
import {
  ICONS,
  MAX_STEP_MS,
  STEP_KINDS,
  STEP_SCHEMAS,
  CustomTheme,
  SpecSchema,
  THEME_COLORS,
  THEME_NAMES,
  type Spec,
  type StepKind,
} from "./spec.js";

export type IssuePath = (string | number)[];

export interface Issue {
  path: IssuePath;
  message: string;
}

export type ValidationResult = { ok: true; spec: Spec } | { ok: false; issues: Issue[] };

/** Structural (zod) validation, then cross-reference checks. */
export function validateSpec(input: unknown): ValidationResult {
  const parsed = SpecSchema.safeParse(input);
  if (parsed.success) {
    const issues = checkReferences(parsed.data);
    return issues.length > 0 ? { ok: false, issues } : { ok: true, spec: parsed.data };
  }
  const issues = parsed.error.issues.flatMap((i) => toIssues(i, input, []));
  // Report reference problems in the same run instead of making users fix-and-rerun.
  const pruned = SpecSchema.safeParse(neutralize(input, issues));
  if (pruned.success) issues.push(...checkReferences(pruned.data));
  return { ok: false, issues };
}

/**
 * Copy of `input` with invalid parts replaced so the rest can still be checked:
 * a broken step becomes a no-op pause (indices stay stable), a broken optional
 * field is dropped, a broken top-level setting falls back to its default.
 * Anything else can't be neutralized safely → undefined.
 */
function neutralize(input: unknown, issues: readonly Issue[]): unknown {
  const copy: unknown = structuredClone(input);
  if (!isRecord(copy)) return undefined;
  for (const { path } of issues) {
    const [section, index, field] = path;
    if (section === "version") copy.version = 1;
    else if (section === "theme" || section === "canvas" || section === "$schema") {
      Reflect.deleteProperty(copy, section);
    } else {
      const list = typeof section === "string" ? copy[section] : undefined;
      if (!Array.isArray(list) || typeof index !== "number") return undefined;
      const item: unknown = list[index];
      const required = REQUIRED_FIELDS[section as keyof typeof REQUIRED_FIELDS] ?? [];
      if (section === "steps") list[index] = { pause: 1 };
      else if (isRecord(item) && typeof field === "string" && !required.includes(field)) {
        Reflect.deleteProperty(item, field);
      } else return undefined;
    }
  }
  return copy;
}

const REQUIRED_FIELDS: Partial<Record<string, readonly string[]>> = {
  nodes: ["id"],
  groups: ["id"],
  edges: ["from", "to"],
};

export function formatPath(path: IssuePath): string {
  return path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg),
    "",
  );
}

// ---------------------------------------------------------------------------
// zod issues → human-friendly issues

type ZodIssue = z.core.$ZodIssue;

function toIssues(issue: ZodIssue, root: unknown, base: IssuePath): Issue[] {
  const rel = issue.path.filter((p): p is string | number => typeof p !== "symbol");
  const path = [...base, ...rel];
  const value = getAt(root, rel);

  switch (issue.code) {
    case "invalid_union":
      // Steps are a union; report errors from the branch the user clearly meant.
      if (path.length === 2 && path[0] === "steps") return stepIssues(value, path);
      if (path.length === 1 && path[0] === "theme") return themeIssues(value);
      if (path.at(-1) === "duration" || path.at(-1) === "pause") {
        return [{ path, message: `${DURATION_HINT}, got ${describe(value)}` }];
      }
      return [{ path, message: issue.message }];

    case "invalid_type":
      if (value === undefined) return [{ path, message: `required (expected ${issue.expected})` }];
      return [{ path, message: `expected ${issue.expected}, got ${describe(value)}` }];

    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        path: [...path, key],
        message: unknownKeyMessage(key, path, value),
      }));

    case "invalid_value": {
      const allowed = issue.values.map((v) => JSON.stringify(v));
      const isIcon = path.at(-1) === "icon";
      const hint =
        typeof value === "string" ? didYouMean(value, issue.values.map(String)) : undefined;
      const expected = isIcon
        ? "a built-in icon"
        : allowed.length === 1
          ? allowed[0]
          : `one of ${allowed.join(", ")}`;
      const tail = hint ?? (isIcon ? ` (built-in icons: ${ICONS.join(", ")})` : "");
      return [{ path, message: `expected ${expected}, got ${describe(value)}${tail}` }];
    }

    case "too_small":
      if (issue.origin === "array") return [{ path, message: "must not be empty" }];
      if (issue.origin === "string") return [{ path, message: "must not be empty" }];
      return [{ path, message: `must be ${issue.inclusive ? ">=" : ">"} ${issue.minimum}` }];

    case "too_big":
      return [{ path, message: `must be ${issue.inclusive ? "<=" : "<"} ${issue.maximum}` }];

    default: {
      // Bare numbers are seconds; `duration: 500` almost always meant milliseconds.
      const isDuration = path.at(-1) === "duration" || path.at(-1) === "pause";
      const tooLong = isDuration && typeof value === "number" && value * 1000 > MAX_STEP_MS;
      const hint = tooLong ? ` (bare numbers are seconds — did you mean "${value}ms"?)` : "";
      return [{ path, message: `${issue.message}${hint}` }];
    }
  }
}

const DURATION_HINT = 'expected a duration like "1.2s" or "500ms"';

function stepIssues(step: unknown, path: IssuePath): Issue[] {
  const example = 'a step like "- reveal: [client]" or "- flow: { from: a, to: b }"';
  if (!isRecord(step)) return [{ path, message: `expected ${example}, got ${describe(step)}` }];

  const keys = Object.keys(step);
  const kinds = keys.filter(isStepKind);

  if (kinds.length > 1) {
    return [{ path, message: `a step must have exactly one action, found ${kinds.join(" and ")}` }];
  }
  const kind = kinds[0];
  if (kind === undefined) {
    const guess = keys.map((k) => didYouMean(k, STEP_KINDS)).find(Boolean);
    return [
      {
        path,
        message: `unknown step; expected one of ${STEP_KINDS.join(", ")}${guess ?? ""}`,
      },
    ];
  }
  const result = STEP_SCHEMAS[kind].safeParse(step);
  return result.success ? [] : result.error.issues.flatMap((i) => toIssues(i, step, path));
}

function themeIssues(theme: unknown): Issue[] {
  const path = ["theme"];
  if (isRecord(theme)) {
    const result = CustomTheme.safeParse(theme);
    return result.success ? [] : result.error.issues.flatMap((i) => toIssues(i, theme, path));
  }
  const hint =
    theme === "custom"
      ? ' — for a custom theme use { base: dark, colors: { packet: "#22d3ee" } }'
      : typeof theme === "string"
        ? (didYouMean(theme, THEME_NAMES) ?? "")
        : "";
  return [
    {
      path,
      message: `expected "dark", "light", or { base, colors }, got ${describe(theme)}${hint}`,
    },
  ];
}

function unknownKeyMessage(key: string, parent: IssuePath, container: unknown): string {
  const quoted = JSON.stringify(key); // keys are user input; never echo raw control chars
  const owner = parent.at(-1);
  if (key === "duration" && typeof owner === "string" && isStepKind(owner)) {
    return `unknown key "duration" in ${owner} — move it up one level, next to "${owner}:"`;
  }
  const kind = isRecord(container) ? STEP_KINDS.find((k) => k in container) : undefined;
  if (parent.length === 2 && parent[0] === "steps" && kind !== undefined) {
    if (kind === "pause" && key === "duration") {
      return `"pause" takes its duration as its value, e.g. "- pause: 2s"`;
    }
    if (KNOWN_KEYS.includes(key) && kind !== "reveal" && kind !== "pause") {
      return `unknown key ${quoted} next to "${kind}:" — move it inside, e.g. "${kind}: { ${key}: … }"`;
    }
  }
  if (KNOWN_KEYS.includes(key)) return `${quoted} is not allowed here`;
  const hint =
    didYouMean(key, KNOWN_KEYS) ?? " — check the spelling, or it may need a newer archreel";
  return `unknown key ${quoted}${hint}`;
}

function isStepKind(s: string): s is StepKind {
  return (STEP_KINDS as readonly string[]).includes(s);
}

const KNOWN_KEYS = [
  ...new Set([
    ...Object.keys(SpecSchema.shape),
    "width",
    "height",
    "fps",
    "id",
    "label",
    "icon",
    "group",
    "position",
    "from",
    "to",
    "nodes",
    "caption",
    "node",
    "effect",
    "duration",
    "base",
    "colors",
    ...THEME_COLORS,
    ...STEP_KINDS,
  ]),
];

// ---------------------------------------------------------------------------
// cross-reference checks (things a schema can't express)

const MAX_SUGGESTIONS = 50;

function checkReferences(spec: Spec): Issue[] {
  const issues: Issue[] = [];
  // Suggestions cost O(candidates × id length²); cap them so hostile specs stay fast.
  let suggestionBudget = MAX_SUGGESTIONS;
  const unknownRef = (
    kind: string,
    id: string,
    known: Set<string>,
    aliases?: Map<string, string>,
  ): string => {
    const alias = aliases?.get(id.toLowerCase());
    const hint =
      alias !== undefined
        ? ` — did you mean "${alias}"?`
        : suggestionBudget-- > 0
          ? didYouMean(id, [...known])
          : undefined;
    return `unknown ${kind} "${id}"${hint ?? ""}`;
  };
  const nodeIds = new Set<string>();
  const groupIds = new Set(spec.groups.map((g) => g.id));
  // "postgres" should suggest "pg" when pg's label is "Postgres".
  const nodeAliases = new Map<string, string>();

  const seen = new Map<string, string>();
  const claim = (id: string, path: IssuePath): void => {
    const prev = seen.get(id);
    if (prev) issues.push({ path, message: `duplicate id "${id}" (already used at ${prev})` });
    else seen.set(id, formatPath(path));
  };

  spec.groups.forEach((g, i) => {
    claim(g.id, ["groups", i, "id"]);
  });
  spec.nodes.forEach((n, i) => {
    claim(n.id, ["nodes", i, "id"]);
    nodeIds.add(n.id);
    nodeAliases.set(n.id.toLowerCase(), n.id);
    if (n.label) nodeAliases.set(n.label.toLowerCase(), n.id);
    if (n.group !== undefined && !groupIds.has(n.group)) {
      issues.push({
        path: ["nodes", i, "group"],
        message: unknownRef("group", n.group, groupIds),
      });
    }
  });

  const node = (id: string, path: IssuePath): boolean => {
    if (nodeIds.has(id)) return true;
    issues.push({ path, message: unknownRef("node", id, nodeIds, nodeAliases) });
    return false;
  };

  const edgeKeys = new Set<string>();
  spec.edges.forEach((e, i) => {
    const okFrom = node(e.from, ["edges", i, "from"]);
    const okTo = node(e.to, ["edges", i, "to"]);
    if (okFrom && okTo && e.from === e.to) {
      issues.push({ path: ["edges", i], message: `edge connects "${e.from}" to itself` });
    }
    const key = `${e.from}->${e.to}`;
    if (edgeKeys.has(key)) {
      issues.push({ path: ["edges", i], message: `duplicate edge from "${e.from}" to "${e.to}"` });
    }
    edgeKeys.add(key);
  });

  const revealable = new Set([...nodeIds, ...groupIds]);
  spec.steps.forEach((step, i) => {
    const at: IssuePath = ["steps", i];
    const target = (id: string, path: IssuePath): void => {
      if (!revealable.has(id)) {
        issues.push({ path, message: unknownRef("node or group", id, revealable, nodeAliases) });
      }
    };
    if ("reveal" in step) {
      step.reveal.forEach((id, j) => {
        target(id, [...at, "reveal", j]);
      });
    } else if ("flow" in step) {
      const { from, to } = step.flow;
      const okFrom = node(from, [...at, "flow", "from"]);
      const okTo = node(to, [...at, "flow", "to"]);
      if (okFrom && okTo && from === to) {
        issues.push({ path: [...at, "flow"], message: `a flow needs two different nodes` });
      }
      // A flow may travel an edge in either direction (e.g. a response).
      else if (
        okFrom &&
        okTo &&
        !edgeKeys.has(`${from}->${to}`) &&
        !edgeKeys.has(`${to}->${from}`)
      ) {
        issues.push({
          path: [...at, "flow"],
          message: `no edge between "${from}" and "${to}" — add { from: ${from}, to: ${to} } to edges`,
        });
      }
    } else if ("fail" in step) {
      target(step.fail.node, [...at, "fail", "node"]);
    } else if ("highlight" in step) {
      step.highlight.nodes.forEach((id, j) => {
        target(id, [...at, "highlight", "nodes", j]);
      });
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// helpers

/** Returns ` — did you mean "x"?` for the closest candidate, if close enough. */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  const needle = input.toLowerCase();
  let best: string | undefined;
  let bestDist = Math.max(1, Math.floor(input.length / 3)) + 1;
  for (const c of candidates) {
    if (Math.abs(c.length - input.length) >= bestDist) continue; // can't beat bestDist
    const d = editDistance(needle, c.toLowerCase(), bestDist);
    if (d < bestDist) [best, bestDist] = [c, d];
  }
  return best === undefined ? undefined : ` — did you mean "${best}"?`;
}

/**
 * Optimal string alignment distance (Levenshtein + adjacent transpositions, so "vcp" → "vpc" = 1).
 * Returns `limit` as soon as the distance is known to be >= limit.
 */
function editDistance(a: string, b: string, limit: number): number {
  let prev2 = new Int32Array(b.length + 1);
  let prev = Int32Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      }
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin >= limit) return limit;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return Math.min(prev[b.length] ?? 0, limit);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getAt(root: unknown, path: IssuePath): unknown {
  let cur = root;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === "number") cur = cur[seg];
    else if (isRecord(cur) && typeof seg === "string") cur = cur[seg];
    else return undefined;
  }
  return cur;
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "a list";
  if (typeof v === "object") return "an object";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return typeof v;
}
