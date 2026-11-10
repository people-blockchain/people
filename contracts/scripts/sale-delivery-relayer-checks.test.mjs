import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHubPeopleChain } from "./sale-delivery-relayer-checks.mjs";

test("matching hub and PEOPLE chain passes without skipping", () => {
  assert.deepEqual(checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 97400, baseChain: 8453, allowTestChain: false }), { skipped: false });
});

test("mismatch throws without ALLOW_TEST_CHAIN", () => {
  assert.throws(() => checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 97401, baseChain: 84532, allowTestChain: false }), /hub PEOPLE_CHAIN_ID is 97400, PEOPLE RPC is 97401/);
});

test("Sepolia hub (97400) + PEOPLE testnet with ALLOW_TEST_CHAIN skips with a loud warning", () => {
  const r = checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 97401, baseChain: 84532, allowTestChain: true });
  assert.equal(r.skipped, true);
  assert.match(r.warning, /REHEARSAL ONLY/);
  assert.match(r.warning, /NEVER run this configuration for the real sale/);
});

test("ALLOW_TEST_CHAIN never skips on a non-testnet PEOPLE chain", () => {
  assert.throws(() => checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 31337, baseChain: 84532, allowTestChain: true }), /hub PEOPLE_CHAIN_ID/);
  assert.throws(() => checkHubPeopleChain({ hubPeopleChainId: 97401n, peopleChain: 97400, baseChain: 84532, allowTestChain: true }), /hub PEOPLE_CHAIN_ID/);
});

test("ALLOW_TEST_CHAIN never skips when Base is mainnet", () => {
  assert.throws(() => checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 97401, baseChain: 8453, allowTestChain: true }), /hub PEOPLE_CHAIN_ID/);
});

test("allowTestChain must be exactly true", () => {
  assert.throws(() => checkHubPeopleChain({ hubPeopleChainId: 97400n, peopleChain: 97401, baseChain: 84532, allowTestChain: "1" }), /hub PEOPLE_CHAIN_ID/);
});
