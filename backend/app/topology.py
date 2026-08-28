import logging
import re
from datetime import datetime, timezone

import httpx

from .models import Topology, TopoEdge, TopoNode
from .pve_client import PveClient

logger = logging.getLogger("topology")

NET_KEY_RE = re.compile(r"net\d+")

QEMU_MODEL_KEYS = {
    "e1000", "e1000e", "i82551", "i82557b", "i82559er", "i82559c", "i82559b",
    "i82562", "ne2k_isa", "ne2k_pci", "pcnet", "rtl8139", "virtio", "vmxnet3",
}

IFACE_KIND_MAP = {
    "eth": "nic",
    "bond": "bond",
    "OVSBond": "bond",
    "vlan": "vlan",
    "bridge": "bridge",
    "OVSBridge": "bridge",
}


def _iface_id(node: str, name: str) -> str:
    return f"iface:{node}:{name}"


def _parse_kv(raw: str) -> dict[str, str]:
    kv: dict[str, str] = {}
    for part in raw.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            kv[k.strip()] = v.strip()
    return kv


def _qemu_net_info(raw: str) -> dict:
    kv = _parse_kv(raw)
    model = mac = None
    for key in QEMU_MODEL_KEYS:
        if key in kv:
            model, mac = key, kv[key]
            break
    return {
        "model": model,
        "mac": mac,
        "bridge": kv.get("bridge"),
        "tag": kv.get("tag"),
        "link_down": kv.get("link_down") == "1",
    }


def _lxc_net_info(raw: str) -> dict:
    kv = _parse_kv(raw)
    return {
        "name": kv.get("name"),
        "mac": kv.get("hwaddr"),
        "bridge": kv.get("bridge"),
        "tag": kv.get("tag"),
        "ip": kv.get("ip"),
        "ip6": kv.get("ip6"),
        "gw": kv.get("gw"),
        "gw6": kv.get("gw6"),
    }


def _lxc_ip_list(info: dict) -> list[str]:
    out = []
    for key, label in (("ip", "v4"), ("ip6", "v6")):
        val = info.get(key)
        if not val or val == "manual":
            continue
        out.append("dhcp (lease unknown)" if val == "dhcp" else val)
    return out or ["none configured"]


def _match_agent_iface(agent_ifaces: list[dict] | None, mac: str | None) -> tuple[str | None, list[str]]:
    """Matches a netN config's MAC against the guest agent's reported interfaces, returning
    the guest-OS-level interface name (e.g. "ens18") alongside its IPs."""
    if not agent_ifaces or not mac:
        return None, []
    mac_norm = mac.lower()
    for ai in agent_ifaces:
        if (ai.get("hardware-address") or "").lower() != mac_norm:
            continue
        ips = []
        for addr in ai.get("ip-addresses", []) or []:
            ip = addr.get("ip-address")
            prefix = addr.get("prefix")
            if ip:
                ips.append(f"{ip}/{prefix}" if prefix is not None else ip)
        return ai.get("name"), ips
    return None, []


def _qemu_ipconfig_gateway(cfg: dict, net_key: str) -> tuple[str | None, str | None]:
    """Cloud-init VMs carry their static gateway in ipconfigN (same index as netN) — this
    is the only place a QEMU guest's default gateway is ever exposed via the API; the
    guest agent has no route-table query."""
    idx = net_key[len("net"):]
    raw = cfg.get(f"ipconfig{idx}")
    if not raw:
        return None, None
    kv = _parse_kv(raw)
    return kv.get("gw"), kv.get("gw6")


def _bond_members(entry: dict) -> list[str]:
    for key in ("slaves", "bond_slaves", "bond-slaves"):
        val = entry.get(key)
        if val:
            return val.split()
    return []


def _bridge_members(entry: dict) -> list[str]:
    val = entry.get("bridge_ports")
    if not val:
        return []
    return [p for p in val.split() if p != "none"]


def _vlan_raw_device(entry: dict) -> str | None:
    return entry.get("vlan-raw-device") or entry.get("vlan_raw_device")


def _vlan_tag(entry: dict) -> str | None:
    for key in ("vlan-id", "vlan_id"):
        val = entry.get(key)
        if val is not None:
            return str(val)
    # Fall back to the numeric suffix of the iface name (e.g. "bond0.444" -> "444").
    name = entry.get("iface", "")
    suffix = name.rsplit(".", 1)[-1]
    return suffix if suffix.isdigit() else None


