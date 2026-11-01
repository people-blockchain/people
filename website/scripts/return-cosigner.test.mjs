import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters, encodeEventTopics, keccak256, parseAbiItem, size, slice, toBytes, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  MIN_RETURN_CONFIRMATIONS,
  addCosignature,
  createReturnAttestation,
  getReturnCosignerSigner,
  mainnetReturnDigest,
} from "../src/lib/sale/v2/return-attestation.ts";
import { createCosigner } from "../src/lib/sale/v2/return-cosigner.ts";

const HUB = "0x3333333333333333333333333333333333333333";
const BURN = "0x4444444444444444444444444444444444444444";
const SELLER = "0x1111111111111111111111111111111111111111";
const FROM = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";
const KEY = `0x${"ab".repeat(32)}`;
const CO_KEY = `0x${"cd".repeat(32)}`;
const TOKEN = "t".repeat(40);
const PERSON = keccak256(toBytes("person-1"));
const NOW = 1_700_000_000;
const WEI = 10n ** 18n;
const EVENT = parseAbiItem(
  "event ReturnBurned(bytes32 indexed returnId, address indexed from, address indexed hub, bytes32 personId, address seller, uint256 amount, uint256 destChainId)",
);

function signer(key) {
  const a = privateKeyToAccount(key);
  return { getAddress: async () => a.address, signDigest: async (hash) => a.sign({ hash }) };
}

function log(returnId, amount) {
  const topics = encodeEventTopics({ abi: [EVENT], eventName: "ReturnBurned", args: { returnId, from: FROM, hub: HUB } });
  const data = encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [PERSON, SELLER, amount, 8453n],
  );
  return { address: BURN, topics, data };
}

function rid(n) {
  return keccak256(toBytes(`return-${n}`));
}

function receiptFor(returnId, amount) {
  return async () => ({ status: "success", blockNumber: 100n, logs: [log(returnId, amount)] });
}

async function primary(returnId, amount = WEI) {
  const r = await createReturnAttestation({
    txHash: `0x${"2".repeat(64)}`,
    returnId,
    signer: signer(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: NOW,
    getReceipt: receiptFor(returnId, amount),
    headBlock: async () => 100n + MIN_RETURN_CONFIRMATIONS,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.equal(r.ok, true);
  return r.body;
}

function cosigner({ amount = WEI, warn = 5n, max = 10n, alerts = [], key = CO_KEY, onchain } = {}) {
  let returnId = rid(1);
  const c = createCosigner(
    { token: TOKEN, hubAddress: HUB, burnAddress: BURN, hubChainId: 8453, warnPplPerHour: warn * WEI, maxPplPerHour: max * WEI },
    {
      signer: signer(key),
      nowSec: () => NOW,
      getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [log(returnId, amount)] }),
      headBlock: async () => 100n + MIN_RETURN_CONFIRMATIONS,
      returnCosigner: async () => onchain ?? privateKeyToAccount(CO_KEY).address,
      alert: async (t) => alerts.push(t),
    },
  );
  return {
    handle: (id, body = {}, auth = `Bearer ${TOKEN}`) => {
      returnId = id;
      return c.handle(auth, { txHash: `0x${"2".repeat(64)}`, returnId: id, deadline: NOW + 900, ...body });
    },
    hourTotal: c.hourTotal,
  };
}

test("cosigner refuses without the shared token", async () => {
  const c = cosigner();
  assert.equal((await c.handle(rid(1), {}, "Bearer wrong")).status, 401);
  assert.equal((await c.handle(rid(1), {}, null)).status, 401);
});

test("cosigner signs the same digest as the primary, for its own on-chain key only", async () => {
  const p = await primary(rid(1));
  const ok = await cosigner().handle(rid(1), { deadline: p.deadline });
  assert.equal(ok.status, 200);
  const digest = mainnetReturnDigest({
    chainId: 8453,
    hub: p.hub,
    message: { ...p, pplAmount: BigInt(p.pplAmount), deadline: BigInt(p.deadline) },
  });
  assert.equal(await recoverAddress({ hash: digest, signature: ok.body.signature }), privateKeyToAccount(CO_KEY).address);

  const wrongKey = await cosigner({ key: KEY }).handle(rid(1), { deadline: p.deadline });
  assert.deepEqual(wrongKey, { status: 503, body: { error: "verifier_mismatch" } });
  const unset = await cosigner({ onchain: ZERO }).handle(rid(1), { deadline: p.deadline });
  assert.deepEqual(unset, { status: 503, body: { error: "verifier_mismatch" } });
});

test("cosigner rejects a deadline in the past or too far ahead", async () => {
  const c = cosigner();
  assert.deepEqual(await c.handle(rid(1), { deadline: NOW }), { status: 400, body: { error: "invalid_deadline" } });
  assert.deepEqual(await c.handle(rid(1), { deadline: NOW + 900 + 61 }), { status: 400, body: { error: "invalid_deadline" } });
});

test("cosigner alerts above the warning level and refuses above the hourly limit", async () => {
  const alerts = [];
  const c = cosigner({ amount: 3n * WEI, warn: 5n, max: 10n, alerts });
  assert.equal((await c.handle(rid(1))).status, 200); // 3
  assert.equal(alerts.length, 0);
  assert.equal((await c.handle(rid(2))).status, 200); // 6 > warn
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /alert/);
  assert.equal((await c.handle(rid(3))).status, 200); // 9
  assert.equal((await c.handle(rid(1))).status, 200, "re-signing the same return does not count twice");
  assert.equal(c.hourTotal(), 9n * WEI);
  const refused = await c.handle(rid(4)); // 12 > max
  assert.deepEqual(refused, { status: 429, body: { error: "hourly_limit" } });
  assert.match(alerts.at(-1), /brake/);
  assert.equal(c.hourTotal(), 9n * WEI);
});

