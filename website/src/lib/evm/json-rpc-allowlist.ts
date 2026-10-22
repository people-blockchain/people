/**
 * Allowed JSON-RPC methods for public proxies (/api/evm/rpc and /api/network/rpc).
 * Node-management namespaces (admin/debug/personal/txpool/miner/hardhat/evm) stay
 * reachable only on the node's own loopback interface.
 *
 * AUDIT M5: stateful filter methods (`eth_newFilter`, `eth_getFilterChanges`, …) are not
 * offered — behind a load balancer the follow-up call can land on a node that never saw the
 * filter — and neither is `eth_subscribe`, which is meaningless over HTTP. `eth_getLogs` is
 * bounded per request (count and block range) by `evmJsonRpcMethodsAllowed`.
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
  "eth_sendRawTransaction",
  "net_listening",
  "net_peerCount",
  "net_version",
  "web3_clientVersion",
  "web3_sha3",
]);

export const MAX_JSON_RPC_BATCH = 50;
/** AUDIT M5: at most this many `eth_getLogs` entries in one (batch) request. */
export const MAX_GET_LOGS_PER_REQUEST = 10;
/** AUDIT M5: Cosmos EVM nodes cap a log query at 10,000 blocks; refuse wider ranges up front. */
export const MAX_GET_LOGS_BLOCK_RANGE = 10_000;

const MOVING_BLOCK_TAGS = new Set(["latest", "pending", "safe", "finalized"]);

function blockNumberOf(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(value)) return null;
  return BigInt(value);
}

/**
 * A log filter is bounded when it pins one block (`blockHash`), spans at most
 * `MAX_GET_LOGS_BLOCK_RANGE` explicit block numbers, or only uses "head" tags (an omitted
 * bound defaults to `latest`). Anything open-ended such as `earliest`→`latest` or a number→tag
 * range is refused, since its width cannot be known here.
 */
export function isBoundedLogFilter(params: unknown): boolean {
  if (!Array.isArray(params) || params.length !== 1) return false;
  const filter = params[0];
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return false;
  const { blockHash, fromBlock, toBlock } = filter as Record<string, unknown>;
  if (blockHash !== undefined) {
    return fromBlock === undefined && toBlock === undefined && typeof blockHash === "string";
  }
  const from = fromBlock ?? "latest";
  const to = toBlock ?? "latest";
  if (typeof from === "string" && typeof to === "string" && MOVING_BLOCK_TAGS.has(from) && MOVING_BLOCK_TAGS.has(to)) {
    return true;
  }
  const a = blockNumberOf(from);
  const b = blockNumberOf(to);
  if (a === null || b === null || b < a) return false;
  return b - a < BigInt(MAX_GET_LOGS_BLOCK_RANGE);
}

/** Number of `eth_getLogs` entries in a (single or batch) JSON-RPC payload. */
export function countGetLogsCalls(payload: unknown): number {
  const entries = Array.isArray(payload) ? payload : [payload];
  return entries.filter(
    (entry) => entry && typeof entry === "object" && (entry as { method?: unknown }).method === "eth_getLogs",
  ).length;
}

/**
 * True when every entry in a JSON-RPC request (single or batch) uses an allow-listed method,
 * and any `eth_getLogs` entries stay within the per-request count and block-range bounds.
 */
export function evmJsonRpcMethodsAllowed(payload: unknown): boolean {
  const entries = Array.isArray(payload) ? payload : [payload];
  if (entries.length === 0 || entries.length > MAX_JSON_RPC_BATCH) return false;
  if (countGetLogsCalls(payload) > MAX_GET_LOGS_PER_REQUEST) return false;
  return entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, params } = entry as { method?: unknown; params?: unknown };
    if (typeof method !== "string" || !EVM_JSON_RPC_ALLOWED_METHODS.has(method)) return false;
    return method !== "eth_getLogs" || isBoundedLogFilter(params);
  });
}
