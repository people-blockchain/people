import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyFounderActionOnChain } from "../src/lib/founders/chain-verify.ts";

const VALID_HASH = `0x${"a".repeat(64)}`;

test("actions with no wired on-chain check are rejected, not trusted", async () => {
  for (const action of ["token_launch", "nft_mint", "pool_create", "governance_vote", "discover_reaction"]) {
    const result = await verifyFounderActionOnChain(action, VALID_HASH, "0x1111111111111111111111111111111111111111");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "not_verifiable");
  }
});

test("swap rejects a malformed tx hash before touching the network", async () => {
  const result = await verifyFounderActionOnChain("swap", "not-a-hash", "0x1111111111111111111111111111111111111111");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_tx_hash");
});

test("stake rejects a malformed tx hash before touching the network", async () => {
  const result = await verifyFounderActionOnChain("stake", "not-a-hash", "0x1111111111111111111111111111111111111111");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "invalid_tx_hash");
});
