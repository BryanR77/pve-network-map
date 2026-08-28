import type { TopoNode } from "../types";

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

function prettyKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export default function DetailPanel({ node, onClose }: { node: TopoNode; onClose: () => void }) {
  const entries = Object.entries(node.data).filter(([k]) => k !== "label");

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 300,
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
        background: "var(--panel-bg)",
        color: "var(--panel-fg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        padding: 16,
        fontSize: 13,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{node.label}</div>
          <div style={{ color: "var(--panel-fg-muted)", fontSize: 11, textTransform: "uppercase" }}>
            {node.kind} · {node.host}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--panel-fg-muted)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} style={{ borderTop: "1px solid var(--panel-border)" }}>
              <td style={{ padding: "5px 4px 5px 0", color: "var(--panel-fg-muted)", verticalAlign: "top", width: "40%" }}>
                {prettyKey(key)}
              </td>
              <td style={{ padding: "5px 0", wordBreak: "break-word" }}>{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
