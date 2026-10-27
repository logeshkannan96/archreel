import { readFile, stat, writeFile } from "node:fs/promises";
import { fromMermaid } from "@archreel/mermaid";
import { MAX_SPEC_BYTES, SCHEMA_ID, stringifySpec } from "@archreel/schema";

/** Starter spec: small, commented, and exercising each step kind once. */
const TEMPLATE = `# yaml-language-server: $schema=${SCHEMA_ID}
# Preview with \`archreel preview <this file>\`; it reloads on save.
version: 1
theme: dark

nodes:
  - { id: client, label: Client, icon: user }
  - { id: api, label: API, icon: server, group: backend }
  - { id: cache, label: Cache, icon: redis, group: backend }
  - { id: db, label: Database, icon: postgres, group: backend }

groups:
  - { id: backend, label: Backend }

edges:
  - { from: client, to: api }
  - { from: api, to: cache }
  - { from: api, to: db }

# Steps play in order. Nodes appear when a step first mentions them.
steps:
  - reveal: [client]
  - flow: { from: client, to: api, label: GET /items }
  - flow: { from: api, to: cache }
  - fail: { node: cache, label: cache miss }
  - flow: { from: api, to: db, label: SELECT }
  - highlight: { nodes: [db], caption: The database is the source of truth }
  - flow: { from: api, to: client, label: 200 OK }
`;

export interface InitOptions {
  from?: string | undefined;
  force?: boolean | undefined;
  log: (line: string) => void;
}

/** Writes a starter spec, or converts a Mermaid flowchart. Never overwrites unless forced. */
export async function init(file: string, { from, force, log }: InitOptions): Promise<number> {
  let content = TEMPLATE;
  if (from !== undefined) {
    let source: string;
    try {
      if ((await stat(from)).size > MAX_SPEC_BYTES) {
        log(`${from}: larger than ${MAX_SPEC_BYTES / 1_000_000} MB`);
        return 1;
      }
      source = await readFile(from, "utf8");
    } catch (err) {
      log(
        `${from}: cannot read file (${err instanceof Error && "code" in err ? String(err.code) : String(err)})`,
      );
      return 1;
    }
    const result = fromMermaid(source);
    if (!result.ok) {
      for (const i of result.issues) log(`${i.line > 0 ? `${from}:${i.line}` : from} ${i.message}`);
      return 1;
    }
    for (const w of result.warnings) log(`${from}:${w.line} warning: ${w.message}`);
    content = `# Imported from ${from}\n${stringifySpec(result.spec)}`;
  }
  try {
    // "wx" fails if the file exists, without a check-then-write race.
    await writeFile(file, content, { flag: force ? "w" : "wx" });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "EEXIST") {
      log(`${file} already exists; pass --force to overwrite it`);
      return 1;
    }
    throw err;
  }
  log(`✓ wrote ${file}\n  next: archreel preview ${file}`);
  return 0;
}
