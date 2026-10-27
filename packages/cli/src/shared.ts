import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScene, type Scene } from "@archreel/layout";
import { MAX_SPEC_BYTES, formatIssues, loadSpec, type Issue, type Spec } from "@archreel/schema";

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

/** Icon files are logos, not photos. */
const MAX_ICON_BYTES = 1_000_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Reads the icon files a spec declares, as data URIs, so the scene carries them and
 * renders don't depend on serving files. Prints problems; undefined if any.
 */
export async function readIcons(
  file: string,
  spec: Spec,
): Promise<Record<string, string> | undefined> {
  const issues: Issue[] = [];
  const icons: Record<string, string> = {};
  for (const [name, path] of Object.entries(spec.icons ?? {})) {
    // The schema guarantees `path` is relative, without "..", and .svg or .png.
    const at = ["icons", name];
    const full = join(dirname(file), path);
    try {
      if ((await stat(full)).size > MAX_ICON_BYTES) {
        issues.push({ path: at, message: `${path} is larger than 1 MB` });
        continue;
      }
      const bytes = await readFile(full);
      const svg = path.toLowerCase().endsWith(".svg");
      const valid = svg
        ? bytes.toString("utf8").includes("<svg")
        : bytes.subarray(0, 8).equals(PNG_SIGNATURE);
      if (!valid) {
        issues.push({ path: at, message: `${path} is not a valid ${svg ? "SVG" : "PNG"} file` });
        continue;
      }
      icons[name] = `data:image/${svg ? "svg+xml" : "png"};base64,${bytes.toString("base64")}`;
    } catch (err) {
      const reason = err instanceof Error && "code" in err ? String(err.code) : String(err);
      issues.push({ path: at, message: `cannot read ${path} (${reason})` });
    }
  }
  if (issues.length === 0) return icons;
  const n = issues.length;
  log(formatIssues(file, issues));
  log(`✗ ${file} — ${n} problem${n === 1 ? "" : "s"}`);
  return undefined;
}

/** A spec file and its icons, laid out. Problems are printed; undefined if unusable. */
export async function readScene(file: string): Promise<Scene | undefined> {
  const spec = await readSpec(file);
  if (!spec) return undefined;
  const icons = await readIcons(file, spec);
  if (!icons) return undefined;
  return buildScene(spec, { icons });
}
