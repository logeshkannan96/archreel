// Regenerates archreel.schema.json from the built zod schema.
import { writeFileSync } from "node:fs";
import { URL } from "node:url";
import { specJsonSchema } from "../dist/index.js";

const out = new URL("../archreel.schema.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(specJsonSchema(), null, 2)}\n`);
