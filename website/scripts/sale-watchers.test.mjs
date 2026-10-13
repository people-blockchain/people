// Regression tests for audit M05-1 (Tron), M05-2 (Solana), M05-3 (TON), M05-5 (EVM confirm guard).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchTronUsdtTransfers, USDT_TRC20_CONTRACT } from "@/lib/sale/watchers/tron";
import { fetchSolanaSplTransfers, SOLANA_MEMO_PROGRAM_ID } from "@/lib/sale/watchers/solana";
import { fetchTonIncoming, USDT_JETTON_MASTER_TON } from "@/lib/sale/watchers/ton";
import { findOrderForPayment } from "@/lib/sale/watchers/match";
import { checkEvmPurchaseAgainstOrder, normalizeEvmTxHash } from "@/lib/sale/evm-order-check";
import { createSaleOrder, normalizePayerAddress, payerAddressRequired } from "@/lib/sale/service";

const json = (body) => ({ ok: true, json: async () => body });

// ---------------------------------------------------------------- Tron (M05-1)

const TRON_RECEIVER = "TReceiverXXXXXXXXXXXXXXXXXXXXXXXXX";

const TRON_PAYER = "T" + "P".repeat(33);

function tronRow(overrides = {}) {
  return {
    transaction_id: "tx-1",
    to: TRON_RECEIVER,
    from: TRON_PAYER,
    type: "Transfer",
    value: "100042123",
    block_timestamp: 1_700_000_000_000,
    token_info: { address: USDT_TRC20_CONTRACT, symbol: "USDT", decimals: 6 },
    ...overrides,
  };
}

async function tronWith(rows) {
  process.env.SALE_RECEIVER_TRON = TRON_RECEIVER;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return json({ data: rows });
  };
  const out = await fetchTronUsdtTransfers();
  return { out, urls };
}

test("tron: query asks only for confirmed official USDT TRC20", async () => {
  const { urls } = await tronWith([]);
  assert.match(urls[0], /only_confirmed=true/);
  assert.match(urls[0], new RegExp(`contract_address=${USDT_TRC20_CONTRACT}`));
});

test("tron: fake TRC20 token with USDT symbol is ignored (audit PoC)", async () => {
  const { out } = await tronWith([
    tronRow({ token_info: { address: "TAttackerFakeToken", symbol: "USDT", decimals: 6 } }),
  ]);
  assert.equal(out.length, 0);
});

test("tron: non-Transfer, other recipient, or bogus value are ignored", async () => {
  const { out } = await tronWith([
    tronRow({ type: "Approval" }),
    tronRow({ to: "TSomeoneElse" }),
    tronRow({ value: "12.5" }),
  ]);
  assert.equal(out.length, 0);
});

