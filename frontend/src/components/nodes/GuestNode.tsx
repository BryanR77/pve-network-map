import { Handle, Position, type NodeProps } from "@xyflow/react";
import { shellStyle, titleStyle, rowStyle, statusDot } from "./styles";

export default function GuestNode({ data, selected }: NodeProps) {
  const status = data.status as string | undefined;
  const running = status === "running";
  const guestType = (data.guest_type as string | undefined)?.toUpperCase();
  const vmid = data.vmid as number | undefined;
  const ips = (data.ips as string[] | undefined) ?? [];
  const nicCount = data.nic_count as number | undefined;

  return (
    <div style={shellStyle("guest", !!selected, !!data.dimmed)}>
      <Handle type="target" position={Position.Left} />
      <div style={titleStyle}>
        <span style={statusDot(running ? "#22c55e" : "#94a3b8")} />
        {data.label as string}
      </div>
      <div style={rowStyle}>
        {guestType} {vmid !== undefined ? `#${vmid}` : ""}
        {nicCount !== undefined ? ` · ${nicCount} NIC${nicCount === 1 ? "" : "s"}` : ""}
      </div>
      {ips.slice(0, 2).map((ip) => (
        <div style={rowStyle} key={ip}>
          {ip}
        </div>
      ))}
      {ips.length > 2 && <div style={rowStyle}>+{ips.length - 2} more</div>}
    </div>
  );
}
