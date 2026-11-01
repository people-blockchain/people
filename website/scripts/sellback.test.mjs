import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  parseAbiItem,
  recoverTypedDataAddress,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { approveErc20IfNeeded } from "../src/lib/evm/erc20-allowance.ts";
import { parseSaleNonceCode } from "../src/lib/sale/v2/ownership.ts";
import {
  MIN_RETURN_CONFIRMATIONS,
  PEOPLE_MAINNET_CHAIN_ID,
  createReturnAttestation,
  decodeReturnBurned,
  getReturnVerifierSigner,
  mainnetReturnDigest,
  readReturnVerifierKey,
  signMainnetReturn,
} from "../src/lib/sale/v2/return-attestation.ts";
import {
  HOLD_SECONDS,
  choosePayableSlice,
  largestPplUnderCaps,
  minUsdcOutFromPayout,
  sellBackAvailability,
  sellBackErrorKey,
  sellBackFeeBand,
  sellBackOpen,
  sellBackPreflight,
} from "../src/lib/sale/v2/sellback.ts";

const HUB = "0x3333333333333333333333333333333333333333";
const BURN = "0x4444444444444444444444444444444444444444";
const SELLER = "0x1111111111111111111111111111111111111111";
const FROM = "0x2222222222222222222222222222222222222222";
const KEY = `0x${"ab".repeat(32)}`;
const PERSON = keccak256(toBytes("person-1"));

/** Test-only signer with the `VerifierSigner` shape; chain policy is tested on `getReturnVerifierSigner`. */
function testSigner(key) {
  const account = privateKeyToAccount(key);
  return { getAddress: async () => account.address, signDigest: async (hash) => account.sign({ hash }) };
}
const RETURN_ID = keccak256(toBytes("return-1"));
const AMOUNT = 10n ** 18n;
const EVENT = parseAbiItem(
  "event ReturnBurned(bytes32 indexed returnId, address indexed from, address indexed hub, bytes32 personId, address seller, uint256 amount, uint256 destChainId)",
);

function returnLog(destChainId = 8453n) {
  const topics = encodeEventTopics({
    abi: [EVENT],
    eventName: "ReturnBurned",
    args: { returnId: RETURN_ID, from: FROM, hub: HUB },
  });
  const data = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [PERSON, SELLER, AMOUNT, destChainId],
  );
  return { address: BURN, topics, data };
}

test("unlocked PPL are only the FIFO prefix older than 30 days", () => {
  const now = 1_700_000_000;
  const lots = [
    { boughtAtSec: now - HOLD_SECONDS - 10, pplRemaining: 5n },
    { boughtAtSec: now - HOLD_SECONDS, pplRemaining: 7n },
    { boughtAtSec: now - HOLD_SECONDS + 86_400, pplRemaining: 9n },
    { boughtAtSec: now - HOLD_SECONDS - 1, pplRemaining: 3n },
  ];
  const got = sellBackAvailability(lots, now);
  assert.equal(got.unlockedPpl, 12n);
  assert.equal(got.nextUnlockSec, lots[2].boughtAtSec + HOLD_SECONDS);
});

test("a locked head blocks later unlocked lots", () => {
  const now = 1_700_000_000;
  const got = sellBackAvailability(
    [
      { boughtAtSec: now - 10, pplRemaining: 4n },
      { boughtAtSec: now - HOLD_SECONDS - 10, pplRemaining: 8n },
    ],
    now,
  );
  assert.equal(got.unlockedPpl, 0n);
  assert.equal(got.nextUnlockSec, now - 10 + HOLD_SECONDS);
});

test("fee band is 1.5% under 1% of the reserve and 3% only above it", () => {
  assert.equal(sellBackFeeBand(100n, 100n), "low");
  assert.equal(sellBackFeeBand(1n, 0n), "high");
  assert.equal(sellBackFeeBand(150n, 100n), "mixed");
});

test("min USDC out keeps 1% slippage, rounded down", () => {
  assert.equal(minUsdcOutFromPayout(10_000n), 9_900n);
  assert.equal(minUsdcOutFromPayout(0n), 0n);
});

test("sell-back stays open after the term and after graduation", () => {
  assert.equal(sellBackOpen(1), true);
  assert.equal(sellBackOpen(2), true);
  assert.equal(sellBackOpen(3), true);
  assert.equal(sellBackOpen(4), true);
  assert.equal(sellBackOpen(0), false);
});

