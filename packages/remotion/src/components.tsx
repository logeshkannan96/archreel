import type { Point, SceneEdge, SceneGroup, SceneNode } from "@archreel/layout";
import { Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Icon } from "./icons.js";
import { ACCENTS, BADGES, DEFAULT_ACCENT, DEFAULT_BADGE, type Theme } from "./theme.js";

// All timing is frame-derived; nothing here may read Math.random or Date.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** A window of frames in which an effect plays on a node or group. */
export interface Effect {
  kind: "highlight" | "fail";
  from: number;
  to: number;
  shake: boolean;
}

/** 0 → 1 → 0 envelope over [from, to] with `ramp` frames on each side. */
function envelope(frame: number, from: number, to: number, ramp: number): number {
  if (frame < from || frame > to) return 0;
  const r = Math.max(1, Math.min(ramp, (to - from) / 2));
  return interpolate(frame, [from, from + r, to - r, to], [0, 1, 1, 0], clamp);
}

function useAppear(appear: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - appear, fps, config: { damping: 16, mass: 0.6 } });
}

interface NodeProps {
  node: SceneNode;
  /** Image for a declared icon (URL or data URI); otherwise the built-in glyph is drawn. */
  src?: string | undefined;
  appear: number;
  effects: readonly Effect[];
  theme: Theme;
  scale: number;
}

/** Frame-derived effect strengths shared by both node styles. */
function useNodeEffects(effects: readonly Effect[], scale: number) {
  const frame = useCurrentFrame();
  const fail = Math.max(
    0,
    ...effects.filter((e) => e.kind === "fail").map((e) => envelope(frame, e.from, e.to, 6)),
  );
  const glow = Math.max(
    0,
    ...effects.filter((e) => e.kind === "highlight").map((e) => envelope(frame, e.from, e.to, 8)),
  );
  const shaking = effects.find((e) => e.shake && frame >= e.from && frame <= e.to);
  const shakeX = shaking
    ? Math.sin((frame - shaking.from) * 1.9) *
      9 *
      scale *
      interpolate(frame, [shaking.from, shaking.from + 20], [1, 0], clamp)
    : 0;
  const pulse = 0.75 + 0.25 * Math.sin(frame / 4);
  return { fail, glow, shaking: shaking !== undefined, shakeX, pulse };
}

/** The icon is the node: a colored badge with a white glyph, label underneath. */
export function IconNode({ node, src, appear, effects, theme, scale }: NodeProps) {
  const shown = useAppear(appear);
  const { fail, glow, shaking, shakeX, pulse } = useNodeEffects(effects, scale);
  const badge = BADGES[node.icon ?? ""] ?? DEFAULT_BADGE;
  const label = (
    <div
      style={{
        position: "absolute",
        top: node.height + 10 * scale,
        left: "50%",
        translate: "-50% 0",
        whiteSpace: "nowrap",
        fontSize: 18 * scale,
        fontWeight: 500,
        color: fail > 0.5 ? theme.danger : theme.text,
      }}
    >
      {node.label}
    </div>
  );
  const frame = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    opacity: shown,
    scale: interpolate(shown, [0, 1], [0.7, 1]),
    translate: `${shakeX}px 0px`,
  } as const;

  if (src !== undefined) {
    // A user's own icon is drawn as-is; effects follow its shape via drop-shadow.
    const shadows = [
      glow > 0 ? `drop-shadow(0 0 ${14 * scale * glow * pulse}px ${theme.highlight})` : "",
      fail > 0 ? `drop-shadow(0 0 ${14 * scale * fail}px ${theme.danger})` : "",
    ].filter(Boolean);
    return (
      <div style={frame}>
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: shadows.length > 0 ? shadows.join(" ") : "none",
          }}
        />
        {label}
      </div>
    );
  }
  return (
    <div style={frame}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: node.width * 0.26,
          background: badge,
          boxShadow: [
            `0 ${4 * scale}px ${14 * scale}px rgba(15, 23, 42, 0.18)`,
            glow > 0 ? `0 0 0 ${5 * scale * glow}px ${theme.highlight}` : "",
            glow > 0 ? `0 0 ${36 * scale * glow * pulse}px ${theme.highlight}` : "",
            fail > 0 ? `0 0 ${36 * scale * fail}px ${theme.danger}` : "",
          ]
            .filter(Boolean)
            .join(", "),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: theme.danger,
            opacity: fail * 0.85 * (shaking ? 1 : pulse),
          }}
        />
        <div style={{ position: "relative", display: "flex" }}>
          <Icon
            name={node.icon ?? "server"}
            size={node.width * 0.56}
            color="#ffffff"
            strokeWidth={1.9}
          />
        </div>
      </div>
      {label}
    </div>
  );
}

