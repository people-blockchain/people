import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import type { VerifierSigner } from "./signer.ts";

/** Base Sepolia is the only chain where a local, env-held verifier key may sign. */
export const LOCAL_VERIFIER_CHAIN_ID = 84532;

function normalizePrivateKey(raw: string): Hex {
  const value = raw.trim();
  const prefixed = `0x${value.replace(/^0x/i, "")}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) {
    throw new Error("SALE_VERIFIER_LOCAL_KEY must be a 32-byte hex private key");
  }
  return prefixed as Hex;
}

/**
 * Dev/test-only signer. It deliberately refuses every chain except Base Sepolia so a local
 * private key can never be used against the Base mainnet hub.
 */
export function createLocalVerifierSigner(
  chainId: number,
  privateKey: string | undefined = process.env.SALE_VERIFIER_LOCAL_KEY,
): VerifierSigner {
  if (chainId !== LOCAL_VERIFIER_CHAIN_ID) {
    throw new Error(
      `SALE_VERIFIER_MODE=local is only allowed on Base Sepolia (${LOCAL_VERIFIER_CHAIN_ID}); got chainId ${chainId}`,
    );
  }
  const key = privateKey?.trim();
  if (!key) throw new Error("SALE_VERIFIER_LOCAL_KEY is not set");

  const account = privateKeyToAccount(normalizePrivateKey(key));
  return {
    getAddress: async (): Promise<Address> => account.address,
    signDigest: async (digest: Hex): Promise<Hex> => account.sign({ hash: digest }),
  };
}
