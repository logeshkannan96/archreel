// Remotion bundle entry: registers the single "Archreel" composition.
import type { Scene } from "@archreel/layout";
import { loadFont } from "@remotion/fonts";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2";
import inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2";
import { Composition, registerRoot } from "remotion";
import { COMPOSITION_ID, Video, type VideoProps } from "./index.js";

// Bundled font: renders must not depend on the fonts installed on the machine.
void Promise.all(
  [
    [inter400, "400"],
    [inter600, "600"],
    [inter700, "700"],
  ].map(([url = "", weight = "400"]) => loadFont({ family: "Inter", url, weight })),
);

const EMPTY_SCENE: Scene = {
  width: 1920,
  height: 1080,
  fps: 30,
  theme: "dark",
  scale: 1,
  durationInFrames: 30,
  nodes: [],
  groups: [],
  edges: [],
  steps: [],
  appear: {},
};

function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={Video}
      defaultProps={{ scene: EMPTY_SCENE } satisfies VideoProps}
      calculateMetadata={({ props }) => ({
        width: props.scene.width,
        height: props.scene.height,
        fps: props.scene.fps,
        durationInFrames: props.scene.durationInFrames,
      })}
    />
  );
}

registerRoot(Root);
