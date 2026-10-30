import { readEvmRpcUrl } from "@/lib/evm/config";
import {
  RequestDeadlineError,
  boundedTimeoutMs,
  currentDeadline,
  deadlineExpired,
  linkAbort,
} from "@/lib/evm/request-deadline";

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
async function postRpc(
  url: string,
  body: unknown,
  timeoutMs: number,
  { ignoreBackoff = false, signal, deadlineAt }: { ignoreBackoff?: boolean; signal?: AbortSignal; deadlineAt?: number } = {},
): Promise<{ res: Response; payload: unknown }> {
  if (!ignoreBackoff && rpcBackoffRemainingMs(url) > 0) throw new Error("rpc_backoff");
  const parent = signal ?? currentDeadline()?.signal;
  const at = deadlineAt ?? currentDeadline()?.at;
  if (parent?.aborted || timeoutMs <= 0) throw new RequestDeadlineError();
  const attempt = linkAbort(timeoutMs, parent);
  let res: Response;
  let payload: unknown;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: attempt.signal,
    });
  } catch (error) {
    if (!ignoreBackoff) noteRpcFailure(url);
    if (parent?.aborted || deadlineExpired(at)) throw new RequestDeadlineError();
    throw error;
  } finally {
    attempt.cancel();
  }
  if (RPC_RETRYABLE_STATUS.has(res.status)) {
    if (!ignoreBackoff) noteRpcFailure(url);
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `rpc_http_${res.status}`);
  }
  try {
    payload = await res.json();
  } catch (error) {
    // A truncated/HTML body (proxy error page, dropped connection) is a node-side failure.
    if (!ignoreBackoff) noteRpcFailure(url);
    throw error;
  }
  noteRpcSuccess(url);
  return { res, payload };
}

export type EvmJsonRpcOptions = {
  /** Per-call abort timeout; defaults to 20 s and is shortened to the request deadline. */
  timeoutMs?: number;
  /**
   * Read through an active per-URL backoff instead of failing fast. Used by `eth_getLogs` retries
   * so one bad window cannot short-circuit the rest of a catalog scan.
   */
  ignoreBackoff?: boolean;
  /** Stops the attempt when the request deadline aborts. */
  signal?: AbortSignal;
  /** Absolute `Date.now()` deadline. Defaults to the request deadline when one is active. */
  deadlineAt?: number;
};

/**
 * A JSON-RPC `error` member answered by a healthy node (typically an `eth_call` revert). Distinct
 * from transport failures (timeout, backoff, HTTP 5xx) so callers can tell "contract says no" from
 * "could not ask".
 */
export class EvmRpcResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvmRpcResponseError";
  }
}

export async function evmJsonRpc<T>(method: string, params: unknown[] = [], options: EvmJsonRpcOptions = {}): Promise<T> {
  const url = readEvmRpcUrl();
  if (!url) throw new Error("evm_rpc_unconfigured");
  const deadlineAt = options.deadlineAt ?? currentDeadline()?.at;
  const { res, payload: raw } = await postRpc(
    url,
    { jsonrpc: "2.0", id: 1, method, params },
    boundedTimeoutMs(options.timeoutMs ?? 20_000, deadlineAt),
    { ignoreBackoff: options.ignoreBackoff, signal: options.signal, deadlineAt },
  );
  const payload = raw as { result?: T; error?: { message?: string } };
  if (payload?.error) throw new EvmRpcResponseError(payload.error.message ?? "rpc_error");
  if (!res.ok) throw new Error(`rpc_http_${res.status}`);
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
export async function evmJsonRpcBatch<T>(
  calls: RpcBatchCall[],
  options: Pick<EvmJsonRpcOptions, "ignoreBackoff" | "timeoutMs" | "deadlineAt" | "signal"> = {},
): Promise<Array<T | null>> {
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
    const deadlineAt = options.deadlineAt ?? currentDeadline()?.at;
    const { res, payload: raw } = await postRpc(url, body, boundedTimeoutMs(options.timeoutMs ?? 30_000, deadlineAt), {
      ignoreBackoff: options.ignoreBackoff,
      signal: options.signal,
      deadlineAt,
    });
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
