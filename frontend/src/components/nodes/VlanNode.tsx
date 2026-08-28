import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function VlanNode({ data, selected }: NodeProps) {
  const active = !!data.active;
  const ip = data.ip as string | null;
  const tag = data.vlan_tag as string | null;
  const rawDevice = data.vlan_raw_device as string | null;

  return (
    <div style={shellStyle("vlan", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(active ? "#22c55e" : "#94a3b8")} />
        {data.label as string}
      </div>
      {tag != null && <div style={rowStyle}>VLAN {tag}</div>}
      {rawDevice && <div style={rowStyle}>on {rawDevice}</div>}
      <div style={rowStyle}>{ip ?? "no IP"}</div>
    </div>
  );
}
