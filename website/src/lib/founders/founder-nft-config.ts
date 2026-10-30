import { getAddress, isAddress, type Address } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { readEvmDeployments } from "@/lib/evm/config";

/** Keys in static `evm-deployments` that mean this collection. Absent until it is deployed. */
export const FOUNDER_NFT_DEPLOYMENT_KEYS = ["founderNft", "peopleFounderNft"] as const;

/** PEOPLE testnet; the Founder NFT is only ever deployed there until mainnet genesis. */
export const FOUNDER_NFT_DEFAULT_CHAIN_ID = 97401;

export type FounderNftPublicConfig = { address: Address; chainId: number };

function deploymentContracts(): Record<string, string | null | undefined> {
  try {
    return readEvmDeployments().contracts ?? {};
  } catch {
    return {};
  }
}

/**
 * True when a static deployment lists this collection at a different address, or lists a value
 * that is not an address. No listed key means the env address stands alone.
 */
export function founderNftDeploymentConflicts(
  envAddress: Address,
  contracts: Record<string, string | null | undefined> | undefined,
): boolean {
  if (!contracts) return false;
  for (const key of FOUNDER_NFT_DEPLOYMENT_KEYS) {
    const value = contracts[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (!isAddress(value, { strict: false })) return true;
    if (getAddress(value) !== envAddress) return true;
  }
  return false;
}

/**
 * Contract address and chain from the environment; null when the address is unset, malformed, or
 * disagrees with a Founder NFT entry in static evm-deployments (the feature is then hidden, and
 * callers must not throw). The `process.env.NEXT_PUBLIC_*` reads stay literal so Next.js can
 * inline them into the client bundle.
 */
export function readFounderNftPublicConfig(
  raw: { address?: string; chainId?: string } = {
    address: process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS,
    chainId: process.env.NEXT_PUBLIC_FOUNDER_NFT_CHAIN_ID,
  },
  contracts: Record<string, string | null | undefined> | undefined = deploymentContracts(),
): FounderNftPublicConfig | null {
  try {
    const address = raw.address?.trim();
    if (!address || !isAddress(address, { strict: false })) return null;
    const checksum = getAddress(address);
    if (founderNftDeploymentConflicts(checksum, contracts)) return null;
    const parsed = Number(raw.chainId?.trim());
    const chainId = Number.isInteger(parsed) && parsed > 0 ? parsed : FOUNDER_NFT_DEFAULT_CHAIN_ID;
    return { address: checksum, chainId };
  } catch {
    return null;
  }
}

/**
 * Backend signer account from `FOUNDER_NFT_SIGNER_PK` (server only, never `NEXT_PUBLIC_`). Null when
 * unset or not a 32-byte hex key. The key is never logged or returned.
 */
export function readFounderNftSignerAccount(
  raw: string | undefined = process.env.FOUNDER_NFT_SIGNER_PK,
): PrivateKeyAccount | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const hex = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  try {
    return privateKeyToAccount(hex as `0x${string}`);
  } catch {
    return null;
  }
}
