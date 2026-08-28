import { BaseEdge, type EdgeProps } from "@xyflow/react";

interface Point {
  x: number;
  y: number;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Param 0..1 of where `p` sits along segment a->b, or null if it isn't actually on it
 * (either off to the side, or too close to an endpoint to bother bumping). */
function paramOnSegment(p: Point, a: Point, b: Point): number | null {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return null;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  if (t < 0.02 || t > 0.98) return null;
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  if (dist(p, proj) > 4) return null;
  return t;
}

/** Straight run from `from` to `to`, with a small semicircle-ish bump at any jump point
 * that lands on it — the standard "wire hop" convention for showing two lines cross
 * without connecting. */
function emitStraightWithJumps(from: Point, to: Point, jumps: Point[], jumpRadius: number): string {
  const hits = jumps
    .map((j) => ({ j, t: paramOnSegment(j, from, to) }))
    .filter((h): h is { j: Point; t: number } => h.t !== null)
    .sort((a, b) => a.t - b.t);

  if (hits.length === 0) {
    return `L ${to.x},${to.y} `;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  let d = "";
  for (const { j } of hits) {
    const r = Math.min(jumpRadius, len / 4);
    const entry = { x: j.x - ux * r, y: j.y - uy * r };
    const exit = { x: j.x + ux * r, y: j.y + uy * r };
    const control = { x: j.x + nx * r * 1.6, y: j.y + ny * r * 1.6 };
    d += `L ${entry.x},${entry.y} Q ${control.x},${control.y} ${exit.x},${exit.y} `;
  }
  d += `L ${to.x},${to.y} `;
  return d;
}

/**
 * Draws straight through dagre's own computed waypoints instead of re-deriving a path
 * from just the two endpoints. Dagre reserves a "slot" for the edge at every intermediate
 * rank it passes through (via a dummy node, spaced apart from real siblings the same way
 * any other node is), so following those points keeps the line clear of unrelated nodes —
 * something a naive two-point smoothstep path can't do for edges spanning multiple ranks.
 * Interior vertices get a small rounded corner; any point in `jumps` gets a small hop so
 * two genuinely-crossing, unrelated edges don't read as touching.
 */
export default function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, data, style, markerEnd }: EdgeProps) {
  const points = (data?.points as Point[] | undefined) ?? [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ];
  const jumps = (data?.jumps as Point[] | undefined) ?? [];
  const cornerRadius = 10;
  const jumpRadius = 6;

  let d = `M ${points[0].x},${points[0].y} `;
  let cursor = points[0];

  if (points.length === 2) {
    d += emitStraightWithJumps(cursor, points[1], jumps, jumpRadius);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
      const v2 = { x: next.x - curr.x, y: next.y - curr.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      if (len1 === 0 || len2 === 0) continue;
      const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
      const p1 = { x: curr.x - (v1.x / len1) * r, y: curr.y - (v1.y / len1) * r };
      const p2 = { x: curr.x + (v2.x / len2) * r, y: curr.y + (v2.y / len2) * r };

      d += emitStraightWithJumps(cursor, p1, jumps, jumpRadius);
      d += `Q ${curr.x},${curr.y} ${p2.x},${p2.y} `;
      cursor = p2;
    }
    const last = points[points.length - 1];
    d += emitStraightWithJumps(cursor, last, jumps, jumpRadius);
  }

  return <BaseEdge id={id} path={d.trim()} style={style} markerEnd={markerEnd} />;
}
