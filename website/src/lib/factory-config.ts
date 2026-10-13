/**
 * Public Token/NFT factory configuration.
 * Displayed PPL fees are owner-approved; env may override.
 */

import { DEFAULT_NFT_MINT_FEE_PPL, DEFAULT_TOKEN_CREATE_FEE_PPL } from "@/lib/factory-fees";
import { isAiIconFeatureEnabled, isPinataConfigured } from "@/lib/factory-icon-config";
import { readOptionalUrl, resolveNodeRpcUrl, resolvePublicChainId } from "@/lib/node-rpc";

function readOptionalNumber(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

export interface FactoryPublicConfig {
  rpcUrl: string | null;
  chainId: string;
  tokenFeePpl: number | null;
  nftFeePpl: number | null;
  publicSubmit: boolean;
  mediaPersist: boolean;
  aiIconEnabled: boolean;
  /** `testnet` when a node URL resolves; `unavailable` only if RPC is explicitly invalid. */
  networkStatus: "testnet" | "unavailable";
}

export function getFactoryPublicConfig(): FactoryPublicConfig {
  const publicRpc = readOptionalUrl(process.env.NEXT_PUBLIC_OVN_RPC_URL);
  const rpcUrl = publicRpc;
  const tokenFeePpl =
    readOptionalNumber(process.env.NEXT_PUBLIC_TOKEN_CREATE_FEE_PPL) ?? DEFAULT_TOKEN_CREATE_FEE_PPL;
  const nftFeePpl =
    readOptionalNumber(process.env.NEXT_PUBLIC_NFT_MINT_FEE_PPL) ?? DEFAULT_NFT_MINT_FEE_PPL;
  const chainId = resolvePublicChainId();
  const mediaPersist = isPinataConfigured();
  const evm = (process.env.NEXT_PUBLIC_CHAIN ?? "").trim().toLowerCase() === "cosmos-evm";
  const nodeUrl = evm ? readOptionalUrl(process.env.EVM_RPC_URL) ?? readOptionalUrl(process.env.NEXT_PUBLIC_EVM_RPC_URL) : getNodeRpcUrl();
  const connected = Boolean(nodeUrl);
  return {
    rpcUrl,
    chainId,
    tokenFeePpl,
    nftFeePpl,
    publicSubmit: connected,
    mediaPersist,
    aiIconEnabled: isAiIconFeatureEnabled(),
    networkStatus: connected ? "testnet" : "unavailable",
  };
}

/** Server-side node origin. Env overrides built-in public testnet default. */
export function getNodeRpcUrl(): string {
  return resolveNodeRpcUrl();
}
