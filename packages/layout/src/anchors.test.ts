import { validateSpec, type Caption, type Spec, type SpecInput } from "@archreel/schema";
import { describe, expect, it } from "vitest";
import { SceneError, resolveVoiceover } from "./anchors.js";
import { buildScene } from "./layout.js";
import { buildTimeline } from "./timeline.js";

// "A user opens the app. The API checks the cache. Then the API queries Postgres."
const NARRATION: [string, number][] = [
  [" A", 0],
  [" user", 200],
  [" opens", 500],
  [" the", 800],
  [" app.", 1000],
  [" The", 2000],
  [" API", 2200],
  [" checks", 2600],
  [" the", 3000],
  [" cache.", 3200],
  [" Then", 5000],
  [" the", 5300],
  [" API", 5500],
  [" queries", 5900],
  [" Postgres.", 6400],
];
const captions: Caption[] = NARRATION.map(([text, startMs]) => ({
  text,
  startMs,
  endMs: startMs + 300,
}));

function spec(steps: SpecInput["steps"]): Spec {
  const result = validateSpec({
    version: 1,
    voiceover: { captions: "captions.json" },
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ],
    steps,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

const timeline = (s: Spec) => buildTimeline(s, 30, resolveVoiceover(s, captions));

function issues(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof SceneError)
      return err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw err;
  }
  return [];
}

describe("voiceover anchors", () => {
  it("starts anchored steps on their phrase and stretches the step before", () => {
    const t = timeline(
      spec([
        { reveal: ["a"], at: "A USER" },
        { flow: { from: "a", to: "b" } },
        { flow: { from: "b", to: "c" }, at: "then the api" },
      ]),
    );
    // 5000ms = frame 150; the unanchored flow (start 24) stretches to end there.
    expect(t.steps.map((s) => [s.start, s.frames])).toEqual([
      [0, 24],
      [24, 126],
      [150, 54],
    ]);
  });

  it("matches a repeated phrase at its next occurrence", () => {
    const t = timeline(
      spec([
        { reveal: ["a"], at: "the API" },
        { reveal: ["b"], at: "the API" },
      ]),
    );
    expect(t.steps.map((s) => s.start)).toEqual([60, 159]);
  });

  it("lasts until the narration ends", () => {
    const t = timeline(spec([{ reveal: ["a"], at: "user" }]));
    // narration ends at 6700ms = frame 201, plus the 45-frame tail
    expect(t.durationInFrames).toBe(246);
  });

  it.each([
    [
      "unknown phrase, with a suggestion",
      [{ reveal: ["a"], at: "cach mis" }],
      [`steps.0.at: "cach mis" isn't in the voiceover captions — did you mean "cache"?`],
    ],
    [
      "phrases out of spoken order",
      [
        { reveal: ["a"], at: "cache" },
        { reveal: ["b"], at: "user" },
      ],
      [
        `steps.1.at: "user" is spoken at 0.2s, before steps[0].at (3.2s) — anchors must follow the narration's order`,
      ],
    ],
    [
      "an anchor that leaves the previous step no time",
      [
        { reveal: ["a"], at: "user" },
        { flow: { from: "a", to: "b" } },
        { flow: { from: "b", to: "c" }, at: "app" },
      ],
      [
        `steps.2.at: "app" is spoken at 1.0s, but steps[1] can't finish before 1.6s — shorten earlier steps or anchor one of them`,
      ],
    ],
  ])("reports %s", (_name, steps, expected) => {
    expect(issues(() => timeline(spec(steps)))).toEqual(expected);
  });

  it("buildScene requires captions when steps have anchors", async () => {
    await expect(buildScene(spec([{ reveal: ["a"], at: "user" }]))).rejects.toThrow(
      "voiceover: captions are required to resolve the steps' `at` phrases",
    );
  });
});
