import Fastify from "fastify";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NodeService } from "./node-service.js";
import { isAllowedCorsOrigin } from "./cors.js";
import { allowKeyedRate } from "./rate-limit.js";
import { registerJsonRpcRoutes } from "./json-rpc.js";

function parseBootstrapPeers(raw: string): string[] {
  return raw
    .split(",")
    .map((peer) => peer.trim())
    .filter(Boolean)
    .map((peer) =>
      peer.startsWith("ws://") || peer.startsWith("wss://") ? peer : `ws://${peer}`
    );
}

const peerId = process.env.PEER_ID ?? `peer-${Math.floor(Math.random() * 10_000)}`;
const port = Number(process.env.PORT ?? 4001);
const gossipPort = Number(process.env.GOSSIP_PORT ?? port + 1);
const dataDir = process.env.DATA_DIR ?? `./data/${peerId}`;
const bootstrapPeers = parseBootstrapPeers(process.env.BOOTSTRAP_PEERS ?? "");
const advertiseAddress = (process.env.PUBLIC_GOSSIP_URL ?? process.env.GOSSIP_ADVERTISE ?? "").trim();

const node = new NodeService({
  dataDir,
  peerId,
  gossipPort,
  bootstrapPeers,
  advertiseAddress: advertiseAddress || undefined
});

/**
 * Who may set the forwarded-for header. Defaults to loopback (a reverse proxy on the same
 * host); `TRUST_PROXY` overrides it — `false`/`off` ignores the header entirely, `true`/`all`
 * trusts it unconditionally (only safe when nothing else can reach the node), or pass a
 * comma-separated list of proxy IPs/CIDRs.
 */
function parseTrustProxy(raw: string | undefined): boolean | string[] {
  const value = (raw ?? "").trim();
  if (!value) return ["127.0.0.1", "::1"];
  const lower = value.toLowerCase();
  if (lower === "false" || lower === "off" || lower === "none") return false;
  if (lower === "true" || lower === "all") return true;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const server = Fastify({ logger: true, trustProxy: parseTrustProxy(process.env.TRUST_PROXY) });
const MAX_WS_BUFFERED_BYTES = Number(process.env.WS_MAX_BUFFERED_BYTES ?? 1_000_000);
const WS_HEARTBEAT_MS = Number(process.env.WS_HEARTBEAT_MS ?? 30_000);
const PERF_MAX_P95_MS = Number(process.env.PERF_MAX_P95_MS ?? 500);
const ipRateMap = new Map<string, { count: number; windowStart: number }>();
const GET_RATE = Number(process.env.PUBLIC_GET_RATE_LIMIT ?? 240);
const POST_TX_RATE = Number(process.env.PUBLIC_TX_RATE_LIMIT ?? 60);
const POST_RPC_RATE = Number(process.env.PUBLIC_RPC_RATE_LIMIT ?? 180);
const POST_FAUCET_RATE = Number(process.env.PUBLIC_FAUCET_IP_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = Number(process.env.PUBLIC_RATE_WINDOW_MS ?? 60_000);

function setCacheHeaders(reply: import("fastify").FastifyReply, maxAgeSeconds: number): void {
  reply.header("Cache-Control", `public, max-age=${Math.max(0, maxAgeSeconds)}`);
}

function etagFor(value: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(value)).digest("hex")}"`;
}

function clientIp(request: import("fastify").FastifyRequest): string {
  return request.ip;
}

/** List endpoints never accept a NaN, negative or oversized `limit` from a client. */
const MAX_LIST_LIMIT = Number(process.env.PUBLIC_LIST_MAX_LIMIT ?? 200);

