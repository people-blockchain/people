// api-cron.md M2: payment txs are claimed in Postgres (unique index) and verified against the
// node's `/transactions/:id` endpoint with age + finality checks.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/factory-icon-db-loader.mjs", import.meta.url);

const { getDbReady } = await import("./fixtures/factory-icon-pglite-db.mjs");
const { factoryIconPaymentTxs } = await import("../src/db/schema.ts");
const {
  verifyIconGenPaymentTx,
  claimIconGenPaymentTx,
  releaseIconGenPaymentTx,
  DEFAULT_ICON_GEN_PAYMENT_MAX_AGE_MS,
} = await import("../src/lib/factory-icon-payment.ts");

const db = await getDbReady();

const RECIPIENT = "0x00000000000000000000000000000000000000ff";
const FROM = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const realFetch = globalThis.fetch;
const envSnapshot = {
  FACTORY_ICON_FEE_RECIPIENT: process.env.FACTORY_ICON_FEE_RECIPIENT,
  NEXT_PUBLIC_ICON_GEN_FEE_PPL: process.env.NEXT_PUBLIC_ICON_GEN_FEE_PPL,
  ICON_GEN_PAYMENT_MIN_CONFIRMATIONS: process.env.ICON_GEN_PAYMENT_MIN_CONFIRMATIONS,
};

process.env.FACTORY_ICON_FEE_RECIPIENT = RECIPIENT;
process.env.NEXT_PUBLIC_ICON_GEN_FEE_PPL = "0.1";
delete process.env.ICON_GEN_PAYMENT_MIN_CONFIRMATIONS;

after(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body };
}

/** Stub `global.fetch` with one tx body and one head body; returns the list of requested URLs. */
function stubNode(tx, head = { height: 1 }, { headOk = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("/transactions/")) return jsonResponse(tx);
    if (href.includes("/chain/head")) return jsonResponse(head, headOk);
    return jsonResponse({}, false);
  };
  return calls;
}

function baseTx(overrides = {}) {
  return {
    id: "tx-1",
    type: "transfer",
    from: FROM,
    to: RECIPIENT,
    amount: 0.1,
    timestamp: Date.now(),
    blockHeight: 1,
    finalized: true,
    ...overrides,
  };
}

test("a recent, finalized tx to the fee recipient is accepted via /transactions/:id", async () => {
  const calls = stubNode(baseTx());
  const res = await verifyIconGenPaymentTx("tx-1", FROM);
  assert.deepEqual(res, { ok: true });
  // Regression: the old code hit `/tx/:id`, which 404s and broke every paid generation.
  assert.ok(calls[0].includes("/transactions/tx-1"), `unexpected url: ${calls[0]}`);
  assert.ok(!/\/tx\//.test(calls[0]), `wrong legacy path: ${calls[0]}`);
  assert.ok(calls.some((u) => u.includes("/chain/head")));
});

test("sender case is normalized when matching the paying wallet", async () => {
  stubNode(baseTx({ from: FROM.toUpperCase().replace("0X", "0x") }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), { ok: true });
});

test("rejects a tx whose sender is not the requesting wallet", async () => {
  stubNode(baseTx({ from: OTHER }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_wrong_sender",
  });
});

test("rejects a tx paid to someone other than the fee recipient", async () => {
  stubNode(baseTx({ to: OTHER }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_wrong_recipient",
  });
});

test("rejects an underpaid tx", async () => {
  stubNode(baseTx({ amount: 0.01 }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_amount_low",
  });
});

test("rejects a non-transfer tx", async () => {
  stubNode(baseTx({ type: "faucet" }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_wrong_type",
  });
});

test("rejects a stale tx even when it is otherwise valid", async () => {
  stubNode(baseTx({ timestamp: Date.now() - DEFAULT_ICON_GEN_PAYMENT_MAX_AGE_MS - 60_000 }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_too_old",
  });
});

test("rejects a tx timestamped in the future beyond clock skew", async () => {
  stubNode(baseTx({ timestamp: Date.now() + 10 * 60 * 1000 }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_from_future",
  });
});

test("rejects a tx that is not yet in a block", async () => {
  stubNode(baseTx({ blockHeight: 0 }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_unconfirmed",
  });
});

test("rejects a tx the node has not finalized", async () => {
  stubNode(baseTx({ finalized: false }));
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_not_finalized",
  });
});

test("enforces the configurable minimum confirmation floor", async () => {
  process.env.ICON_GEN_PAYMENT_MIN_CONFIRMATIONS = "5";
  try {
    stubNode(baseTx({ blockHeight: 1 }), { height: 2 });
    assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
      ok: false,
      code: "payment_tx_insufficient_confirmations",
    });
  } finally {
    delete process.env.ICON_GEN_PAYMENT_MIN_CONFIRMATIONS;
  }
});

test("fails closed when the chain head is unavailable", async () => {
  stubNode(baseTx(), { height: 1 }, { headOk: false });
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_head_unavailable",
  });
});

test("reports a lookup failure when the node is unreachable", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
    ok: false,
    code: "payment_tx_lookup_failed",
  });
});

test("reports not-found for an unknown tx", async () => {
  globalThis.fetch = async () => jsonResponse({}, false);
  assert.deepEqual(await verifyIconGenPaymentTx("nope", FROM), {
    ok: false,
    code: "payment_tx_not_found",
  });
});

test("fails closed when no fee recipient is configured", async () => {
  delete process.env.FACTORY_ICON_FEE_RECIPIENT;
  try {
    stubNode(baseTx());
    assert.deepEqual(await verifyIconGenPaymentTx("tx-1", FROM), {
      ok: false,
      code: "fee_recipient_unconfigured",
    });
  } finally {
    process.env.FACTORY_ICON_FEE_RECIPIENT = RECIPIENT;
  }
});

test("a payment tx can be claimed exactly once, case-insensitively", async () => {
  await db.delete(factoryIconPaymentTxs);
  const day = "2099-02-01";
  assert.equal(await claimIconGenPaymentTx("0xAbC123", FROM, day), true);
  assert.equal(await claimIconGenPaymentTx("0xabc123", OTHER, day), false);

  const rows = await db.select().from(factoryIconPaymentTxs);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paymentTxId, "0xabc123");
});

test("releasing a failed claim re-allows the same tx", async () => {
  await db.delete(factoryIconPaymentTxs);
  const day = "2099-02-02";
  assert.equal(await claimIconGenPaymentTx("0xdeadbeef", FROM, day), true);
  assert.equal(await claimIconGenPaymentTx("0xdeadbeef", FROM, day), false);
  await releaseIconGenPaymentTx("0xDEADBEEF");
  assert.equal(await claimIconGenPaymentTx("0xdeadbeef", FROM, day), true);
});
