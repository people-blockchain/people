import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { isIPv4, isIPv6 } from "node:net";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { WebSocket, WebSocketServer } from "ws";
import { transactionIdPayload, type Block, type Transaction, type WireMessage } from "@people/protocol";

export interface GossipNetworkOptions {
  peerId: string;
  chainId?: string;
  port: number;
  bootstrapPeers?: string[];
  /** Public ws(s) URL peers should dial (not 127.0.0.1). */
  advertiseAddress?: string;
  maxMessageBytes?: number;
  reconnectMs?: number;
  peerBookPath?: string;
  maxPeers?: number;
  /** Max simultaneous connections per remote IP (IPv4 exact, IPv6 per /64). Env P2P_MAX_PEERS_PER_IP, default 2. Loopback is exempt. */
  maxPeersPerIp?: number;
  /** Max inbound connections; the rest of `maxPeers` is reserved for outbound dials. Env P2P_MAX_INBOUND, default maxPeers - 8. */
  maxInboundPeers?: number;
  /** Interface the gossip WebSocketServer binds to. Env GOSSIP_BIND_HOST; unset keeps the ws default (all interfaces). */
  bindHost?: string;
  dialTimeoutMs?: number;
  /** Close an inbound socket that has not completed the hello handshake in time. */
  handshakeTimeoutMs?: number;
  /** Per-peer (per-socket) message/byte budget per second. */
  maxMessagesPerSecond?: number;
  maxBytesPerSecond?: number;
}

type GossipEvents = {
  tx: (tx: Transaction) => void;
  block: (block: Block) => void;
  peer_joined: (peerId: string) => void;
  request_blocks: (fromHeight: number, toHeight: number, peerId: string) => void;
  blocks_response: (blocks: Block[]) => void;
};

interface PeerBookEntry {
  address: string;
  lastSuccess: number;
  fails: number;
  /** When the entry was first recorded; used to evict the oldest unverified entries first. */
  addedAt?: number;
}

const MAX_SEEN = 5_000;
const BULK_SYNC_GZIP_THRESHOLD = 32_000;
const PEER_EXCHANGE_LIMIT = 8;
const BAN_MS = 10 * 60_000;
/** Inbound sockets that never finish the hello handshake are closed after this. */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;
/** Unfinished-handshake sockets allowed per remote IP. */
const MAX_PENDING_HANDSHAKES_PER_IP = 8;
const DEFAULT_MAX_PEERS = 32;
const DEFAULT_MAX_PEERS_PER_IP = 2;
/** Slots always kept free of inbound connections so the node can still dial out. */
const DEFAULT_OUTBOUND_RESERVED = 8;
/** An address that failed this many dials without ever succeeding is dropped from the book. */
const PEER_BOOK_MAX_FAILS = 8;
const PEER_BOOK_FACTOR = 4;
const DEFAULT_MAX_MESSAGES_PER_SECOND = 200;
const DEFAULT_MAX_BYTES_PER_SECOND = 4_000_000;

function normalizePeerAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    return trimmed;
  }
  return `ws://${trimmed}`;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function expandIPv6(address: string): number[] | null {
  let text = address;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    if (!isIPv4(tail[1])) return null;
    const o = tail[1].split(".").map(Number);
    text = `${text.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Key used for per-IP connection limits: IPv4 exact, IPv6 grouped by /64, IPv4-mapped IPv6
 * collapsed to the embedded IPv4. Non-IP hostnames get a `host:` key.
 */
export function peerIpKey(raw: string): string {
  let host = raw.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const zone = host.indexOf("%");
  if (zone >= 0) host = host.slice(0, zone);
  if (!host) return "unknown";
  if (isIPv4(host)) return host;
  if (isIPv6(host)) {
    const g = expandIPv6(host);
    if (!g) return `host:${host}`;
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    }
    return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}/64`;
  }
  return `host:${host}`;
}

function isLoopbackKey(key: string): boolean {
  return key.startsWith("127.") || key === "0:0:0:0/64" || key === "host:localhost";
}

/**
 * Peer-exchange must only ever record publicly routable addresses. Accepting private,
 * loopback, link-local or CGNAT hints would let a peer push the node at internal services.
 */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "::" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if ([a, b].some((n) => n > 255)) return false;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (host.includes(":")) {
    if (/^::ffff:/.test(host)) return isPrivateOrLocalHost(host.slice(7));
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true; // fc00::/7 unique-local
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return true; // fe80::/10 link-local
    return false;
  }
  return false;
}

