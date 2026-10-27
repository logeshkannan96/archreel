#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { formatIssues, loadSpec } from "@archreel/schema";

const USAGE = `Usage: archreel <command> [options]

Commands:
  validate <file...>   Check specs and report problems with file:line:col

Options:
  -h, --help           Show this help`;

const EXIT_INVALID = 1;
const EXIT_USAGE = 2;

async function validate(files: string[]): Promise<number> {
  if (files.length === 0) {
    process.stderr.write(`archreel validate: expected at least one spec file\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }
  let failed = 0;
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (err) {
      const reason = err instanceof Error && "code" in err ? String(err.code) : String(err);
      process.stderr.write(`${file}: cannot read file (${reason})\n`);
      failed++;
      continue;
    }
    const result = loadSpec(source);
    if (result.ok) {
      const { nodes, edges, steps } = result.spec;
      process.stdout.write(
        `✓ ${file} — ${nodes.length} nodes, ${edges.length} edges, ${steps.length} steps\n`,
      );
    } else {
      failed++;
      const n = result.issues.length;
      process.stderr.write(`${formatIssues(file, result.issues)}\n`);
      process.stderr.write(`✗ ${file} — ${n} problem${n === 1 ? "" : "s"}\n`);
    }
  }
  return failed > 0 ? EXIT_INVALID : 0;
}

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { help: { type: "boolean", short: "h" } },
  });
  const [command, ...rest] = positionals;
  if (values.help || command === undefined) {
    process.stdout.write(`${USAGE}\n`);
    return command === undefined && !values.help ? EXIT_USAGE : 0;
  }
  if (command === "validate") return validate(rest);
  process.stderr.write(`archreel: unknown command "${command}"\n\n${USAGE}\n`);
  return EXIT_USAGE;
}

process.exitCode = await main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`archreel: ${err instanceof Error ? err.message : String(err)}\n`);
  return EXIT_USAGE;
});
