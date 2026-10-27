import { Document, isMap, isSeq } from "yaml";
import { SCHEMA_ID } from "./json-schema.js";
import type { SpecInput } from "./spec.js";

/** Lists whose items read best on one line each, like `- { id: api, label: API }`. */
const ONE_LINE_ITEMS = new Set(["nodes", "groups", "edges"]);

/** A spec as YAML in the examples' style, with an editor schema hint. */
export function stringifySpec(spec: SpecInput): string {
  const doc = new Document(spec);
  doc.commentBefore = ` yaml-language-server: $schema=${SCHEMA_ID}`;
  if (isMap(doc.contents)) {
    for (const pair of doc.contents.items) {
      const key = String(pair.key);
      const value = pair.value;
      if (isMap(value)) value.flow = true;
      if (!isSeq(value)) continue;
      for (const item of value.items) {
        if (ONE_LINE_ITEMS.has(key) && isMap(item)) item.flow = true;
        // Steps: `- flow: { from: a, to: b }`
        if (key === "steps" && isMap(item)) {
          for (const p of item.items) if (isMap(p.value) || isSeq(p.value)) p.value.flow = true;
        }
      }
    }
  }
  return doc.toString({ lineWidth: 100 }).replace(/\n(?=(nodes|groups|edges|steps):)/g, "\n\n");
}
