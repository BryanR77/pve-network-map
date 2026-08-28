# PVE Network Map

Interactive, live-updating visual map of a Proxmox VE cluster's network topology —
physical NICs, bonds, VLAN sub-interfaces, bridges, SDN VNets, and the VMs/CTs attached
to them, with IP info for both hosts and guests.

## How it works

- **`backend/`** — FastAPI service that polls the Proxmox API (via an API token) on an
  interval, builds a topology graph, and serves it over `GET /api/topology` and a live
  `WS /ws/topology` feed that pushes an updated snapshot whenever something changes.
- **`frontend/`** — React + React Flow app that renders the graph as an interactive,
  auto-laid-out diagram (grouped by hypervisor, one dagre layout per host so hosts never
  overlap), updating live as the backend pushes changes. Click any node for full details
  in a side panel; search/filter by host or guest name.

Topology covers, per host: physical NICs → bonds → VLAN sub-interfaces → bridges → SDN
VNets (VLAN-zone networks, shown as virtual bridges since Proxmox attaches them to the
zone's real bridge via 802.1q tagging rather than a separate interface) → guest VMs/CTs.
A VM or CT with multiple NICs renders as a single guest node with one small vNIC node per
network interface feeding into it, each wired to whichever bridge/VNet it's actually
attached to.

Guest IPs: LXC containers report their configured IP (and gateway) directly from
Proxmox's own config — always available. QEMU VMs need the QEMU guest agent installed and
running in the guest to report IPs and the guest-OS interface name (e.g. `net0 (ens18)`);
without it, the NIC's attachment (bridge/VLAN/MAC) still shows but the IP reads
"unavailable". A QEMU VM's gateway is only ever visible if it's cloud-init provisioned
(`ipconfigN` in its Proxmox config) — Proxmox has no other way to expose a running VM's
default route.

Edges are drawn by literally following dagre's own internal routing waypoints (not just
a naive line between two endpoints), with small "wire jump" hops where two unrelated
edges genuinely cross, so a busy fan-out (e.g. one bridge with many attached guests) stays
readable instead of looking like everything runs through everything else.

## Running it

1. Copy `.env.example` to `.env` and fill in your Proxmox host and API token:

   ```
   cp .env.example .env
   ```

   The token only needs read access — an API token scoped to the `PVEAuditor` role is
   sufficient, since this app never writes anything to Proxmox.

2. Start it:

   ```
   docker compose up --build
   ```

3. Open `http://localhost:8080`.

Changed `.env`? Edit it, then `docker compose up -d backend` — env vars are only read
when a container is created, so `docker restart` alone won't pick up changes; `up -d`
detects the change and recreates just that container.

## Local (non-Docker) development

Backend:

```
cd backend
pip install -r requirements.txt
export $(cat ../.env | xargs)
uvicorn app.main:app --reload
```

Frontend (proxies `/api` and `/ws` to `localhost:8000` — see `vite.config.ts`):

```
cd frontend
npm install
npm run dev
```
