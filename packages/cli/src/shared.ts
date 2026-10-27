import { copyFile, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SceneError, buildScene, type Scene } from "@archreel/layout";
import {
  MAX_CAPTIONS_BYTES,
  MAX_SPEC_BYTES,
  formatIssues,
  loadCaptions,
  loadSpec,
  locateIssues,
  type Caption,
  type Issue,
  type Spec,
} from "@archreel/schema";

/** The Remotion bundle entry that registers the archreel composition. */
export const ENTRY_POINT = fileURLToPath(import.meta.resolve("@archreel/remotion/entry"));

export const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const plural = (n: number): string => `${n} problem${n === 1 ? "" : "s"}`;

/** Reads a file with a size cap. Undefined (and a printed error) if unreadable. */
async function readText(file: string, maxBytes: number): Promise<string | undefined> {
  try {
    // Check size before reading so a huge file can't exhaust memory.
    if ((await stat(file)).size > maxBytes) {
      log(`${file}: larger than ${maxBytes / 1_000_000} MB`);
      return undefined;
    }
    return await readFile(file, "utf8");
  } catch (err) {
    log(`${file}: cannot read file (${errorCode(err)})`);
    return undefined;
  }
}

const errorCode = (err: unknown): string =>
  err instanceof Error && "code" in err ? String(err.code) : String(err);

/** Reads and validates a spec file, printing problems. Undefined if unusable. */
export async function readSpec(file: string): Promise<Spec | undefined> {
  const source = await readText(file, MAX_SPEC_BYTES);
  if (source === undefined) return undefined;
  const result = loadSpec(source);
  if (result.ok) return result.spec;
  log(formatIssues(file, result.issues));
  log(`✗ ${file} — ${plural(result.issues.length)}`);
  return undefined;
}

export interface Project {
  spec: Spec;
  scene: Scene;
  /** Absolute path of the narration audio, if any; the scene refers to it as `scene.audio`. */
  audioFile?: string | undefined;
}

/**
 * Reads a spec and its voiceover files and lays it out. Problems (including
 * unmatched `at` phrases) are printed with locations; undefined if unusable.
 */
export async function readProject(file: string): Promise<Project | undefined> {
  const spec = await readSpec(file);
  if (!spec) return undefined;
  const dir = dirname(file);
  const report = async (issues: Issue[]): Promise<undefined> => {
    const source = (await readText(file, MAX_SPEC_BYTES)) ?? "";
    log(formatIssues(file, locateIssues(source, issues)));
    log(`✗ ${file} — ${plural(issues.length)}`);
    return undefined;
  };

  let captions: Caption[] | undefined;
  let audioFile: string | undefined;
  if (spec.voiceover) {
    // The schema guarantees both paths are relative and stay inside `dir`.
    const captionsFile = join(dir, spec.voiceover.captions);
    const source = await readText(captionsFile, MAX_CAPTIONS_BYTES);
    if (source === undefined) return undefined;
    const result = loadCaptions(source);
    if (!result.ok) {
      log(formatIssues(captionsFile, result.issues));
      log(`✗ ${captionsFile} — ${plural(result.issues.length)}`);
      return undefined;
    }
    captions = result.captions;
    if (spec.voiceover.audio !== undefined) {
      audioFile = join(dir, spec.voiceover.audio);
      try {
        await stat(audioFile);
      } catch (err) {
        return report([
          { path: ["voiceover", "audio"], message: `cannot read ${audioFile} (${errorCode(err)})` },
        ]);
      }
    }
  }

  try {
    const audio = audioFile === undefined ? undefined : audioName(audioFile);
    return { spec, scene: await buildScene(spec, { captions, audio }), audioFile };
  } catch (err) {
    if (err instanceof SceneError) return report(err.issues);
    throw err;
  }
}

const audioName = (file: string): string => `voiceover${extname(file).toLowerCase()}`;

/**
 * Remotion serves media from a public dir. Copy only the narration there, so
 * a render never exposes the rest of the spec's folder to the browser.
 */
export async function publicDirFor(audioFile: string | undefined): Promise<string | undefined> {
  if (audioFile === undefined) return undefined;
  const dir = await mkdtemp(join(tmpdir(), "archreel-public-"));
  await copyFile(audioFile, join(dir, audioName(audioFile)));
  return dir;
}
