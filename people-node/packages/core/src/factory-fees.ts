import {
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE
} from "@ovn/protocol";

function readNonNegativeFee(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim() ?? "";
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${envName} must be a non-negative finite number`);
  }
  return value;
}

/**
 * Consensus minimum `tx.fee` in PPL for `tokenCreate` — the owner-approved constant (M13-4).
 *
 * This is checked while applying a block and hashed into the genesis state root, so it must be
 * the same number on every node: an env-derived value made two nodes disagree about the same
 * transaction (and about genesis) whenever their environments differed. `TOKEN_CREATE_MIN_FEE`
 * therefore no longer moves this — it can only raise what this node requires of its own mempool,
 * see `tokenCreateMempoolMinFee`.
 */
export function tokenCreateMinFee(): number {
  return DEFAULT_TOKEN_CREATE_MIN_FEE;
}

/** Consensus minimum `tx.fee` in PPL for `nftMint` — see `tokenCreateMinFee`. */
export function nftMintMinFee(): number {
  return DEFAULT_NFT_MINT_MIN_FEE;
}

/** This node's mempool floor for `tokenCreate`: the consensus minimum, never below it. */
export function tokenCreateMempoolMinFee(): number {
  return Math.max(
    DEFAULT_TOKEN_CREATE_MIN_FEE,
    readNonNegativeFee("TOKEN_CREATE_MIN_FEE", DEFAULT_TOKEN_CREATE_MIN_FEE)
  );
}

/** This node's mempool floor for `nftMint`: the consensus minimum, never below it. */
export function nftMintMempoolMinFee(): number {
  return Math.max(
    DEFAULT_NFT_MINT_MIN_FEE,
    readNonNegativeFee("NFT_MINT_MIN_FEE", DEFAULT_NFT_MINT_MIN_FEE)
  );
}

export { DEFAULT_NFT_MINT_MIN_FEE, DEFAULT_TOKEN_CREATE_MIN_FEE };
