/** Read-only protocol client for the partner cabinet. Never writes chain state. */

import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/people-compat";
import { resolveNodeRpcUrl } from "@/lib/node-rpc";
import type { PartnerStrings } from "@/lib/partner/copy";
import {
  NATIVE_ASSET_ID,
  parseGrowthClaimsFromSnapshot,
  resolvePplBalanceFromAccount,
  type GrowthClaimRow,
} from "@/lib/partner/wallet-summary";

export const NATIVE_TICKER = "PPL";
export { NATIVE_ASSET_ID };

export type ProtocolConnection =
  | { status: "disconnected"; reason: "not_configured" | "unreachable" | "invalid_response" }
  | { status: "connected"; chainId?: string; headHeight?: number };

export type ProtocolAccountView = {
  address: string;
  pplBalance: number | null;
  nonce: number | null;
  chainId?: string;
  headHeight?: number;
};

export type GrowthClaimView = GrowthClaimRow;

function nodeBaseUrl(): string {
  return resolveNodeRpcUrl();
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function compatGet(path: string): Promise<{ status: number; body: unknown }> {
  return handleEvmCompatGet(path, new URLSearchParams());
}

export async function probeProtocol(): Promise<ProtocolConnection> {
  if (isCosmosEvmChain()) {
    try {
      const { status, body } = await compatGet("/health");
      const rec = asRecord(body);
      if (status !== 200 || !rec || rec.status !== "ok") {
        return { status: "disconnected", reason: "invalid_response" };
      }
      return {
        status: "connected",
        chainId: typeof rec.chainId === "string" ? rec.chainId : undefined,
        headHeight: typeof rec.height === "number" ? rec.height : undefined,
      };
    } catch {
      return { status: "disconnected", reason: "unreachable" };
    }
  }
  const base = nodeBaseUrl();
  try {
    const body = asRecord(await getJson(`${base}/health`));
    if (!body) {
      return { status: "disconnected", reason: "invalid_response" };
    }
    return {
      status: "connected",
      chainId: typeof body.chainId === "string" ? body.chainId : undefined,
    };
  } catch {
    return { status: "disconnected", reason: "unreachable" };
  }
}

export async function fetchAccountView(address: string): Promise<{
  connection: ProtocolConnection;
  account: ProtocolAccountView | null;
}> {
  if (isCosmosEvmChain()) {
    const health = await probeProtocol();
    if (health.status !== "connected") {
      return { connection: health, account: null };
    }
    try {
      const { status, body } = await compatGet(`/address/${encodeURIComponent(address)}`);
      const rec = asRecord(body);
      if (status >= 500) {
        return { connection: { status: "disconnected", reason: "unreachable" }, account: null };
      }
      if (status !== 200 || !rec) {
        return { connection: { status: "disconnected", reason: "invalid_response" }, account: null };
      }
      return {
        connection: { status: "connected", chainId: health.chainId, headHeight: health.headHeight },
        account: {
          address: typeof rec.address === "string" ? rec.address : address,
          pplBalance: resolvePplBalanceFromAccount(rec),
          nonce: typeof rec.nonce === "number" ? rec.nonce : null,
          chainId: health.chainId,
          headHeight: health.headHeight,
        },
      };
    } catch {
      return { connection: { status: "disconnected", reason: "unreachable" }, account: null };
    }
  }
  const base = nodeBaseUrl();
  try {
    const health = await probeProtocol();
    if (health.status !== "connected") {
      return { connection: health, account: null };
    }
    const body = asRecord(await getJson(`${base}/address/${encodeURIComponent(address)}`));
    if (!body) {
      return { connection: { status: "disconnected", reason: "invalid_response" }, account: null };
    }
    const ppl = resolvePplBalanceFromAccount(body);
    return {
      connection: {
        status: "connected",
        chainId: typeof body.chainId === "string" ? body.chainId : health.chainId,
        headHeight: typeof body.headHeight === "number" ? body.headHeight : undefined,
      },
      account: {
        address: typeof body.address === "string" ? body.address : address,
        pplBalance: ppl,
        nonce: typeof body.nonce === "number" ? body.nonce : null,
        chainId: typeof body.chainId === "string" ? body.chainId : health.chainId,
        headHeight: typeof body.headHeight === "number" ? body.headHeight : undefined,
      },
    };
  } catch {
    return { connection: { status: "disconnected", reason: "unreachable" }, account: null };
  }
}

export type GrowthClaimsCopy = Pick<
  PartnerStrings,
  "nodeNotConfigured" | "snapshotEmpty" | "growthClaimsNotExposed" | "growthClaimsReadError"
>;

export async function fetchGrowthClaims(
  address: string,
  t?: GrowthClaimsCopy,
): Promise<{
  available: boolean;
  claims: GrowthClaimView[];
  note?: string;
}> {
  if (isCosmosEvmChain()) {
    try {
      const { status, body } = await compatGet("/snapshot");
      const snap = asRecord(body);
      // EVM compat intentionally has no snapshot: the deployment JSON is a build-time
      // snapshot, not live chain state. Missing claims must not fail the address balance.
      if (status === 404 || (status === 200 && (!snap || (!snap.growthClaims && !asRecord(snap.chainState)?.growthClaims)))) {
        return {
          available: false,
          claims: snap ? parseGrowthClaimsFromSnapshot(snap, address) : [],
          note:
            t?.growthClaimsNotExposed ??
            "This node HTTP snapshot does not expose Growth claims. Accruals stay on-chain; the cabinet cannot list them until a public read API exists.",
        };
      }
      if (status !== 200 || !snap) {
        return { available: false, claims: [], note: t?.snapshotEmpty ?? "Snapshot was empty." };
      }
      return { available: true, claims: parseGrowthClaimsFromSnapshot(snap, address) };
    } catch {
      return {
        available: false,
        claims: [],
        note: t?.growthClaimsReadError ?? "Could not read Growth claims from the node.",
      };
    }
  }
  const base = nodeBaseUrl();
  if (!base) {
    return { available: false, claims: [], note: t?.nodeNotConfigured ?? "Node URL is not configured." };
  }
  try {
    const snap = asRecord(await getJson(`${base}/snapshot`));
    if (!snap) {
      return { available: false, claims: [], note: t?.snapshotEmpty ?? "Snapshot was empty." };
    }
    const claims = parseGrowthClaimsFromSnapshot(snap, address);
    const claimsRaw = snap.growthClaims ?? asRecord(snap.chainState)?.growthClaims;
    if (!claimsRaw) {
      return {
        available: false,
        claims,
        note:
          t?.growthClaimsNotExposed ??
          "This node HTTP snapshot does not expose Growth claims. Accruals stay on-chain; the cabinet cannot list them until a public read API exists.",
      };
    }
    return { available: true, claims };
  } catch {
    return {
      available: false,
      claims: [],
      note: t?.growthClaimsReadError ?? "Could not read Growth claims from the node.",
    };
  }
}