function parseLimit(raw: string | undefined, fallback: number, max = MAX_LIST_LIMIT): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function parseOffset(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false;
  }
  return header.split(",").some((part) => part.trim() === etag || part.trim() === etag.replace(/"/g, ""));
}

async function sendCached(
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  body: unknown,
  maxAgeSeconds: number
) {
  const etag = etagFor(body);
  setCacheHeaders(reply, maxAgeSeconds);
  reply.header("ETag", etag);
  if (matchesEtag(request.headers["if-none-match"], etag)) {
    return reply.code(304).send();
  }
  return body;
}

server.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type,x-api-token,if-none-match");
  }
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  if (request.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

server.addHook("onRequest", async (request, reply) => {
  const path = request.url.split("?")[0] ?? "";
  if (request.method === "OPTIONS" || path === "/health" || path === "/ready") {
    return;
  }
  const ip = request.ip || "unknown";
  const limit =
    request.method === "POST" && path.startsWith("/faucet")
      ? POST_FAUCET_RATE
      : request.method === "POST" && (path === "/rpc" || path === "/")
        ? POST_RPC_RATE
        : request.method === "POST" && path.startsWith("/tx")
          ? POST_TX_RATE
          : GET_RATE;
  if (!allowKeyedRate(ipRateMap, `${request.method}:${path.split("/")[1] ?? ""}:${ip}`, limit, RATE_WINDOW_MS)) {
    return reply.code(429).send({ error: "rate_limited" });
  }
});

server.addHook("onResponse", async (request, reply) => {
  if (request.method === "GET" && reply.statusCode < 400) {
    const start = (request as import("fastify").FastifyRequest & { _startMs?: number })._startMs;
    if (start) {
      node.recordApiRequest(Date.now() - start);
    }
  }
});

server.addHook("onRequest", async (request) => {
  (request as import("fastify").FastifyRequest & { _startMs?: number })._startMs = Date.now();
});

server.get("/", async () => ({
  service: "people-node-node-api",
  ok: true,
  chainId: node.config.chainId,
  peerId,
  gossipPort,
  consensus: "leader-based-pos",
  docs: [
    "GET /health",
    "GET /health/details",
    "GET /metrics",
    "GET /metrics/prometheus",
    "GET /security/slash-candidate",
    "GET /openapi.yaml",
    "GET /chain/head",
    "GET /snapshot",
    "GET /blocks?limit=10&offset=0",
    "GET /blocks?limit=10&cursor=100",
    "GET /blocks/:height",
    "GET /transactions?limit=20&offset=0",
    "GET /transactions?limit=20&cursor=tx-id",
    "GET /transactions/:id",
    "GET /search?q=",
    "GET /address/:address",
    "GET /address/:address/transactions",
    "GET /accounts?limit=100&offset=0",
    "GET /chain/config",
    "GET /validators",
    "GET /assets",
    "GET /assets/:assetId",
    "GET /nfts",
    "GET /nfts/:nftId",
    "GET /contracts",
    "GET /contracts/params",
    "GET /contracts/:address",
    "POST /contracts/call",
    "GET /community-pool",
    "GET /community-pool/:assetId",
    "GET /rewards/latest",
    "GET /rewards/history",
    "GET /governance/proposals",
    "WS /ws",
    "POST /tx",
    "POST /bootstrap",
    "POST /faucet/fund",
    "POST /security/report",
    "POST /rpc (JSON-RPC 2.0 eth_* read-only)",
    "POST / (JSON-RPC when Content-Type is application/json)"
  ]
}));

registerJsonRpcRoutes(server, node);

server.get("/health", async (): Promise<import("@people/protocol").HealthResponse> => ({
  ok: true,
  chainId: node.config.chainId,
  peerId
}));

server.get("/health/details", async () => node.getHealthDetails());

server.get("/ready", async () => ({
  ok: true,
  peerId,
  height: node.getHead().height
}));

server.get("/metrics", async () => node.getMetrics());

server.get("/metrics/prometheus", async (_request, reply) => {
  reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
  return node.getPrometheusMetrics();
});

server.get("/security/slash-candidate", async () => ({
  candidate: node.getLatestSlashCandidate()
}));

server.get("/openapi.yaml", async (request, reply) => {
  const spec = await readFile(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8");
  reply.header("content-type", "application/yaml");
  return sendCached(request, reply, spec, 60);
});

server.get("/network", async () => node.getPublicNetworkInfo());

server.get("/chain/head", async () => node.getHead());

server.get("/snapshot", async () => node.getSnapshot());

server.get("/blocks", async (request) => {
  const { limit, offset, cursor } = request.query as { limit?: string; offset?: string; cursor?: string };
  if (cursor !== undefined) {
    const parsedCursor = Number(cursor);
    const result = node.getRecentBlocksCursor(
      parseLimit(limit, 10),
      Number.isFinite(parsedCursor) ? parsedCursor : undefined
    );
    return { ...result, mode: "cursor" };
  }
  return node.getRecentBlocks(parseLimit(limit, 10), parseOffset(offset));
});

server.get("/blocks/:height", async (request, reply) => {
  const { height } = request.params as { height: string };
  const block = node.getBlockByHeight(Number(height));
  if (!block) {
    return reply.code(404).send({ error: "not_found" });
  }
  return block;
});

server.get("/transactions", async (request) => {
  const { limit, offset, cursor } = request.query as { limit?: string; offset?: string; cursor?: string };
  if (cursor !== undefined) {
    const result = node.getRecentTransactionsCursor(parseLimit(limit, 20), cursor);
    return { ...result, mode: "cursor" };
  }
  return node.getRecentTransactions(parseLimit(limit, 20), parseOffset(offset));
});

server.get("/transactions/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const tx = node.getTransactionById(id);
  if (!tx) {
    return reply.code(404).send({ error: "not_found" });
  }
  return tx;
});

server.get("/search", async (request) => {
  const { q } = request.query as { q?: string };
  return node.search(q ?? "");
});

server.get("/address/:address/transactions", async (request) => {
  const { address } = request.params as { address: string };
  const { limit, offset, cursor } = request.query as { limit?: string; offset?: string; cursor?: string };
  if (cursor !== undefined) {
    const result = node.getTransactionsByAddressCursor(address, parseLimit(limit, 50), cursor);
    return { ...result, mode: "cursor" };
  }
  return node.getTransactionsByAddress(address, parseLimit(limit, 50), parseOffset(offset));
});

server.get("/address/:address", async (request) => {
  const { address } = request.params as { address: string };
  return node.getAccount(address);
});

server.get("/address/:address/balances", async (request) => {
  const { address } = request.params as { address: string };
  return node.getAccountBalances(address);
});

server.get("/address/:address/balances/:assetId", async (request) => {
  const { address, assetId } = request.params as { address: string; assetId: string };
  return node.getAccountBalance(address, assetId);
});

server.get("/accounts", async (request) => {
  const { limit, offset } = request.query as { limit?: string; offset?: string };
  return node.listAccounts(parseLimit(limit, 100), parseOffset(offset));
});

server.get("/chain/config", async (request, reply) => {
  return sendCached(request, reply, node.getChainConfig(), 30);
});

server.get("/validators", async (request, reply) => {
  return sendCached(request, reply, Object.values(node.chainState.validators), 5);
});

server.get("/assets", async () => node.listAssets());

server.get("/nfts", async (request) => {
  const { owner } = request.query as { owner?: string };
  if (owner) {
    return node.listOwnedNfts(owner);
  }
  return node.listNfts();
});

server.get("/nfts/:nftId", async (request, reply) => {
  const { nftId } = request.params as { nftId: string };
  const nft = node.getNft(nftId);
  if (!nft) {
    return reply.code(404).send({ error: "nft_not_found" });
  }
  return nft;
});

server.get("/contracts", async () => node.listContracts());

server.get("/contracts/params", async () => node.getContractParams());

server.get("/contracts/:address", async (request, reply) => {
  const { address } = request.params as { address: string };
  const contract = node.getContract(address);
  if (!contract) {
    return reply.code(404).send({ error: "contract_not_found" });
  }
  return contract;
});

server.get("/contracts/:address/logs", async (request, reply) => {
  const { address } = request.params as { address: string };
  const contract = node.getContract(address);
  if (!contract) {
    return reply.code(404).send({ error: "contract_not_found" });
  }
  return contract.receipts.flatMap((item) =>
    item.logs.map((log) => ({ ...log, txId: item.txId, status: item.status }))
  );
});

server.post("/contracts/call", async (request, reply) => {
  if (!node.allowContractCall(clientIp(request))) {
    return reply.code(429).send({ error: "contract_call_rate_limited" });
  }
  const body = request.body as { from?: string; to?: string; data?: string; gasLimit?: number };
  if (!body?.to) {
    return reply.code(400).send({ error: "to_required" });
  }
  return node.staticContractCall({
    from: body.from,
    to: body.to,
    data: body.data,
    gasLimit: body.gasLimit
  });
});

server.get("/assets/:assetId", async (request, reply) => {
  const { assetId } = request.params as { assetId: string };
  const asset = node.getAsset(assetId);
  if (!asset) {
    return reply.code(404).send({ error: "asset_not_found" });
  }
  return asset;
});

server.get("/assets/:assetId/curve", async (request, reply) => {
  const { assetId } = request.params as { assetId: string };
  const curve = node.getCurve(assetId);
  if (!curve) {
    return reply.code(404).send({ error: "curve_not_found" });
  }
  return curve;
});

server.get("/assets/:assetId/vesting", async (request, reply) => {
  const { assetId } = request.params as { assetId: string };
  const vesting = node.getCreatorVesting(assetId);
  if (!vesting) {
    return reply.code(404).send({ error: "vesting_not_found" });
  }
  return vesting;
});

server.get("/assets/:assetId/liquidity", async (request) => {
  const { assetId } = request.params as { assetId: string };
  return node.getAssetLiquidity(assetId);
});

server.get("/liquidity-pools", async () => node.listLiquidityPools());

server.get("/liquidity-pools/:poolId", async (request, reply) => {
  const { poolId } = request.params as { poolId: string };
  const pool = node.getLiquidityPool(poolId);
  if (!pool) {
    return reply.code(404).send({ error: "pool_not_found" });
  }
  return pool;
});

server.get("/liquidity-pools/:poolId/quote", async (request, reply) => {
  const { poolId } = request.params as { poolId: string };
  const query = request.query as { tokenIn?: string; amountIn?: string; tokenOut?: string };
  const tokenIn = String(query.tokenIn ?? "").trim();
  const amountIn = Number(query.amountIn);
  if (!tokenIn || !Number.isFinite(amountIn) || amountIn <= 0) {
    return reply.code(400).send({ error: "invalid_quote" });
  }
  try {
    return node.quoteAmmSwap(poolId, tokenIn, amountIn, query.tokenOut);
  } catch (error) {
    const message = error instanceof Error ? error.message : "quote_failed";
    return reply.code(400).send({ error: "quote_failed", message });
  }
});

server.get("/community-pool", async () => node.getCommunityPool());

server.get("/community-pool/:assetId", async (request) => {
  const { assetId } = request.params as { assetId: string };
  return node.getCommunityPool(assetId);
});

server.get("/rewards/latest", async () => node.latestReward);

server.get("/rewards/history", async (request) => {
  const { limit } = request.query as { limit?: string };
  return node.getRewardHistory(parseLimit(limit, 50));
});

server.get("/governance/proposals", async () => node.listProposals());

server.post("/tx", async (request, reply) => {
  const tx = request.body as import("@people/protocol").Transaction;
  const result = node.submitTransaction(tx);
  if (!result.accepted) {
    return reply.code(result.error === "rate_limited" ? 429 : 400).send(result);
  }
  return result;
});

server.post("/bootstrap", async (request, reply) => {
  const { address, kind } = (request.body ?? {}) as { address?: string; kind?: string };
  // The bundle embeds the caller-supplied address and kind; validate both instead of
  // stringifying whatever the client sent.
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
    return reply.code(400).send({ ok: false, error: "invalid_address" });
  }
  if (kind !== "full" && kind !== "light") {
    return reply.code(400).send({ ok: false, error: "invalid_kind" });
  }
  return { qrPayload: node.buildBootstrapBundle(address.trim(), kind) };
});

