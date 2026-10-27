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
export const THEME_NAMES = ["dark", "light"] as const;
/** Colors a custom theme can override. */
export const THEME_COLORS = [
  "background",
  "node",
  "nodeBorder",
  "text",
  "mutedText",
  "edge",
  "packet",
  "packetText",
  "groupFill",
  "groupBorder",
  "danger",
  "highlight",
  "captionFill",
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];
export const STEP_KINDS = ["reveal", "flow", "highlight", "fail", "pause"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

// H.264/yuv420p (Remotion's default codec) needs even dimensions.
const MAX_DIMENSION = 7680;
const MAX_FPS = 60;
// Bounds keep validation cheap on hostile input and specs renderable.
const MAX_ID_LENGTH = 64;
const MAX_TEXT_LENGTH = 200;
const MAX_NODES = 500;
const MAX_GROUPS = 100;
const MAX_EDGES = 2000;
const MAX_STEPS = 2000;
const MAX_PATH_LENGTH = 500;
export const MAX_STEP_MS = 60_000;

const Id = z
  .string()
  .max(MAX_ID_LENGTH)
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
  .refine((ms) => ms <= MAX_STEP_MS, `must be at most ${MAX_STEP_MS / 1000}s`)
  .meta({ description: 'Seconds as a number, or a string like "1.2s" or "500ms"' });

const Text = z.string().min(1).max(MAX_TEXT_LENGTH);

// Hex only: CSS functions like url() would let a spec fetch remote resources mid-render.
const Color = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
    'must be a hex color like "#38bdf8" or "#38bdf880"',
  );

const colorShape = Object.fromEntries(THEME_COLORS.map((k) => [k, Color.optional()])) as Record<
  ThemeColor,
  z.ZodOptional<typeof Color>
>;

export const CustomTheme = z.strictObject({
  base: z.enum(THEME_NAMES).default("dark").meta({ description: "Theme to start from" }),
  colors: z.strictObject(colorShape).default({}).meta({ description: "Hex color overrides" }),
});

/** A file next to the spec. Must stay inside the spec's folder. */
const RelativePath = z
  .string()
  .min(1)
  .max(MAX_PATH_LENGTH)
  .refine((p) => !/^(?:[\\/]|[A-Za-z]:)/.test(p), "must be a relative path")
  .refine(
    (p) => !p.split(/[\\/]/).includes(".."),
    'must not contain ".." (files must be inside the spec\'s folder)',
  );

export const VoiceoverSchema = z
  .strictObject({
    captions: RelativePath.meta({
      description: "Word timestamps: a JSON array of { text, startMs, endMs } (Remotion Caption)",
    }),
    audio: RelativePath.optional().meta({ description: "Narration audio (mp3, wav, m4a, …)" }),
  })
  .meta({ description: "Narration that steps can anchor to with `at`" });

const Dimension = z
  .int()
  .positive()
  .max(MAX_DIMENSION)
  .multipleOf(2, "must be even (H.264 video requires even dimensions)");

export const NodeSchema = z.strictObject({
  id: Id,
  label: Text.optional().meta({ description: "Display text; defaults to id" }),
  icon: z.enum(ICONS).optional(),
  group: Id.optional().meta({ description: "Id of the group this node sits in" }),
  position: z
    .strictObject({ x: z.number(), y: z.number() })
    .optional()
    .meta({ description: "Manual position override in canvas pixels; skips auto-layout" }),
});

export const GroupSchema = z.strictObject({
  id: Id,
  label: Text.optional(),
});

export const EdgeSchema = z.strictObject({
  from: Id,
  to: Id,
  label: Text.optional(),
});

const stepDuration = Duration.optional().meta({
  description: "How long this step plays; defaults per step kind",
});

const stepAt = Text.optional().meta({
  description: "Start this step when the phrase is spoken in the voiceover",
});

export const RevealStep = z.strictObject({
  reveal: z.array(Id).min(1).max(MAX_NODES).meta({ description: "Node or group ids to fade in" }),
  duration: stepDuration,
  at: stepAt,
});

export const FlowStep = z.strictObject({
  flow: z.strictObject({
    from: Id,
    to: Id,
    label: Text.optional(),
  }),
  duration: stepDuration,
  at: stepAt,
});

export const HighlightStep = z.strictObject({
  highlight: z.strictObject({
    nodes: z.array(Id).min(1).max(MAX_NODES).meta({ description: "Node or group ids" }),
    caption: Text.optional(),
  }),
  duration: stepDuration,
  at: stepAt,
});

export const FailStep = z.strictObject({
  fail: z.strictObject({
    node: Id.meta({ description: "Node or group id" }),
    effect: z.enum(FAIL_EFFECTS).default("shake"),
    label: Text.optional(),
  }),
  duration: stepDuration,
  at: stepAt,
});

export const PauseStep = z.strictObject({
  pause: Duration,
  at: stepAt,
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
    $schema: z.string().optional().meta({ description: "JSON Schema URL, for editors" }),
    version: z.literal(1),
    theme: z
      .union([z.enum(THEME_NAMES), CustomTheme])
      .default("dark")
      .meta({ description: '"dark", "light", or { base, colors } to override colors' }),
    canvas: z
      .strictObject({
        width: Dimension.default(1920),
        height: Dimension.default(1080),
        fps: z.int().positive().max(MAX_FPS).default(30),
      })
      .default({ width: 1920, height: 1080, fps: 30 }),
    nodes: z.array(NodeSchema).min(1).max(MAX_NODES),
    groups: z.array(GroupSchema).max(MAX_GROUPS).default([]),
    edges: z.array(EdgeSchema).max(MAX_EDGES).default([]),
    steps: z.array(StepSchema).max(MAX_STEPS).default([]),
    voiceover: VoiceoverSchema.optional(),
  })
  .meta({ title: "archreel spec", description: "Declarative architecture explainer video" });

export type Spec = z.output<typeof SpecSchema>;
export type SpecInput = z.input<typeof SpecSchema>;
export type Step = z.output<typeof StepSchema>;
export type ThemeSpec = Spec["theme"];

/** Identity helper for authoring specs in TypeScript with editor completion. */
export const defineSpec = (spec: SpecInput): SpecInput => spec;
