import asyncio
import logging

from .config import settings
from .models import Topology
from .pve_client import PveClient
from .topology import build_topology
from .ws import ConnectionManager

logger = logging.getLogger("poller")


class TopologyPoller:
    def __init__(self, client: PveClient, manager: ConnectionManager) -> None:
        self._client = client
        self._manager = manager
        self.latest: Topology | None = None
        self._last_hash: int | None = None
        self._task: asyncio.Task | None = None

    async def poll_once(self) -> Topology:
        topology = await build_topology(self._client)
        self.latest = topology
        digest = hash(topology.model_dump_json(exclude={"generated_at"}))
        if digest != self._last_hash:
            self._last_hash = digest
            await self._manager.broadcast(topology)
        return topology

    async def _run(self) -> None:
        while True:
            try:
                await self.poll_once()
            except Exception:
                logger.exception("poll cycle failed")
            await asyncio.sleep(settings.poll_interval_seconds)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
