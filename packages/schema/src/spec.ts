import { z } from "zod";

/** Built-in icon glyphs. Generic shapes, not brand logos. */
export const ICONS = [
  "user",
  "server",
  "database",
  "cache",
  "queue",
  "aws/alb",
  "aws/s3",
  "k8s/pod",
  "redis",
  "postgres",
  "kafka",
] as const;

export const FAIL_EFFECTS = ["shake", "flash"] as const;
export const STEP_KINDS = ["reveal", "flow", "highlight", "fail", "pause"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

// H.264/yuv420p (Remotion's default codec) needs even dimensions.
const MAX_DIMENSION = 7680;
const MAX_FPS = 60;

const Id = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    "must start with a letter and contain only letters, digits, - or _",
  )
  .meta({ description: "Identifier referenced by edges and steps" });

const DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s)$/;

/** Seconds as a number, or a string like "1.2s" / "500ms". Parsed to milliseconds. */
export const Duration = z
  .union([
    z.number().positive(),
    z.string().regex(DURATION_RE, 'must be a duration like "1.2s" or "500ms"'),
  ])
  .transform((v) => {
    if (typeof v === "number") return v * 1000;
    const [, amount = "0", unit] = DURATION_RE.exec(v) ?? [];
    return unit === "ms" ? Number(amount) : Number(amount) * 1000;
  })
  .refine((ms) => ms > 0, "must be greater than 0")
  .meta({ description: 'Seconds as a number, or a string like "1.2s" or "500ms"' });

const Dimension = z
  .int()
  .positive()
  .max(MAX_DIMENSION)
  .multipleOf(2, "must be even (H.264 video requires even dimensions)");

export const NodeSchema = z.strictObject({
  id: Id,
  label: z.string().min(1).optional().meta({ description: "Display text; defaults to id" }),
  icon: z.enum(ICONS).optional(),
  group: Id.optional().meta({ description: "Id of the group this node sits in" }),
  position: z
    .strictObject({ x: z.number(), y: z.number() })
    .optional()
    .meta({ description: "Manual position override in canvas pixels; skips auto-layout" }),
});

export const GroupSchema = z.strictObject({
  id: Id,
  label: z.string().min(1).optional(),
});

export const EdgeSchema = z.strictObject({
  from: Id,
  to: Id,
  label: z.string().min(1).optional(),
});

const stepDuration = Duration.optional().meta({
  description: "How long this step plays; defaults per step kind",
});

export const RevealStep = z.strictObject({
  reveal: z.array(Id).min(1).meta({ description: "Node or group ids to fade in" }),
  duration: stepDuration,
});

export const FlowStep = z.strictObject({
  flow: z.strictObject({
    from: Id,
    to: Id,
    label: z.string().min(1).optional(),
  }),
  duration: stepDuration,
});

export const HighlightStep = z.strictObject({
  highlight: z.strictObject({
    nodes: z.array(Id).min(1),
    caption: z.string().min(1).optional(),
  }),
  duration: stepDuration,
});

export const FailStep = z.strictObject({
  fail: z.strictObject({
    node: Id,
    effect: z.enum(FAIL_EFFECTS).default("shake"),
    label: z.string().min(1).optional(),
  }),
  duration: stepDuration,
});

export const PauseStep = z.strictObject({
  pause: Duration,
});

/** One schema per step kind, keyed by the kind's action key. */
export const STEP_SCHEMAS = {
  reveal: RevealStep,
  flow: FlowStep,
  highlight: HighlightStep,
  fail: FailStep,
  pause: PauseStep,
} as const satisfies Record<StepKind, z.ZodType>;

export const StepSchema = z.union([RevealStep, FlowStep, HighlightStep, FailStep, PauseStep]);

export const SpecSchema = z
  .strictObject({
    version: z.literal(1),
    theme: z.enum(["dark", "light"]).default("dark"),
    canvas: z
      .strictObject({
        width: Dimension.default(1920),
        height: Dimension.default(1080),
        fps: z.int().positive().max(MAX_FPS).default(30),
      })
      .default({ width: 1920, height: 1080, fps: 30 }),
    nodes: z.array(NodeSchema).min(1),
    groups: z.array(GroupSchema).default([]),
    edges: z.array(EdgeSchema).default([]),
    steps: z.array(StepSchema).default([]),
  })
  .meta({ title: "archreel spec", description: "Declarative architecture explainer video" });

export type Spec = z.output<typeof SpecSchema>;
export type SpecInput = z.input<typeof SpecSchema>;
export type Step = z.output<typeof StepSchema>;

/** Identity helper for authoring specs in TypeScript with editor completion. */
export const defineSpec = (spec: SpecInput): SpecInput => spec;
