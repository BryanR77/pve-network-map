import HostNode from "./HostNode";
import NicNode from "./NicNode";
import BondNode from "./BondNode";
import VlanNode from "./VlanNode";
import BridgeNode from "./BridgeNode";
import GuestNicNode from "./GuestNicNode";
import GuestNode from "./GuestNode";
import HostRegionNode from "./HostRegionNode";

export const nodeTypes = {
  host: HostNode,
  nic: NicNode,
  bond: BondNode,
  vlan: VlanNode,
  bridge: BridgeNode,
  vnic: GuestNicNode,
  guest: GuestNode,
  hostRegion: HostRegionNode,
};
