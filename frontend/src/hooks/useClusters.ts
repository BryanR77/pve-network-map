import { useEffect, useState } from "react";
import type { ClusterSummary } from "../types";

const STORAGE_KEY = "pve-network-map:selectedCluster";

export function useClusters() {
  const [clusters, setClusters] = useState<ClusterSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clusters")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ClusterSummary[]) => {
        if (cancelled) return;
        setClusters(list);
        const stored = localStorage.getItem(STORAGE_KEY);
        const valid = stored && list.some((c) => c.id === stored);
        setSelectedId(valid ? stored : (list[0]?.id ?? null));
      })
      .catch(() => {
        if (!cancelled) setClusters([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = (id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return { clusters, selectedId, select };
}