test("tron: decimals are fixed at 6, not taken from the response", async () => {
  const { out } = await tronWith([
    tronRow({ token_info: { address: USDT_TRC20_CONTRACT, decimals: 18 } }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].amountMicro, 100042123n);
});

test("tron: official USDT transfer to receiver → one row", async () => {
  const { out } = await tronWith([tronRow()]);
  assert.deepEqual(out, [
    { txId: "tx-1", to: TRON_RECEIVER, amountMicro: 100042123n, timestamp: 1_700_000_000_000, from: TRON_PAYER },
  ]);
});

// M05-7: the sender is reported so an order can be bound to the exact wallet that must pay it.
test("tron: transfer with no `from` in the response reports a null sender", async () => {
  const { out } = await tronWith([tronRow({ from: undefined })]);
  assert.equal(out[0].from, null);
});

// -------------------------------------------------------------- Solana (M05-2)

const SOL_RECEIVER = "SaleReceiver1111111111111111111111111111111";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDT_ATA = "SaleUsdtAta11111111111111111111111111111111";

function bal(owner, amount, mint = USDT_MINT) {
  return { mint, owner, uiTokenAmount: { amount: String(amount), decimals: 6 } };
}

function solTx({ err = null, pre, post, memo = "PPL-abcdef12", blockTime = 1_700_000_000 } = {}) {
  return {
    blockTime,
    meta: {
      err,
      preTokenBalances: pre ?? [bal(SOL_RECEIVER, 5_000_000), bal("Payer", 200_000_000)],
      postTokenBalances: post ?? [bal(SOL_RECEIVER, 105_042_123), bal("Payer", 99_957_877)],
    },
    transaction: {
      message: {
        instructions: [
          { programId: SOLANA_MEMO_PROGRAM_ID, program: "spl-memo", parsed: memo },
          {
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            parsed: { type: "transferChecked", info: { mint: USDT_MINT, tokenAmount: { amount: "100042123" } } },
          },
        ],
      },
    },
  };
}

async function solanaWith(tx) {
  process.env.SALE_RECEIVER_SOLANA = SOL_RECEIVER;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const { method, params } = JSON.parse(init.body);
    calls.push({ method, params });
    if (method === "getTokenAccountsByOwner") {
      return json({ result: { value: params[1].mint === USDT_MINT ? [{ pubkey: USDT_ATA }] : [] } });
    }
    if (method === "getSignaturesForAddress") return json({ result: [{ signature: "sig-1", err: null }] });
    if (method === "getTransaction") return json({ result: tx });
    throw new Error(`unexpected ${method}`);
  };
  const out = await fetchSolanaSplTransfers();
  return { out, calls };
}

test("solana: signatures come from the sale token accounts; tx read as finalized", async () => {
  const { calls } = await solanaWith(solTx());
  const sigCall = calls.find((c) => c.method === "getSignaturesForAddress");
  assert.equal(sigCall.params[0], USDT_ATA);
  const txCall = calls.find((c) => c.method === "getTransaction");
  assert.equal(txCall.params[1].commitment, "finalized");
});

test("solana: failed transaction (meta.err) is ignored (audit PoC)", async () => {
  const { out } = await solanaWith(solTx({ err: { InstructionError: [1, "Custom"] } }));
  assert.equal(out.length, 0);
});

test("solana: self-transfer that only mentions the sale address is ignored", async () => {
  const { out } = await solanaWith(
    solTx({
      pre: [bal(SOL_RECEIVER, 5_000_000), bal("Attacker", 200_000_000)],
      post: [bal(SOL_RECEIVER, 5_000_000), bal("Attacker", 200_000_000)],
    }),
  );
  assert.equal(out.length, 0);
});

test("solana: transfer of another mint to the receiver is ignored", async () => {
  const fake = "FakeMint111111111111111111111111111111111111";
  const { out } = await solanaWith(
    solTx({ pre: [bal(SOL_RECEIVER, 0, fake)], post: [bal(SOL_RECEIVER, 100_042_123, fake)] }),
  );
  assert.equal(out.length, 0);
});

test("solana: real incoming USDT → one row with exact amount, stable and memo", async () => {
  const { out } = await solanaWith(solTx());
  assert.deepEqual(out, [
    {
      txId: "sig-1",
      stable: "usdt",
      amountMicro: 100042123n,
      memo: "PPL-abcdef12",
      timestamp: 1_700_000_000_000,
      from: "Payer",
    },
  ]);
});

// M05-7: the token account owner whose balance dropped is reported as the sender, so an order
// can be bound to the exact wallet that must pay it.
test("solana: sender is the owner whose balance decreased, not the receiver", async () => {
  const { out } = await solanaWith(
    solTx({
      pre: [bal(SOL_RECEIVER, 5_000_000), bal("Payer", 200_000_000), bal("Unrelated", 50_000_000)],
      post: [bal(SOL_RECEIVER, 105_042_123), bal("Payer", 99_957_877), bal("Unrelated", 50_000_000)],
    }),
  );
  assert.equal(out[0].from, "Payer");
});

// ------------------------------------------------------------------ TON (M05-3)

const TON_RECEIVER = "0:" + "ab".repeat(32);
const OTHER_ADDRESS = "0:" + "cd".repeat(32);
const FAKE_MASTER = "0:" + "11".repeat(32);
const TON_PAYER = "0:" + "22".repeat(32);

