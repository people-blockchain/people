import { test } from "node:test";
import assert from "node:assert/strict";

test("built-in public testnet defaults apply when env is unset", async () => {
  const prev = {
    OVN_RPC_URL: process.env.OVN_RPC_URL,
    NEXT_PUBLIC_OVN_RPC_URL: process.env.NEXT_PUBLIC_OVN_RPC_URL,
    PEOPLE_NODE_URL: process.env.PEOPLE_NODE_URL,
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
    EVM_RPC_URL: process.env.EVM_RPC_URL,
  };
  delete process.env.OVN_RPC_URL;
  delete process.env.NEXT_PUBLIC_OVN_RPC_URL;
  delete process.env.PEOPLE_NODE_URL;
  delete process.env.NEXT_PUBLIC_CHAIN_ID;
  delete process.env.NEXT_PUBLIC_CHAIN;
  delete process.env.EVM_RPC_URL;

  const {
    resolveNodeRpcUrl,
    resolvePublicChainId,
    DEFAULT_PUBLIC_CHAIN_ID,
    COSMOS_EVM_CHAIN_ID_LABEL,
  } = await import("../src/lib/node-rpc.ts");

  assert.equal(resolveNodeRpcUrl(), "https://node.peopleblockchain.network");
  assert.equal(resolvePublicChainId(), COSMOS_EVM_CHAIN_ID_LABEL);
  assert.equal(COSMOS_EVM_CHAIN_ID_LABEL, "97401");

  process.env.NEXT_PUBLIC_CHAIN = "ovn-node";
  assert.equal(resolvePublicChainId(), DEFAULT_PUBLIC_CHAIN_ID);
  assert.equal(DEFAULT_PUBLIC_CHAIN_ID, "people-public-testnet-v2-2026-09-30");

  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
