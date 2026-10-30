import type { Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { FounderNftPublicConfig } from "./founder-nft-config.ts";

/**
 * EIP-712 typed data for PeopleFounderNFT (contracts/src/nft/PeopleFounderNFT.sol). The type strings
 * must equal MINT_TYPEHASH / REBIND_TYPEHASH there:
 *   Mint(bytes32 personId,address to,uint256 nonce,uint256 deadline)
 *   Rebind(bytes32 personId,address oldHolder,address newHolder,uint256 nonce,uint256 deadline)
 */
export const FOUNDER_NFT_DOMAIN_NAME = "PeopleFounderNFT";
export const FOUNDER_NFT_DOMAIN_VERSION = "1";

export const FOUNDER_NFT_MINT_TYPES = {
  Mint: [
    { name: "personId", type: "bytes32" },
    { name: "to", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const FOUNDER_NFT_REBIND_TYPES = {
  Rebind: [
    { name: "personId", type: "bytes32" },
    { name: "oldHolder", type: "address" },
    { name: "newHolder", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function founderNftDomain(config: FounderNftPublicConfig) {
  return {
    name: FOUNDER_NFT_DOMAIN_NAME,
    version: FOUNDER_NFT_DOMAIN_VERSION,
    chainId: config.chainId,
    verifyingContract: config.address,
  } as const;
}

export type FounderNftMintMessage = { personId: Hex; to: Address; nonce: bigint; deadline: bigint };
export type FounderNftRebindMessage = {
  personId: Hex;
  oldHolder: Address;
  newHolder: Address;
  nonce: bigint;
  deadline: bigint;
};

export function founderNftMintTypedData(config: FounderNftPublicConfig, message: FounderNftMintMessage) {
  return {
    domain: founderNftDomain(config),
    types: FOUNDER_NFT_MINT_TYPES,
    primaryType: "Mint" as const,
    message,
  };
}

export function founderNftRebindTypedData(config: FounderNftPublicConfig, message: FounderNftRebindMessage) {
  return {
    domain: founderNftDomain(config),
    types: FOUNDER_NFT_REBIND_TYPES,
    primaryType: "Rebind" as const,
    message,
  };
}

export function signFounderNftMint(
  account: PrivateKeyAccount,
  config: FounderNftPublicConfig,
  message: FounderNftMintMessage,
): Promise<Hex> {
  return account.signTypedData(founderNftMintTypedData(config, message));
}

export function signFounderNftRebind(
  account: PrivateKeyAccount,
  config: FounderNftPublicConfig,
  message: FounderNftRebindMessage,
): Promise<Hex> {
  return account.signTypedData(founderNftRebindTypedData(config, message));
}
