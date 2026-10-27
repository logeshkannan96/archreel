import { z } from "zod";
import { SpecSchema } from "./spec.js";

export const SCHEMA_ID = "https://unpkg.com/@archreel/schema/archreel.schema.json";

/** JSON Schema for spec *input* (what users and LLMs write), for editors and tool calls. */
export function specJsonSchema(): Record<string, unknown> {
  return {
    $id: SCHEMA_ID,
    ...z.toJSONSchema(SpecSchema, { io: "input", target: "draft-2020-12" }),
  };
}
