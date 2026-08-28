import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, statusDot } from "./styles";

export default function HostNode({ data, selected }: NodeProps) {
  const status = data.status as string | undefined;
  const online = status === "online";
  return (
    <div style={{ ...shellStyle("host", !!selected, !!data.dimmed), textAlign: "center" }}>
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(online ? "#22c55e" : "#ef4444")} />
        {data.label as string}
      </div>
      <div style={{ color: "var(--node-fg-muted)" }}>{status ?? "unknown"}</div>
    </div>
  );
}
