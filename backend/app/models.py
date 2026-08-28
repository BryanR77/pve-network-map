from typing import Literal

from pydantic import BaseModel

NodeKind = Literal["host", "nic", "bond", "vlan", "bridge", "vnic", "guest"]


class TopoNode(BaseModel):
    id: str
    kind: NodeKind
    label: str
    host: str
    # Free-form metadata rendered in the UI (IPs, MAC, VLAN tag, MTU, link state,
    # guest type/id, etc.) — kept loose since each kind carries different fields.
    data: dict


class TopoEdge(BaseModel):
    id: str
    source: str
    target: str


class Topology(BaseModel):
    nodes: list[TopoNode]
    edges: list[TopoEdge]
    generated_at: str