def _net_keys(cfg: dict) -> list[str]:
    keys = [k for k in cfg if NET_KEY_RE.fullmatch(k)]
    return sorted(keys, key=lambda k: int(k[3:]))


def _iface_data(entry: dict) -> dict:
    ip = entry.get("cidr") or (
        f"{entry['address']}/{entry['netmask']}"
        if entry.get("address") and entry.get("netmask")
        else entry.get("address")
    )
    ip6 = entry.get("cidr6") or (
        f"{entry['address6']}/{entry['netmask6']}"
        if entry.get("address6") and entry.get("netmask6")
        else entry.get("address6")
    )
    return {
        "iface_type": entry.get("type"),
        "ip": ip,
        "ip6": ip6,
        "gateway": entry.get("gateway"),
        "gateway6": entry.get("gateway6"),
        "mtu": entry.get("mtu"),
        "active": bool(entry.get("active")),
        "autostart": bool(entry.get("autostart")),
        "method": entry.get("method"),
        "comments": (entry.get("comments") or "").strip() or None,
        "bond_mode": entry.get("bond_mode"),
        "bridge_vlan_aware": bool(entry.get("bridge_vlan_aware"))
        if "bridge_vlan_aware" in entry
        else None,
        "vlan_raw_device": _vlan_raw_device(entry) if entry.get("type") == "vlan" else None,
        "vlan_tag": _vlan_tag(entry) if entry.get("type") == "vlan" else None,
    }


def _add_sdn_vnets(
    node_name: str,
    host_id: str,
    sdn_vnets: list[dict],
    zone_bridge: dict[str, str | None],
    known_iface_names: set[str],
    nodes: list[TopoNode],
    edges: list[TopoEdge],
) -> None:
    """SDN VNets (e.g. VLAN-zone networks) aren't real interfaces on the host — Proxmox
    attaches guest taps directly to the zone's underlying bridge with 802.1q tagging. We
    model each as a virtual bridge node per host so guests attached to it still show up,
    parented under that zone's bridge when we can resolve one."""
    for v in sdn_vnets:
        vnet = v.get("vnet")
        if not vnet:
            continue
        zone = v.get("zone")
        nid = _iface_id(node_name, vnet)
        nodes.append(
            TopoNode(
                id=nid,
                kind="bridge",
                label=v.get("alias") or vnet,
                host=node_name,
                data={
                    "iface_type": "sdn-vnet",
                    "vnet": vnet,
                    "zone": zone,
                    "vlan_tag": v.get("tag"),
                    "ip": None,
                    "ip6": None,
                    "active": True,
                },
            )
        )
        parent_bridge = zone_bridge.get(zone) if zone else None
        if parent_bridge and parent_bridge in known_iface_names:
            edges.append(TopoEdge(id=f"e:{nid}:parent", source=_iface_id(node_name, parent_bridge), target=nid))
        else:
            edges.append(TopoEdge(id=f"e:{nid}:host", source=host_id, target=nid))


