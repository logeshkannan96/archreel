import { z } from "zod";
import type { Issue } from "./validate.js";

/** Word timestamps from a transcription, in Remotion's `Caption` shape (extra fields ignored). */
export const CaptionSchema = z.object({
  text: z.string().max(1000),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});
export type Caption = z.output<typeof CaptionSchema>;

/** About 10 hours of narration at word granularity. */
const MAX_CAPTIONS = 200_000;
export const MAX_CAPTIONS_BYTES = 20_000_000;

export type CaptionsResult = { ok: true; captions: Caption[] } | { ok: false; issues: Issue[] };

/** Parses a captions JSON file. Never throws. */
export function loadCaptions(source: string): CaptionsResult {
  if (source.length > MAX_CAPTIONS_BYTES) {
    return { ok: false, issues: [{ path: [], message: "captions file is larger than 20 MB" }] };
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ path: [], message: `invalid JSON: ${reason}` }] };
  }
  const result = z.array(CaptionSchema).max(MAX_CAPTIONS).safeParse(data);
  if (result.success) return { ok: true, captions: result.data };
  const issues = result.error.issues.slice(0, 10).map((i) => {
    const path = i.path.filter((p): p is string | number => typeof p !== "symbol");
    const expected = path.length === 0 ? " (expected an array of { text, startMs, endMs })" : "";
    return { path, message: `${i.message}${expected}` };
  });
  return { ok: false, issues };
}