const PREFLIGHT = {
  opened: true,
  paused: false,
  liquidityReleased: false,
  returnVerifier: "0x5555555555555555555555555555555555555555",
  sellablePpl: 100n,
  pplIn: 40n,
  grossUsd6: 1_000n,
  payoutUsd6: 980n,
  personalRemainingUsd6: 2_000n,
  globalRemainingUsd6: 2_000n,
};

test("preflight rejects a burn that the hub cannot pay", () => {
  assert.equal(sellBackPreflight(PREFLIGHT).ok, true);
  assert.equal(sellBackPreflight({ ...PREFLIGHT, sellablePpl: 10n }).reason, "notEnough");
  assert.equal(sellBackPreflight({ ...PREFLIGHT, paused: true }).reason, "paused");
  assert.equal(sellBackPreflight({ ...PREFLIGHT, liquidityReleased: true }).reason, "closed");
  assert.equal(sellBackPreflight({ ...PREFLIGHT, returnVerifier: "0x0000000000000000000000000000000000000000" }).reason, "disabled");
  assert.equal(sellBackPreflight({ ...PREFLIGHT, personalRemainingUsd6: 1_000n }).reason, "personalCap");
  assert.equal(sellBackPreflight({ ...PREFLIGHT, globalRemainingUsd6: 1_049n }).reason, "globalCap");
});

test("a cap-fitting slice is chosen under a monotonic quote", () => {
  const grossOf = (ppl) => ppl * 10n;
  assert.equal(largestPplUnderCaps(100n, grossOf, 250n, 400n), 25n);
  assert.equal(largestPplUnderCaps(20n, grossOf, 1_000n, 1_000n), 20n);
  assert.equal(largestPplUnderCaps(20n, grossOf, 0n, 1_000n), 0n);
});

test("revert names map to short error keys", () => {
  assert.equal(sellBackErrorKey({ shortMessage: "The contract function reverted with the following reason: NotEnoughUnlocked" }), "notEnough");
  assert.equal(sellBackErrorKey({ message: "GlobalDayCap()" }), "globalCap");
  assert.equal(sellBackErrorKey({ code: 4001 }), "rejected");
  assert.equal(sellBackErrorKey({ message: "transaction reverted" }), "reverted");
});

test("ReturnBurned decodes returnId, person, seller, amount and destChainId", () => {
  const burned = decodeReturnBurned([returnLog()], { burn: BURN, hub: HUB, destChainId: 8453n });
  assert.equal(burned?.returnId, RETURN_ID);
  assert.equal(burned?.personId, PERSON);
  assert.equal(burned?.seller, SELLER);
  assert.equal(burned?.amount, AMOUNT);
  assert.equal(burned?.destChainId, 8453n);
  assert.equal(decodeReturnBurned([returnLog()], { burn: BURN, hub: SELLER, destChainId: 8453n }), null);
});

test("decodeReturnBurned rejects a destChainId other than the configured Base chain", () => {
  assert.equal(decodeReturnBurned([returnLog(84532n)], { burn: BURN, hub: HUB, destChainId: 8453n }), null);
  assert.equal(decodeReturnBurned([returnLog(8453n)], { burn: BURN, hub: HUB, destChainId: 8453n })?.destChainId, 8453n);
});

test("the exact unpaid remainder is chosen when it fits the caps", async () => {
  const exact = await choosePayableSlice(7n, async (ppl) => ({ gross: ppl, payout: ppl }), 100n, 100n);
  assert.deepEqual(exact, { payable: 7n, payout: 7n });
  const sliced = await choosePayableSlice(50n, async (ppl) => ({ gross: ppl * 10n, payout: ppl }), 100n, 80n);
  assert.equal(sliced.payable, 8n);
  assert.equal(sliced.payout, 8n);
});

