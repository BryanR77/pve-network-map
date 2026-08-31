export type NodeKind = "host" | "nic" | "bond" | "vlan" | "bridge" | "vnic" | "guest";

export interface ClusterSummary {
  id: string;
  name: string;
}

export interface TopoNode {
  id: string;
  kind: NodeKind;
  label: string;
  host: string;
  data: Record<string, unknown>;
}

export interface TopoEdge {
  id: string;
  source: string;
  target: string;
}

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
  generated_at: string | null;
}
