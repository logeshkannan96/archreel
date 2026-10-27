#!/usr/bin/env node
import { parseArgs } from "node:util";
import { buildScene } from "@archreel/layout";
import { log, readSpec } from "./shared.js";

const USAGE = `Usage: archreel <command> [options]

Commands:
  validate <file...>        Check specs and report problems with file:line:col
  render <file> -o <out>    Render to MP4, or GIF if <out> ends in .gif
  preview <file>            Open Remotion Studio; reloads when the spec changes
  init [file]               Write a starter spec (default: archreel.yaml)

Options:
  -o, --out <path>          Output file for render (default: <file>.mp4)
      --scale <n>           Output scale for render (default: 1, or 0.5 for GIF)
      --from <diagram.mmd>  For init: convert a Mermaid flowchart instead
      --force               For init: overwrite an existing file
  -h, --help                Show this help`;

const EXIT_INVALID = 1;
const EXIT_USAGE = 2;

async function validate(files: string[]): Promise<number> {
  if (files.length === 0) return usage("validate: expected at least one spec file");
  let failed = 0;
  for (const file of files) {
    const spec = await readSpec(file);
    if (spec) {
      const { nodes, edges, steps } = spec;
      process.stdout.write(
        `✓ ${file} — ${nodes.length} nodes, ${edges.length} edges, ${steps.length} steps\n`,
      );
    } else {
      failed++;
    }
  }
  return failed > 0 ? EXIT_INVALID : 0;
}

async function render(
  file: string | undefined,
  out: string | undefined,
  scale: string | undefined,
): Promise<number> {
  if (file === undefined) return usage("render: expected a spec file");
  const parsedScale = scale === undefined ? undefined : Number(scale);
  if (parsedScale !== undefined && !(parsedScale > 0 && parsedScale <= 4)) {
    return usage(`render: --scale must be a number in (0, 4], got "${scale ?? ""}"`);
  }
  const spec = await readSpec(file);
  if (!spec) return EXIT_INVALID;
  const target = out ?? file.replace(/\.(ya?ml|json)$/i, "") + ".mp4";
  // Loaded lazily: Remotion's renderer is heavy and `validate` doesn't need it.
  const { renderScene } = await import("./render.js");
  await renderScene(await buildScene(spec), { out: target, scale: parsedScale, log });
  log(`✓ wrote ${target}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        out: { type: "string", short: "o" },
        scale: { type: "string" },
        from: { type: "string" },
        force: { type: "boolean" },
      },
    });
  } catch (err) {
    return usage(err instanceof Error ? err.message : String(err));
  }
  const { positionals, values } = parsed;
  const [command, ...rest] = positionals;
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  switch (command) {
    case undefined:
      process.stdout.write(`${USAGE}\n`);
      return EXIT_USAGE;
    case "validate":
      return validate(rest);
    case "render":
      return render(rest[0], values.out, values.scale);
    case "preview": {
      if (rest[0] === undefined) return usage("preview: expected a spec file");
      const { preview } = await import("./preview.js");
      return preview(rest[0], log);
    }
    case "init": {
      const { init } = await import("./init.js");
      return init(rest[0] ?? "archreel.yaml", { from: values.from, force: values.force, log });
    }
    default:
      return usage(`unknown command "${command}"`);
  }
}

function usage(message: string): number {
  log(`archreel: ${message}\n\n${USAGE}`);
  return EXIT_USAGE;
}

process.exitCode = await main(process.argv.slice(2)).catch((err: unknown) => {
  log(`archreel: ${err instanceof Error ? err.message : String(err)}`);
  return EXIT_INVALID;
});