export function Node({ node, src, appear, effects, theme, scale }: NodeProps) {
  const shown = useAppear(appear);
  const accent = ACCENTS[node.icon ?? ""] ?? DEFAULT_ACCENT;
  const { fail, glow, shaking, shakeX, pulse } = useNodeEffects(effects, scale);

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        opacity: shown,
        scale: interpolate(shown, [0, 1], [0.7, 1]),
        translate: `${shakeX}px 0px`,
        borderRadius: 18 * scale,
        background: theme.node,
        border: `${2 * scale}px solid ${fail > 0 ? theme.danger : glow > 0 ? theme.highlight : theme.nodeBorder}`,
        boxShadow: [
          `0 ${6 * scale}px ${18 * scale}px rgba(0,0,0,0.25)`,
          glow > 0 ? `0 0 ${40 * scale * glow * pulse}px ${theme.highlight}` : "",
          fail > 0 ? `0 0 ${36 * scale * fail}px ${theme.danger}` : "",
        ]
          .filter(Boolean)
          .join(", "),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10 * scale,
        color: theme.text,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: theme.danger,
          opacity: fail * 0.18 * (shaking ? 1 : pulse),
        }}
      />
      {src === undefined ? (
        <Icon name={node.icon ?? "server"} size={44 * scale} color={accent} />
      ) : (
        <Img src={src} style={{ width: 44 * scale, height: 44 * scale, objectFit: "contain" }} />
      )}
      <div
        style={{
          fontSize: 20 * scale,
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.15,
          padding: `0 ${10 * scale}px`,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {node.label}
      </div>
    </div>
  );
}

export function Group({
  group,
  appear,
  effects,
  theme,
  scale,
  solid = false,
}: {
  /** Solid border (icon style) instead of dashed (card style). */
  solid?: boolean;
  group: SceneGroup;
  appear: number;
  effects: readonly Effect[];
  theme: Theme;
  scale: number;
}) {
  const frame = useCurrentFrame();
  const shown = useAppear(appear);
  const glow = Math.max(0, ...effects.map((e) => envelope(frame, e.from, e.to, 8)));
  const failing = effects.some((e) => e.kind === "fail" && frame >= e.from && frame <= e.to);
  const accent = failing ? theme.danger : theme.highlight;
  return (
    <div
      style={{
        position: "absolute",
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        opacity: shown,
        borderRadius: 24 * scale,
        background: theme.groupFill,
        border: `${(solid ? 1.5 : 2) * scale}px ${solid ? "solid" : "dashed"} ${glow > 0 ? accent : theme.groupBorder}`,
        boxShadow: glow > 0 ? `0 0 ${40 * scale * glow}px ${accent}` : "none",
      }}
    />
  );
}

/**
 * A group's name as a small tag. Drawn after the edges, on a solid background,
 * so edges entering the group (from above, when flowing down) pass behind it.
 */
export function GroupLabel({
  group,
  appear,
  theme,
  scale,
}: {
  group: SceneGroup;
  appear: number;
  theme: Theme;
  scale: number;
}) {
  const shown = useAppear(appear);
  if (group.label === undefined) return null;
  const pad = { x: 8 * scale, y: 3 * scale };
  return (
    <div
      style={{
        position: "absolute",
        left: group.x + 20 * scale - pad.x,
        top: group.y + 14 * scale - pad.y,
        padding: `${pad.y}px ${pad.x}px`,
        borderRadius: 6 * scale,
        background: theme.node,
        opacity: shown,
        fontSize: 17 * scale,
        fontWeight: 700,
        letterSpacing: 1.5 * scale,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        color: theme.mutedText,
      }}
    >
      {group.label}
    </div>
  );
}

export function EdgeArrowDefs({ theme }: { theme: Theme }) {
  return (
    <defs>
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0 0 10 5 0 10z" fill={theme.edge} />
      </marker>
    </defs>
  );
}

export function Edge({
  edge,
  appear,
  theme,
  scale,
}: {
  edge: SceneEdge;
  appear: number;
  theme: Theme;
  scale: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drawn = interpolate(frame, [appear, appear + 0.5 * fps], [0, 1], {
    ...clamp,
    easing: EASE,
  });
  if (drawn === 0) return null;
  return (
    <g>
      <path
        d={toPath(edge.points)}
        fill="none"
        stroke={theme.edge}
        strokeWidth={2.5 * scale}
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - drawn}
        markerEnd={drawn > 0.95 ? "url(#arrow)" : undefined}
      />
      {edge.label === undefined ? null : (
        <Pill
          at={edge.label}
          text={edge.label.text}
          opacity={drawn}
          color={theme.mutedText}
          fill={theme.node}
          border={theme.nodeBorder}
          scale={scale * 0.85}
        />
      )}
    </g>
  );
}

