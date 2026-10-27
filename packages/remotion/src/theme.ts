export interface Theme {
  background: string;
  node: string;
  nodeBorder: string;
  text: string;
  mutedText: string;
  edge: string;
  packet: string;
  packetText: string;
  groupFill: string;
  groupBorder: string;
  danger: string;
  highlight: string;
  captionFill: string;
}

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
    background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef2f7 80%)",
    node: "#ffffff",
    nodeBorder: "#cbd5e1",
    text: "#0f172a",
    mutedText: "#475569",
    edge: "#94a3b8",
    packet: "#0284c7",
    packetText: "#ffffff",
    groupFill: "rgba(59, 130, 246, 0.05)",
    groupBorder: "#93c5fd",
    danger: "#dc2626",
    highlight: "#f59e0b",
    captionFill: "rgba(255, 255, 255, 0.95)",
  },
} as const satisfies Record<string, Theme>;

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
