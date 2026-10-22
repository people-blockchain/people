import assert from "node:assert/strict";
import test from "node:test";
import { countGetLogsCalls, evmJsonRpcMethodsAllowed, EVM_JSON_RPC_ALLOWED_METHODS } from "../src/lib/evm/json-rpc-allowlist.ts";

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

// AUDIT M5: stateful filters and eth_subscribe are not proxied; eth_getLogs is bounded.
test("filter methods and eth_subscribe are refused", () => {
  for (const method of [
    "eth_newFilter",
    "eth_newBlockFilter",
    "eth_newPendingTransactionFilter",
    "eth_getFilterChanges",
    "eth_getFilterLogs",
    "eth_uninstallFilter",
    "eth_subscribe",
    "eth_unsubscribe",
  ]) {
    assert.equal(evmJsonRpcMethodsAllowed({ jsonrpc: "2.0", id: 1, method, params: [] }), false, method);
  }
});

const logs = (filter, id = 1) => ({ jsonrpc: "2.0", id, method: "eth_getLogs", params: [filter] });

test("eth_getLogs is allowed for a block range up to 10,000 blocks", () => {
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "0x0", toBlock: "0x270f" })), true); // 9,999 blocks span
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "0x0", toBlock: "0x2710" })), false); // 10,001 blocks
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "0x10", toBlock: "0x1" })), false);
});

test("eth_getLogs accepts blockHash and head-tag filters but refuses open-ended ranges", () => {
  assert.equal(evmJsonRpcMethodsAllowed(logs({ blockHash: `0x${"ab".repeat(32)}` })), true);
  assert.equal(evmJsonRpcMethodsAllowed(logs({})), true);
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "latest" })), true);
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "earliest", toBlock: "latest" })), false);
  assert.equal(evmJsonRpcMethodsAllowed(logs({ fromBlock: "0x1" })), false);
  assert.equal(evmJsonRpcMethodsAllowed({ jsonrpc: "2.0", id: 1, method: "eth_getLogs" }), false);
});

test("a batch may carry at most 10 eth_getLogs entries", () => {
  const ten = Array.from({ length: 10 }, (_, i) => logs({ fromBlock: "0x1", toBlock: "0x2" }, i));
  assert.equal(evmJsonRpcMethodsAllowed(ten), true);
  assert.equal(evmJsonRpcMethodsAllowed([...ten, logs({ fromBlock: "0x1", toBlock: "0x2" }, 11)]), false);
  assert.equal(countGetLogsCalls(ten), 10);
});
