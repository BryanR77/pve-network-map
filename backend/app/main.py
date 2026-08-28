import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from .poller import TopologyPoller
from .pve_client import PveClient
from .ws import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

client = PveClient()
manager = ConnectionManager()
poller = TopologyPoller(client, manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await poller.poll_once()
    except Exception:
        logger.exception("initial poll failed — will retry on the poll loop")
    poller.start()
    yield
    await poller.stop()
    await client.aclose()


app = FastAPI(title="PVE Network Map", lifespan=lifespan)


@app.get("/api/topology")
async def get_topology():
    if poller.latest is None:
        return JSONResponse({"nodes": [], "edges": [], "generated_at": None}, status_code=503)
    return poller.latest


@app.get("/api/health")
async def health():
    return {"status": "ok", "has_data": poller.latest is not None}


@app.websocket("/ws/topology")
async def ws_topology(ws: WebSocket):
    await manager.connect(ws)
    try:
        if poller.latest is not None:
            await ws.send_text(poller.latest.model_dump_json())
        while True:
            # Client doesn't need to send anything; just keep the connection open.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
