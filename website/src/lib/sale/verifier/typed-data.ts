import { hashTypedData, keccak256, toBytes, type Address, type Hex } from "viem";

/** EIP-712 domain fixed by PplCurveHubV2 (contracts/src/sale/PplCurveHubV2.sol). */
export const VERIFICATION_DOMAIN_NAME = "PplCurveHubV2";
export const VERIFICATION_DOMAIN_VERSION = "1";

export const VERIFICATION_TYPEHASH = keccak256(
  toBytes("Verification(address account,bytes32 personId,uint256 nonce,uint256 deadline)"),
);

export const VERIFICATION_TYPES = {
  Verification: [
    { name: "account", type: "address" },
    { name: "personId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type VerificationMessage = {
  account: Address;
  personId: Hex;
  nonce: bigint;
  deadline: bigint;
};

export type VerificationDomain = {
  name: typeof VERIFICATION_DOMAIN_NAME;
  version: typeof VERIFICATION_DOMAIN_VERSION;
  chainId: number;
  verifyingContract: Address;
};

/** Builds the exact domain the hub uses: name "PplCurveHubV2", version "1". */
export function buildVerificationDomain(input: {
  chainId: number;
  hub: Address;
}): VerificationDomain {
  return {
    name: VERIFICATION_DOMAIN_NAME,
    version: VERIFICATION_DOMAIN_VERSION,
    chainId: input.chainId,
    verifyingContract: input.hub,
  };
}

/** Aliases kept for callers that read naturally as "the verification domain". */
export const verificationDomain = buildVerificationDomain;
export const buildDomain = buildVerificationDomain;

/** `hashTypedData` over the canonical Verification struct. */
export function verificationDigest(input: {
  chainId: number;
  hub: Address;
  message: VerificationMessage;
}): Hex {
  return hashTypedData({
    domain: buildVerificationDomain({ chainId: input.chainId, hub: input.hub }),
    types: VERIFICATION_TYPES,
    primaryType: "Verification",
    message: input.message,
  });
}
