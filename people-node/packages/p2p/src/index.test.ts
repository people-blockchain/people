import { describe, expect, test } from "vitest";
import { GossipNetwork } from "./index.js";

describe("@ovn/p2p", () => {
  test("GossipNetwork initializes with peer id and bootstrap peers", () => {
    const gossip = new GossipNetwork({
      peerId: "test-peer",
      port: 19999,
      bootstrapPeers: ["ws://127.0.0.1:4002"]
    });
    expect(gossip.peerId).toBe("test-peer");
    expect(gossip.bootstrapPeers).toEqual(["ws://127.0.0.1:4002"]);
    expect(gossip.peerCount()).toBe(0);
  });

  test("buildJoinBundle includes peer and gossip metadata", () => {
    const gossip = new GossipNetwork({
      peerId: "peer-bundle",
      port: 20010,
      bootstrapPeers: ["ws://127.0.0.1:4002"]
    });
    const bundle = gossip.buildJoinBundle("0xvalidator");
    expect(bundle.peerId).toBe("peer-bundle");
    expect(bundle.gossipPort).toBe(20010);
    expect(bundle.validatorPubKey).toBe("0xvalidator");
    expect(bundle.bootstrapPeers).toContain("ws://127.0.0.1:4002");
  });

  test("advertises PUBLIC gossip URL instead of loopback", () => {
    const gossip = new GossipNetwork({
      peerId: "adv-peer",
      port: 4002,
      advertiseAddress: "203.0.113.10:4002"
    });
    expect(gossip.advertisedListenAddress()).toBe("ws://203.0.113.10:4002");
  });

  test("records same-port remote peers and ignores loopback hints", () => {
    const gossip = new GossipNetwork({
      peerId: "book-peer",
      port: 4002,
      advertiseAddress: "ws://203.0.113.8:4002"
    });
    gossip.recordListenHint("ws://127.0.0.1:4002");
    gossip.recordListenHint("ws://203.0.113.8:4002");
    gossip.recordListenHint("ws://203.0.113.9:4002");
    expect(gossip.recordedPeerAddresses()).toContain("ws://203.0.113.9:4002");
    expect(gossip.recordedPeerAddresses()).not.toContain("ws://127.0.0.1:4002");
    expect(gossip.recordedPeerAddresses()).not.toContain("ws://203.0.113.8:4002");
  });

  test("exposes peer book metrics helpers", () => {
    const gossip = new GossipNetwork({
      peerId: "metrics-peer",
      port: 20011,
      bootstrapPeers: ["127.0.0.1:4002"]
    });
    expect(gossip.outboundPeerCount()).toBe(0);
    expect(gossip.reconnectCount()).toBe(0);
    expect(gossip.bannedPeerCount()).toBe(0);
    gossip.banPeer("ws://127.0.0.1:9999");
    expect(gossip.bannedPeerCount()).toBe(1);
  });
});
