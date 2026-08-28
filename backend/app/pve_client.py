import logging
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger("pve_client")


class PveClient:
    """Thin async wrapper over the subset of the Proxmox VE REST API this app needs."""

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"https://{settings.pve_host}:8006/api2/json",
            headers={
                "Authorization": f"PVEAPIToken={settings.pve_token_id}={settings.pve_token_secret}"
            },
            verify=settings.pve_verify_ssl,
            timeout=15.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str) -> Any:
        resp = await self._client.get(path)
        resp.raise_for_status()
        return resp.json()["data"]

    async def list_nodes(self) -> list[dict]:
        return await self._get("/nodes")

    async def node_network(self, node: str) -> list[dict]:
        return await self._get(f"/nodes/{node}/network")

    async def list_qemu(self, node: str) -> list[dict]:
        return await self._get(f"/nodes/{node}/qemu")

    async def qemu_config(self, node: str, vmid: int) -> dict:
        return await self._get(f"/nodes/{node}/qemu/{vmid}/config")

    async def qemu_agent_interfaces(self, node: str, vmid: int) -> list[dict] | None:
        """Returns None when the guest agent is unavailable rather than raising."""
        try:
            data = await self._get(
                f"/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces"
            )
            return data.get("result")
        except httpx.HTTPStatusError:
            return None
        except httpx.RequestError as exc:
            logger.warning("agent network-get-interfaces failed for %s/%s: %s", node, vmid, exc)
            return None

    async def list_lxc(self, node: str) -> list[dict]:
        return await self._get(f"/nodes/{node}/lxc")

    async def lxc_config(self, node: str, vmid: int) -> dict:
        return await self._get(f"/nodes/{node}/lxc/{vmid}/config")

    async def sdn_vnets(self) -> list[dict]:
        return await self._get("/cluster/sdn/vnets")

    async def sdn_zones(self) -> list[dict]:
        return await self._get("/cluster/sdn/zones")
