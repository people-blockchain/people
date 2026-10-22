import { EventEmitter, once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { GossipNetwork, peerIpKey } from "./index.js";

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  closed = false;
  send(): void {}
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

type Internals = {
  attachSocket(socket: unknown, remote: string): void;
  rememberPeerAddress(raw: string): void;
  recordDialSuccess(address: string): void;
  recordDialFailure(address: string): void;
  peerBook: Map<string, { address: string; lastSuccess: number; fails: number }>;
  wss: WebSocketServer;
};
const internals = (n: GossipNetwork) => n as unknown as Internals;
const attach = (n: GossipNetwork, remote: string) => {
  const socket = new FakeSocket();
  internals(n).attachSocket(socket, remote);
  return socket;
};
const make = (extra: Partial<ConstructorParameters<typeof GossipNetwork>[0]> = {}) =>
  new GossipNetwork({ peerId: "limits", chainId: "test-a", port: 0, ...extra });

describe("peerIpKey", () => {
  test("IPv4 exact, IPv4-mapped IPv6 collapsed, IPv6 grouped by /64", () => {
    expect(peerIpKey("198.51.100.7")).toBe("198.51.100.7");
    expect(peerIpKey("::ffff:198.51.100.7")).toBe("198.51.100.7");
    expect(peerIpKey("::ffff:c633:6407")).toBe("198.51.100.7");
    expect(peerIpKey("[2001:db8:1:2::1]")).toBe("2001:db8:1:2/64");
    expect(peerIpKey("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2/64");
    expect(peerIpKey("2001:db8:1:3::1")).not.toBe(peerIpKey("2001:db8:1:2::1"));
    expect(peerIpKey("2001:db8::1%eth0")).toBe("2001:db8:0:0/64");
    expect(peerIpKey("Example.COM")).toBe("host:example.com");
  });
});

describe("per-IP and inbound limits", () => {
  test("a single IP cannot hold more than maxPeersPerIp slots (IPv4-mapped counted once)", () => {
    const net = make({ maxPeersPerIp: 2 });
    const a = attach(net, "198.51.100.7");
    const b = attach(net, "::ffff:198.51.100.7");
    const c = attach(net, "198.51.100.7");
    expect([a.closed, b.closed, c.closed]).toEqual([false, false, true]);
    expect(net.peerCount()).toBe(2);
    expect(attach(net, "198.51.100.8").closed).toBe(false);
    a.close();
    expect(attach(net, "198.51.100.7").closed).toBe(false);
  });

  test("IPv6 peers in the same /64 share one budget", () => {
    const net = make({ maxPeersPerIp: 2 });
    attach(net, "2001:db8:0:1::1");
    attach(net, "2001:db8:0:1::2");
    expect(attach(net, "2001:db8:0:1::3").closed).toBe(true);
    expect(attach(net, "2001:db8:0:2::1").closed).toBe(false);
  });

  test("P2P_MAX_PEERS_PER_IP env sets the default", () => {
    process.env.P2P_MAX_PEERS_PER_IP = "1";
    try {
      const net = make();
      attach(net, "198.51.100.9");
      expect(attach(net, "198.51.100.9").closed).toBe(true);
    } finally {
      delete process.env.P2P_MAX_PEERS_PER_IP;
    }
  });

  test("inbound connections cannot take every slot", () => {
    const net = make({ maxPeers: 10, maxPeersPerIp: 100, maxInboundPeers: 6 });
    const sockets = Array.from({ length: 8 }, (_, i) => attach(net, `198.51.100.${i + 1}`));
    expect(sockets.filter((s) => !s.closed)).toHaveLength(6);
    expect(net.peerCount()).toBe(6);
  });

  test("default inbound quota leaves 8 of 32 slots for outbound", () => {
    const net = make({ maxPeersPerIp: 100 });
    const sockets = Array.from({ length: 32 }, (_, i) => attach(net, `198.51.100.${i + 1}`));
    expect(sockets.filter((s) => !s.closed)).toHaveLength(24);
  });

  test("outbound dials respect the per-IP limit", async () => {
    const net = make({ maxPeersPerIp: 1 });
    attach(net, "203.0.113.5");
    const before = (net as unknown as { outbound: Map<string, unknown> }).outbound.size;
    await (net as unknown as { connect(u: string): Promise<void> }).connect("ws://203.0.113.5:4002");
    expect((net as unknown as { outbound: Map<string, unknown> }).outbound.size).toBe(before);
  });

  test("loopback is exempt from the per-IP limit", () => {
    const net = make({ maxPeersPerIp: 1 });
    expect([attach(net, "127.0.0.1"), attach(net, "::ffff:127.0.0.1"), attach(net, "::1")].some((s) => s.closed)).toBe(false);
  });
});

describe("peer book", () => {
  test("is capped; unverified spam cannot evict successful or bootstrap entries", () => {
    const net = make({ maxPeers: 2, bootstrapPeers: ["boot.example:4002"] });
    const book = internals(net);
    book.recordDialSuccess("ws://198.51.100.1:4002");
    for (let i = 0; i < 50; i += 1) book.rememberPeerAddress(`ws://203.0.113.${i + 1}:4002`);
    expect(book.peerBook.size).toBeLessThanOrEqual(8);
    expect(book.peerBook.has("ws://198.51.100.1:4002")).toBe(true);
    expect(book.peerBook.has("ws://boot.example:4002")).toBe(true);
  });

  test("a verified peer displaces unverified entries and then the oldest verified one", () => {
    const net = make({ maxPeers: 1 });
    const book = internals(net);
    for (let i = 0; i < 4; i += 1) book.rememberPeerAddress(`ws://203.0.113.${i + 1}:4002`);
    book.recordDialSuccess("ws://198.51.100.1:4002");
    expect(book.peerBook.size).toBe(4);
    expect(book.peerBook.get("ws://198.51.100.1:4002")?.lastSuccess).toBeGreaterThan(0);
    for (let i = 0; i < 4; i += 1) book.recordDialSuccess(`ws://198.51.100.${i + 10}:4002`);
    expect(book.peerBook.size).toBe(4);
    expect([...book.peerBook.values()].every((e) => e.lastSuccess > 0)).toBe(true);
  });

  test("unverified entries that keep failing are dropped; verified ones stay", () => {
    const net = make({ maxPeers: 4 });
    const book = internals(net);
    book.rememberPeerAddress("ws://203.0.113.1:4002");
    book.recordDialSuccess("ws://198.51.100.1:4002");
    for (let i = 0; i < 8; i += 1) {
      book.recordDialFailure("ws://203.0.113.1:4002");
      book.recordDialFailure("ws://198.51.100.1:4002");
    }
    expect(book.peerBook.has("ws://203.0.113.1:4002")).toBe(false);
    expect(book.peerBook.has("ws://198.51.100.1:4002")).toBe(true);
  });

  test("a poisoned peers.json is bounded and keeps the best entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "p2p-book-"));
    const path = join(dir, "peers.json");
    const peers = Array.from({ length: 500 }, (_, i) => ({ address: `ws://203.0.113.${i % 250}:${5000 + i}`, lastSuccess: 0, fails: 0 }));
    peers.push({ address: "ws://198.51.100.1:4002", lastSuccess: 1_000, fails: 0 });
    peers.push({ address: "ws://not-a-peer", lastSuccess: "x" as unknown as number, fails: 99 });
    await writeFile(path, JSON.stringify({ peers }));
    const net = make({ maxPeers: 4, peerBookPath: path });
    await net.start();
    try {
      expect(internals(net).peerBook.size).toBeLessThanOrEqual(16);
      expect(internals(net).peerBook.has("ws://198.51.100.1:4002")).toBe(true);
    } finally {
      await net.close();
    }
    const saved = JSON.parse(await readFile(path, "utf8")) as { peers: unknown[] };
    expect(saved.peers.length).toBeLessThanOrEqual(16);
  });
});

describe("gossip bind host", () => {
  test("GOSSIP_BIND_HOST / bindHost restricts the listening interface", async () => {
    const net = make({ bindHost: "127.0.0.1" });
    await net.start();
    try {
      const server = internals(net).wss;
      if (!server.address()) await once(server, "listening");
      expect((server.address() as { address: string }).address).toBe("127.0.0.1");
    } finally {
      await net.close();
    }
  });

  test("env var is honoured and default binds as before", async () => {
    process.env.GOSSIP_BIND_HOST = "127.0.0.1";
    const bound = make();
    delete process.env.GOSSIP_BIND_HOST;
    const open = make();
    await bound.start();
    await open.start();
    try {
      for (const n of [bound, open]) if (!internals(n).wss.address()) await once(internals(n).wss, "listening");
      expect((internals(bound).wss.address() as { address: string }).address).toBe("127.0.0.1");
      expect(["::", "0.0.0.0"]).toContain((internals(open).wss.address() as { address: string }).address);
    } finally {
      await bound.close();
      await open.close();
    }
  });
});
