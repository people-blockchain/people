import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";

import { fetchAccountView, fetchGrowthClaims, probeProtocol } from "../src/lib/partner/protocol.ts";
import { loadPartnerWalletSummary, resolvePplBalanceFromAccount } from "../src/lib/partner/wallet-summary.ts";
import { resetRpcBackoffForTests } from "../src/lib/evm/rpc-server.ts";

/**
 * The cabinet used to read the removed people-node HTTP API (`/health`, `/address/:addr`,
 * `/snapshot`) even when the public backend is `cosmos-evm`. These tests pin the EVM compat
 * path: an ephemeral localhost JSON-RPC node answers the compat layer, while the legacy node
 * URL points at a closed port so any fallback to it fails loudly.
 */

const ADDRESS = "0x00000000000000000000000000000000000000aa";
const HEAD = 1_240_000;
const BALANCE_WEI = 1_234_567_890_000_000_000n; // 1.23456789 PPL
const NONCE = 7;

const previousEnv = {
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_EVM_RPC_URL: process.env.NEXT_PUBLIC_EVM_RPC_URL,
  PEOPLE_RPC_URL: process.env.PEOPLE_RPC_URL,
};

process.env.NEXT_PUBLIC_CHAIN = "cosmos-evm";
process.env.PEOPLE_RPC_URL = "http://127.0.0.1:1";
delete process.env.NEXT_PUBLIC_EVM_RPC_URL;

after(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const hex = (value) => `0x${value.toString(16)}`;

function rpcAnswer(call) {
  if (call.method === "eth_blockNumber") return hex(HEAD);
  if (call.method === "eth_getBalance") return hex(BALANCE_WEI);
  if (call.method === "eth_getTransactionCount") return hex(NONCE);
  return "0x";
}

async function startRpcNode(t) {
  const calls = [];
  const node = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      calls.push({ method: body.method, params: body.params ?? [] });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: rpcAnswer(body) }));
    });
  });
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const previous = process.env.EVM_RPC_URL;
  process.env.EVM_RPC_URL = `http://127.0.0.1:${node.address().port}`;
  resetRpcBackoffForTests();
  t.after(async () => {
    if (previous === undefined) delete process.env.EVM_RPC_URL;
    else process.env.EVM_RPC_URL = previous;
    await new Promise((resolve) => node.close(resolve));
  });
  return calls;
}

test("probeProtocol treats evm compat health as connected without people-node /health", async (t) => {
  const calls = await startRpcNode(t);
  const connection = await probeProtocol();
  assert.deepEqual(connection, { status: "connected", chainId: "97401", headHeight: HEAD });
  assert.ok(calls.some((call) => call.method === "eth_blockNumber"));
});

test("fetchAccountView reads the compat address payload", async (t) => {
  await startRpcNode(t);
  const { connection, account } = await fetchAccountView(ADDRESS);
  assert.equal(connection.status, "connected");
  assert.equal(connection.chainId, "97401");
  assert.equal(account?.nonce, NONCE);
  assert.ok(Math.abs((account?.pplBalance ?? 0) - 1.23456789) < 1e-12);
});

test("fetchGrowthClaims reports compat snapshot as not exposed instead of a read error", async (t) => {
  await startRpcNode(t);
  const growth = await fetchGrowthClaims(ADDRESS);
  assert.equal(growth.available, false);
  assert.deepEqual(growth.claims, []);
  assert.match(growth.note ?? "", /does not expose Growth claims/);
});

test("resolvePplBalanceFromAccount parses the compat balanceWei payload as 18-decimal PPL", () => {
  const balance = resolvePplBalanceFromAccount({
    balanceWei: "1234567890000000000",
    nonce: NONCE,
    balances: {},
    outgoingTxs: NONCE,
    incomingTxs: 0,
  });
  assert.ok(Math.abs(balance - 1.23456789) < 1e-12);
  assert.equal(resolvePplBalanceFromAccount({ balanceWei: "0", balances: {} }), 0);
  // Legacy people-node shapes keep working and win over balanceWei.
  assert.equal(resolvePplBalanceFromAccount({ balances: { ppl: 12 }, balanceWei: "5000000000000000000" }), 12);
  assert.equal(resolvePplBalanceFromAccount({ balance: 5, balanceWei: "5000000000000000000" }), 5);
  assert.equal(resolvePplBalanceFromAccount({ balanceWei: "not-a-number" }), 0);
});

test("loadPartnerWalletSummary still shows the balance when the snapshot returns 404", async () => {
  const requested = [];
  const fetchJson = async (path) => {
    requested.push(path);
    if (path.startsWith("address/")) return { balanceWei: "2500000000000000000", balances: {} };
    throw new Error("http_404");
  };
  const { balance, growth } = await loadPartnerWalletSummary(ADDRESS, fetchJson);
  assert.equal(balance, 2.5);
  assert.deepEqual(growth, { accrued: 0, claimable: 0, claimed: 0 });
  assert.deepEqual(requested, [`address/${ADDRESS}`, "snapshot"]);
});
