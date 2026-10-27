import type { Scene } from "@archreel/layout";
import { COMPOSITION_ID } from "@archreel/remotion/id";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { ENTRY_POINT } from "./shared.js";

/** README-friendly GIFs: half resolution, every other frame. */
const GIF_SCALE = 0.5;
const GIF_EVERY_NTH_FRAME = 2;

export interface RenderOptions {
  out: string;
  /** Output scale; defaults to 1 (MP4) or 0.5 (GIF). */
  scale?: number | undefined;
  log: (line: string) => void;
}

export async function renderScene(scene: Scene, { out, scale, log }: RenderOptions): Promise<void> {
  const isGif = out.toLowerCase().endsWith(".gif");
  log("Bundling…");
  const serveUrl = await bundle({ entryPoint: ENTRY_POINT });
  const inputProps = { scene };
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });

  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: isGif ? "gif" : "h264",
    outputLocation: out,
    scale: scale ?? (isGif ? GIF_SCALE : 1),
    ...(isGif ? { everyNthFrame: GIF_EVERY_NTH_FRAME } : {}),
    onBrowserDownload: () => {
      log("Downloading Chrome Headless Shell (first run only)…");
      return { version: null, onProgress: () => undefined };
    },
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== lastReported) {
        lastReported = pct;
        log(`Rendering ${out}: ${pct}%`);
      }
    },
  });
}

/** Renders single frames to PNG; used by visual regression tests. */
export async function renderFrames(
  scene: Scene,
  frames: readonly number[],
  outFile: (frame: number) => string,
  scale = 1,
): Promise<void> {
  const serveUrl = await bundle({ entryPoint: ENTRY_POINT });
  const inputProps = { scene };
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  for (const frame of frames) {
    await renderStill({ composition, serveUrl, inputProps, frame, scale, output: outFile(frame) });
  }
}
