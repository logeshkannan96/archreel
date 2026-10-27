// Remotion bundle entry for the archreel CLI: one composition sized by its scene.
import type { Scene } from "@archreel/layout";
import { Composition, registerRoot } from "remotion";
import { Archreel, type ArchreelProps } from "./Archreel.js";
import { COMPOSITION_ID } from "./id.js";

const EMPTY_SCENE: Scene = {
  width: 1920,
  height: 1080,
  captionBottom: 60,
  nodeStyle: "icon",
  icons: {},
  fps: 30,
  theme: "light",
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
      component={Archreel}
      defaultProps={{ scene: EMPTY_SCENE } satisfies ArchreelProps}
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
