# archreel

Write your architecture as YAML. Get an animated system-design video: nodes appear, requests
travel along edges, components fail and light up.

![A URL shortener request: client → load balancer → API → cache miss → Postgres → redirect](https://raw.githubusercontent.com/logeshkannan96/archreel/main/examples/url-shortener.gif)

> [!IMPORTANT]
> **Licensing.** archreel is MIT, but it renders with [Remotion](https://www.remotion.dev), which
> is **not** MIT. Remotion is free for individuals and for companies with 3 or fewer employees;
> larger companies need a [Remotion company license](https://www.remotion.dev/license). Using
> archreel means accepting Remotion's terms.

## Quickstart (60 seconds)

Needs Node.js 22.12 or newer.

```sh
npx archreel init                                   # writes archreel.yaml
npx archreel preview archreel.yaml                  # live preview; reloads when you save
npx archreel render archreel.yaml -o archreel.mp4   # or -o archreel.gif
```

The first render downloads Remotion's headless Chrome once. Rendering is deterministic: the same
spec always produces the same video, byte for byte.

## The spec

```yaml
version: 1
theme: dark # dark | light | { base: dark, colors: { packet: "#22d3ee" } }
canvas: { width: 1920, height: 1080, fps: 30 }

nodes:
  - { id: client, label: Client, icon: user }
  - { id: api, label: API, icon: server, group: vpc }
  - { id: pg, label: Postgres, icon: postgres, group: vpc }

groups:
  - { id: vpc, label: VPC }

edges:
  - { from: client, to: api }
  - { from: api, to: pg }

steps:
  - reveal: [client, api]
  - flow: { from: client, to: api, label: GET /abc }
    duration: 1.5s
  - flow: { from: api, to: pg, label: SELECT }
  - fail: { node: pg, effect: shake, label: timeout }
  - highlight: { nodes: [pg], caption: The database is the bottleneck }
  - pause: 1s
```

| Step                              | Does                                                                                  | Default length |
| --------------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| `reveal: [ids]`                   | Fades in nodes or groups                                                              | 0.8s           |
| `flow: { from, to, label? }`      | Sends a packet along an edge; either direction, so responses reuse the request's edge | 1.2s           |
| `highlight: { nodes, caption? }`  | Glows nodes or groups, with an optional caption                                       | 2s             |
| `fail: { node, effect?, label? }` | Shakes (`shake`) or flashes (`flash`) a node or group red                             | 1.5s           |
| `pause: 1s`                       | Holds                                                                                 | —              |

- **Durations** are seconds (`2`) or strings (`"1.2s"`, `"500ms"`), set per step with `duration:`.
- **Appearing:** with no `reveal` step, everything is visible from the start. Otherwise a node
  appears at the first step that mentions it.
- **Layout** is automatic ([ELK](https://eclipse.dev/elk/) layered) and stable: adding a node
  doesn't reshuffle the rest. Pin a node with `position: { x, y }` (its center, in pixels).
- **Vertical videos:** portrait canvases flow top to bottom. A 9:16 canvas (`1080 × 1920`) keeps
  the diagram and captions clear of the YouTube Shorts overlays. Override with
  `direction: right | down`.
- **Icons** (generic line glyphs, not vendor logos): `user`, `server`, `database`, `cache`,
  `queue`, `aws/alb`, `aws/s3`, `k8s/pod`, `redis`, `postgres`, `kafka`.

Mistakes are reported with a location and a suggestion:

```
$ npx archreel validate spec.yaml
spec.yaml:17:24 steps[2].flow.to: unknown node "postgres" — did you mean "pg"?
```

For editor completion, start the file with the line `npx archreel init` writes:

```yaml
# yaml-language-server: $schema=https://unpkg.com/@archreel/schema/archreel.schema.json
```

The same JSON Schema works as a tool definition for an LLM: have it write the YAML, then loop on
`archreel validate` until it's clean.

## Gallery

|                                                                                                                                                                |                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Rate limiter](https://raw.githubusercontent.com/logeshkannan96/archreel/main/examples/rate-limiter.gif)<br>[`rate-limiter.yaml`](examples/rate-limiter.yaml) | ![Kafka fan-out](https://raw.githubusercontent.com/logeshkannan96/archreel/main/examples/kafka-fanout.gif)<br>[`kafka-fanout.yaml`](examples/kafka-fanout.yaml) (light theme) |

<img alt="URL shortener as a vertical Short" src="https://raw.githubusercontent.com/logeshkannan96/archreel/main/examples/url-shortener-shorts.gif" width="270"><br>
[`url-shortener-shorts.yaml`](examples/url-shortener-shorts.yaml): the same spec on a 9:16 canvas.

## Use it inside your own Remotion video

`@archreel/remotion` is a regular Remotion component, so a diagram can be one scene of a longer
video. Your project owns the narration, timing and layout around it.

```sh
npm i @archreel/remotion @archreel/layout @archreel/schema
```

```tsx
import { buildScene } from "@archreel/layout";
import { Archreel } from "@archreel/remotion";
import { formatIssues, loadSpec } from "@archreel/schema";
import { Sequence, staticFile } from "remotion";

// In your <Composition calculateMetadata>: YAML → validated spec → laid-out scene.
const result = loadSpec(await fetch(staticFile("system.yaml")).then((r) => r.text()));
if (!result.ok) throw new Error(formatIssues("system.yaml", result.issues));
const scene = await buildScene(result.spec);

// In your component: the diagram is scene.width × scene.height px and starts at frame 0.
<Sequence from={90}>
  <Archreel scene={scene} />
</Sequence>;
```

- Set the spec's `canvas` to the size you want the diagram, and its `fps` to your composition's.
  A mismatch throws instead of silently playing at the wrong speed.
- `theme: { base: dark, colors: { background: "#00000000" } }` makes the diagram transparent
  over your own background.
- `remotion`, `react` and `react-dom` are peer dependencies, so the component uses your Remotion
  version.

[`examples/embed`](examples/embed) is a complete host project.

## Import from Mermaid

```sh
npx archreel init system.yaml --from diagram.mmd
```

Imports flowcharts: node shapes, link styles and labels, chains, `&`, subgraphs and direction.
Icons are guessed from names, and each link becomes a `flow` step. Styling lines are skipped
with a warning; anything else unsupported fails with its line number.

## CLI

```
archreel validate <file...>        Check specs and report problems with file:line:col
archreel render <file> -o <out>    Render to MP4, or GIF if <out> ends in .gif
archreel preview <file>            Open Remotion Studio; reloads when the spec changes
archreel init [file]               Write a starter spec (default: archreel.yaml)

  -o, --out <path>          Output file for render (default: <file>.mp4)
      --scale <n>           Output scale for render (default: 1, or 0.5 for GIF)
      --from <diagram.mmd>  For init: convert a Mermaid flowchart instead
      --force               For init: overwrite an existing file
```

Exit codes: `0` ok, `1` invalid spec or failed render, `2` usage error.

## Packages

| Package                                   |                                                 |
| ----------------------------------------- | ----------------------------------------------- |
| [`archreel`](packages/cli)                | The CLI                                         |
| [`@archreel/schema`](packages/schema)     | Zod schema, types, YAML loading, JSON Schema    |
| [`@archreel/layout`](packages/layout)     | Spec → positioned, timed scene (pure; no React) |
| [`@archreel/remotion`](packages/remotion) | The `<Archreel>` Remotion component             |
| [`@archreel/mermaid`](packages/mermaid)   | Mermaid flowchart → spec                        |

## Credits

- [Remotion](https://www.remotion.dev) renders the video (see the licensing note above).
- [elkjs](https://github.com/kieler/elkjs) lays out the diagram (EPL-2.0).
- [Inter](https://rsms.me/inter/) is the bundled font (SIL Open Font License).
- Icons are original, generic glyphs. Names like `aws/alb` describe a kind of component; no
  vendor logos are included.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
