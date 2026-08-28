import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function BondNode({ data, selected }: NodeProps) {
  const active = !!data.active;
  const mode = data.bond_mode as string | null;
  const ip = data.ip as string | null;

  return (
    <div style={shellStyle("bond", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(active ? "#22c55e" : "#94a3b8")} />
        {data.label as string}
      </div>
      {mode && <div style={rowStyle}>{mode}</div>}
      <div style={rowStyle}>{ip ?? "no IP"}</div>
    </div>
  );
}
