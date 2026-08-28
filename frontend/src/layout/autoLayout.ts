import dagre from "dagre";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { TopoNode, TopoEdge, NodeKind } from "../types";

// Heights must fit the worst-case row count each card can render (title + up to 3 detail
// rows) — React Flow doesn't clip custom nodes, so an undersized box here doesn't get
// truncated, it silently overlaps whatever dagre placed next to it.
const SIZE: Record<NodeKind, { width: number; height: number }> = {
  host: { width: 160, height: 56 },
  nic: { width: 180, height: 76 },
  bond: { width: 180, height: 76 },
  vlan: { width: 190, height: 92 },
  bridge: { width: 190, height: 76 },
  vnic: { width: 170, height: 92 },
  guest: { width: 200, height: 92 },
};

const REGION_PADDING = 36;
const REGION_HEADER = 28;
const HOST_GAP = 60;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

interface Point {
  x: number;
  y: number;
}

/** Where two line segments genuinely cross (not just touch near an endpoint, which is
 * usually two edges meeting at a shared node rather than an unrelated crossing). */
function segmentIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Hosts have no edges between them, so laying every node out in one shared dagre graph
 * leaves their bounding boxes to whatever dagre's component packing happens to produce —
 * which can overlap. Instead each host is laid out in its own dagre graph, then the
 * resulting clusters are stacked vertically with a fixed gap so they never collide.
 */
export function layoutTopology(topoNodes: TopoNode[], topoEdges: TopoEdge[]): LayoutResult {
  const hostOrder: string[] = [];
  const nodesByHost = new Map<string, TopoNode[]>();
  const hostOf = new Map<string, string>();
  for (const n of topoNodes) {
    if (!nodesByHost.has(n.host)) {
      nodesByHost.set(n.host, []);
      hostOrder.push(n.host);
    }
    nodesByHost.get(n.host)!.push(n);
    hostOf.set(n.id, n.host);
  }

  const edgesByHost = new Map<string, TopoEdge[]>();
  for (const e of topoEdges) {
    const host = hostOf.get(e.source);
    if (host && hostOf.get(e.target) === host) {
      if (!edgesByHost.has(host)) edgesByHost.set(host, []);
      edgesByHost.get(host)!.push(e);
    }
  }

  const regionNodes: Node[] = [];
  const flowNodes: Node[] = [];
  // Dagre already computes proper multi-point routes for each edge internally — for an
  // edge spanning more than one rank it threads dummy nodes through every intermediate
  // rank specifically so the path doesn't collide with real siblings there. Handing React
  // Flow only the two endpoints throws that away and lets it re-derive a naive path that
  // can visually cut straight through unrelated nodes sitting in between. Captured per
  // edge id (in this host's local coordinates, offset-corrected below) and consumed by a
  // custom edge type that draws straight through dagre's own waypoints instead.
  const edgePoints = new Map<string, Point[]>();
  // Two edges that geometrically cross but don't share a node read as ambiguous without
  // a visual cue — populated per host below (hosts are stacked with no y overlap, so
  // cross-host crossings can't happen and jumps are only ever computed within one host).
  const edgeJumps = new Map<string, Point[]>();
  let yCursor = 0;

  for (const host of hostOrder) {
    const hostNodes = nodesByHost.get(host)!;
    const hostEdges = edgesByHost.get(host) ?? [];

    const g = new dagre.graphlib.Graph();
    // Leave `align` unset: dagre's default (averaging its 4 alignment heuristics) was
    // measured against this cluster's real topology to produce noticeably less zigzag
    // than pinning a single corner (e.g. "UL") — verified by summing |source.y - target.y|
    // across every edge for each option, default won on every host.
    g.setGraph({ rankdir: "LR", nodesep: 56, ranksep: 150, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of hostNodes) {
      const size = SIZE[n.kind];
      g.setNode(n.id, { width: size.width, height: size.height });
    }
    for (const e of hostEdges) {
      g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const localPos = new Map<string, { x: number; y: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of hostNodes) {
      const pos = g.node(n.id);
      const size = SIZE[n.kind];
      const x = pos.x - size.width / 2;
      const y = pos.y - size.height / 2;
      localPos.set(n.id, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size.width);
      maxY = Math.max(maxY, y + size.height);
    }
    if (!isFinite(minX)) {
      minX = minY = maxX = maxY = 0;
    }

    const offsetX = REGION_PADDING - minX;
    const offsetY = yCursor + REGION_PADDING + REGION_HEADER - minY;

    for (const e of hostEdges) {
      const dagreEdge = g.edge(e.source, e.target);
      if (dagreEdge?.points) {
        edgePoints.set(
          e.id,
          dagreEdge.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }))
        );
      }
    }

    // The edge that comes later in the list gets the jump — arbitrary but deterministic,
    // so crossings render consistently across polls rather than flipping which line hops.
    const hostEdgeIds = hostEdges.map((e) => e.id).filter((id) => edgePoints.has(id));
    for (let i = 0; i < hostEdgeIds.length; i++) {
      const ptsA = edgePoints.get(hostEdgeIds[i])!;
      for (let j = i + 1; j < hostEdgeIds.length; j++) {
        const idB = hostEdgeIds[j];
        const ptsB = edgePoints.get(idB)!;
        for (let a = 0; a < ptsA.length - 1; a++) {
          for (let b = 0; b < ptsB.length - 1; b++) {
            const hit = segmentIntersection(ptsA[a], ptsA[a + 1], ptsB[b], ptsB[b + 1]);
            if (hit) {
              if (!edgeJumps.has(idB)) edgeJumps.set(idB, []);
              edgeJumps.get(idB)!.push(hit);
            }
          }
        }
      }
    }

    for (const n of hostNodes) {
      const pos = localPos.get(n.id)!;
      flowNodes.push({
        id: n.id,
        type: n.kind,
        position: { x: pos.x + offsetX, y: pos.y + offsetY },
        data: { ...n.data, label: n.label, host: n.host, kind: n.kind },
      });
    }

    const width = maxX - minX + REGION_PADDING * 2;
    const height = maxY - minY + REGION_PADDING * 2 + REGION_HEADER;
    regionNodes.push({
      id: `region:${host}`,
      type: "hostRegion",
      position: { x: 0, y: yCursor },
      data: { label: host, width, height },
      draggable: false,
      selectable: false,
      zIndex: -1,
      style: { width, height },
    });

    yCursor += height + HOST_GAP;
  }

  const positionedIds = new Set(flowNodes.map((n) => n.id));
  const flowEdges: Edge[] = topoEdges
    .filter((e) => positionedIds.has(e.source) && positionedIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "routed",
      data: { points: edgePoints.get(e.id), jumps: edgeJumps.get(e.id) ?? [] },
      style: { stroke: "var(--edge-color)", strokeWidth: 1.5 },
      // A busy bridge can have 7+ edges converging close together with crossing paths —
      // without an arrowhead it's easy to mistake "these two lines cross near each other"
      // for "these two nodes are connected."
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--edge-color)" },
    }));

  return { nodes: [...regionNodes, ...flowNodes], edges: flowEdges };
}
