# @archreel/schema

The [archreel](https://github.com/logeshkannan96/archreel) spec: Zod schema, TypeScript types,
YAML loading with `file:line:col` errors, and the JSON Schema (`@archreel/schema/archreel.schema.json`)
for editors and LLM tool calls.

```ts
import { formatIssues, loadSpec } from "@archreel/schema";

const result = loadSpec(yamlText);
if (!result.ok) console.error(formatIssues("spec.yaml", result.issues));
```

MIT. See the [main README](https://github.com/logeshkannan96/archreel#readme).
