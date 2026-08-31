import { useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, useReactFlow, Background, Controls, MiniMap, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useClusters } from "./hooks/useClusters";
import { useTopologySocket } from "./hooks/useTopologySocket";
import { layoutTopology } from "./layout/autoLayout";
import { nodeTypes } from "./components/nodes";
import { KIND_COLOR } from "./components/nodes/styles";
import RoutedEdge from "./components/edges/RoutedEdge";
import DetailPanel from "./components/DetailPanel";
import type { TopoNode } from "./types";

const edgeTypes = { routed: RoutedEdge };

/** ReactFlow only auto-fits the viewport once, the first time nodes are measured — it
 * doesn't refit just because the nodes/edges props change later. Since <ReactFlow> stays
 * mounted across cluster switches, without this the camera stays framed on whatever the
 * previously-selected cluster's graph looked like. Fires once per cluster as soon as that
 * cluster's data has actually loaded (not on every routine live-update poll, which would
 * otherwise reset the user's pan/zoom every time anything on the graph changes). */
function FitViewOnClusterChange({ clusterId, ready }: { clusterId: string | null; ready: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const raf = requestAnimationFrame(() => fitView({ padding: 0.1 }));
    return () => cancelAnimationFrame(raf);
  }, [clusterId, ready, fitView]);
  return null;
}

export default function App() {
  const { clusters, selectedId: clusterId, select: selectCluster } = useClusters();
  const { topology, status } = useTopologySocket(clusterId);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Node ids aren't namespaced per cluster, so a stale selection from the previous
  // cluster could otherwise coincidentally match a node in the new one.
  useEffect(() => setSelectedId(null), [clusterId]);

  const layout = useMemo(() => {
    if (!topology) return { nodes: [] as Node[], edges: [] };
    return layoutTopology(topology.nodes, topology.edges);
  }, [topology]);

  const query = search.trim().toLowerCase();
  const displayNodes = useMemo(() => {
    if (!query) return layout.nodes;
    return layout.nodes.map((n) => {
      if (n.type === "hostRegion") return n;
      const label = String(n.data.label ?? "").toLowerCase();
      const host = String(n.data.host ?? "").toLowerCase();
      const matched = label.includes(query) || host.includes(query);
      return { ...n, data: { ...n.data, dimmed: !matched } };
    });
  }, [layout.nodes, query]);

  const selectedNode: TopoNode | undefined = topology?.nodes.find((n) => n.id === selectedId);

  const statusColor = status === "open" ? "#22c55e" : status === "connecting" ? "#f59e0b" : "#ef4444";
  const statusLabel = status === "open" ? "live" : status === "connecting" ? "connecting…" : "reconnecting…";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--app-bg)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid var(--panel-border)",
          background: "var(--panel-bg)",
          color: "var(--panel-fg)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>PVE Network Map</div>
        {clusters && clusters.length > 0 && (
          <select
            value={clusterId ?? ""}
            onChange={(e) => selectCluster(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--panel-border)",
              background: "var(--app-bg)",
              color: "var(--panel-fg)",
              fontSize: 13,
            }}
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder="Search host, bridge, VM/CT…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "0 1 320px",
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid var(--panel-border)",
            background: "var(--app-bg)",
            color: "var(--panel-fg)",
            fontSize: 13,
          }}
        />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--panel-fg-muted)" }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor,
            }}
          />
          {statusLabel}
          {topology?.generated_at && (
            <span style={{ marginLeft: 10 }}>
              updated {new Date(topology.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={displayNodes}
            edges={layout.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => {
              if (node.type !== "hostRegion") setSelectedId(node.id);
            }}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.type && n.type in KIND_COLOR ? KIND_COLOR[n.type as keyof typeof KIND_COLOR] : "#3a3f4b")}
              nodeStrokeWidth={0}
              maskColor="rgba(255, 255, 255, 0.08)"
              style={{ backgroundColor: "var(--panel-bg)" }}
            />
          </ReactFlow>
          <FitViewOnClusterChange clusterId={clusterId} ready={!!topology} />
        </ReactFlowProvider>
        {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedId(null)} />}
        {!topology && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--panel-fg-muted)",
              fontSize: 14,
            }}
          >
            {clusters && clusters.length === 0 ? "No clusters configured" : "Loading topology…"}
          </div>
        )}
      </div>
    </div>
  );
}