server.post("/faucet/fund", async (request, reply) => {
  if (!node.isPublicFaucetEnabled()) {
    return reply.code(403).send({ ok: false, error: "faucet_forbidden" });
  }
  const { address, amount } = request.body as { address: string; amount: number };
  if (!address || amount <= 0) {
    return reply.code(400).send({ ok: false, error: "invalid_request" });
  }
  if (!node.allowFaucet(address)) {
    return reply.code(429).send({ ok: false, error: "faucet_rate_limited" });
  }
  // Second, per-caller limit so one IP cannot drain the faucet by rotating addresses.
  if (!allowKeyedRate(ipRateMap, `faucet-ip:${clientIp(request)}`, POST_FAUCET_RATE, RATE_WINDOW_MS)) {
    return reply.code(429).send({ ok: false, error: "faucet_rate_limited" });
  }
  try {
    const tx = node.fundFromFaucet(address, amount);
    return { ok: true, txId: tx.id, testnet: true, chainId: node.config.chainId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "faucet_disabled";
    const status =
      message === "faucet_busy"
        ? 503
        : message === "invalid_amount" || message === "faucet_amount_capped"
          ? 400
          : message === "faucet_daily_budget_exhausted"
            ? 429
            : 403;
    return reply.code(status).send({ ok: false, error: message });
  }
});

server.post("/security/report", async (request, reply) => {
  const token = request.headers["x-api-token"];
  const body = request.body as {
    validator: string;
    evidenceType?: "double_sign" | "conflicting_attestation";
    evidence?: import("@people/protocol").SlashEvidence;
  };
  const evidence = body.evidence ?? {
    type: body.evidenceType ?? "double_sign",
    validator: body.validator,
    height: 0,
    blockHashA: "a",
    blockHashB: "b"
  };
  const result = node.reportSecurity(
    body.validator,
    evidence,
    typeof token === "string" ? token : undefined
  );
  if (!result.ok) {
    return reply.code(result.error === "unauthorized" ? 401 : 400).send(result);
  }
  return result;
});

await node.start();
const bootHeight = node.getHead().height;
server.log.info(
  bootHeight > 0
    ? `Loaded persisted chain from ${dataDir} at height=${bootHeight}`
    : `No persisted chain in ${dataDir}; starting from genesis`
);
const address = await server.listen({ port, host: process.env.BIND_HOST ?? "0.0.0.0" });
const { WebSocketServer } = await import("ws");
const WS_MAX_PAYLOAD_BYTES = Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 1_000_000);
const WS_MAX_CONNECTIONS_PER_IP = Number(process.env.WS_MAX_CONNECTIONS_PER_IP ?? 20);
const WS_MAX_MESSAGES_PER_SECOND = Number(process.env.WS_MAX_MESSAGES_PER_SECOND ?? 20);
/** Live /ws sockets per remote IP (ws' default maxPayload is 100 MiB — cap it). */
const wsConnectionsByIp = new Map<string, number>();
const wss = new WebSocketServer({
  server: server.server,
  path: "/ws",
  maxPayload: WS_MAX_PAYLOAD_BYTES
});