function tonRow(overrides = {}) {
  return {
    source: TON_PAYER,
    destination: TON_RECEIVER,
    jetton_master: USDT_JETTON_MASTER_TON,
    amount: "100042123",
    transaction_hash: "tx-1",
    transaction_now: 1_700_000_000,
    transaction_aborted: false,
    decoded_forward_payload: { "@type": "text_comment", comment: "PPL-abcdef12" },
    ...overrides,
  };
}

async function tonWith(rows) {
  process.env.SALE_RECEIVER_TON = TON_RECEIVER;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return json({ jetton_transfers: rows });
  };
  const out = await fetchTonIncoming();
  return { out, urls };
}

test("ton: query filters by the USDT jetton master, the receiver and incoming direction", async () => {
  const { urls } = await tonWith([]);
  assert.match(urls[0], /\/jetton\/transfers\?/);
  assert.match(urls[0], new RegExp(`jetton_master=${encodeURIComponent(USDT_JETTON_MASTER_TON)}`));
  assert.match(urls[0], /direction=in/);
  assert.match(urls[0], new RegExp(`owner_address=${encodeURIComponent(TON_RECEIVER)}`));
});

test("ton: native TON transfers are never counted — only jetton_transfers rows are read", async () => {
  // Old bug: in_msg.value (native TON, nanoTON) was divided by 1000 and treated as USDT.
  // The new endpoint has no such field at all; a row with a different jetton master is dropped.
  const { out } = await tonWith([tonRow({ jetton_master: FAKE_MASTER })]);
  assert.equal(out.length, 0);
});

test("ton: aborted/bounced transfer is ignored", async () => {
  const { out } = await tonWith([tonRow({ transaction_aborted: true })]);
  assert.equal(out.length, 0);
});

test("ton: transfer to a different address is ignored", async () => {
  const { out } = await tonWith([tonRow({ destination: OTHER_ADDRESS })]);
  assert.equal(out.length, 0);
});

test("ton: real incoming USDT jetton transfer → one row with exact amount and memo", async () => {
  const { out } = await tonWith([tonRow()]);
  assert.deepEqual(out, [
    {
      txId: "tx-1",
      amountMicro: 100042123n,
      memo: "PPL-abcdef12",
      timestamp: 1_700_000_000_000,
      from: TON_PAYER,
    },
  ]);
});

// M05-7: the jetton owner (source) is reported in the same normalized form used for storage,
// so an order can be bound to the exact wallet that must pay it.
test("ton: sender address is normalized the same way as the receiver/master addresses", async () => {
  const { out } = await tonWith([tonRow({ source: "0:" + "22".repeat(32).toUpperCase() })]);
  assert.equal(out[0].from, TON_PAYER);
});

test("ton: transfer with no source reports a null sender", async () => {
  const { out } = await tonWith([tonRow({ source: undefined })]);
  assert.equal(out[0].from, null);
});

// -------------------------------------------------------------- order matching

const order = {
  id: "o1",
  status: "pending_payment",
  stable: "usdt",
  paymentMicro: "100042123",
  paymentMemo: "PPL-abcdef12",
  createdAt: new Date(1_700_000_000_000),
};

test("matching: transfer made before the order was created never matches", () => {
  assert.equal(
    findOrderForPayment([order], { amountMicro: 100042123n, memo: null, stable: "usdt", timestamp: 1_699_999_999_000 }),
    undefined,
  );
  assert.equal(
    findOrderForPayment([order], { amountMicro: 100042123n, memo: null, stable: "usdt", timestamp: 0 }),
    undefined,
  );
});

test("matching: other stable or memo does not match; exact payment does", () => {
  const base = { amountMicro: 100042123n, timestamp: 1_700_000_100_000 };
  assert.equal(findOrderForPayment([order], { ...base, memo: null, stable: "usdc" }), undefined);
  assert.equal(findOrderForPayment([order], { ...base, memo: "PPL-other", stable: "usdt" }), undefined);
  assert.equal(findOrderForPayment([order], { ...base, memo: "PPL-abcdef12", stable: "usdt" })?.id, "o1");
});

