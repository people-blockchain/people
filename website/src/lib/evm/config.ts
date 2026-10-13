import deployments from "@/data/evm-deployments-97401.json" with { type: "json" };
import { PEOPLE_EIP155_CHAIN_ID } from "@/lib/wallet-address-scheme";
import { DEFAULT_EVM_RPC_URL } from "@/lib/evm/public-endpoints";

export type EvmDeployments = {
  chainId: number;
  cosmosChainId: string;
  rpcUrl: string;
  deployedAt?: string | null;
  deployer?: string | null;
  contracts: Record<string, string | null>;
  /**
   * First block each contract could have emitted a log. Scans must start here rather than at
   * `deployBlock`: the factories were created ~220k blocks after the chain's first deploy, so
   * scanning from 56 walks ~24 windows that can never match.
   */
  startBlocks?: Record<string, number>;
  deployBlock?: number | null;
  assetMap: Record<string, string>;
  pools: Array<{
    poolId: string;
    tokenAssetId: string;
    tokenAddress?: string;
    nativeReserve: number;
    tokenReserve: number;
    status?: string;
  }>;
  nfts?: Array<{
    nftId: string;
    collection?: string;
    onChainTokenId?: string;
    owner: string;
    creator?: string;
    name: string;
    description?: string;
    imageUri?: string;
  }>;
  seed?: Record<string, unknown>;
};

export function readEvmDeployments(): EvmDeployments {
  return deployments as EvmDeployments;
}

function normalizeEvmRpcUrl(raw: string): string {
  const trimmed = raw.replace(/\/$/, "");
  if (!trimmed) return DEFAULT_EVM_RPC_URL;
  if (trimmed.startsWith("http://node.peopleblockchain.network")) return DEFAULT_EVM_RPC_URL;
  return trimmed;
}

export function readEvmRpcUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_EVM_RPC_URL ?? process.env.EVM_RPC_URL ?? "").trim();
  if (fromEnv) return normalizeEvmRpcUrl(fromEnv);
  const file = readEvmDeployments().rpcUrl;
  return normalizeEvmRpcUrl(file);
}

export function evmContractsReady(): boolean {
  const c = readEvmDeployments().contracts;
  return Boolean(c.tokenFactory && c.router && c.wppl);
}

export const peopleEvmChain = {
  id: PEOPLE_EIP155_CHAIN_ID,
  name: "People's Blockchain testnet",
  nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 },
} as const;