/** A packet travelling an edge. Frame 0 is the start of the travel. */
export function Packet({
  edge,
  reversed,
  label,
  frames,
  theme,
  scale,
}: {
  edge: SceneEdge;
  reversed: boolean;
  label?: string | undefined;
  frames: number;
  theme: Theme;
  scale: number;
}) {
  const frame = useCurrentFrame();
  const points = reversed ? [...edge.points].reverse() : edge.points;
  const travel = Math.max(1, Math.round(frames * 0.8));
  const t = interpolate(frame, [0, travel], [0, 1], {
    ...clamp,
    easing: Easing.inOut((n) => Easing.cubic(n)),
  });
  const fade = interpolate(frame, [0, 4, travel, frames], [0, 1, 1, 0], clamp);
  const head = pointAt(points, t);
  const r = 11 * scale;
  return (
    <g opacity={fade}>
      <path
        d={toPath([...trail(points, t), head])}
        fill="none"
        stroke={theme.packet}
        strokeWidth={4 * scale}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.55}
      />
      <circle cx={head.x} cy={head.y} r={r * 2.2} fill={theme.packet} opacity={0.18} />
      <circle cx={head.x} cy={head.y} r={r} fill={theme.packet} />
      {label === undefined ? null : (
        <Pill
          at={{ x: head.x, y: head.y - 34 * scale }}
          text={label}
          opacity={1}
          color={theme.packetText}
          fill={theme.packet}
          border={theme.packet}
          scale={scale}
        />
      )}
    </g>
  );
}

/** Badge above a failing node or group. Frame 0 is the start of the effect. */
export function Callout({
  target,
  text,
  frames,
  theme,
  scale,
}: {
  target: { x: number; y: number; width: number };
  text: string;
  frames: number;
  theme: Theme;
  scale: number;
}) {
  const frame = useCurrentFrame();
  const shown = envelope(frame, 0, frames, 8);
  return (
    <div
      style={{
        position: "absolute",
        left: target.x + target.width / 2,
        top: target.y - 14 * scale,
        translate: `-50% ${-100 + (1 - shown) * 20}%`,
        opacity: shown,
        background: theme.danger,
        color: "#ffffff",
        fontSize: 18 * scale,
        fontWeight: 700,
        padding: `${6 * scale}px ${14 * scale}px`,
        borderRadius: 999,
        whiteSpace: "nowrap",
        boxShadow: `0 ${4 * scale}px ${14 * scale}px rgba(0,0,0,0.3)`,
      }}
    >
      {text}
    </div>
  );
}

/** Caption in the band below the diagram. Frame 0 is the start of the step. */
/** Bottom-centered text band, sized by the diagram (not the host composition). */
export function Caption({
  text,
  frames,
  theme,
  area,
}: {
  text: string;
  frames: number;
  theme: Theme;
  area: { width: number; height: number; captionBottom: number };
}) {
  const frame = useCurrentFrame();
  const { width, height, captionBottom } = area;
  const shown = envelope(frame, 0, frames, 8);
  const unit = Math.min(width, height) / 1080;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: captionBottom,
        translate: `-50% ${(1 - shown) * 30}px`,
        opacity: shown,
        maxWidth: width * 0.8,
        background: theme.captionFill,
        color: theme.text,
        border: `${2 * unit}px solid ${theme.highlight}`,
        fontSize: 34 * unit,
        fontWeight: 600,
        padding: `${16 * unit}px ${34 * unit}px`,
        borderRadius: 18 * unit,
        textAlign: "center",
        boxShadow: `0 ${8 * unit}px ${30 * unit}px rgba(0,0,0,0.3)`,
      }}
    >
      {text}
    </div>
  );
}

function Pill({
  at,
  text,
  opacity,
  color,
  fill,
  border,
  scale,
}: {
  at: Point;
  text: string;
  opacity: number;
  color: string;
  fill: string;
  border: string;
  scale: number;
}) {
  return (
    <foreignObject
      x={at.x - 300}
      y={at.y - 30 * scale}
      width={600}
      height={60 * scale}
      opacity={opacity}
    >
      <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}
      >
        <span
          style={{
            background: fill,
            color,
            fontSize: 17 * scale,
            fontWeight: 700,
            padding: `${4 * scale}px ${12 * scale}px`,
            border: `${1.5 * scale}px solid ${border}`,
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </span>
      </div>
    </foreignObject>
  );
}

// ---------------------------------------------------------------------------
// polyline geometry

const toPath = (points: readonly Point[]): string =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The point at fraction `t` of the polyline's length. */
export function pointAt(points: readonly Point[], t: number): Point {
  const first = points[0] ?? { x: 0, y: 0 };
  const total = points.slice(1).reduce((sum, p, i) => sum + dist(points[i] ?? p, p), 0);
  let remaining = t * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] ?? first;
    const b = points[i] ?? a;
    const d = dist(a, b);
    if (remaining <= d && d > 0) {
      return { x: a.x + ((b.x - a.x) * remaining) / d, y: a.y + ((b.y - a.y) * remaining) / d };
    }
    remaining -= d;
  }
  return points.at(-1) ?? first;
}

/** Vertices of the polyline already passed at fraction `t`. */
function trail(points: readonly Point[], t: number): Point[] {
  const head = pointAt(points, t);
  const out: Point[] = [];
  let travelled = 0;
  const total = points.slice(1).reduce((sum, p, i) => sum + dist(points[i] ?? p, p), 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) break;
    if (i > 0) travelled += dist(points[i - 1] ?? p, p);
    if (travelled > t * total) break;
    out.push(p);
  }
  return out.length > 0 ? out : [head];
}
