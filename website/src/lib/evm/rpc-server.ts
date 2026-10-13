import { readEvmRpcUrl } from "@/lib/evm/config";

export async function evmJsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const url = readEvmRpcUrl();
  if (!url) throw new Error("evm_rpc_unconfigured");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message ?? `rpc_http_${res.status}`);
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
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const payload = (await res.json()) as Array<RpcBatchEntry<T>> | RpcBatchEntry<T>;
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
