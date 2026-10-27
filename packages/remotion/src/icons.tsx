import type { ReactNode } from "react";

/**
 * Built-in glyphs: original, generic line drawings on a 24×24 grid.
 * They suggest a kind of component; none reproduces a vendor's logo.
 */
const db = (
  <>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </>
);

const GLYPHS: Record<string, ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" />
    </>
  ),
  database: db,
  postgres: (
    <>
      {db}
      <path d="M12 15v7" />
    </>
  ),
  cache: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  redis: (
    <>
      <path d="M12 3 21 7.5 12 12 3 7.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  queue: (
    <>
      <rect x="2" y="8" width="5" height="8" rx="1" />
      <rect x="9.5" y="8" width="5" height="8" rx="1" />
      <rect x="17" y="8" width="5" height="8" rx="1" />
    </>
  ),
  kafka: (
    <>
      <path d="M3 6h14M3 12h18M3 18h12" />
      <path d="m17 3 3 3-3 3M15 15l3 3-3 3" />
    </>
  ),
  "aws/alb": (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M12 7.5v7M12 9.5 5 15M12 9.5l7 5.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
    </>
  ),
  "aws/s3": (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="2.5" />
      <path d="M4 6l2 13c.3 1.7 2.9 3 6 3s5.7-1.3 6-3l2-13" />
    </>
  ),
  "k8s/pod": (
    <>
      <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v10" />
    </>
  ),
};

export function Icon({ name, size, color }: { name: string; size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name] ?? GLYPHS.server}
    </svg>
  );
}
