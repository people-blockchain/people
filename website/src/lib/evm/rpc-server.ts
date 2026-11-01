import { AsyncLocalStorage } from "node:async_hooks";
import { readEvmRpcUrl } from "@/lib/evm/config";

/**
 * Exponential backoff for the shared PEOPLE node.
 *
 * When the node times out, drops the connection or answers 429/5xx, further calls to that URL fail
 * fast (`rpc_backoff`) instead of piling more work onto a struggling validator. The pause starts at
 * `RPC_BACKOFF_BASE_MS` and doubles per consecutive failure up to `RPC_BACKOFF_MAX_MS`; any
 * successful response resets it. JSON-RPC `error` members are answers from a healthy node and do
 * not count as failures. State is per URL and per server instance.
 */
export const RPC_BACKOFF_BASE_MS = 2_000;
export const RPC_BACKOFF_MAX_MS = 120_000;
const RPC_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

type BackoffState = { failures: number; blockedUntil: number };
const backoffByUrl = new Map<string, BackoffState>();

export function rpcBackoffDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(RPC_BACKOFF_MAX_MS, RPC_BACKOFF_BASE_MS * 2 ** (failures - 1));
}

/** Milliseconds until `url` may be called again (0 when it is not backing off). */
export function rpcBackoffRemainingMs(url = readEvmRpcUrl() ?? ""): number {
  const state = backoffByUrl.get(url);
  return state ? Math.max(0, state.blockedUntil - Date.now()) : 0;
}

export function resetRpcBackoffForTests(): void {
  backoffByUrl.clear();
}

/** Per-request RPC deadline. Log scans read it so a short NFT listing cannot sit on a 20s call. */
export type RpcCallContext = {
  deadlineAt?: number;
  logPriority?: "recent" | "history";
};

const rpcCallContext = new AsyncLocalStorage<RpcCallContext>();

export function withRpcCallContext<T>(patch: RpcCallContext, fn: () => Promise<T>): Promise<T> {
  const parent = rpcCallContext.getStore();
  return rpcCallContext.run({ ...parent, ...patch }, fn);
}

export function readRpcDeadlineAt(): number | undefined {
  return rpcCallContext.getStore()?.deadlineAt;
}

export function readLogWindowPriority(): "recent" | "history" {
  return rpcCallContext.getStore()?.logPriority ?? "history";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function timeoutFor(fallbackMs: number): { timeoutMs: number; soft: boolean } {
  const deadlineAt = readRpcDeadlineAt();
  if (deadlineAt === undefined) return { timeoutMs: fallbackMs, soft: false };
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return { timeoutMs: 0, soft: true };
  const timeoutMs = Math.min(fallbackMs, remaining);
  return { timeoutMs, soft: timeoutMs < fallbackMs };
}

function noteRpcFailure(url: string): void {
  const state = backoffByUrl.get(url) ?? { failures: 0, blockedUntil: 0 };
  state.failures += 1;
  state.blockedUntil = Date.now() + rpcBackoffDelayMs(state.failures);
  backoffByUrl.set(url, state);
}

function noteRpcSuccess(url: string): void {
  backoffByUrl.delete(url);
}

/** POSTs a JSON-RPC body, honouring and updating the per-URL backoff. */
async function postRpc(url: string, body: unknown, fallbackTimeoutMs: number): Promise<{ res: Response; payload: unknown }> {
  if (rpcBackoffRemainingMs(url) > 0) throw new Error("rpc_backoff");
  const { timeoutMs, soft } = timeoutFor(fallbackTimeoutMs);
  if (timeoutMs <= 0) throw new Error("rpc_deadline");
  let res: Response;
  let payload: unknown;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // A listing deadline is our stop, not a sick node. A full 20s timeout still backs off.
    if (!(soft && isAbortError(error))) noteRpcFailure(url);
    throw error;
  }
  if (RPC_RETRYABLE_STATUS.has(res.status)) {
    noteRpcFailure(url);
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `rpc_http_${res.status}`);
  }
  try {
    payload = await res.json();
  } catch (error) {
    // A truncated/HTML body (proxy error page, dropped connection) is a node-side failure.
    noteRpcFailure(url);
    throw error;
  }
  noteRpcSuccess(url);
  return { res, payload };
}

export async function evmJsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const url = readEvmRpcUrl();
  if (!url) throw new Error("evm_rpc_unconfigured");
  const { res, payload: raw } = await postRpc(url, { jsonrpc: "2.0", id: 1, method, params }, 20_000);
  const payload = raw as { result?: T; error?: { message?: string } };
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? `rpc_http_${res.status}`);
  }
  return payload.result as T;
}

/**
 * JSON-RPC 2.0 batch arrays. A catalog scan needs ~20 `eth_getLogs` windows plus a handful of
 * `eth_call`s per token/pair; sent one-by-one against the public node that is 20–25 s, whereas the
 * same calls in a single HTTP request complete in 1–10 s. The node (and our own `/api/evm/rpc`
 * proxy) accept arrays of up to 50, so requests are chunked to stay inside that cap.
 */
export const RPC_BATCH_MAX = 50;

type RpcBatchCall = { method: string; params?: unknown[] };

type RpcBatchEntry<T> = { id?: number; result?: T; error?: { message?: string } };

/**
 * Sends calls as JSON-RPC batches, preserving input order. A call that fails (transport error or a
 * JSON-RPC `error` member) yields `null` in its slot instead of rejecting the whole batch, so one
 * bad token cannot blank the catalog.
 */
export async function evmJsonRpcBatch<T>(calls: RpcBatchCall[]): Promise<Array<T | null>> {
  const out: Array<T | null> = [];
  if (!calls.length) return out;
  const url = readEvmRpcUrl();
  if (!url) throw new Error("evm_rpc_unconfigured");
  for (let i = 0; i < calls.length; i += RPC_BATCH_MAX) {
    const chunk = calls.slice(i, i + RPC_BATCH_MAX);
    const body = chunk.map((call, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: call.method,
      params: call.params ?? [],
    }));
    const { res, payload: raw } = await postRpc(url, body, 30_000);
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const payload = raw as Array<RpcBatchEntry<T>> | RpcBatchEntry<T>;
    // A node that rejects batch arrays answers with a single error object rather than an array.
    if (!Array.isArray(payload)) {
      throw new Error(payload?.error?.message ?? "rpc_batch_rejected");
    }
    const byId = new Map<number, RpcBatchEntry<T>>();
    for (const entry of payload) {
      if (entry && typeof entry.id === "number") byId.set(entry.id, entry);
    }
    for (let index = 0; index < chunk.length; index++) {
      const entry = byId.get(index + 1);
      out.push(entry && !entry.error ? (entry.result as T) : null);
    }
  }
  return out;
}

export function weiToPpl(wei: bigint): number {
  return Number(wei) / 1e18;
}

export function pplToWei(amount: number): bigint {
  return BigInt(Math.floor(amount * 1e18));
}