// ------------------------------------------------- order window (audit M05-7)

test("matching: a transfer after the quote expired never matches (audit M05-7)", () => {
  const expiring = { ...order, expiresAt: new Date(1_700_000_045_000) };
  const base = { amountMicro: 100042123n, memo: null, stable: "usdt" };
  assert.equal(findOrderForPayment([expiring], { ...base, timestamp: 1_700_000_045_000 })?.id, "o1");
  assert.equal(findOrderForPayment([expiring], { ...base, timestamp: 1_700_000_045_001 }), undefined);
  // No expiry recorded (legacy row) or no block time reported: the window cannot be checked.
  assert.equal(findOrderForPayment([order], { ...base, timestamp: 1_800_000_000_000 })?.id, "o1");
  assert.equal(findOrderForPayment([expiring], { ...base })?.id, "o1");
});

// --------------------------------------------------- payer identity (audit M05-7)

test("matching: a payment from the wrong address does not match an order bound to a payerAddress", () => {
  const bound = { ...order, payerAddress: TRON_PAYER };
  const base = { amountMicro: 100042123n, memo: "PPL-abcdef12", stable: "usdt", timestamp: 1_700_000_100_000 };
  assert.equal(findOrderForPayment([bound], { ...base, fromAddress: "TSomeoneElseEntirelyXXXXXXXXXXXXXX" }), undefined);
  assert.equal(findOrderForPayment([bound], { ...base, fromAddress: null }), undefined);
  assert.equal(findOrderForPayment([bound], { ...base }), undefined); // fromAddress omitted entirely
});

test("matching: a payment from the correct address matches an order bound to a payerAddress", () => {
  const bound = { ...order, payerAddress: TRON_PAYER };
  const base = { amountMicro: 100042123n, memo: "PPL-abcdef12", stable: "usdt", timestamp: 1_700_000_100_000 };
  assert.equal(findOrderForPayment([bound], { ...base, fromAddress: TRON_PAYER })?.id, "o1");
});

test("matching: a legacy order with payerAddress null still matches on amount alone (back-compat)", () => {
  const legacy = { ...order, payerAddress: null };
  const base = { amountMicro: 100042123n, memo: "PPL-abcdef12", stable: "usdt", timestamp: 1_700_000_100_000 };
  assert.equal(findOrderForPayment([legacy], { ...base, fromAddress: "TSomeoneElseEntirelyXXXXXXXXXXXXXX" })?.id, "o1");
  assert.equal(findOrderForPayment([legacy], { ...base, fromAddress: null })?.id, "o1");
  assert.equal(findOrderForPayment([legacy], { ...base })?.id, "o1");
});

test("normalizePayerAddress: Tron/Solana base58 addresses are validated and kept case-sensitive", () => {
  assert.equal(normalizePayerAddress("tron", TRON_PAYER), TRON_PAYER);
  assert.equal(normalizePayerAddress("tron", TRON_PAYER.toLowerCase()), null); // wrong case != same address
  assert.equal(normalizePayerAddress("tron", "not-a-tron-address"), null);
  assert.equal(normalizePayerAddress("tron", ""), null);

  const solPayer = "9" + "A".repeat(33);
  assert.equal(normalizePayerAddress("solana", solPayer), solPayer);
  assert.equal(normalizePayerAddress("solana", "too-short"), null);
});

test("normalizePayerAddress: TON addresses are normalized to the same raw wc:hex form the watcher uses", () => {
  assert.equal(normalizePayerAddress("ton", TON_PAYER), TON_PAYER);
  assert.equal(normalizePayerAddress("ton", "0:" + "22".repeat(32).toUpperCase()), TON_PAYER);
  assert.equal(normalizePayerAddress("ton", "not-a-ton-address"), null);
});

