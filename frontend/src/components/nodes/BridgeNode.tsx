import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function BridgeNode({ data, selected }: NodeProps) {
  const active = !!data.active;
  const ip = data.ip as string | null;
  const vlanAware = data.bridge_vlan_aware as boolean | null;
  const vlanTag = data.vlan_tag as string | number | null;

  return (
    <div style={shellStyle("bridge", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(active ? "#22c55e" : "#94a3b8")} />
        {data.label as string}
      </div>
      <div style={rowStyle}>{ip ?? "no IP"}</div>
      {vlanAware && <div style={rowStyle}>VLAN aware</div>}
      {vlanTag != null && <div style={rowStyle}>VLAN {vlanTag}</div>}
    </div>
  );
}
