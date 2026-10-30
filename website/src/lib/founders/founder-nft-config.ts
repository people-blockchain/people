import { getAddress, isAddress, type Address } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/** PEOPLE testnet; the Founder NFT is only ever deployed there until mainnet genesis. */
export const FOUNDER_NFT_DEFAULT_CHAIN_ID = 97401;

export type FounderNftPublicConfig = { address: Address; chainId: number };

/**
 * Contract address and chain from the environment; null when the address is unset or malformed
 * (the feature is then hidden). The `process.env.NEXT_PUBLIC_*` reads stay literal so Next.js can
 * inline them into the client bundle.
 */
export function readFounderNftPublicConfig(
  raw: { address?: string; chainId?: string } = {
    address: process.env.NEXT_PUBLIC_FOUNDER_NFT_ADDRESS,
    chainId: process.env.NEXT_PUBLIC_FOUNDER_NFT_CHAIN_ID,
  },
): FounderNftPublicConfig | null {
  const address = raw.address?.trim();
  if (!address || !isAddress(address, { strict: false })) return null;
  const parsed = Number(raw.chainId?.trim());
  const chainId = Number.isInteger(parsed) && parsed > 0 ? parsed : FOUNDER_NFT_DEFAULT_CHAIN_ID;
  return { address: getAddress(address), chainId };
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
