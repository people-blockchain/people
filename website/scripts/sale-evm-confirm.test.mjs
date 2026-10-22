/**
 * WEB-M4 — POST /api/sale/evm/confirm must not be open, and must only settle an order from a
 * real on-chain purchase. The route requires a session and is rate-limited (exercised via the
 * shared helper); `confirmOrderAction` proves the handler is idempotent; `verifyEvmSaleTx` is
 * driven against a stubbed JSON-RPC to prove the receipt's real recipient, beneficiary and
 * amount are checked against the sale config — never a client-supplied value.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from "viem";

const SALE_CONTRACT = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";
const BENEFICIARY = "0x3333333333333333333333333333333333333333";
const OTHER = "0x4444444444444444444444444444444444444444";
const TX_HASH = `0x${"a".repeat(64)}`;
const BLOCK_HASH = `0x${"b".repeat(64)}`;
const RECEIPT_BLOCK = 100;
const HEAD = RECEIPT_BLOCK + 14; // 15 confirmations
const BLOCK_TIMESTAMP_MS = 1_700_000_000_000;

const purchasedEvent = parseAbiItem(
  "event Purchased(address indexed buyer, address indexed beneficiary, uint256 usdtPaid, uint256 pplOut, uint256 soldAfter)",
);

function logFor({ beneficiary = BENEFICIARY, usdtPaid = 50n * 10n ** 6n, pplOut = 1000n } = {}) {
  const topics = encodeEventTopics({
    abi: [purchasedEvent],
    eventName: "Purchased",
    args: { buyer: BUYER, beneficiary },
  });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [usdtPaid, pplOut, pplOut],
  );
  return {
    address: SALE_CONTRACT,
    topics,
    data,
    blockNumber: `0x${RECEIPT_BLOCK.toString(16)}`,
    transactionHash: TX_HASH,
    transactionIndex: "0x0",
    blockHash: BLOCK_HASH,
    logIndex: "0x0",
    removed: false,
  };
}

function receiptFor({ to = SALE_CONTRACT, status = "0x1", logs = [logFor()] } = {}) {
  return {
    transactionHash: TX_HASH,
    transactionIndex: "0x0",
    blockHash: BLOCK_HASH,
    blockNumber: `0x${RECEIPT_BLOCK.toString(16)}`,
    from: BUYER,
    to,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    contractAddress: null,
    logs,
    logsBloom: `0x${"0".repeat(512)}`,
    status,
    type: "0x2",
    effectiveGasPrice: "0x1",
  };
}

function blockFor({ timestampMs = BLOCK_TIMESTAMP_MS } = {}) {
  return {
    number: `0x${RECEIPT_BLOCK.toString(16)}`,
    hash: BLOCK_HASH,
    parentHash: `0x${"1".repeat(64)}`,
    nonce: "0x0000000000000000",
    sha3Uncles: `0x${"2".repeat(64)}`,
    logsBloom: `0x${"0".repeat(512)}`,
    transactionsRoot: `0x${"3".repeat(64)}`,
    stateRoot: `0x${"4".repeat(64)}`,
    receiptsRoot: `0x${"5".repeat(64)}`,
    miner: `0x${"6".repeat(40)}`,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x1",
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    timestamp: `0x${Math.floor(timestampMs / 1000).toString(16)}`,
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x1",
    mixHash: `0x${"7".repeat(64)}`,
  };
}

/** Stub viem's HTTP transport: answer each JSON-RPC method from the supplied fixtures. */
function stubRpc({ receipt, block, head = HEAD } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request.method);
    let result = null;
    if (request.method === "eth_getTransactionReceipt") result = receipt;
    else if (request.method === "eth_blockNumber") result = `0x${head.toString(16)}`;
    else if (request.method === "eth_getBlockByNumber") result = block;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

let verifyEvmSaleTx, checkEvmPurchaseAgainstOrder, confirmOrderAction;

before(async () => {
  process.env.NEXT_PUBLIC_SALE_HUB_ADDRESS = SALE_CONTRACT;
  process.env.SALE_RPC_BASE = "https://rpc.test";
  ({ verifyEvmSaleTx } = await import("../src/lib/sale/evm-verify.ts"));
  ({ checkEvmPurchaseAgainstOrder, confirmOrderAction } = await import("../src/lib/sale/evm-order-check.ts"));
});

test("the confirm route requires a session, rate-limits, and never reads amounts from the body", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "src/app/api/sale/evm/confirm/route.ts"),
    "utf8",
  );
  assert.match(src, /await auth\(\)/);
  assert.match(src, /sign_in_required/);
  assert.match(src, /checkSharedRateLimit\("sale-evm-confirm"/);
  // The only request fields are the order id and tx hash; amounts are re-derived on chain.
  assert.doesNotMatch(src, /body\.(ppl|usdt|amount|min)/i);
});

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.NEXT_PUBLIC_SALE_HUB_ADDRESS;
  delete process.env.SALE_RPC_BASE;
});

