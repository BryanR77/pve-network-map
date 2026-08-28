import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTopologySocket } from "./hooks/useTopologySocket";
import { layoutTopology } from "./layout/autoLayout";
import { nodeTypes } from "./components/nodes";
import { KIND_COLOR } from "./components/nodes/styles";
import RoutedEdge from "./components/edges/RoutedEdge";
import DetailPanel from "./components/DetailPanel";
import type { TopoNode } from "./types";

const edgeTypes = { routed: RoutedEdge };

export default function App() {
  const { topology, status } = useTopologySocket();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            Loading topology…
          </div>
        )}
      </div>
    </div>
  );
}
