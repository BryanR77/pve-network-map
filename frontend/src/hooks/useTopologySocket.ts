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
    const controller = new AbortController();

    // Prime the view with a normal fetch so something renders before the
    // socket handshake completes.
    fetch(`/api/topology?cluster=${encodeURIComponent(clusterId)}`, { signal: controller.signal })
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
        if (cancelled) return;
        retryDelay.current = 1000;
        setStatus("open");
      };
      socket.onmessage = (event) => {
        // A message from this socket can still be delivered after the effect that
        // opened it has been cleaned up (e.g. rapid cluster switching, where the old
        // socket hasn't finished closing before a new one connects) — without this
        // check it would silently overwrite the newly-selected cluster's state with
        // stale data from the one being switched away from.
        if (cancelled) return;
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
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [clusterId]);

  return { topology, status };
}
