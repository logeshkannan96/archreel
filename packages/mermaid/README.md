# @archreel/mermaid

Converts a Mermaid flowchart into an [archreel](https://github.com/logeshkannan96/archreel) spec:
nodes, shapes, links and labels, subgraphs and direction. Each link becomes a `flow` step.

```ts
import { fromMermaid } from "@archreel/mermaid";
import { stringifySpec } from "@archreel/schema";

const result = fromMermaid("flowchart LR\n  a[Web] --> b[(Orders)]");
if (result.ok) console.log(stringifySpec(result.spec));
```

From the CLI: `npx archreel init spec.yaml --from diagram.mmd`. MIT.
