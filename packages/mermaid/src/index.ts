import { MAX_SPEC_BYTES, formatPath, validateSpec, type SpecInput } from "@archreel/schema";

export interface MermaidIssue {
  /** 1-based source line; 0 for problems with the diagram as a whole. */
  line: number;
  message: string;
}

export type MermaidResult =
  { ok: true; spec: SpecInput; warnings: MermaidIssue[] } | { ok: false; issues: MermaidIssue[] };

type Icon = NonNullable<SpecInput["nodes"][number]["icon"]>;
type StepInput = NonNullable<SpecInput["steps"]>[number];

interface RawNode {
  label?: string;
  cylinder: boolean;
  /** The first subgraph that mentions the node owns it, as in Mermaid. */
  group?: RawGroup;
}
interface RawGroup {
  rawId: string;
  title: string;
  line: number;
}
interface RawEdge {
  from: string;
  to: string;
  label?: string;
  line: number;
}

// Longest openers first. `[/` and `[\` accept either slash as the closer (trapezoids).
const SHAPES: readonly (readonly [open: string, close: string])[] = [
  ["(((", ")))"],
  ["([", "])"],
  ["[[", "]]"],
  ["[(", ")]"],
  ["((", "))"],
  ["{{", "}}"],
  ["[/", "/]"],
  ["[/", "\\]"],
  ["[\\", "\\]"],
  ["[\\", "/]"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  [">", "]"],
];
const NODE_ID = /[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/y;
const CLASS_SUFFIX = /:::[\w-]+/y;
// Arrow bodies: dotted `-.-`, solid `--`/`---`, thick `==`, dotted label opener `-.`, invisible `~~~`.
const LINK = /(<)?(-\.+-|-{2,}|={2,}|-\.|~{3,})([>xo])?/y;
const LABEL_END: Record<string, RegExp> = {
  "--": /(-{2,}[>xo]|-{3,})/g,
  "==": /(={2,}[>xo]|={3,})/g,
  "-.": /(\.-+[>xo]?)/g,
};
const IGNORED = /^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/;
const HEADER = /^(?:flowchart|graph)(?:\s+(LR|RL|TB|TD|BT))?$/i;

/** Icons guessed from ids and labels; order matters (specific before generic). */
const ICON_HINTS: readonly (readonly [RegExp, Icon])[] = [
  [/redis/, "redis"],
  [/postgres|\bpg\b|psql/, "postgres"],
  [/kafka/, "kafka"],
  [/queue|\bsqs\b|rabbit|\bmq\b|pub\/?sub/, "queue"],
  [/cache|memcache/, "cache"],
  [/\bs3\b|bucket|blob|object store/, "aws/s3"],
  [/\b[an]?lb\b|\belb\b|load ?balancer|nginx|ingress|gateway/, "aws/alb"],
  [/\bpods?\b|k8s|kubernetes/, "k8s/pod"],
  [/user|client|browser|mobile|customer/, "user"],
  [/\bdb\b|database|mysql|mongo|dynamo|cassandra|\bsql\b/, "database"],
  [/server|\bapi\b|service|\bsvc\b|backend|worker|\bapp\b/, "server"],
];

/**
 * Parses the flowchart subset of Mermaid (nodes, shapes, links with labels,
 * chains, `&`, subgraphs) into an archreel spec that plays each link in order.
 * Styling lines are ignored with a warning; anything else is an error.
 */
export function fromMermaid(source: string): MermaidResult {
  if (source.length > MAX_SPEC_BYTES) {
    return { ok: false, issues: [{ line: 0, message: "diagram is larger than 1 MB" }] };
  }
  const issues: MermaidIssue[] = [];
  const warnings: MermaidIssue[] = [];
  const warned = new Set<string>();
  const warnOnce = (line: number, key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push({ line, message });
  };

  const nodes = new Map<string, RawNode>();
  const groups: RawGroup[] = [];
  const stack: RawGroup[] = [];
  const edges: RawEdge[] = [];
  let sawHeader = false;
  let down = false;

  const mention = (rawId: string, label: string | undefined, cylinder: boolean): void => {
    const node = nodes.get(rawId) ?? { cylinder: false };
    if (label !== undefined) node.label = label;
    node.cylinder ||= cylinder;
    const inner = stack.at(-1);
    if (node.group === undefined && inner !== undefined) node.group = inner;
    nodes.set(rawId, node);
  };

  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = index + 1;
    const text = rawLine.trim();
    if (text === "" || text.startsWith("%%")) continue;
    for (const stmt of splitStatements(text)) {
      if (!sawHeader) {
        const header = HEADER.exec(stmt);
        if (!header) {
          issues.push({
            line,
            message: `expected "flowchart LR" or "graph TD" — only Mermaid flowcharts can be imported`,
          });
          return { ok: false, issues };
        }
        // Mermaid's default is top to bottom. archreel flows right or down only.
        const dir = header[1]?.toUpperCase() ?? "TB";
        down = dir !== "LR" && dir !== "RL";
        if (dir === "RL" || dir === "BT") {
          const drawn = down ? "top to bottom" : "left to right";
          warnings.push({ line, message: `direction ${dir} is drawn ${drawn}` });
        }
        sawHeader = true;
        continue;
      }
      const subgraph = /^subgraph\b\s*(.*)$/.exec(stmt);
      if (subgraph) {
        const group = parseSubgraph(subgraph[1] ?? "", line, groups.length);
        if (stack.length > 0) {
          warnOnce(
            line,
            "nested",
            "nested subgraphs are drawn side by side, not inside each other",
          );
        }
        groups.push(group);
        stack.push(group);
        continue;
      }
      if (stmt === "end") {
        if (stack.pop() === undefined) issues.push({ line, message: `"end" without a subgraph` });
        continue;
      }
      if (/^direction\b/.test(stmt)) continue;
      const ignored = IGNORED.exec(stmt)?.[1];
      if (ignored !== undefined) {
        const why = ignored === "click" ? "" : "; use a theme to style the video";
        warnOnce(line, ignored, `"${ignored}" lines are ignored${why}`);
        continue;
      }
      const error = parseChain(stmt, line, mention, edges);
      if (error !== undefined) issues.push({ line, message: error });
    }
  }
  if (!sawHeader) issues.push({ line: 0, message: "empty diagram" });
  for (const g of stack)
    issues.push({ line: g.line, message: `subgraph "${g.title}" is never closed` });
  if (issues.length > 0) return { ok: false, issues };

  return assemble(nodes, groups, edges, warnings, down);
}

/** Splits `a --> b; b --> c` on semicolons outside quotes and brackets. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "[" || c === "(" || c === "{") depth++;
    else if (c === "]" || c === ")" || c === "}") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  out.push(line.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

function parseSubgraph(rest: string, line: number, index: number): RawGroup {
  const withTitle = /^([\w-]+)\s*\[(.*)\]$/.exec(rest);
  if (withTitle) {
    const [, rawId = "", title = ""] = withTitle;
    return { rawId, title: cleanLabel(title) || rawId, line };
  }
  const title = cleanLabel(rest);
  // `subgraph "Data tier"` or `subgraph Data tier`: Mermaid uses the title as the id.
  return {
    rawId: rest.trim() || `subgraph${index + 1}`,
    title: title || `Group ${index + 1}`,
    line,
  };
}

/** Parses `a & b --> c[Label] -->|x| d`; returns an error message or undefined. */
function parseChain(
  s: string,
  line: number,
  mention: (rawId: string, label: string | undefined, cylinder: boolean) => void,
  edges: RawEdge[],
): string | undefined {
  let i = 0;
  const ws = (): void => {
    while (i < s.length && /\s/.test(s.charAt(i))) i++;
  };
  const unexpected = (): string =>
    `can't parse ${JSON.stringify(s.slice(i, i + 20))} (archreel imports nodes, links and subgraphs)`;

  const nodeRef = (): string | undefined => {
    NODE_ID.lastIndex = i;
    const id = NODE_ID.exec(s)?.[0];
    if (id === undefined) return undefined;
    i += id.length;
    let label: string | undefined;
    let cylinder = false;
    // An opener without its closer fails the statement, so a hostile line can't go quadratic.
    let unclosed = false;
    for (const [open, close] of SHAPES) {
      if (!s.startsWith(open, i)) continue;
      unclosed = true;
      let from = i + open.length;
      let text: string | undefined;
      if (s.charAt(from) === '"') {
        const q = s.indexOf('"', from + 1);
        if (q < 0) return undefined;
        text = s.slice(from + 1, q);
        from = q + 1;
      }
      const end = s.indexOf(close, from);
      if (end < 0) continue;
      label = cleanLabel(text ?? s.slice(from, end));
      cylinder = open === "[(";
      i = end + close.length;
      unclosed = false;
      break;
    }
    if (unclosed) return undefined;
    CLASS_SUFFIX.lastIndex = i;
    i += CLASS_SUFFIX.exec(s)?.[0].length ?? 0;
    mention(id, label || undefined, cylinder);
    return id;
  };

  const nodeGroup = (): string[] | undefined => {
    const ids: string[] = [];
    for (;;) {
      ws();
      const id = nodeRef();
      if (id === undefined) return undefined;
      ids.push(id);
      ws();
      if (s.charAt(i) !== "&") return ids;
      i++;
    }
  };

  let left = nodeGroup();
  if (left === undefined) return unexpected();
  while (i < s.length) {
    LINK.lastIndex = i;
    const link = LINK.exec(s);
    if (!link) return unexpected();
    i = LINK.lastIndex;
    const [, , body = "", head] = link;
    let label: string | undefined;
    const end = head === undefined ? LABEL_END[body] : undefined;
    if (end !== undefined) {
      // `-- text -->`: the text runs until the closing arrow.
      end.lastIndex = i;
      const close = end.exec(s);
      if (!close) return `link label "${s.slice(i).trim()}" has no closing arrow`;
      label = cleanLabel(s.slice(i, close.index)) || undefined;
      i = end.lastIndex;
    }
    ws();
    if (s.charAt(i) === "|") {
      const close = s.indexOf("|", i + 1);
      if (close < 0) return `link label "${s.slice(i)}" has no closing "|"`;
      label = cleanLabel(s.slice(i + 1, close)) || undefined;
      i = close + 1;
    }
    const right = nodeGroup();
    if (right === undefined) return unexpected();
    // `~~~` only nudges Mermaid's layout.
    if (!body.startsWith("~")) {
      for (const from of left) {
        for (const to of right) edges.push({ from, to, line, ...(label ? { label } : {}) });
      }
    }
    left = right;
    ws();
  }
  return undefined;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };

/** Mermaid label markup → plain text: `<br/>` and `\n` become spaces, tags and backticks go. */
function cleanLabel(text: string): string {
  return text
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/<br\s*\/?>|\\n/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/#(\w+);/g, (m, name: string) => ENTITIES[name] ?? m)
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_ID = 64;
const MAX_LABEL = 200;

function assemble(
  rawNodes: Map<string, RawNode>,
  rawGroups: RawGroup[],
  rawEdges: RawEdge[],
  warnings: MermaidIssue[],
  down: boolean,
): MermaidResult {
  const groupRaw = new Set(rawGroups.map((g) => g.rawId));
  const taken = new Set<string>();
  const allocate = (raw: string): string => {
    let base = raw
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^[^A-Za-z]+/, "")
      .slice(0, MAX_ID - 4);
    if (base === "") base = "n";
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    return id;
  };

  // A link to a subgraph id names the subgraph, not a node.
  const nodeIds = new Map<string, string>();
  for (const raw of rawNodes.keys()) if (!groupRaw.has(raw)) nodeIds.set(raw, allocate(raw));
  const groupIds = new Map<RawGroup, string>();
  const used = new Set([...rawNodes.values()].map((n) => n.group));
  for (const g of rawGroups) {
    if (used.has(g)) groupIds.set(g, allocate(g.rawId));
    else
      warnings.push({
        line: g.line,
        message: `subgraph "${g.title}" has no nodes of its own; skipped`,
      });
  }

  const nodes: SpecInput["nodes"] = [];
  for (const [raw, n] of rawNodes) {
    const id = nodeIds.get(raw);
    if (id === undefined) continue;
    const label = truncate(n.label ?? raw);
    const icon = guessIcon(`${raw} ${label}`, n.cylinder);
    const group = n.group && groupIds.get(n.group);
    nodes.push({
      id,
      ...(label === id ? {} : { label }),
      ...(icon ? { icon } : {}),
      ...(group ? { group } : {}),
    });
  }
  const groups = [...groupIds].map(([g, id]) => ({
    id,
    ...(g.title === id ? {} : { label: truncate(g.title) }),
  }));

  const edges: NonNullable<SpecInput["edges"]> = [];
  const steps: StepInput[] = [];
  const edgeKeys = new Set<string>();
  for (const e of rawEdges) {
    const from = nodeIds.get(e.from);
    const to = nodeIds.get(e.to);
    if (from === undefined || to === undefined) {
      const sub = from === undefined ? e.from : e.to;
      warnings.push({
        line: e.line,
        message: `link to subgraph "${sub}" skipped; link its nodes instead`,
      });
      continue;
    }
    if (from === to) {
      warnings.push({ line: e.line, message: `self-link on "${from}" skipped` });
      continue;
    }
    const label = e.label === undefined ? undefined : truncate(e.label);
    // A link back along an existing edge (a response) reuses it, like a flow in a spec.
    if (!edgeKeys.has(`${from}->${to}`) && !edgeKeys.has(`${to}->${from}`)) {
      edgeKeys.add(`${from}->${to}`);
      edges.push({ from, to, ...(label ? { label } : {}) });
      steps.push({ flow: { from, to } });
    } else {
      steps.push({ flow: { from, to, ...(label ? { label } : {}) } });
    }
  }
  const first = edges[0]?.from ?? nodes[0]?.id;
  if (first === undefined)
    return { ok: false, issues: [{ line: 0, message: "diagram has no nodes" }] };
  // Stage the video: start with the first node, reveal the rest as flows reach them.
  if (steps.length > 0) steps.unshift({ reveal: [first] });

  const spec: SpecInput = {
    version: 1,
    ...(down ? { direction: "down" } : {}),
    nodes,
    ...(groups.length ? { groups } : {}),
    edges,
    steps,
  };
  const result = validateSpec(spec);
  if (!result.ok) {
    return {
      ok: false,
      issues: result.issues.map((i) => ({
        line: 0,
        message: `${formatPath(i.path)}: ${i.message}`,
      })),
    };
  }
  return { ok: true, spec, warnings };
}

const truncate = (s: string): string =>
  s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s;

const STORAGE: ReadonlySet<Icon> = new Set([
  "redis",
  "postgres",
  "kafka",
  "queue",
  "cache",
  "aws/s3",
  "database",
]);

/** A cylinder is storage even when its name says otherwise ("users" → database, not user). */
function guessIcon(text: string, cylinder: boolean): Icon | undefined {
  const t = text.toLowerCase();
  const icon = ICON_HINTS.find(([re]) => re.test(t))?.[1];
  return cylinder && (icon === undefined || !STORAGE.has(icon)) ? "database" : icon;
}
