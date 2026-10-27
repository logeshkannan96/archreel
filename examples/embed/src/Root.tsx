import { buildScene, type Scene } from "@archreel/layout";
import { Archreel } from "@archreel/remotion";
import { formatIssues, loadSpec } from "@archreel/schema";
import {
  AbsoluteFill,
  Composition,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

/** The host's own intro before the diagram starts. */
export const TITLE_FRAMES = 45;

interface Props extends Record<string, unknown> {
  scene: Scene | null;
}

/** Host-owned layout: a title, then the archreel diagram below it. */
function Explainer({ scene }: Props) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#0b1120", fontFamily: "Inter, sans-serif" }}>
      <div
        style={{
          marginTop: 260,
          textAlign: "center",
          color: "#f8fafc",
          fontSize: 76,
          fontWeight: 700,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        Cache-aside reads
      </div>
      {scene && (
        <Sequence from={TITLE_FRAMES} layout="none">
          <div style={{ position: "absolute", top: 520, left: 0 }}>
            <Archreel scene={scene} />
          </div>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}

export function Root() {
  return (
    <Composition
      id="Explainer"
      component={Explainer}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={TITLE_FRAMES}
      defaultProps={{ scene: null } satisfies Props}
      // The spec is plain YAML in public/; edit it and Studio re-runs this.
      calculateMetadata={async () => {
        const source = await fetch(staticFile("system.yaml")).then((r) => r.text());
        const result = loadSpec(source);
        if (!result.ok) throw new Error(formatIssues("system.yaml", result.issues));
        const scene = await buildScene(result.spec);
        return { props: { scene }, durationInFrames: TITLE_FRAMES + scene.durationInFrames };
      }}
    />
  );
}