async def _add_node_network(
    client: PveClient, node_name: str, host_id: str, nodes: list[TopoNode], edges: list[TopoEdge]
) -> None:
    try:
        iface_entries = await client.node_network(node_name)
    except httpx.HTTPError as exc:
        logger.warning("failed to fetch network config for %s: %s", node_name, exc)
        return

    # Proxmox doesn't guarantee list ordering, and an unstable order makes the frontend
    # layout jump around on every poll — sort everything deterministically before use.
    iface_entries = sorted(iface_entries, key=lambda e: e["iface"])

    known_names = {e["iface"] for e in iface_entries}
    # Edges are drawn physical -> virtual (nic -> bond -> vlan -> bridge -> guest), which is
    # the opposite of Proxmox's "container owns member" config shape (bridge_ports/bond
    # slaves list members under the container), so these are tracked and reversed separately.
    contained_by: dict[str, str] = {}  # member iface -> bond/bridge that contains it
    derived_from: dict[str, str] = {}  # vlan sub-iface -> its raw base device
    for entry in iface_entries:
        typ = entry.get("type")
        name = entry["iface"]
        if typ in ("bond", "OVSBond"):
            for member in _bond_members(entry):
                contained_by[member] = name
        elif typ in ("bridge", "OVSBridge"):
            for member in _bridge_members(entry):
                contained_by[member] = name
        elif typ == "vlan":
            raw = _vlan_raw_device(entry)
            if raw:
                derived_from[name] = raw

    # An iface that already gets an edge from somewhere else must NOT also get a fallback
    # host edge, or it ends up parented under both. For contained_by (member -> container)
    # the *container* is the receiver (edge points member -> container); for derived_from
    # (vlan-iface -> raw-device) it's the other way around — the *vlan iface itself* is the
    # receiver (edge points raw-device -> vlan-iface), so it's the keys that matter there,
    # not the values. Physical nics/bonds still always get a host edge in addition to
    # whatever they feed into: every nic is a child of the hypervisor *and* the bridge it
    # feeds is a child of the nic, both at once.
    receives_edge = set(contained_by.values()) | set(derived_from.keys())

    for entry in iface_entries:
        name = entry["iface"]
        typ = entry.get("type")
        kind = IFACE_KIND_MAP.get(typ, "nic")
        nid = _iface_id(node_name, name)
        nodes.append(TopoNode(id=nid, kind=kind, label=name, host=node_name, data=_iface_data(entry)))

        container = contained_by.get(name)
        if container and container in known_names:
            edges.append(TopoEdge(id=f"e:{nid}:contained", source=nid, target=_iface_id(node_name, container)))
        raw = derived_from.get(name)
        if raw and raw in known_names:
            edges.append(TopoEdge(id=f"e:{nid}:derived", source=_iface_id(node_name, raw), target=nid))
        if name not in receives_edge:
            edges.append(TopoEdge(id=f"e:{nid}:host", source=host_id, target=nid))


async def _add_qemu_guests(
    client: PveClient, node_name: str, nodes: list[TopoNode], edges: list[TopoEdge], known_iface_ids: set[str]
) -> None:
    try:
        guests = sorted(await client.list_qemu(node_name), key=lambda g: g["vmid"])
    except httpx.HTTPError as exc:
        logger.warning("failed to list qemu guests on %s: %s", node_name, exc)
        return

    for guest in guests:
        vmid = guest["vmid"]
        try:
            cfg = await client.qemu_config(node_name, vmid)
        except httpx.HTTPError as exc:
            logger.warning("failed to fetch qemu config %s/%s: %s", node_name, vmid, exc)
            continue

        net_keys = _net_keys(cfg)
        if not net_keys:
            continue

        agent_ifaces = None
        if guest.get("status") == "running":
            agent_ifaces = await client.qemu_agent_interfaces(node_name, vmid)

        name = guest.get("name") or cfg.get("name") or f"vmid {vmid}"
        gid = f"guest:{node_name}:qemu:{vmid}"

        vnic_nodes: list[TopoNode] = []
        vnic_edges: list[TopoEdge] = []
        all_ips: list[str] = []

        for key in net_keys:
            info = _qemu_net_info(cfg[key])
            bridge = info.get("bridge")
            if not bridge:
                continue
            bridge_id = _iface_id(node_name, bridge)
            if bridge_id not in known_iface_ids:
                continue

            guest_iface, ips = _match_agent_iface(agent_ifaces, info.get("mac"))
            if not ips:
                if guest.get("status") != "running":
                    ips = ["vm not running"]
                else:
                    ips = ["unavailable (guest agent not reporting)"]
            all_ips.extend(ips)
            gateway, gateway6 = _qemu_ipconfig_gateway(cfg, key)

            vnic_id = f"{gid}:{key}"
            vnic_nodes.append(
                TopoNode(
                    id=vnic_id,
                    kind="vnic",
                    label=key,
                    host=node_name,
                    data={
                        "mac": info.get("mac"),
                        "model": info.get("model"),
                        "bridge": bridge,
                        "vlan_tag": info.get("tag"),
                        "link_down": info.get("link_down"),
                        "guest_iface": guest_iface,
                        "gateway": gateway,
                        "gateway6": gateway6,
                        "ips": ips,
                    },
                )
            )
            vnic_edges.append(TopoEdge(id=f"e:{bridge_id}->{vnic_id}", source=bridge_id, target=vnic_id))
            vnic_edges.append(TopoEdge(id=f"e:{vnic_id}->{gid}", source=vnic_id, target=gid))

        if not vnic_nodes:
            continue

        nodes.append(
            TopoNode(
                id=gid,
                kind="guest",
                label=name,
                host=node_name,
                data={
                    "guest_type": "qemu",
                    "vmid": vmid,
                    "status": guest.get("status"),
                    "nic_count": len(vnic_nodes),
                    "ips": all_ips,
                },
            )
        )
        nodes.extend(vnic_nodes)
        edges.extend(vnic_edges)


