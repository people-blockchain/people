/**
 * Allowed JSON-RPC methods for public proxies (/api/evm/rpc and /api/network/rpc).
 * Node-management namespaces (admin/debug/personal/txpool/miner/hardhat/evm) stay
 * reachable only on the node's own loopback interface.
 */
export const EVM_JSON_RPC_ALLOWED_METHODS = new Set([
  "eth_accounts",
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_maxPriorityFeePerGas",
  "eth_newBlockFilter",
  "eth_newFilter",
  "eth_newPendingTransactionFilter",
  "eth_sendRawTransaction",
  "eth_subscribe",
  "eth_uninstallFilter",
  "eth_unsubscribe",
  "net_listening",
  "net_peerCount",
  "net_version",
  "web3_clientVersion",
  "web3_sha3",
]);

/** True when every entry in a JSON-RPC request (single or batch) uses an allow-listed method. */
export function evmJsonRpcMethodsAllowed(payload: unknown): boolean {
  const entries = Array.isArray(payload) ? payload : [payload];
  if (entries.length === 0 || entries.length > 50) return false;
  return entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const method = (entry as { method?: unknown }).method;
    return typeof method === "string" && EVM_JSON_RPC_ALLOWED_METHODS.has(method);
  });
}
