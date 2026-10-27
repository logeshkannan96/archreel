import type { Scene } from "@archreel/layout";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import {
  Callout,
  Caption,
  Edge,
  EdgeArrowDefs,
  Group,
  Node,
  Packet,
  type Effect,
} from "./components.js";
import { resolveTheme } from "./theme.js";

export interface VideoProps extends Record<string, unknown> {
  scene: Scene;
}

export function Video({ scene }: VideoProps) {
  const theme = resolveTheme(scene.theme);
  const { scale } = scene;

  // Effects per target id; a group effect also applies to its members.
  const effects = new Map<string, Effect[]>();
  const members = (id: string): string[] => [
    id,
    ...scene.nodes.filter((n) => n.group === id).map((n) => n.id),
  ];
  for (const s of scene.steps) {
    if (s.kind !== "highlight" && s.kind !== "fail") continue;
    const targets = s.kind === "fail" ? [s.target] : s.targets;
    const effect: Effect = {
      kind: s.kind,
      from: s.actionStart,
      to: s.start + s.frames,
      shake: s.kind === "fail" && s.effect === "shake",
    };
    for (const id of targets.flatMap(members))
      effects.set(id, [...(effects.get(id) ?? []), effect]);
  }
  const edges = new Map(scene.edges.map((e) => [e.id, e]));
  const boxes = new Map([...scene.nodes, ...scene.groups].map((b) => [b.id, b]));

  return (
    <AbsoluteFill style={{ background: theme.background, fontFamily: "Inter, sans-serif" }}>
      {scene.audio === undefined ? null : (
        <Html5Audio
          src={/^https?:\/\//.test(scene.audio) ? scene.audio : staticFile(scene.audio)}
        />
      )}
      {scene.groups.map((g) => (
        <Group
          key={g.id}
          group={g}
          appear={scene.appear[g.id] ?? 0}
          effects={effects.get(g.id) ?? []}
          theme={theme}
          scale={scale}
        />
      ))}
      <svg width={scene.width} height={scene.height} style={{ position: "absolute", inset: 0 }}>
        <EdgeArrowDefs theme={theme} />
        {scene.edges.map((e) => (
          <Edge key={e.id} edge={e} appear={scene.appear[e.id] ?? 0} theme={theme} scale={scale} />
        ))}
      </svg>
      {scene.nodes.map((n) => (
        <Node
          key={n.id}
          node={n}
          appear={scene.appear[n.id] ?? 0}
          effects={effects.get(n.id) ?? []}
          theme={theme}
          scale={scale}
        />
      ))}
      {scene.steps.map((s, i) => {
        const frames = s.start + s.frames - s.actionStart;
        if (s.kind === "flow") {
          const edge = edges.get(s.edge);
          return edge ? (
            <Sequence key={i} from={s.actionStart} durationInFrames={frames} layout="none">
              <svg
                width={scene.width}
                height={scene.height}
                style={{ position: "absolute", inset: 0 }}
              >
                <Packet
                  edge={edge}
                  reversed={s.reversed}
                  label={s.label}
                  frames={frames}
                  theme={theme}
                  scale={scale}
                />
              </svg>
            </Sequence>
          ) : null;
        }
        if (s.kind === "fail" && s.label !== undefined) {
          const target = boxes.get(s.target);
          return target ? (
            <Sequence key={i} from={s.actionStart} durationInFrames={frames} layout="none">
              <Callout target={target} text={s.label} frames={frames} theme={theme} scale={scale} />
            </Sequence>
          ) : null;
        }
        if (s.kind === "highlight" && s.caption !== undefined) {
          return (
            <Sequence key={i} from={s.actionStart} durationInFrames={frames} layout="none">
              <Caption text={s.caption} frames={frames} theme={theme} />
            </Sequence>
          );
        }
        return null;
      })}
    </AbsoluteFill>
  );
}
