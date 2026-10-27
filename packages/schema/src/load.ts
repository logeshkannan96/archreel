import { LineCounter, isNode, parseDocument, type Document } from "yaml";
import type { Spec } from "./spec.js";
import { formatPath, validateSpec, type Issue, type IssuePath } from "./validate.js";

export interface LocatedIssue extends Issue {
  /** 1-based; absent when the location can't be resolved. */
  line?: number;
  col?: number;
}

export type LoadResult = { ok: true; spec: Spec } | { ok: false; issues: LocatedIssue[] };

/** Parse YAML (or JSON, a YAML subset) and validate, attaching source locations to issues. */
export function loadSpec(source: string): LoadResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, prettyErrors: false });

  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((e) => ({
        path: [],
        message: `invalid YAML: ${firstLine(e.message)}`,
        ...linePos(lineCounter, e.pos[0]),
      })),
    };
  }

  const result = validateSpec(doc.toJS());
  if (result.ok) return result;
  const issues: LocatedIssue[] = result.issues.map((issue) => ({
    ...issue,
    ...linePos(lineCounter, offsetOf(doc, issue.path)),
  }));
  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  return { ok: false, issues };
}

/** `file:line:col path: message`, one per line — clickable in most terminals and editors. */
export function formatIssues(file: string, issues: readonly LocatedIssue[]): string {
  return issues
    .map((i) => {
      const loc = i.line === undefined ? file : `${file}:${i.line}:${i.col ?? 1}`;
      const path = formatPath(i.path);
      return `${loc} ${path ? `${path}: ` : ""}${i.message}`;
    })
    .join("\n");
}

/** Offset of the deepest YAML node that exists along `path`. */
function offsetOf(doc: Document, path: IssuePath): number | undefined {
  for (let len = path.length; len >= 0; len--) {
    const sub = path.slice(0, len);
    const node: unknown = sub.length === 0 ? doc.contents : doc.getIn(sub, true);
    if (isNode(node) && node.range) {
      // A missing key is better pointed at its parent's key than the parent's whole body.
      return len < path.length ? (keyOffset(doc, sub) ?? node.range[0]) : node.range[0];
    }
  }
  return undefined;
}

function keyOffset(doc: Document, path: IssuePath): number | undefined {
  if (path.length === 0) return undefined;
  const parent: unknown = path.length === 1 ? doc.contents : doc.getIn(path.slice(0, -1), true);
  if (!isNode(parent) || !("items" in parent) || !Array.isArray(parent.items)) return undefined;
  const last = path.at(-1);
  for (const item of parent.items as unknown[]) {
    if (typeof item === "object" && item !== null && "key" in item) {
      const key: unknown = item.key;
      if (isNode(key) && "value" in key && key.value === last) return key.range?.[0];
    }
  }
  return undefined;
}

function linePos(lc: LineCounter, offset: number | undefined): Partial<LocatedIssue> {
  if (offset === undefined) return {};
  const { line, col } = lc.linePos(offset);
  return { line, col };
}

function firstLine(s: string): string {
  return s.split("\n")[0] ?? s;
}