/**
 * Content-derived id for a gossip transaction. The declared `id` is only a content hash
 * after the signed-content upgrade activates (see core verifyTransaction), so the gossip
 * "seen" set is keyed by the value we compute here instead of the id a peer claims.
 */
function gossipTxContentId(tx: Transaction): string | null {
  try {
    return createHash("sha256").update(transactionIdPayload(tx)).digest("hex");
  } catch {
    return null;
  }
}

export class GossipNetwork {
  private readonly emitter = new EventEmitter();
  private readonly socketIdentities = new WeakMap<WebSocket, string>();
  private readonly handshakes = new WeakSet<WebSocket>();
  private readonly sockets = new Set<WebSocket>();
  private readonly outbound = new Map<string, WebSocket>();
  private readonly seen = new Set<string>();
  /** Locally minted per-socket ids — never the self-reported peerId. */
  private readonly localIdSockets = new Map<string, WebSocket>();
  private readonly socketLocalIds = new Map<WebSocket, string>();
  private localIdSeq = 0;
  private readonly handshakeTimers = new Map<WebSocket, NodeJS.Timeout>();
  private readonly socketIps = new Map<WebSocket, string>();
  private readonly pendingHandshakesByIp = new Map<string, number>();
  private readonly messageRates = new WeakMap<WebSocket, { start: number; messages: number; bytes: number }>();
  private readonly txPool = new Map<string, Transaction>();
  private readonly cacheSizes = new Map<string, number>();
  private cachedBytes = 0;
  private readonly blockPool = new Map<string, Block>();
  private readonly peerBook = new Map<string, PeerBookEntry>();
  private readonly protectedPeers = new Set<string>();
  private readonly inboundSockets = new Set<WebSocket>();
  private readonly socketIpKeys = new Map<WebSocket, string>();
  private readonly connectionsByIp = new Map<string, number>();
  private readonly bannedUntil = new Map<string, number>();
  private readonly backoffUntil = new Map<string, number>();
  private wss: WebSocketServer | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  readonly peerId: string;
  readonly bootstrapPeers: string[];
  private readonly maxMessageBytes: number;
  private readonly reconnectMs: number;
  private readonly peerBookPath?: string;
  private readonly maxPeers: number;
  private readonly maxPeersPerIp: number;
  private readonly maxInboundPeers: number;
  private readonly bindHost?: string;
  private readonly dialTimeoutMs: number;
  private readonly handshakeTimeoutMs: number;
  private readonly maxMessagesPerSecond: number;
  private readonly maxBytesPerSecond: number;

  constructor(private readonly options: GossipNetworkOptions) {
    this.peerId = options.peerId;
    this.bootstrapPeers = (options.bootstrapPeers ?? []).map(normalizePeerAddress).filter(Boolean);
    this.maxMessageBytes = options.maxMessageBytes ?? 1_000_000;
    this.reconnectMs = options.reconnectMs ?? 5_000;
    this.peerBookPath = options.peerBookPath;
    this.maxPeers = options.maxPeers ?? DEFAULT_MAX_PEERS;
    this.maxPeersPerIp = options.maxPeersPerIp ?? parsePositiveInt(process.env.P2P_MAX_PEERS_PER_IP) ?? DEFAULT_MAX_PEERS_PER_IP;
    const defaultInbound = Math.max(1, this.maxPeers - Math.min(DEFAULT_OUTBOUND_RESERVED, Math.floor(this.maxPeers / 2)));
    this.maxInboundPeers = Math.min(
      this.maxPeers,
      options.maxInboundPeers ?? parsePositiveInt(process.env.P2P_MAX_INBOUND) ?? defaultInbound
    );
    this.bindHost = options.bindHost?.trim() || process.env.GOSSIP_BIND_HOST?.trim() || undefined;
    this.dialTimeoutMs = options.dialTimeoutMs ?? 4_000;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.maxMessagesPerSecond = options.maxMessagesPerSecond ?? DEFAULT_MAX_MESSAGES_PER_SECOND;
    this.maxBytesPerSecond = options.maxBytesPerSecond ?? DEFAULT_MAX_BYTES_PER_SECOND;
    for (const peer of this.bootstrapPeers) {
      this.peerBook.set(peer, { address: peer, lastSuccess: 0, fails: 0, addedAt: Date.now() });
      this.protectedPeers.add(peer);
    }
  }

