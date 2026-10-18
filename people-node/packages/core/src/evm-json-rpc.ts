import {
  APPROVED_CONTRACT_GAS_PRICE_PPL,
  DEFAULT_TX_GAS_LIMIT,
  EIP155_CHAIN_ID,
  MAX_TX_GAS_LIMIT
} from "@people/protocol";
import { resolveAccountStorageKey } from "./address-policy.js";
import { staticContractCall } from "./contracts.js";
import type { ChainState } from "./index.js";
import { pplToWei } from "./evm.js";

export const PEOPLE_JSON_RPC_VERSION = "PeopleNode/1.0.0";

/**
 * M16-1: a single HTTP request must not be able to run an unbounded number of
 * calls. Node policy (not consensus), so it is configurable per node.
 */
export const DEFAULT_JSON_RPC_MAX_BATCH = 50;

export function jsonRpcMaxBatch(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.JSON_RPC_MAX_BATCH ?? DEFAULT_JSON_RPC_MAX_BATCH);
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_JSON_RPC_MAX_BATCH;
  }
  return Math.floor(raw);
}

export interface EvmJsonRpcHost {
  chainState: ChainState;
  headHeight: number;
  stringChainId: string;
  clientVersion?: string;
  /**
   * M16-1: node policy for `eth_call`/`eth_estimateGas`, mirroring
   * `POST /contracts/call`. Omitted in core tests, where behaviour is unchanged.
   */
  maxCallGas?: number;
  allowCall?: () => boolean;
}

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorBody {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcErrorBody;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function requireCallAllowed(host: EvmJsonRpcHost): void {
  if (host.allowCall && !host.allowCall()) {
    throw new RpcCallRateLimitedError();
  }
}

function callGasCap(host: EvmJsonRpcHost, requested: number): number {
  const cap = host.maxCallGas;
  if (cap === undefined || !Number.isFinite(cap) || cap < 1) {
    return requested;
  }
  return Math.min(requested, Math.floor(cap));
}

function hexQuantity(value: number | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(Math.max(0, Math.floor(value)));
  return `0x${n.toString(16)}`;
}

function parseAddressParam(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new RpcParamError(`Invalid ${name}`);
  }
  return value.toLowerCase();
}

function parseHexData(value: unknown): string {
  if (value === undefined || value === null || value === "0x") {
    return "0x";
  }
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new RpcParamError("Invalid data");
  }
  return value;
}

class RpcParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcParamError";
  }
}

function gasPriceWei(): bigint {
  return pplToWei(APPROVED_CONTRACT_GAS_PRICE_PPL) || 1n;
}

function getAccountBalanceWei(state: ChainState, address: string): bigint {
  const key = resolveAccountStorageKey(state, address);
  const account = state.accounts[key];
  if (!account) {
    return 0n;
  }
  return pplToWei(account.balance ?? 0);
}

function getContractCode(state: ChainState, address: string): string {
  const key = resolveAccountStorageKey(state, address);
  const contract = state.contracts?.[key];
  return contract?.code && contract.code !== "0x" ? contract.code : "0x";
}