test("MainnetReturn signature recovers the return verifier on the hub domain", async () => {
  const deadline = 1_800_000_000n;
  const signature = await signMainnetReturn({
    privateKey: KEY,
    chainId: 8453,
    hub: HUB,
    message: {
      personId: PERSON,
      hub: HUB,
      seller: SELLER,
      pplAmount: AMOUNT,
      sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
      destChainId: 8453,
      returnId: RETURN_ID,
      deadline,
    },
  });
  const recovered = await recoverTypedDataAddress({
    domain: { name: "PplCurveHubV2", version: "1", chainId: 8453, verifyingContract: HUB },
    types: {
      MainnetReturn: [
        { name: "personId", type: "bytes32" },
        { name: "hub", type: "address" },
        { name: "seller", type: "address" },
        { name: "pplAmount", type: "uint256" },
        { name: "sourceChainId", type: "uint256" },
        { name: "destChainId", type: "uint256" },
        { name: "returnId", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "MainnetReturn",
    message: {
      personId: PERSON,
      hub: HUB,
      seller: SELLER,
      pplAmount: AMOUNT,
      sourceChainId: BigInt(PEOPLE_MAINNET_CHAIN_ID),
      destChainId: 8453n,
      returnId: RETURN_ID,
      deadline,
    },
    signature,
  });
  assert.equal(recovered, privateKeyToAccount(KEY).address);
  assert.equal(PEOPLE_MAINNET_CHAIN_ID, 97401);
});

test("a missing return-verifier key is refused before any signature", async () => {
  const previous = process.env.SALE_RETURN_VERIFIER_LOCAL_KEY;
  delete process.env.SALE_RETURN_VERIFIER_LOCAL_KEY;
  try {
    assert.equal(readReturnVerifierKey(), null);
    const result = await createReturnAttestation({
      txHash: `0x${"1".repeat(64)}`,
      signer: getReturnVerifierSigner(8453),
      burnAddress: BURN,
      hubAddress: HUB,
      hubChainId: 8453,
      nowSec: 1_700_000_000,
      getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [returnLog()] }),
      headBlock: async () => 111n,
      returnVerifier: async () => privateKeyToAccount(KEY).address,
    });
    assert.deepEqual(result, { ok: false, status: 503, error: "signer_unavailable" });
  } finally {
    if (previous === undefined) delete process.env.SALE_RETURN_VERIFIER_LOCAL_KEY;
    else process.env.SALE_RETURN_VERIFIER_LOCAL_KEY = previous;
  }
});

test("attestation signs only a successful ReturnBurned for this hub", async () => {
  const result = await createReturnAttestation({
    txHash: `0x${"2".repeat(64)}`,
    signer: testSigner(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [returnLog()] }),
    headBlock: async () => 100n + MIN_RETURN_CONFIRMATIONS - 1n,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.returnId, RETURN_ID);
  assert.equal(result.body.pplAmount, AMOUNT.toString());
  assert.equal(result.body.sourceChainId, 97401);
  assert.equal(result.body.destChainId, 8453);
  assert.equal(result.body.hub, HUB);
  assert.equal(result.body.seller, SELLER);
  assert.equal(result.body.deadline, 1_700_000_000 + 15 * 60);

  const wrongHub = await createReturnAttestation({
    txHash: `0x${"3".repeat(64)}`,
    signer: testSigner(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [{ ...returnLog(), address: FROM }] }),
    headBlock: async () => 200n,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.deepEqual(wrongHub, { ok: false, status: 422, error: "return_not_found" });
});

test("attestation waits for 12 PEOPLE confirmations or a finalized block", async () => {
  assert.equal(MIN_RETURN_CONFIRMATIONS, 12n);
  const shallow = await createReturnAttestation({
    txHash: `0x${"4".repeat(64)}`,
    signer: testSigner(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [returnLog()] }),
    headBlock: async () => 110n,
    finalizedBlock: async () => 99n,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.deepEqual(shallow, { ok: false, status: 202, error: "awaiting_confirmations" });

  const finalized = await createReturnAttestation({
    txHash: `0x${"5".repeat(64)}`,
    signer: testSigner(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [returnLog()] }),
    headBlock: async () => 100n,
    finalizedBlock: async () => 100n,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.equal(finalized.ok, true);
});

test("createReturnAttestation does not sign when destChainId is not the hub chain", async () => {
  const wrongChain = await createReturnAttestation({
    txHash: `0x${"6".repeat(64)}`,
    signer: testSigner(KEY),
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", blockNumber: 100n, logs: [returnLog(84532n)] }),
    headBlock: async () => 200n,
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.deepEqual(wrongChain, { ok: false, status: 422, error: "return_not_found" });
  assert.equal("signature" in wrongChain, false);
});

test("nonceCode is required and blank values are rejected", () => {
  assert.equal(parseSaleNonceCode(undefined), null);
  assert.equal(parseSaleNonceCode(""), null);
  assert.equal(parseSaleNonceCode("   "), null);
  assert.equal(parseSaleNonceCode(12), null);
  assert.equal(parseSaleNonceCode("nonce-1"), "nonce-1");
});

test("approve waits for the receipt and rechecks allowance before the next action", async () => {
  const calls = [];
  let allowance = 0n;
  const result = await approveErc20IfNeeded({
    amount: 100n,
    readAllowance: async () => {
      calls.push("allowance");
      return allowance;
    },
    approve: async () => {
      calls.push("approve");
      return "0xabc";
    },
    waitForReceipt: async (hash) => {
      calls.push(`receipt:${hash}`);
      allowance = 100n;
      return { status: "success" };
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, ["allowance", "approve", "receipt:0xabc", "allowance"]);
});

test("a reverted approval does not count as granted", async () => {
  const calls = [];
  const result = await approveErc20IfNeeded({
    amount: 100n,
    readAllowance: async () => {
      calls.push("allowance");
      return 0n;
    },
    approve: async () => "0xabc",
    waitForReceipt: async () => ({ status: "reverted" }),
  });
  assert.deepEqual(result, { ok: false, reason: "reverted" });
  assert.deepEqual(calls, ["allowance"]);
});

test("an allowance that is still short after the receipt blocks the next action", async () => {
  const result = await approveErc20IfNeeded({
    amount: 100n,
    readAllowance: async () => 0n,
    approve: async () => "0xabc",
    waitForReceipt: async () => ({ status: "success" }),
  });
  assert.deepEqual(result, { ok: false, reason: "allowance_short" });
});

test("enough allowance skips the approval", async () => {
  let approved = false;
  const result = await approveErc20IfNeeded({
    amount: 50n,
    readAllowance: async () => 50n,
    approve: async () => {
      approved = true;
      return "0xabc";
    },
    waitForReceipt: async () => ({ status: "success" }),
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(approved, false);
});

test("return-verifier: env key is refused on Base mainnet and any chain but Base Sepolia", () => {
  assert.equal(getReturnVerifierSigner(8453, { SALE_RETURN_VERIFIER_LOCAL_KEY: KEY }), null);
  assert.equal(getReturnVerifierSigner(8453, { SALE_RETURN_VERIFIER_MODE: "local", SALE_RETURN_VERIFIER_LOCAL_KEY: KEY }), null);
  assert.equal(getReturnVerifierSigner(1, { SALE_RETURN_VERIFIER_LOCAL_KEY: KEY }), null);
  assert.notEqual(getReturnVerifierSigner(84532, { SALE_RETURN_VERIFIER_LOCAL_KEY: KEY }), null);
});

test("return-verifier: nothing configured, bad key, or kms without key id signs nothing", () => {
  assert.equal(getReturnVerifierSigner(84532, {}), null);
  assert.equal(getReturnVerifierSigner(84532, { SALE_RETURN_VERIFIER_LOCAL_KEY: "0x1234" }), null);
  assert.equal(getReturnVerifierSigner(8453, { SALE_RETURN_VERIFIER_MODE: "kms" }), null);
  assert.equal(getReturnVerifierSigner(8453, { SALE_RETURN_VERIFIER_MODE: "something" }), null);
});

test("return-verifier: kms mode with a key id yields a signer without touching the key", () => {
  const signer = getReturnVerifierSigner(8453, {
    SALE_RETURN_VERIFIER_MODE: "kms",
    SALE_RETURN_VERIFIER_KMS_KEY_ID: "test-key-id",
  });
  assert.notEqual(signer, null);
  assert.equal(typeof signer.signDigest, "function");
});

test("signer-path signature equals the typed-data signature and recovers to the verifier", async () => {
  const message = {
    personId: PERSON,
    hub: HUB,
    seller: SELLER,
    pplAmount: AMOUNT,
    sourceChainId: 97401,
    destChainId: 84532,
    returnId: RETURN_ID,
    deadline: 1_700_000_900n,
  };
  const viaDigest = await testSigner(KEY).signDigest(mainnetReturnDigest({ chainId: 84532, hub: HUB, message }));
  const viaTyped = await signMainnetReturn({ privateKey: KEY, chainId: 84532, hub: HUB, message });
  assert.equal(viaDigest, viaTyped);
  const local = getReturnVerifierSigner(84532, { SALE_RETURN_VERIFIER_LOCAL_KEY: KEY });
  assert.equal(await local.getAddress(), privateKeyToAccount(KEY).address);
});