  async start(): Promise<void> {
    await this.loadPeerBook();
    this.wss = new WebSocketServer({
      port: this.options.port,
      maxPayload: this.maxMessageBytes,
      ...(this.bindHost ? { host: this.bindHost } : {})
    });
    this.wss.on("connection", (socket, request) =>
      this.attachSocket(socket, request.socket.remoteAddress ?? "")
    );
    for (const peer of this.knownDialAddresses()) {
      await this.connect(peer);
    }
    this.reconnectTimer = setInterval(() => {
      void this.ensurePeerConnections();
    }, this.reconnectMs);
  }

  on<K extends keyof GossipEvents>(event: K, listener: GossipEvents[K]): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  peerCount(): number {
    return this.sockets.size;
  }

  outboundPeerCount(): number {
    return [...this.outbound.values()].filter((socket) => socket.readyState === WebSocket.OPEN).length;
  }

  reconnectCount(): number {
    return this.reconnectAttempts;
  }

  bannedPeerCount(): number {
    const now = Date.now();
    let count = 0;
    for (const until of this.bannedUntil.values()) {
      if (until > now) {
        count += 1;
      }
    }
    return count;
  }

  banPeer(addressOrPeerId: string, reason = "manual"): void {
    const address = normalizePeerAddress(addressOrPeerId);
    const key = address || addressOrPeerId;
    this.bannedUntil.set(key, Date.now() + BAN_MS);
    const socket = this.outbound.get(key) ?? this.localIdSockets.get(key);
    socket?.close();
    void reason;
  }

  private remember(id: string): boolean {
    if (this.seen.has(id)) {
      return false;
    }
    this.seen.add(id);
    if (this.seen.size > MAX_SEEN) {
      const first = this.seen.values().next().value as string | undefined;
      if (first) {
        this.seen.delete(first);
        this.evictPayload(first);
      }
    }
    return true;
  }

  private evictPayload(id: string): void {
    this.cachedBytes -= this.cacheSizes.get(id) ?? 0;
    this.cacheSizes.delete(id);
    if (id.startsWith("tx:")) this.txPool.delete(id.slice(3));
    if (id.startsWith("block:")) this.blockPool.delete(id.slice(6));
  }

  private cachePayload(kind: "tx" | "block", id: string, value: Transaction | Block): void {
    const key = `${kind}:${id}`;
    this.evictPayload(key);
    const size = Buffer.byteLength(JSON.stringify(value));
    const budget = 16 * 1024 * 1024;
    if (size > Math.min(budget,this.maxMessageBytes)) return;
    while (this.cachedBytes + size > budget && this.cacheSizes.size) this.evictPayload(this.cacheSizes.keys().next().value!);
    this.cacheSizes.set(key,size);
    this.cachedBytes += size;
    if (kind === "tx") this.txPool.set(id,value as Transaction);
    else this.blockPool.set(id,value as Block);
  }

  private knownDialAddresses(): string[] {
    const now = Date.now();
    return this.rankedPeerEntries([...this.peerBook.values()])
      .filter((entry) => (this.bannedUntil.get(entry.address) ?? 0) <= now)
      .map((entry) => entry.address)
      .slice(0, this.maxPeers);
  }

  private attachSocket(socket: WebSocket, remoteAddress = ""): void {
    if (this.sockets.size >= this.maxPeers || this.inboundSockets.size >= this.maxInboundPeers) { socket.close(); return; }
    const ip = remoteAddress || "unknown";
    const ipKey = peerIpKey(ip);
    if (!this.reserveIpSlot(socket, ipKey)) { socket.close(); return; }
    this.inboundSockets.add(socket);
    // Cap unfinished handshakes per IP so a peer cannot fill the peer table with sockets
    // that never say hello, and time out the ones it does open.
    if (!this.beginHandshake(ip)) { this.releaseIpSlot(socket); this.inboundSockets.delete(socket); socket.close(); return; }
    this.socketIps.set(socket, ip);
    this.sockets.add(socket);
    const handshakeTimer = setTimeout(() => {
      if (!this.handshakes.has(socket)) {
        socket.close();
      }
    }, this.handshakeTimeoutMs);
    handshakeTimer.unref?.();
    this.handshakeTimers.set(socket, handshakeTimer);

    socket.on("error", () => socket.close());
    socket.on("message", (raw) => {
      try {
        const text = String(raw);
        if (text.length > this.maxMessageBytes) {
          this.banPeerBySocket(socket);
          return;
        }
        if (!this.allowMessage(socket, Buffer.byteLength(text))) {
          this.banPeerBySocket(socket);
          return;
        }
        const message = JSON.parse(text) as WireMessage;
        this.handleMessage(message, socket);
      } catch {
        // ignore malformed wire messages
      }
    });
    socket.on("close", () => {
      this.finishHandshake(socket);
      this.sockets.delete(socket);
      this.inboundSockets.delete(socket);
      this.releaseIpSlot(socket);
      this.releaseSocketId(socket);
    });
    this.send(socket, {
      type: "hello",
      peerId: this.peerId,
      payload: { ok: true, chainId: this.options.chainId ?? "people-devnet", identity: this.peerId, listen: this.listenAddress() }
    });
  }