function sendSafe(socket: import("ws").WebSocket, event: unknown): void {
  if (socket.readyState !== 1) {
    return;
  }
  if (socket.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
    node.recordWsDroppedClient();
    socket.terminate();
    return;
  }
  socket.send(JSON.stringify(event));
}

wss.on("connection", (socket, request) => {
  // Cap concurrent sockets and inbound messages per IP, mirroring the HTTP limits. An
  // unbounded public /ws would let one client exhaust file descriptors or the event loop.
  const ip = request.socket.remoteAddress ?? "unknown";
  const open = wsConnectionsByIp.get(ip) ?? 0;
  if (open >= WS_MAX_CONNECTIONS_PER_IP) {
    node.recordWsDroppedClient();
    socket.close(1013, "too_many_connections");
    return;
  }
  wsConnectionsByIp.set(ip, open + 1);
  socket.on("close", () => {
    const remaining = (wsConnectionsByIp.get(ip) ?? 1) - 1;
    if (remaining <= 0) wsConnectionsByIp.delete(ip);
    else wsConnectionsByIp.set(ip, remaining);
  });
  let messageRate = { start: Date.now(), messages: 0 };
  (socket as import("ws").WebSocket & { isAlive?: boolean }).isAlive = true;
  socket.on("pong", () => {
    (socket as import("ws").WebSocket & { isAlive?: boolean }).isAlive = true;
  });
  sendSafe(socket, {
    type: "hello",
    payload: {
      peerId,
      chainId: node.config.chainId,
      tokenSymbol: "PPL",
      tokenName: "People"
    }
  });
  sendSafe(socket, { type: "snapshot", payload: node.getSnapshot() });
  sendSafe(socket, { type: "metrics", payload: node.getMetrics() });
  sendSafe(socket, { type: "feed", payload: node.getLiveFeed() });
  sendSafe(socket, { type: "rewards", payload: node.latestReward });

  socket.on("message", (raw) => {
    const now = Date.now();
    if (now - messageRate.start > 1_000) {
      messageRate = { start: now, messages: 0 };
    }
    messageRate.messages += 1;
    if (messageRate.messages > WS_MAX_MESSAGES_PER_SECOND) {
      node.recordWsDroppedClient();
      socket.terminate();
      return;
    }
    try {
      const message = JSON.parse(String(raw)) as { type?: string };
      if (message.type === "ping") {
        sendSafe(socket, { type: "pong", payload: { ts: Date.now() } });
      }
    } catch {
      // ignore
    }
  });
});

node.onLive((event) => {
  for (const client of wss.clients) {
    sendSafe(client, event);
  }
});

const heartbeatTimer = setInterval(() => {
  for (const client of wss.clients) {
    const socket = client as import("ws").WebSocket & { isAlive?: boolean };
    if (socket.isAlive === false) {
      node.recordWsDroppedClient();
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    if (socket.readyState === 1) {
      socket.ping();
    }
  }
}, WS_HEARTBEAT_MS);

const shutdown = async () => {
  clearInterval(heartbeatTimer);
  await node.stop();
  await wss.close();
  await server.close();
  process.exit(0);
};
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});

server.log.info(`Node API on ${address}, gossip on ${gossipPort}, live ws /ws, perf gate p95<=${PERF_MAX_P95_MS}ms`);
