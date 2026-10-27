# @archreel/layout

Turns a validated [archreel](https://github.com/logeshkannan96/archreel) spec into a scene: node,
group and edge positions (ELK layered layout) plus a frame-accurate timeline. Pure and
deterministic; no React. The scene is plain JSON, so it can be passed as Remotion input props.

```ts
import { buildScene } from "@archreel/layout";

const scene = await buildScene(spec);
```

MIT. Bundles [elkjs](https://github.com/kieler/elkjs) (EPL-2.0). See the
[main README](https://github.com/logeshkannan96/archreel#readme).