async def _add_lxc_guests(
    client: PveClient, node_name: str, nodes: list[TopoNode], edges: list[TopoEdge], known_iface_ids: set[str]
) -> None:
    try:
        guests = sorted(await client.list_lxc(node_name), key=lambda g: g["vmid"])
    except httpx.HTTPError as exc:
        logger.warning("failed to list lxc guests on %s: %s", node_name, exc)
        return

    for guest in guests:
        vmid = guest["vmid"]
        try:
            cfg = await client.lxc_config(node_name, vmid)
        except httpx.HTTPError as exc:
            logger.warning("failed to fetch lxc config %s/%s: %s", node_name, vmid, exc)
            continue

        net_keys = _net_keys(cfg)
        if not net_keys:
            continue

        name = guest.get("name") or cfg.get("hostname") or f"vmid {vmid}"
        gid = f"guest:{node_name}:lxc:{vmid}"

        vnic_nodes: list[TopoNode] = []
        vnic_edges: list[TopoEdge] = []
        all_ips: list[str] = []

        for key in net_keys:
            info = _lxc_net_info(cfg[key])
            bridge = info.get("bridge")
            if not bridge:
                continue
            bridge_id = _iface_id(node_name, bridge)
            if bridge_id not in known_iface_ids:
                continue

            ips = _lxc_ip_list(info)
            all_ips.extend(ips)

            vnic_id = f"{gid}:{key}"
            vnic_nodes.append(
                TopoNode(
                    id=vnic_id,
                    kind="vnic",
                    label=info.get("name") or key,
                    host=node_name,
                    data={
                        "mac": info.get("mac"),
                        "bridge": bridge,
                        "vlan_tag": info.get("tag"),
                        "gateway": info.get("gw"),
                        "gateway6": info.get("gw6"),
                        "ips": ips,
                    },
                )
            )
            vnic_edges.append(TopoEdge(id=f"e:{bridge_id}->{vnic_id}", source=bridge_id, target=vnic_id))
            vnic_edges.append(TopoEdge(id=f"e:{vnic_id}->{gid}", source=vnic_id, target=gid))

        if not vnic_nodes:
            continue

        nodes.append(
            TopoNode(
                id=gid,
                kind="guest",
                label=name,
                host=node_name,
                data={
                    "guest_type": "lxc",
                    "vmid": vmid,
                    "status": guest.get("status"),
                    "nic_count": len(vnic_nodes),
                    "ips": all_ips,
                },
            )
        )
        nodes.extend(vnic_nodes)
        edges.extend(vnic_edges)


async def build_topology(client: PveClient) -> Topology:
    nodes: list[TopoNode] = []
    edges: list[TopoEdge] = []

    sdn_vnets: list[dict] = []
    zone_bridge: dict[str, str | None] = {}
    try:
        sdn_vnets = sorted(await client.sdn_vnets(), key=lambda v: v.get("vnet") or "")
        zone_bridge = {z["zone"]: z.get("bridge") for z in await client.sdn_zones()}
    except httpx.HTTPError as exc:
        logger.warning("failed to fetch SDN config: %s", exc)

    node_list = await client.list_nodes()
    for nm in sorted(node_list, key=lambda n: n["node"]):
        node_name = nm["node"]
        host_id = f"host:{node_name}"
        nodes.append(
            TopoNode(id=host_id, kind="host", label=node_name, host=node_name, data={"status": nm.get("status")})
        )

        if nm.get("status") != "online":
            continue

        await _add_node_network(client, node_name, host_id, nodes, edges)
        known_names = {n.label for n in nodes if n.host == node_name and n.kind in ("nic", "bond", "bridge")}
        _add_sdn_vnets(node_name, host_id, sdn_vnets, zone_bridge, known_names, nodes, edges)

        known_iface_ids = {n.id for n in nodes if n.host == node_name and n.kind in ("nic", "bond", "bridge")}
        await _add_qemu_guests(client, node_name, nodes, edges, known_iface_ids)
        await _add_lxc_guests(client, node_name, nodes, edges, known_iface_ids)

    return Topology(nodes=nodes, edges=edges, generated_at=datetime.now(timezone.utc).isoformat())