test("payerAddressRequired: only the non-EVM rails require a payerAddress", () => {
  assert.equal(payerAddressRequired("evm"), false);
  assert.equal(payerAddressRequired("tron"), true);
  assert.equal(payerAddressRequired("ton"), true);
  assert.equal(payerAddressRequired("solana"), true);
});

const PEOPLE_ADDR = "0x" + "ab".repeat(20);

test("sale order: creating a tron/ton/solana order without payerAddress is rejected (audit M05-7)", async () => {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5"; // never dialed: rejected before any DB call
  process.env.SALE_RECEIVER_TRON = TRON_RECEIVER;
  const r = await createSaleOrder({ networkId: "tron", stable: "usdt", peopleAddress: PEOPLE_ADDR, usdtAmount: 100 });
  assert.deepEqual(r, { ok: false, code: "payer_address_required" });
});

test("sale order: creating a non-EVM order with a malformed payerAddress is rejected", async () => {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5";
  process.env.SALE_RECEIVER_TRON = TRON_RECEIVER;
  const r = await createSaleOrder({
    networkId: "tron",
    stable: "usdt",
    peopleAddress: PEOPLE_ADDR,
    usdtAmount: 100,
    payerAddress: "not-a-tron-address",
  });
  assert.deepEqual(r, { ok: false, code: "invalid_payer_address" });
});

// ------------------------------------------------------------ EVM confirm (M05-5)

test("evm confirm: event PPL above the quote is rejected", () => {
  const r = checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 10 }, { pplOut: 100_000_000, usdtPaid: 3 });
  assert.deepEqual(r, { ok: false, code: "ppl_out_exceeds_quote" });
});

test("evm confirm: payment below the quote is rejected", () => {
  const r = checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 10 }, { pplOut: 1000, usdtPaid: 3 });
  assert.deepEqual(r, { ok: false, code: "usdt_below_quote" });
});

test("evm confirm: delivery never exceeds the quoted PPL", () => {
  const r = checkEvmPurchaseAgainstOrder({ pplQuoted: 1000, usdtQuoted: 10 }, { pplOut: 1005, usdtPaid: 10 });
  assert.deepEqual(r, { ok: true, pplToDeliver: 1000, usdtPaid: 10 });
});

// ------------------------------------------------------------ EVM confirm (M05-4)

test("evm confirm: tx hash is normalized to lowercase regardless of input case", () => {
  const h = "0x" + "ab".repeat(32);
  assert.equal(normalizeEvmTxHash(h), h);
  assert.equal(normalizeEvmTxHash(h.replace("ab", "AB")), h);
  assert.equal(normalizeEvmTxHash("0x" + "AB".repeat(32)), h);
});

test("evm confirm: malformed tx hashes are rejected", () => {
  assert.equal(normalizeEvmTxHash("not-a-hash"), null);
  assert.equal(normalizeEvmTxHash("0x" + "ab".repeat(31)), null); // too short
  assert.equal(normalizeEvmTxHash("0x" + "gg".repeat(32)), null); // non-hex
});


// ------------------------------------------------------------------ S4-08 (TON timestamp required)
test("S4-08: a TON transfer that predates the order must not match when timestamp is passed", () => {
  const now = 1_700_000_000_000;
  const order = {
    id: "attacker",
    status: "pending_payment",
    stable: "usdt",
    paymentMicro: "10041500",
    paymentMemo: null,
    createdAt: new Date(now - 60_000),
    expiresAt: new Date(now + 44 * 60_000),
    payerAddress: "0:" + "aa".repeat(32),
  };
  const withoutTs = {
    amountMicro: 10_041_500n,
    memo: null,
    fromAddress: order.payerAddress,
  };
  const withTs = {
    ...withoutTs,
    stable: "usdt",
    timestamp: now - 60 * 60_000, // one hour before order creation
  };
  // Omitting timestamp skips the bound (pre-fix bug). With timestamp, no match.
  assert.equal(findOrderForPayment([order], withoutTs)?.id, "attacker");
  assert.equal(findOrderForPayment([order], withTs), undefined);
});