test("addCosignature returns both signatures and checks the cosigner on chain", async () => {
  const p = await primary(rid(1));
  const c = cosigner();
  const fetchImpl = async (_url, init) => {
    const out = await c.handle(rid(1), JSON.parse(init.body), init.headers.authorization);
    return new Response(JSON.stringify(out.body), { status: out.status });
  };
  const base = { primary: p, txHash: `0x${"2".repeat(64)}`, hubChainId: 8453, cosignerUrl: "https://co.example/cosign", cosignerToken: TOKEN, fetchImpl };

  const ok = await addCosignature({ ...base, cosigner: async () => privateKeyToAccount(CO_KEY).address });
  assert.equal(ok.ok, true);
  assert.equal(size(ok.signature), 130);
  assert.equal(slice(ok.signature, 0, 65), p.signature);

  const mismatch = await addCosignature({ ...base, cosigner: async () => privateKeyToAccount(KEY).address });
  assert.equal(mismatch.ok, false);

  const noUrl = await addCosignature({ ...base, cosignerUrl: undefined, cosigner: async () => privateKeyToAccount(CO_KEY).address });
  assert.deepEqual(noUrl, { ok: false, status: 503, error: "cosigner_not_configured" });
});

test("on Base mainnet a missing cosigner is refused; on testnets one signature passes", async () => {
  const p = await primary(rid(1));
  const base = { primary: p, txHash: `0x${"2".repeat(64)}`, cosignerUrl: undefined, cosignerToken: undefined, cosigner: async () => ZERO };
  assert.deepEqual(await addCosignature({ ...base, hubChainId: 8453 }), { ok: false, status: 503, error: "cosigner_required" });
  assert.deepEqual(await addCosignature({ ...base, hubChainId: 84532 }), { ok: true, signature: p.signature });
});

test("cosigner key follows the same chain policy as the primary", () => {
  assert.equal(getReturnCosignerSigner(8453, { SALE_RETURN_COSIGNER_LOCAL_KEY: CO_KEY }), null);
  assert.notEqual(getReturnCosignerSigner(84532, { SALE_RETURN_COSIGNER_LOCAL_KEY: CO_KEY }), null);
  assert.equal(getReturnCosignerSigner(8453, { SALE_RETURN_COSIGNER_MODE: "kms" }), null);
});
