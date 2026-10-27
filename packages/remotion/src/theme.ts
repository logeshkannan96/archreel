import type { ThemeColor, ThemeSpec } from "@archreel/schema";

export type Theme = Record<ThemeColor, string>;

export const THEMES = {
  dark: {
    background: "radial-gradient(ellipse at 50% 40%, #1e293b 0%, #0b1120 75%)",
    node: "#162032",
    nodeBorder: "#334155",
    text: "#e2e8f0",
    mutedText: "#94a3b8",
    edge: "#64748b",
    packet: "#38bdf8",
    packetText: "#0b1120",
    groupFill: "rgba(148, 163, 184, 0.06)",
    groupBorder: "#475569",
    danger: "#f87171",
    highlight: "#facc15",
    captionFill: "rgba(15, 23, 42, 0.92)",
  },
  light: {
    background: "#ffffff",
    node: "#ffffff",
    nodeBorder: "#cbd5e1",
    text: "#0f172a",
    mutedText: "#475569",
    edge: "#94a3b8",
    packet: "#0284c7",
    packetText: "#ffffff",
    groupFill: "#eaf5fc",
    groupBorder: "#a8cbe3",
    danger: "#dc2626",
    highlight: "#f59e0b",
    captionFill: "rgba(255, 255, 255, 0.95)",
  },
} as const satisfies Record<string, Theme>;

/** A built-in theme, or a built-in with a custom theme's overrides applied. */
export function resolveTheme(spec: ThemeSpec): Theme {
  if (typeof spec === "string") return THEMES[spec];
  const overrides = Object.entries(spec.colors).filter(([, v]) => v !== undefined);
  return { ...THEMES[spec.base], ...Object.fromEntries(overrides) };
}

/** Icon accent colors; readable on both themes. */
export const ACCENTS: Record<string, string> = {
  user: "#a78bfa",
  server: "#60a5fa",
  database: "#34d399",
  postgres: "#34d399",
  cache: "#fb7185",
  redis: "#fb7185",
  queue: "#fbbf24",
  kafka: "#fbbf24",
  "aws/alb": "#fb923c",
  "aws/s3": "#fb923c",
  "k8s/pod": "#818cf8",
};
export const DEFAULT_ACCENT = "#60a5fa";

/** Icon-style badge fills: deeper than ACCENTS so a white glyph reads on them. */
export const BADGES: Record<string, string> = {
  user: "#7c3aed",
  server: "#2563eb",
  database: "#059669",
  postgres: "#0f766e",
  cache: "#e11d48",
  redis: "#dc2626",
  queue: "#d97706",
  kafka: "#b45309",
  "aws/alb": "#ea580c",
  "aws/s3": "#c2410c",
  "k8s/pod": "#326ce5",
};
export const DEFAULT_BADGE = "#2563eb";