function getStorageAt(state: ChainState, address: string, slotHex: string): string {
  const key = resolveAccountStorageKey(state, address);
  const contract = state.contracts?.[key];
  if (!contract) {
    return "0x" + "00".repeat(32);
  }
  const slot = slotHex.toLowerCase();
  const value = contract.storage[slot] ?? contract.storage[slot.replace(/^0x/, "0x")];
  if (!value) {
    return "0x" + "00".repeat(32);
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return normalized.length >= 66 ? normalized : `0x${normalized.slice(2).padStart(64, "0")}`;
}

async function dispatchMethod(host: EvmJsonRpcHost, method: string, params: unknown): Promise<unknown> {
  const state = host.chainState;
  switch (method) {
    case "eth_chainId":
      return hexQuantity(EIP155_CHAIN_ID);
    case "net_version":
      return String(EIP155_CHAIN_ID);
    case "web3_clientVersion":
      return host.clientVersion ?? PEOPLE_JSON_RPC_VERSION;
    case "eth_blockNumber":
      return hexQuantity(host.headHeight);
    case "eth_gasPrice":
      return hexQuantity(gasPriceWei());
    case "eth_getBalance": {
      const list = Array.isArray(params) ? params : [];
      const address = parseAddressParam(list[0], "address");
      return hexQuantity(getAccountBalanceWei(state, address));
    }
    case "eth_getCode": {
      const list = Array.isArray(params) ? params : [];
      const address = parseAddressParam(list[0], "address");
      return getContractCode(state, address);
    }
    case "eth_getStorageAt": {
      const list = Array.isArray(params) ? params : [];
      const address = parseAddressParam(list[0], "address");
      const slot =
        typeof list[1] === "string" && /^0x[0-9a-fA-F]{64}$/.test(list[1])
          ? list[1].toLowerCase()
          : (() => {
              throw new RpcParamError("Invalid storage slot");
            })();
      return getStorageAt(state, address, slot);
    }
    case "eth_call": {
      const list = Array.isArray(params) ? params : [];
      const callObj = (list[0] ?? {}) as Record<string, unknown>;
      const to = parseAddressParam(callObj.to, "to");
      const from =
        callObj.from !== undefined ? parseAddressParam(callObj.from, "from") : "0x" + "00".repeat(20);
      const data = parseHexData(callObj.data);
      const gasHex = callObj.gas;
      let gasLimit = DEFAULT_TX_GAS_LIMIT;
      if (typeof gasHex === "string" && /^0x[0-9a-fA-F]+$/.test(gasHex)) {
        gasLimit = Math.min(MAX_TX_GAS_LIMIT, Number(BigInt(gasHex)));
      }
      requireCallAllowed(host);
      const receipt = await staticContractCall(state, from, to, data, callGasCap(host, gasLimit));
      if (receipt.status === 0) {
        throw new Error(receipt.error ?? "execution reverted");
      }
      return receipt.returnData.startsWith("0x") ? receipt.returnData : `0x${receipt.returnData}`;
    }
    case "eth_estimateGas": {
      const list = Array.isArray(params) ? params : [];
      const callObj = (list[0] ?? {}) as Record<string, unknown>;
      if (!callObj.to) {
        throw new RpcParamError("Missing to");
      }
      const to = parseAddressParam(callObj.to, "to");
      const from =
        callObj.from !== undefined ? parseAddressParam(callObj.from, "from") : "0x" + "00".repeat(20);
      const data = parseHexData(callObj.data);
      requireCallAllowed(host);
      const receipt = await staticContractCall(state, from, to, data, callGasCap(host, MAX_TX_GAS_LIMIT));
      // Mirror eth_call: a reverting call must report the revert, not a plausible gas number.
      if (receipt.status === 0) {
        throw new Error(receipt.error ?? "execution reverted");
      }
      const intrinsic = 21_000;
      const used = Math.max(intrinsic, receipt.gasUsed || intrinsic);
      return hexQuantity(Math.min(used, MAX_TX_GAS_LIMIT));
    }
    default:
      throw new MethodNotFoundError(method);
  }
}

/** M16-1: `eth_call`/`eth_estimateGas` refused by node rate policy. */
export class RpcCallRateLimitedError extends Error {
  constructor() {
    super("Contract call rate limit exceeded");
    this.name = "RpcCallRateLimitedError";
  }
}

class MethodNotFoundError extends Error {
  constructor(method: string) {
    super(`Method not found: ${method}`);
    this.name = "MethodNotFoundError";
  }
}

export async function handleJsonRpcRequest(
  host: EvmJsonRpcHost,
  request: JsonRpcRequest
): Promise<JsonRpcResponse> {
  // Batch items are caller-supplied JSON: `null`/numbers/strings must produce a -32600 for
  // that slot, not throw out of the whole batch.
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Invalid Request" } };
  }
  const id: JsonRpcId = request.id ?? null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return { jsonrpc: "2.0", id, error: { code: INVALID_REQUEST, message: "Invalid Request" } };
  }
  try {
    const result = await dispatchMethod(host, request.method, request.params);
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    if (error instanceof MethodNotFoundError) {
      return { jsonrpc: "2.0", id, error: { code: METHOD_NOT_FOUND, message: error.message } };
    }
    if (error instanceof RpcParamError) {
      return { jsonrpc: "2.0", id, error: { code: INVALID_PARAMS, message: error.message } };
    }
    if (error instanceof RpcCallRateLimitedError) {
      return { jsonrpc: "2.0", id, error: { code: INVALID_REQUEST, message: error.message } };
    }
    const message = error instanceof Error ? error.message : "Internal error";
    return { jsonrpc: "2.0", id, error: { code: INTERNAL_ERROR, message, data: message } };
  }
}

export function parseJsonRpcBody(raw: unknown): JsonRpcRequest | JsonRpcRequest[] | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => item as JsonRpcRequest);
  }
  if (typeof raw === "object") {
    return raw as JsonRpcRequest;
  }
  return null;
}

export async function handleJsonRpcBatch(
  host: EvmJsonRpcHost,
  requests: JsonRpcRequest[]
): Promise<JsonRpcResponse[]> {
  const out: JsonRpcResponse[] = [];
  for (const req of requests) {
    // M16-1: hand the event loop back between calls so block production,
    // attestations and gossip timers keep firing while a batch runs.
    if (out.length > 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    out.push(await handleJsonRpcRequest(host, req));
  }
  return out;
}

/** M16-1: a batch longer than `jsonRpcMaxBatch()` is refused without executing anything. */
export function jsonRpcBatchTooLarge(id: JsonRpcId = null): JsonRpcErrorBody {
  return { jsonrpc: "2.0", id, error: { code: INVALID_REQUEST, message: "Batch too large" } };
}

export function jsonRpcParseError(id: JsonRpcId = null): JsonRpcErrorBody {
  return { jsonrpc: "2.0", id, error: { code: PARSE_ERROR, message: "Parse error" } };
}
