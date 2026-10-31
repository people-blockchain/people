import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { signFactoryTx, keyFromPrivate } from "../src/lib/people-sign.ts";
import { transactionIdPayload } from "../../people-node/packages/protocol/src/transaction-id.ts";
process.env.GENESIS_FAUCET_ADDRESS ??= "0x" + "1".repeat(40);
const { signTransaction, verifyTransaction, contentTransactionId } = await import("../../people-node/packages/core/dist/crypto.js");
import { signTransaction as sdkSign } from "../../people-node/packages/sdk/dist/index.js";

test("browser, SDK and core agree on content IDs and verify each other's signatures", () => {
  const prevChain = process.env.NEXT_PUBLIC_CHAIN;
  // This JSON tx format is the legacy backend. The node SDK stays on sha256
  // until its own canonical flag is set, so the comparison has to run there.
  process.env.NEXT_PUBLIC_CHAIN = "people-node";
  try {
    const key = randomBytes(32).toString("hex");
    const tx = { chainId: "audit-testnet", id: "client-id", from: keyFromPrivate(key).address,
      to: "network", amount: 1, fee: 0.004875, nonce: 3, timestamp: 123, type: "transfer",
      payload: { memo: "Привет", nested: { z: 1, a: [2, 3] } } };
    const browser = signFactoryTx(key, tx);
    const core = signTransaction(key, tx, true);
    const sdk = sdkSign(key, tx);
    const expected = createHash("sha256").update(transactionIdPayload(tx)).digest("hex");
    for (const signed of [browser, core, sdk]) {
      assert.equal(signed.id, expected);
      assert.equal(signed.id, contentTransactionId(signed));
      assert.equal(verifyTransaction(signed), true);
      assert.equal(verifyTransaction({ ...signed, amount: 2 }), false);
    }
    const reordered = { ...tx, payload: { nested: { a: [2, 3], z: 1 }, memo: "Привет" } };
    assert.equal(signFactoryTx(key, reordered).id, expected);
    assert.notEqual(signFactoryTx(key, { ...tx, nonce: 4 }).id, expected);
  } finally {
    if (prevChain === undefined) delete process.env.NEXT_PUBLIC_CHAIN;
    else process.env.NEXT_PUBLIC_CHAIN = prevChain;
  }
});
