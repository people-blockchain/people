/**
 * Cheap RPC reachability check for token create, run before any IPFS pin.
 * Transient 502/503/504 and network failures are retried with a short backoff.
 * A revert or a chain mismatch is not retried and must not pin.
 */
import { preflightTx, type PreflightClient, type PreflightResult, type PreflightTx } from "@/lib/evm/tx-preflight";
import type { Abi } from "viem";

export const TOKEN_CREATE_RPC_RETRY_DELAYS_MS = [300, 900] as const;

export type TokenCreateRpcClient = {
  getChainId: () => Promise<number>;
  getBalance: (payer: string) => Promise<bigint>;
  /** Placeholder `createToken` simulation. Throw on transport failure; return `{ ok: false }` on revert. */
  simulateCreate?: () => Promise<void | { ok: boolean }>;
};

export type TokenCreateRpcPreflight =
  | { ok: true; balance: bigint }
  | { ok: false; reason: "rpc" | "chain" | "simulation" };

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export function isTransientCreateRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown; status?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  if (name === "TimeoutError" || name === "AbortError" || name === "HttpRequestError" || name === "TypeError") return true;
  if (error instanceof TypeError) return true;
  if (typeof record.status === "number" && (record.status === 502 || record.status === 503 || record.status === 504)) return true;
  const message = typeof record.message === "string" ? record.message : "";
  if (/rpc_backoff|failed to fetch|fetch failed|networkerror|econnrefused|econnreset|timeout/i.test(message)) return true;
  return /\b50[234]\b/.test(message) || /http[_ ]50[234]/i.test(message);
}

export async function withCreateRpcRetry<T>(
  run: () => Promise<T>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TOKEN_CREATE_RPC_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await wait(TOKEN_CREATE_RPC_RETRY_DELAYS_MS[attempt - 1]);
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === TOKEN_CREATE_RPC_RETRY_DELAYS_MS.length || !isTransientCreateRpcError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("rpc_unavailable");
}

/**
 * `eth_chainId` must match, then the payer's balance is read, then an optional `createToken`
 * simulation with a placeholder metadata URI. Pinning is the caller's job and must wait for `{ ok: true }`.
 */
export async function preflightTokenCreateRpc(args: {
  expectedChainId: number;
  payer: string;
  client: TokenCreateRpcClient;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TokenCreateRpcPreflight> {
  const wait = args.sleep ?? sleep;
  let chainId: number;
  try {
    chainId = await withCreateRpcRetry(() => args.client.getChainId(), wait);
  } catch (error) {
    if (isTransientCreateRpcError(error)) return { ok: false, reason: "rpc" };
    throw error;
  }
  if (chainId !== args.expectedChainId) return { ok: false, reason: "chain" };
  let balance: bigint;
  try {
    balance = await withCreateRpcRetry(() => args.client.getBalance(args.payer), wait);
  } catch (error) {
    if (isTransientCreateRpcError(error)) return { ok: false, reason: "rpc" };
    throw error;
  }
  if (args.client.simulateCreate) {
    let simulated: void | { ok: boolean };
    try {
      simulated = await withCreateRpcRetry(() => args.client.simulateCreate!(), wait);
    } catch (error) {
      if (isTransientCreateRpcError(error)) return { ok: false, reason: "rpc" };
      throw error;
    }
    if (simulated && simulated.ok === false) return { ok: false, reason: "simulation" };
  }
  return { ok: true, balance };
}

/** Runs `pin` once after a successful preflight. A failed or throwing preflight does not pin. */
export async function pinAfterCreatePreflight<T>(
  preflight: () => Promise<TokenCreateRpcPreflight>,
  pin: () => Promise<T>,
): Promise<T> {
  const result = await preflight();
  if (!result.ok) {
    const error = new Error(result.reason);
    error.name = "TokenCreateRpcPreflightError";
    throw error;
  }
  return pin();
}

/** Retries only the simulation. The caller sends afterwards, so a retry cannot broadcast twice. */
export async function preflightTxWithRetry(
  client: PreflightClient,
  tx: PreflightTx,
  opts?: { abi?: Abi },
  wait?: (ms: number) => Promise<void>,
): Promise<PreflightResult> {
  return withCreateRpcRetry(() => preflightTx(client, tx, opts), wait);
}
