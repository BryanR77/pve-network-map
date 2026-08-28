import type { NodeKind } from "../../types";

export const KIND_COLOR: Record<NodeKind, string> = {
  host: "#64748b",
  nic: "#0ea5e9",
  bond: "#8b5cf6",
  vlan: "#f472b6",
  bridge: "#f59e0b",
  vnic: "#14b8a6",
  guest: "#22c55e",
};

export const shellStyle = (kind: NodeKind, selected: boolean, dimmed: boolean): React.CSSProperties => ({
  border: `1.5px solid ${KIND_COLOR[kind]}`,
  borderRadius: 8,
  background: "var(--node-bg)",
  padding: "6px 10px",
  fontSize: 11,
  lineHeight: 1.35,
  color: "var(--node-fg)",
  boxShadow: selected ? `0 0 0 2px ${KIND_COLOR[kind]}` : "0 1px 2px rgba(0,0,0,0.15)",
  opacity: dimmed ? 0.3 : 1,
  minWidth: 150,
});

export const titleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  marginBottom: 2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const rowStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "var(--node-fg-muted)",
};

export function statusDot(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: color,
    marginRight: 5,
  };
}
