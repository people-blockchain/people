import assert from "node:assert/strict";
import test from "node:test";
import { evmJsonRpcMethodsAllowed, EVM_JSON_RPC_ALLOWED_METHODS } from "../src/lib/evm/json-rpc-allowlist.ts";

test("allowlist accepts eth_chainId and refuses admin_peers", () => {
  assert.equal(evmJsonRpcMethodsAllowed({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), true);
  assert.equal(evmJsonRpcMethodsAllowed({ jsonrpc: "2.0", id: 1, method: "admin_peers", params: [] }), false);
  assert.equal(evmJsonRpcMethodsAllowed({ jsonrpc: "2.0", id: 1, method: "debug_traceTransaction", params: [] }), false);
  assert.ok(EVM_JSON_RPC_ALLOWED_METHODS.has("eth_sendRawTransaction"));
});

test("allowlist rejects empty and oversized batches", () => {
  assert.equal(evmJsonRpcMethodsAllowed([]), false);
  const big = Array.from({ length: 51 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "eth_chainId", params: [] }));
  assert.equal(evmJsonRpcMethodsAllowed(big), false);
  assert.equal(
    evmJsonRpcMethodsAllowed([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "admin_nodeInfo", params: [] },
    ]),
    false,
  );
});
