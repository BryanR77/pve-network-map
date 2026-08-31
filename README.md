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
  in a side panel; search/filter by host or guest name; switch between configured
  clusters with the selector in the header.

The backend can poll multiple independent Proxmox clusters at once — each is configured
as an entry in `clusters.yaml` and polled/broadcast separately. The frontend shows one
cluster's graph at a time, picked from the selector; your choice is remembered across
reloads.

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

1. Copy `clusters.yaml.example` to `clusters.yaml` and add one entry per Proxmox cluster
   you want to monitor:

   ```
   cp clusters.yaml.example clusters.yaml
   ```

   The token only needs read access — an API token scoped to the `PVEAuditor` role is
   sufficient, since this app never writes anything to Proxmox.

2. Copy `.env.example` to `.env` (defaults are usually fine as-is):

   ```
   cp .env.example .env
   ```

3. Start it:

   ```
   docker compose up --build
   ```

4. Open `http://localhost:8080`.

Both files are only read once, at backend startup — neither is watched while it's
running. To pick up changes:

- Changed `clusters.yaml`? `docker compose restart backend` is enough — it's bind-mounted,
  so the container already sees the current file, it just needs the process restarted to
  re-read it.
- Changed `.env`? You need `docker compose up -d backend` instead — env vars are baked
  into the container at creation time, so a restart alone won't pick them up; `up -d`
  detects the change and recreates just that container.

## Local (non-Docker) development

Backend:

```
cd backend
pip install -r requirements.txt
export $(cat ../.env | xargs)
export CLUSTERS_CONFIG=../clusters.yaml
uvicorn app.main:app --reload
```

Frontend (proxies `/api` and `/ws` to `localhost:8000` — see `vite.config.ts`):

```
cd frontend
npm install
npm run dev
```
