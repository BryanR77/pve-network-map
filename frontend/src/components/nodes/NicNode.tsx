import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function NicNode({ data, selected }: NodeProps) {
  const active = !!data.active;
  const comments = data.comments as string | null;
  const ip = data.ip as string | null;

  return (
    <div style={shellStyle("nic", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(active ? "#22c55e" : "#94a3b8")} />
        {data.label as string}
      </div>
      {comments && <div style={rowStyle}>{comments}</div>}
      <div style={rowStyle}>{ip ?? "no IP"}</div>
    </div>
  );
}
