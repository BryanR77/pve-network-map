import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from .config import ClusterConfig, settings
from .poller import TopologyPoller
from .pve_client import PveClient
from .ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")


@dataclass
class ClusterRuntime:
    config: ClusterConfig
    client: PveClient
    manager: ConnectionManager
    poller: TopologyPoller


def _build_runtime(cfg: ClusterConfig) -> ClusterRuntime:
    client = PveClient(cfg)
    manager = ConnectionManager()
    poller = TopologyPoller(
        client, manager, poll_interval_seconds=cfg.poll_interval_seconds or settings.poll_interval_seconds
    )
    return ClusterRuntime(config=cfg, client=client, manager=manager, poller=poller)


clusters: dict[str, ClusterRuntime] = {cfg.id: _build_runtime(cfg) for cfg in settings.clusters}


@asynccontextmanager
async def lifespan(app: FastAPI):
    async def init_one(rt: ClusterRuntime) -> None:
        try:
            await rt.poller.poll_once()
        except Exception:
            logger.exception("initial poll failed for cluster %s — will retry on the poll loop", rt.config.id)

    await asyncio.gather(*(init_one(rt) for rt in clusters.values()))
    for rt in clusters.values():
        rt.poller.start()
    yield
    for rt in clusters.values():
        await rt.poller.stop()
        await rt.client.aclose()


app = FastAPI(title="PVE Network Map", lifespan=lifespan)


@app.get("/api/clusters")
async def list_clusters():
    return [{"id": rt.config.id, "name": rt.config.name} for rt in clusters.values()]


@app.get("/api/topology")
async def get_topology(cluster: str):
    rt = clusters.get(cluster)
    if rt is None:
        return JSONResponse({"error": f"unknown cluster '{cluster}'"}, status_code=404)
    if rt.poller.latest is None:
        return JSONResponse({"nodes": [], "edges": [], "generated_at": None}, status_code=503)
    return rt.poller.latest


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "clusters": {cid: rt.poller.latest is not None for cid, rt in clusters.items()},
    }


@app.websocket("/ws/topology/{cluster_id}")
async def ws_topology(ws: WebSocket, cluster_id: str):
    rt = clusters.get(cluster_id)
    if rt is None:
        await ws.close(code=4404)
        return

    await rt.manager.connect(ws)
    try:
        if rt.poller.latest is not None:
            await ws.send_text(rt.poller.latest.model_dump_json())
        while True:
            # Client doesn't need to send anything; just keep the connection open.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        rt.manager.disconnect(ws)
