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
  PEOPLE_MAINNET_CHAIN_ID,
  createReturnAttestation,
  decodeReturnBurned,
  readReturnVerifierKey,
  signMainnetReturn,
} from "../src/lib/sale/v2/return-attestation.ts";
import {
  HOLD_SECONDS,
  minUsdcOutFromPayout,
  sellBackAvailability,
  sellBackErrorKey,
  sellBackFeeBand,
  sellBackOpen,
} from "../src/lib/sale/v2/sellback.ts";

const HUB = "0x3333333333333333333333333333333333333333";
const BURN = "0x4444444444444444444444444444444444444444";
const SELLER = "0x1111111111111111111111111111111111111111";
const FROM = "0x2222222222222222222222222222222222222222";
const KEY = `0x${"ab".repeat(32)}`;
const PERSON = keccak256(toBytes("person-1"));
const RETURN_ID = keccak256(toBytes("return-1"));
const AMOUNT = 10n ** 18n;
const EVENT = parseAbiItem(
  "event ReturnBurned(bytes32 indexed returnId, address indexed from, address indexed hub, bytes32 personId, address seller, uint256 amount)",
);

function returnLog() {
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
    ],
    [PERSON, SELLER, AMOUNT],
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

test("sell-back stays open after the term and closes at graduation", () => {
  assert.equal(sellBackOpen(1), true);
  assert.equal(sellBackOpen(2), true);
  assert.equal(sellBackOpen(3), true);
  assert.equal(sellBackOpen(0), false);
  assert.equal(sellBackOpen(4), false);
});

test("revert names map to short error keys", () => {
  assert.equal(sellBackErrorKey({ shortMessage: "The contract function reverted with the following reason: NotEnoughUnlocked" }), "notEnough");
  assert.equal(sellBackErrorKey({ message: "GlobalDayCap()" }), "globalCap");
  assert.equal(sellBackErrorKey({ code: 4001 }), "rejected");
  assert.equal(sellBackErrorKey({ message: "transaction reverted" }), "reverted");
});

test("ReturnBurned decodes returnId, person, seller and amount", () => {
  const burned = decodeReturnBurned([returnLog()], { burn: BURN, hub: HUB });
  assert.equal(burned?.returnId, RETURN_ID);
  assert.equal(burned?.personId, PERSON);
  assert.equal(burned?.seller, SELLER);
  assert.equal(burned?.amount, AMOUNT);
  assert.equal(decodeReturnBurned([returnLog()], { burn: BURN, hub: SELLER }), null);
});

test("MainnetReturn signature recovers the return verifier on the hub domain", async () => {
  const deadline = 1_800_000_000n;
  const signature = await signMainnetReturn({
    privateKey: KEY,
    chainId: 8453,
    hub: HUB,
    message: {
      personId: PERSON,
      seller: SELLER,
      pplAmount: AMOUNT,
      sourceChainId: PEOPLE_MAINNET_CHAIN_ID,
      returnId: RETURN_ID,
      deadline,
    },
  });
  const recovered = await recoverTypedDataAddress({
    domain: { name: "PplCurveHubV2", version: "1", chainId: 8453, verifyingContract: HUB },
    types: {
      MainnetReturn: [
        { name: "personId", type: "bytes32" },
        { name: "seller", type: "address" },
        { name: "pplAmount", type: "uint256" },
        { name: "sourceChainId", type: "uint256" },
        { name: "returnId", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "MainnetReturn",
    message: {
      personId: PERSON,
      seller: SELLER,
      pplAmount: AMOUNT,
      sourceChainId: BigInt(PEOPLE_MAINNET_CHAIN_ID),
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
      key: readReturnVerifierKey(),
      burnAddress: BURN,
      hubAddress: HUB,
      hubChainId: 8453,
      nowSec: 1_700_000_000,
      getReceipt: async () => ({ status: "success", logs: [returnLog()] }),
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
    key: KEY,
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", logs: [returnLog()] }),
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.returnId, RETURN_ID);
  assert.equal(result.body.pplAmount, AMOUNT.toString());
  assert.equal(result.body.sourceChainId, 97401);
  assert.equal(result.body.deadline, 1_700_000_000 + 15 * 60);

  const wrongHub = await createReturnAttestation({
    txHash: `0x${"3".repeat(64)}`,
    key: KEY,
    burnAddress: BURN,
    hubAddress: HUB,
    hubChainId: 8453,
    nowSec: 1_700_000_000,
    getReceipt: async () => ({ status: "success", logs: [{ ...returnLog(), address: FROM }] }),
    returnVerifier: async () => privateKeyToAccount(KEY).address,
  });
  assert.deepEqual(wrongHub, { ok: false, status: 422, error: "return_not_found" });
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
