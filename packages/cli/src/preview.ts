import { spawn } from "node:child_process";
import { unwatchFile, watchFile } from "node:fs";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Scene } from "@archreel/layout";
import { ENTRY_POINT, readScene } from "./shared.js";

const POLL_MS = 300;

/**
 * Starts Remotion Studio on the archreel composition. Studio hot-reloads its
 * --props file, so we rewrite that file whenever the spec changes and is valid.
 */
export async function preview(file: string, log: (line: string) => void): Promise<number> {
  const scene = await readScene(file);
  if (!scene) return 1;

  const tmp = await mkdtemp(join(tmpdir(), "archreel-"));
  const propsFile = join(tmp, "props.json");
  const writeProps = async (s: Scene): Promise<void> => {
    // Write-then-rename so Studio never reads a half-written file.
    const partial = `${propsFile}.tmp`;
    await writeFile(partial, JSON.stringify({ scene: s }));
    await rename(partial, propsFile);
  };
  await writeProps(scene);

  // The bin isn't in @remotion/cli's exports map; locate it via package.json.
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@remotion/cli/package.json");
  const pkg = require(pkgPath) as { bin: { remotion: string } };
  const remotionCli = join(dirname(pkgPath), pkg.bin.remotion);
  // --force-new: an already-running Studio would ignore this props file.
  const studio = spawn(
    process.execPath,
    [remotionCli, "studio", ENTRY_POINT, `--props=${propsFile}`, "--force-new", "--no-open"],
    {
      stdio: "inherit",
    },
  );

  // Polling survives editors that save by replacing the file.
  watchFile(file, { interval: POLL_MS }, () => {
    void readScene(file).then(async (next) => {
      if (next) {
        await writeProps(next);
        log(`↻ ${file} reloaded`);
      }
    });
  });

  return new Promise((resolve) => {
    // Pass signals on and wait for Studio, so it isn't orphaned and cleanup below runs.
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => studio.kill(signal));
    }
    studio.on("exit", (code) => {
      unwatchFile(file);
      void rm(tmp, { recursive: true, force: true }).then(() => {
        resolve(code ?? 0);
      });
    });
  });
}
