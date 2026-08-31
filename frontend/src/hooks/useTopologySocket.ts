import { useEffect, useRef, useState } from "react";
import type { Topology } from "../types";

export type ConnectionStatus = "connecting" | "open" | "closed";

export function useTopologySocket(clusterId: string | null) {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const retryDelay = useRef(1000);

  useEffect(() => {
    setTopology(null);
    if (!clusterId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Prime the view with a normal fetch so something renders before the
    // socket handshake completes.
    fetch(`/api/topology?cluster=${encodeURIComponent(clusterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setTopology(data);
      })
      .catch(() => {});

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/topology/${encodeURIComponent(clusterId)}`);

      socket.onopen = () => {
        retryDelay.current = 1000;
        setStatus("open");
      };
      socket.onmessage = (event) => {
        try {
          setTopology(JSON.parse(event.data));
        } catch {
          // ignore malformed frame
        }
      };
      socket.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        retryTimer = setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 15000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [clusterId]);

  return { topology, status };
}