const createdAt = BLOCK_TIMESTAMP_MS - 60_000;
const expiresAt = BLOCK_TIMESTAMP_MS + 60_000;

async function verify(overrides = {}) {
  stubRpc({ receipt: receiptFor(), block: blockFor(), ...overrides });
  return verifyEvmSaleTx("usdc", TX_HASH, BENEFICIARY, 1000, createdAt, expiresAt);
}

/* ── on-chain verification ────────────────────────────────────────────────── */

test("a genuine Purchased event from the sale contract verifies", async () => {
  const result = await verify();
  assert.deepEqual(result, { ok: true, usdtPaid: 50, pplOut: 1000 });
});

test("a receipt whose real recipient is not the sale contract is rejected", async () => {
  const result = await verify({ receipt: receiptFor({ to: OTHER }) });
  assert.deepEqual(result, { ok: false, code: "wrong_contract" });
});

test("a failed transaction is rejected", async () => {
  const result = await verify({ receipt: receiptFor({ status: "0x0" }) });
  assert.deepEqual(result, { ok: false, code: "tx_not_confirmed" });
});

test("a beneficiary other than the order's address is rejected", async () => {
  const result = await verify({ receipt: receiptFor({ logs: [logFor({ beneficiary: OTHER })] }) });
  assert.deepEqual(result, { ok: false, code: "beneficiary_mismatch" });
});

test("a purchase below the quoted PPL is rejected", async () => {
  const result = await verify({ receipt: receiptFor({ logs: [logFor({ pplOut: 10n })] }) });
  assert.deepEqual(result, { ok: false, code: "ppl_too_low" });
});

test("a tx mined before the order existed cannot pay for it", async () => {
  const result = await verify({ block: blockFor({ timestampMs: createdAt - 1_000 }) });
  assert.deepEqual(result, { ok: false, code: "tx_before_order" });
});

test("a tx mined after the quote expired cannot pay for it", async () => {
  const result = await verify({ block: blockFor({ timestampMs: expiresAt + 1_000 }) });
  assert.deepEqual(result, { ok: false, code: "tx_after_expiry" });
});

test("an unconfirmed tx reports awaiting_confirmations", async () => {
  const result = await verify({ head: RECEIPT_BLOCK });
  assert.deepEqual(result, { ok: false, code: "awaiting_confirmations" });
});

test("the delivered PPL never exceeds the quote and underpayment is rejected", () => {
  // The contract's own numbers are clamped to the order, and a payment below the quote fails.
  assert.deepEqual(checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 50 }, { pplOut: 2000, usdtPaid: 50 }), {
    ok: false,
    code: "ppl_out_exceeds_quote",
  });
  assert.deepEqual(checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 50 }, { pplOut: 1000, usdtPaid: 10 }), {
    ok: false,
    code: "usdt_below_quote",
  });
  assert.deepEqual(checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 50 }, { pplOut: 1000, usdtPaid: 50 }), {
    ok: true,
    pplToDeliver: 1000,
    usdtPaid: 50,
  });
});

/* ── idempotency ──────────────────────────────────────────────────────────── */

test("confirmOrderAction: terminal and paid orders are never re-verified on chain", () => {
  assert.equal(confirmOrderAction({ status: "delivered", paymentTxId: TX_HASH }, TX_HASH), "done");
  assert.equal(confirmOrderAction({ status: "paid", paymentTxId: TX_HASH }, TX_HASH), "resume_delivery");
  assert.equal(confirmOrderAction({ status: "delivering", paymentTxId: TX_HASH }, TX_HASH), "resume_delivery");
  assert.equal(confirmOrderAction({ status: "pending_payment", paymentTxId: null }, TX_HASH), "verify");
});

test("confirmOrderAction: a replay with a different tx hash against a paid order conflicts", () => {
  const other = `0x${"c".repeat(64)}`;
  assert.equal(confirmOrderAction({ status: "paid", paymentTxId: TX_HASH }, other), "conflict");
  assert.equal(confirmOrderAction({ status: "delivering", paymentTxId: TX_HASH }, other), "conflict");
  // Case-insensitive on the stored hash, matching the lower() index used everywhere else.
  const storedUpper = `0x${TX_HASH.slice(2).toUpperCase()}`;
  assert.equal(confirmOrderAction({ status: "paid", paymentTxId: storedUpper }, TX_HASH), "resume_delivery");
});

test("confirmOrderAction: expired/cancelled orders cannot be re-opened", () => {
  for (const status of ["expired", "failed", "cancelled"]) {
    assert.equal(confirmOrderAction({ status, paymentTxId: null }, TX_HASH), "not_payable");
  }
});
