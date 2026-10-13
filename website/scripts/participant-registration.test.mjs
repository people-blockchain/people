import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = {
  store: new Map(),
  getItem(k) {
    return this.store.get(k) ?? null;
  },
  setItem(k, v) {
    this.store.set(k, v);
  },
  removeItem(k) {
    this.store.delete(k);
  },
};

import {
  captureReferrerFromSearch,
  isValidReferrerAddress,
  planParticipantRegistration,
  readStoredReferrer,
  resolveReferrerForWallet,
} from "../src/lib/referral-ref.ts";
import { signFactoryTx } from "../src/lib/ovn-sign.ts";

const SELF = "0x1111111111111111111111111111111111111111";
const REF = "0x2222222222222222222222222222222222222222";
const PRIVATE = "aa".repeat(32);

test("referrer capture validates address and ignores self", () => {
  globalThis.localStorage.store.clear();
  captureReferrerFromSearch(`?ref=${REF}`);
  assert.equal(readStoredReferrer(), REF);
  assert.equal(resolveReferrerForWallet(SELF), REF);
  assert.equal(resolveReferrerForWallet(REF), null);
  captureReferrerFromSearch("?ref=not-an-address");
  assert.equal(readStoredReferrer(), REF);
  assert.ok(isValidReferrerAddress(REF));
  assert.ok(!isValidReferrerAddress("0x123"));
});

test("referrer capture is first-touch: a later valid ref does not overwrite the stored one", () => {
  globalThis.localStorage.store.clear();
  const OTHER_REF = "0x3333333333333333333333333333333333333333";
  captureReferrerFromSearch(`?ref=${REF}`);
  assert.equal(readStoredReferrer(), REF);
  captureReferrerFromSearch(`?ref=${OTHER_REF}`);
  assert.equal(readStoredReferrer(), REF);
});

test("registration plan orders register then referral", () => {
  globalThis.localStorage.setItem("ppl_referrer", REF);
  const plan = planParticipantRegistration(SELF);
  assert.deepEqual(plan.steps, ["register", "referral"]);
  assert.equal(plan.referrer, REF);
});

test("participant txs are zero-fee and referral points at stored ref", () => {
  globalThis.localStorage.setItem("ppl_referrer", REF);
  const plan = planParticipantRegistration(SELF);
  const register = signFactoryTx(PRIVATE, {
    chainId: "people-internal-testnet",
    id: "r1",
    from: SELF,
    to: SELF,
    amount: 0,
    fee: 0,
    nonce: 0,
    timestamp: 1,
    type: "registerParticipant",
  });
  const referral = signFactoryTx(PRIVATE, {
    chainId: "people-internal-testnet",
    id: "r2",
    from: SELF,
    to: SELF,
    amount: 0,
    fee: 0,
    nonce: 1,
    timestamp: 2,
    type: "participantReferral",
    payload: { parent: plan.referrer },
  });
  assert.equal(register.type, "registerParticipant");
  assert.equal(referral.payload.parent, REF);
  assert.equal(register.fee, 0);
});

test("mock network accepts register + referral sequence", async () => {
  const submitted = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/network/health")) {
      return Response.json({ chainId: "people-internal-testnet" });
    }
    if (url.includes("/api/network/address/")) {
      return Response.json({ nonce: 0, balance: 0 });
    }
    if (url.endsWith("/api/network/tx") && init?.method === "POST") {
      submitted.push(JSON.parse(String(init.body)));
      return Response.json({ accepted: true });
    }
    return Response.json({});
  };
  try {
    globalThis.localStorage.setItem("ppl_referrer", REF);
    const plan = planParticipantRegistration(SELF);
    for (let i = 0; i < plan.steps.length; i += 1) {
      const step = plan.steps[i];
      const tx = signFactoryTx(PRIVATE, {
        chainId: "people-internal-testnet",
        id: `tx-${i}`,
        from: SELF,
        to: SELF,
        amount: 0,
        fee: 0,
        nonce: i,
        timestamp: Date.now(),
        type: step === "register" ? "registerParticipant" : "participantReferral",
        ...(step === "referral" ? { payload: { parent: plan.referrer } } : {}),
      });
      const res = await fetch("/api/network/tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tx),
      });
      assert.equal(res.ok, true);
    }
    assert.deepEqual(
      submitted.map((t) => t.type),
      ["registerParticipant", "participantReferral"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