  /** Count a connection against its remote IP; false if the per-IP limit is already reached. */
  private reserveIpSlot(socket: WebSocket, key: string): boolean {
    if (!isLoopbackKey(key) && (this.connectionsByIp.get(key) ?? 0) >= this.maxPeersPerIp) return false;
    this.socketIpKeys.set(socket, key);
    this.connectionsByIp.set(key, (this.connectionsByIp.get(key) ?? 0) + 1);
    return true;
  }

  private releaseIpSlot(socket: WebSocket): void {
    const key = this.socketIpKeys.get(socket);
    if (key === undefined) return;
    this.socketIpKeys.delete(socket);
    const left = (this.connectionsByIp.get(key) ?? 1) - 1;
    if (left <= 0) this.connectionsByIp.delete(key);
    else this.connectionsByIp.set(key, left);
  }

  private beginHandshake(ip: string): boolean {
    const pending = this.pendingHandshakesByIp.get(ip) ?? 0;
    if (pending >= MAX_PENDING_HANDSHAKES_PER_IP) return false;
    this.pendingHandshakesByIp.set(ip, pending + 1);
    return true;
  }

  private finishHandshake(socket: WebSocket): void {
    const timer = this.handshakeTimers.get(socket);
    if (timer) {
      clearTimeout(timer);
      this.handshakeTimers.delete(socket);
    }
    const ip = this.socketIps.get(socket);
    if (ip) {
      const pending = (this.pendingHandshakesByIp.get(ip) ?? 1) - 1;
      if (pending <= 0) this.pendingHandshakesByIp.delete(ip);
      else this.pendingHandshakesByIp.set(ip, pending);
      this.socketIps.delete(socket);
    }
  }

  /** Per-socket message/byte budget. Exceeding it closes (and for outbound, bans) the peer. */
  private allowMessage(socket: WebSocket, bytes: number): boolean {
    const now = Date.now();
    const state = this.messageRates.get(socket);
    if (!state || now - state.start > 1_000) {
      this.messageRates.set(socket, { start: now, messages: 1, bytes });
      return true;
    }
    state.messages += 1;
    state.bytes += bytes;
    return state.messages <= this.maxMessagesPerSecond && state.bytes <= this.maxBytesPerSecond;
  }

  /** A socket's routing identity is minted locally; a peer's own `peerId` is never trusted. */
  private assignSocketId(socket: WebSocket): string {
    const existing = this.socketLocalIds.get(socket);
    if (existing) return existing;
    const id = `local-${++this.localIdSeq}`;
    this.socketLocalIds.set(socket, id);
    this.localIdSockets.set(id, socket);
    return id;
  }

  private releaseSocketId(socket: WebSocket): void {
    const id = this.socketLocalIds.get(socket);
    if (id) {
      this.localIdSockets.delete(id);
      this.socketLocalIds.delete(socket);
    }
  }

  advertisedListenAddress(): string {
    return this.listenAddress();
  }

  private listenAddress(): string {
    const advertised = this.options.advertiseAddress?.trim();
    if (advertised) {
      return normalizePeerAddress(advertised);
    }
    return `ws://127.0.0.1:${this.options.port}`;
  }

  private async ensurePeerConnections(): Promise<void> {
    for (const peer of this.knownDialAddresses()) {
      const existing = this.outbound.get(peer);
      if (existing && existing.readyState === WebSocket.OPEN) {
        continue;
      }
      const until = this.backoffUntil.get(peer) ?? 0;
      if (Date.now() < until) {
        continue;
      }
      this.reconnectAttempts += 1;
      await this.connect(peer);
    }
  }

