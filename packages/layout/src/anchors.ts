import { didYouMean, formatPath, type Caption, type Issue, type Spec } from "@archreel/schema";

/** A spec that is valid on its own but can't be built into a scene (e.g. an unmatched `at`). */
export class SceneError extends Error {
  constructor(readonly issues: Issue[]) {
    super(issues.map((i) => `${formatPath(i.path)}: ${i.message}`).join("\n"));
    this.name = "SceneError";
  }
}

export interface Voiceover {
  /** Start time in ms for each step with an `at`, by step index. */
  anchors: (number | undefined)[];
  /** When the narration ends; the video lasts at least this long. */
  endMs: number;
}

/** Lowercased words without punctuation: "Cache-miss!" → ["cachemiss"]. */
const words = (text: string): string[] =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);

export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * Matches each step's `at` phrase against the narration's words. Phrases are
 * searched in step order, so a phrase spoken twice anchors to the next occurrence.
 */
export function resolveVoiceover(spec: Spec, captions: readonly Caption[]): Voiceover {
  const spoken = captions.flatMap((c) => words(c.text).map((w) => ({ w, ms: c.startMs })));
  const find = (phrase: string[], from: number): number => {
    for (let i = from; i + phrase.length <= spoken.length; i++) {
      if (phrase.every((w, j) => spoken[i + j]?.w === w)) return i;
    }
    return -1;
  };

  const issues: Issue[] = [];
  let cursor = 0;
  let prev: { index: number; ms: number } | undefined;
  const anchors = spec.steps.map((step, index) => {
    if (step.at === undefined) return undefined;
    const path = ["steps", index, "at"];
    const phrase = words(step.at);
    if (phrase.length === 0) {
      issues.push({ path, message: "must contain at least one word" });
      return undefined;
    }
    const found = find(phrase, cursor);
    const match = spoken[found];
    if (match === undefined) {
      const earlier = spoken[find(phrase, 0)];
      if (earlier !== undefined && prev !== undefined) {
        issues.push({
          path,
          message: `"${step.at}" is spoken at ${seconds(earlier.ms)}, before steps[${prev.index}].at (${seconds(prev.ms)}) — anchors must follow the narration's order`,
        });
      } else {
        const known = new Set(spoken.map((s) => s.w));
        const missing = phrase.find((w) => !known.has(w));
        const hint = missing === undefined ? undefined : didYouMean(missing, [...known]);
        issues.push({ path, message: `"${step.at}" isn't in the voiceover captions${hint ?? ""}` });
      }
      return undefined;
    }
    cursor = found + phrase.length;
    prev = { index, ms: match.ms };
    return match.ms;
  });
  if (issues.length > 0) throw new SceneError(issues);
  return { anchors, endMs: Math.max(0, ...captions.map((c) => c.endMs)) };
}
