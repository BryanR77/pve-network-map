import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function GuestNicNode({ data, selected }: NodeProps) {
  const linkDown = !!data.link_down;
  const mac = data.mac as string | null;
  const tag = data.vlan_tag as string | number | null;
  const ips = (data.ips as string[] | undefined) ?? [];
  const guestIface = data.guest_iface as string | null;
  const gateway = (data.gateway as string | null) ?? (data.gateway6 as string | null);

  return (
    <div style={shellStyle("vnic", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={titleStyle}>
        <span style={statusDot(linkDown ? "#94a3b8" : "#22c55e")} />
        {data.label as string}
        {guestIface ? ` (${guestIface})` : ""}
      </div>
      {mac && <div style={rowStyle}>{mac}</div>}
      {tag != null && <div style={rowStyle}>VLAN {tag}</div>}
      {ips.slice(0, 1).map((ip) => (
        <div style={rowStyle} key={ip}>
          {ip}
        </div>
      ))}
      {gateway && <div style={rowStyle}>gw {gateway}</div>}
    </div>
  );
}