  private async connect(url: string): Promise<void> {
    const address = normalizePeerAddress(url);
    if (!address) {
      return;
    }
    if ((this.bannedUntil.get(address) ?? 0) > Date.now()) {
      return;
    }
    try {
      if (this.sockets.size >= this.maxPeers || this.outbound.has(address)) return;
      const dialKey = peerIpKey(new URL(address).hostname);
      if (!isLoopbackKey(dialKey) && (this.connectionsByIp.get(dialKey) ?? 0) >= this.maxPeersPerIp) return;
      const socket = new WebSocket(address, { maxPayload: this.maxMessageBytes });
      this.reserveIpSlot(socket, dialKey);
      this.outbound.set(address, socket);
      const failTimer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.terminate();
          this.recordDialFailure(address);
        }
      }, this.dialTimeoutMs);

      socket.on("open", () => {
        clearTimeout(failTimer);
        // The hostname may have resolved to an address that is already at its limit.
        const remote = (socket as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
        const actualKey = remote ? peerIpKey(remote) : dialKey;
        if (actualKey !== dialKey) {
          this.releaseIpSlot(socket);
          if (!this.reserveIpSlot(socket, actualKey)) {
            socket.close();
            return;
          }
        }
        this.sockets.add(socket);
        this.recordDialSuccess(address);
        this.emitter.emit("peer_joined", address);
        this.send(socket, {
          type: "hello",
          peerId: this.peerId,
          payload: { ok: true, chainId: this.options.chainId ?? "people-devnet", identity: this.peerId, listen: this.listenAddress() }
        });
        this.sendPeerExchange(socket);
      });
      socket.on("message", (raw) => {
        try {
          const text = String(raw);
          if (text.length > this.maxMessageBytes) {
            this.banPeer(address, "oversized");
            return;
          }
          if (!this.allowMessage(socket, Buffer.byteLength(text))) {
            this.banPeer(address, "rate_limited");
            return;
          }
          const message = JSON.parse(text) as WireMessage;
          this.handleMessage(message, socket);
        } catch {
          // ignore
        }
      });
      socket.on("close", () => {
        clearTimeout(failTimer);
        this.sockets.delete(socket);
        this.releaseIpSlot(socket);
        this.releaseSocketId(socket);
        if (this.outbound.get(address) === socket) {
          this.outbound.delete(address);
        }
      });
      socket.on("error", () => {
        this.recordDialFailure(address);
      });
    } catch {
      this.recordDialFailure(address);
    }
  }

  private peerBookCap(): number {
    return this.maxPeers * PEER_BOOK_FACTOR;
  }

  /**
   * Make room for one more entry. Unverified candidates (never connected) go first, worst
   * failure count then oldest; verified ones only go when the incoming entry is itself
   * verified, oldest lastSuccess first. Configured bootstrap peers are never evicted.
   */
  private evictForNewEntry(incomingVerified: boolean): boolean {
    let victim: PeerBookEntry | undefined;
    const worse = (a: PeerBookEntry, b: PeerBookEntry): boolean => {
      const aVerified = a.lastSuccess > 0;
      const bVerified = b.lastSuccess > 0;
      if (aVerified !== bVerified) return !aVerified;
      if (!aVerified) return a.fails !== b.fails ? a.fails > b.fails : (a.addedAt ?? 0) < (b.addedAt ?? 0);
      return a.lastSuccess !== b.lastSuccess ? a.lastSuccess < b.lastSuccess : a.fails > b.fails;
    };
    for (const entry of this.peerBook.values()) {
      if (this.protectedPeers.has(entry.address)) continue;
      // An unverified newcomer may only displace an unverified entry that has already failed.
      if (!incomingVerified && (entry.lastSuccess > 0 || entry.fails === 0)) continue;
      if (!victim || worse(entry, victim)) victim = entry;
    }
    if (!victim) return false;
    this.peerBook.delete(victim.address);
    return true;
  }

  /** Insert or return the entry for `address`, enforcing the size cap. Null if rejected. */
  private upsertPeerEntry(address: string, verified: boolean): PeerBookEntry | null {
    const existing = this.peerBook.get(address);
    if (existing) return existing;
    if (this.peerBook.size >= this.peerBookCap() && !this.evictForNewEntry(verified)) return null;
    const entry: PeerBookEntry = { address, lastSuccess: 0, fails: 0, addedAt: Date.now() };
    this.peerBook.set(address, entry);
    return entry;
  }

  private recordDialSuccess(address: string): void {
    const entry = this.upsertPeerEntry(address, true);
    if (!entry) return;
    entry.lastSuccess = Date.now();
    entry.fails = 0;
    this.backoffUntil.delete(address);
    this.queuePersistPeerBook();
  }

  private recordDialFailure(address: string): void {
    const entry = this.peerBook.get(address);
    if (!entry) return;
    entry.fails += 1;
    if (entry.lastSuccess === 0 && entry.fails >= PEER_BOOK_MAX_FAILS && !this.protectedPeers.has(address)) {
      // Never reachable and repeatedly failing: forget it instead of keeping the slot.
      this.peerBook.delete(address);
      this.backoffUntil.delete(address);
      this.bannedUntil.set(address, Date.now() + BAN_MS);
      this.queuePersistPeerBook();
      return;
    }
    const delay = Math.min(60_000, this.reconnectMs * 2 ** Math.min(6, entry.fails));
    this.backoffUntil.set(address, Date.now() + delay);
    if (entry.fails >= 8) {
      this.bannedUntil.set(address, Date.now() + BAN_MS);
    }
    this.queuePersistPeerBook();
  }

  private banPeerBySocket(socket: WebSocket): void {
    for (const [address, peerSocket] of this.outbound.entries()) {
      if (peerSocket === socket) {
        this.banPeer(address, "oversized");
        return;
      }
    }
    socket.close();
  }

  private sendPeerExchange(socket: WebSocket): void {
    const peers = this.knownDialAddresses().slice(0, PEER_EXCHANGE_LIMIT);
    this.send(socket, {
      type: "peers",
      peerId: this.peerId,
      payload: { peers }
    });
  }

  recordListenHint(raw: string): void {
    this.rememberPeerAddress(raw);
  }

  recordedPeerAddresses(): string[] {
    return [...this.peerBook.keys()];
  }

  private rememberPeerAddress(raw: string): void {
    const address = normalizePeerAddress(raw);
    if (!address || address === this.listenAddress()) {
      return;
    }
    let hostname = "";
    try {
      hostname = new URL(address).hostname;
    } catch {
      return;
    }
    if (isPrivateOrLocalHost(hostname)) {
      return;
    }
    if (!this.peerBook.has(address) && this.upsertPeerEntry(address, false)) {
      this.queuePersistPeerBook();
    }
  }

  private handleMessage(message: WireMessage, socket: WebSocket): void {
    if (!message || typeof message !== "object" || typeof message.peerId !== "string" || message.peerId.length > 256) { socket.close(); return; }
    if (message.type !== "hello" && (!this.handshakes.has(socket) || this.socketIdentities.get(socket) !== message.peerId)) { socket.close(); return; }
    if (message.type === "hello") {
      const hello = message.payload as {chainId?:string};
      if (hello?.chainId !== (this.options.chainId ?? "people-devnet")) { socket.close(); return; }
      if (this.handshakes.has(socket)) { socket.close(); return; }
      this.handshakes.add(socket);
      this.socketIdentities.set(socket,message.peerId);
      // Routing identity is minted locally: a peer cannot claim another peer's id to
      // intercept blocks addressed to it.
      this.assignSocketId(socket);
      this.finishHandshake(socket);
      const payload = message.payload as { listen?: string } | null;
      if (payload?.listen) {
        this.rememberPeerAddress(payload.listen);
      }
      this.emitter.emit("peer_joined", message.peerId);
      this.sendPeerExchange(socket);
      return;
    }
    if (message.type === "peers") {
      const payload = message.payload as { peers?: string[] };
      if (!Array.isArray(payload?.peers) || payload.peers.length > this.maxPeers * 4) return;
      for (const peer of payload.peers) {
        if (typeof peer !== "string" || peer.length > 2048) continue;
        this.rememberPeerAddress(peer);
      }
      return;
    }
    if (message.type === "tx") {
      const tx = message.payload as Transaction;
      if (!tx || typeof tx.id !== "string" || tx.id.length > 256) { socket.close(); return; }
      // Derive the dedup key from the signed content, not the id the peer declares, so a
      // forged envelope cannot poison the seen-set for a real transaction.
      const contentId = gossipTxContentId(tx);
      if (!contentId) return;
      if (!this.remember(`tx:${contentId}`)) {
        return;
      }
      this.cachePayload("tx",tx.id,tx);
      this.emitter.emit("tx", tx);
      return;
    }
    if (message.type === "block") {
      const block = message.payload as Block;
      if (!validWireBlock(block)) { socket.close(); return; }
      if (!this.remember(`block:${block.hash}`)) {
        return;
      }
      this.cachePayload("block",block.hash,block);
      this.emitter.emit("block", block);
      return;
    }
    if (message.type === "request_blocks") {
      const payload = message.payload as { fromHeight?: number; toHeight?: number };
      if (!Number.isSafeInteger(payload?.fromHeight) || !Number.isSafeInteger(payload?.toHeight) || payload.fromHeight! < 0 || payload.toHeight! < payload.fromHeight! || payload.toHeight! - payload.fromHeight! >= 100) return;
      this.emitter.emit(
        "request_blocks",
        Number(payload.fromHeight ?? 0),
        Number(payload.toHeight ?? 0),
        // Local socket id: the reply is routed back to this exact socket, never to whatever
        // peer id the sender claimed.
        this.assignSocketId(socket)
      );
      return;
    }
    if (message.type === "blocks_response") {
      const payload = message.payload as { blocks?: Block[]; gz?: string };
      let blocks: Block[] = [];
      if (payload.gz) {
        try {
          blocks = JSON.parse(gunzipSync(Buffer.from(payload.gz, "base64"), {maxOutputLength:this.maxMessageBytes}).toString("utf8")) as Block[];
        } catch {
          return;
        }
      } else if (Array.isArray(payload.blocks)) {
        blocks = payload.blocks;
      } else if (Array.isArray(message.payload)) {
        blocks = message.payload as Block[];
      }
      if (!Array.isArray(blocks) || blocks.length === 0 || blocks.length > 100 || !blocks.every(validWireBlock)) {
        return;
      }
      this.emitter.emit("blocks_response", blocks);
      return;
    }
    if (message.type === "inv") {
      const payload = message.payload as { kind?: "tx" | "block"; id?: string };
      if (!payload.id || !payload.kind) {
        return;
      }
      if (payload.kind === "tx" && this.seen.has(`tx:${payload.id}`)) {
        return;
      }
      if (payload.kind === "block" && this.seen.has(`block:${payload.id}`)) {
        return;
      }
      this.send(socket, {
        type: "getdata",
        peerId: this.peerId,
        payload
      });
      return;
    }
    if (message.type === "getdata") {
      const payload = message.payload as { kind?: "tx" | "block"; id?: string };
      if (!payload.id || !payload.kind) {
        return;
      }
      if (payload.kind === "tx") {
        const tx = this.txPool.get(payload.id);
        if (tx) {
          this.send(socket, { type: "tx", peerId: this.peerId, payload: tx });
        }
        return;
      }
      if (payload.kind === "block") {
        const block = this.blockPool.get(payload.id);
        if (block) {
          this.send(socket, { type: "block", peerId: this.peerId, payload: block });
        }
      }
    }
  }

  private send(socket: WebSocket, message: WireMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      if (socket.bufferedAmount > this.maxMessageBytes * 2) { socket.close(); return; }
      if (Buffer.byteLength(payload) <= this.maxMessageBytes) {
        socket.send(payload);
      }
    }
  }

  broadcast(message: WireMessage): void {
    for (const socket of this.sockets) {
      this.send(socket, message);
    }
  }

  publishTx(tx: Transaction): void {
    this.remember(`tx:${gossipTxContentId(tx) ?? tx.id}`);
    this.cachePayload("tx",tx.id,tx);
    this.broadcast({ type: "inv", peerId: this.peerId, payload: { kind: "tx", id: tx.id } });
  }

  publishBlock(block: Block): void {
    this.remember(`block:${block.hash}`);
    this.cachePayload("block",block.hash,block);
    this.broadcast({ type: "inv", peerId: this.peerId, payload: { kind: "block", id: block.hash } });
  }

  requestBlocks(fromHeight: number, toHeight: number): void {
    this.broadcast({
      type: "request_blocks",
      peerId: this.peerId,
      payload: { fromHeight, toHeight }
    });
  }

  sendBlocks(blocks: Block[], targetPeerId?: string): void {
    const raw = JSON.stringify(blocks);
    const payload =
      raw.length > BULK_SYNC_GZIP_THRESHOLD
        ? { gz: gzipSync(raw).toString("base64") }
        : { blocks };
    const message: WireMessage = {
      type: "blocks_response",
      peerId: this.peerId,
      payload
    };
    if (targetPeerId) {
      // The target id is the locally minted socket id from `request_blocks`; if that socket
      // is gone the sync reply is dropped rather than broadcast to every peer.
      const target = this.localIdSockets.get(targetPeerId);
      if (target) {
        this.send(target, message);
      }
      return;
    }
    this.broadcast(message);
  }

  buildJoinBundle(validatorPubKey: string): {
    peerId: string;
    bootstrapPeers: string[];
    validatorPubKey: string;
    gossipPort: number;
  } {
    return {
      peerId: this.peerId,
      bootstrapPeers: this.knownDialAddresses().slice(0, PEER_EXCHANGE_LIMIT),
      validatorPubKey,
      gossipPort: this.options.port
    };
  }

  private queuePersistPeerBook(): void {
    if (!this.peerBookPath || this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.savePeerBook();
    }, 1_000);
  }

  /** Verified entries first (most recent success), then unverified by fewest failures and age. */
  private rankedPeerEntries(entries: PeerBookEntry[]): PeerBookEntry[] {
    return [...entries].sort((a, b) =>
      (this.protectedPeers.has(b.address) ? 1 : 0) - (this.protectedPeers.has(a.address) ? 1 : 0) ||
      b.lastSuccess - a.lastSuccess ||
      a.fails - b.fails ||
      (b.addedAt ?? 0) - (a.addedAt ?? 0)
    );
  }

  private async loadPeerBook(): Promise<void> {
    if (!this.peerBookPath) {
      return;
    }
    try {
      const raw = await readFile(this.peerBookPath, "utf8");
      const parsed = JSON.parse(raw) as { peers?: PeerBookEntry[] };
      const loaded = Array.isArray(parsed.peers) ? parsed.peers : [];
      // Best entries first, so a bloated or poisoned file cannot crowd out good ones.
      const sanitized: PeerBookEntry[] = [];
      for (const entry of loaded) {
        if (!entry || typeof entry.address !== "string" || entry.address.length > 2048) continue;
        const address = normalizePeerAddress(entry.address);
        if (!address) continue;
        const lastSuccess = Number(entry.lastSuccess ?? 0);
        const fails = Number(entry.fails ?? 0);
        const addedAt = Number(entry.addedAt ?? 0);
        sanitized.push({
          address,
          lastSuccess: Number.isFinite(lastSuccess) && lastSuccess > 0 ? lastSuccess : 0,
          fails: Number.isFinite(fails) && fails > 0 ? fails : 0,
          addedAt: Number.isFinite(addedAt) && addedAt > 0 ? addedAt : 0
        });
      }
      for (const entry of this.rankedPeerEntries(sanitized)) {
        if (this.peerBook.has(entry.address)) {
          const known = this.peerBook.get(entry.address)!;
          known.lastSuccess = Math.max(known.lastSuccess, entry.lastSuccess);
          known.fails = entry.fails;
          continue;
        }
        if (this.peerBook.size >= this.peerBookCap()) break;
        if (entry.lastSuccess === 0 && entry.fails >= PEER_BOOK_MAX_FAILS) continue;
        this.peerBook.set(entry.address, entry);
      }
    } catch {
      // no peer book yet
    }
  }

  private async savePeerBook(): Promise<void> {
    if (!this.peerBookPath) {
      return;
    }
    try {
      await mkdir(dirname(this.peerBookPath), { recursive: true });
      const peers = this.rankedPeerEntries([...this.peerBook.values()]).slice(0, this.peerBookCap());
      await writeFile(this.peerBookPath, JSON.stringify({ peers }, null, 2), "utf8");
    } catch {
      // ignore persist errors
    }
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.savePeerBook();
    for (const socket of this.sockets) {
      socket.close();
    }
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    }
  }
}

function validWireBlock(block: Block): boolean {
  return Boolean(block && typeof block.hash === "string" && block.hash.length <= 128 && block.header &&
    Number.isSafeInteger(block.header.height) && block.header.height >= 0 && Array.isArray(block.transactions) && block.transactions.length <= 100);
}
