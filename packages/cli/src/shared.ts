import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MAX_SPEC_BYTES, formatIssues, loadSpec, type Spec } from "@archreel/schema";

/** The Remotion bundle entry that registers the archreel composition. */
export const ENTRY_POINT = fileURLToPath(import.meta.resolve("@archreel/remotion/entry"));

export const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/** Reads and validates a spec file, printing problems. Undefined if unusable. */
export async function readSpec(file: string): Promise<Spec | undefined> {
  let source: string;
  try {
    // Check size before reading so a huge file can't exhaust memory.
    if ((await stat(file)).size > MAX_SPEC_BYTES) {
      log(`${file}: larger than ${MAX_SPEC_BYTES / 1_000_000} MB`);
      return undefined;
    }
    source = await readFile(file, "utf8");
  } catch (err) {
    const reason = err instanceof Error && "code" in err ? String(err.code) : String(err);
    log(`${file}: cannot read file (${reason})`);
    return undefined;
  }
  const result = loadSpec(source);
  if (result.ok) return result.spec;
  const n = result.issues.length;
  log(formatIssues(file, result.issues));
  log(`✗ ${file} — ${n} problem${n === 1 ? "" : "s"}`);
  return undefined;
}
