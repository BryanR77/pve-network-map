import type { NodeProps } from "@xyflow/react";

export default function HostRegionNode({ data }: NodeProps) {
  const width = data.width as number;
  const height = data.height as number;
  return (
    <div
      style={{
        width,
        height,
        border: "1.5px dashed var(--region-border)",
        borderRadius: 12,
        background: "var(--region-bg)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 10px",
          color: "var(--region-fg)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {data.label as string}
      </div>
    </div>
  );
}
