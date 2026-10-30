import { getAddress, isAddress, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { FounderNftChainReader, FounderNftPendingRebind } from "./founder-nft-chain.ts";
import type { FounderNftPublicConfig } from "./founder-nft-config.ts";
import type { FounderNftPersonLookup, FounderNftPersonResult, HumanPassportStampsLookup } from "./founder-nft-person.ts";
import { signFounderNftMint, signFounderNftRebind } from "./founder-nft-typed-data.ts";
import {
  verifyFounderNftWalletAuth,
  type FounderNftWalletAuthProof,
  type FounderNftWalletAuthRow,
} from "./founder-nft-wallet-auth.ts";
import { VERIFICATION_LEVEL_STRONG } from "./verification.ts";

/**
 * Founder NFT backend rules (docs/founder-nft.md). Eligibility is hard-coded: ONLY Human Passport
 * (verification level 2) can mint; Telegram-only users never get a signature. The one exception is
 * `FOUNDER_NFT_TEST_ALLOWLIST`: a comma-separated wallet list that skips only that level check, and
 * only when `VERCEL_ENV` is not `production` and the contract chain id is 97401. Production ignores
 * the variable. Login, the verified-human gate, the wallet proof, and stamp checks still apply.
 * There is no other switch. I/O (database, Passport HTTP, chain RPC, signer key, clock) is injected
 * so the rules stay testable.
 *
 * Identity: `personId` comes from the Human Passport stamp nullifiers of the connected wallet, matched
 * against `founder_nft_stamp_hash`. A wallet whose stamps already belong to a person with a token,
 * and which cannot reach level 2 (Human Passport dedup), may only rebind that token.
 *
 * Mint and rebind signatures are issued only after the wallet signs a server nonce (see
 * `founder-nft-wallet-auth.ts`). The EIP-712 signer key never leaves the server.
 */

/** Signatures are short-lived: the contract also enforces the deadline. */
export const FOUNDER_NFT_SIGNATURE_TTL_SECONDS = 10 * 60;

/** PEOPLE testnet. The test allowlist cannot skip the level check on any other chain. */
const FOUNDER_NFT_TEST_ALLOWLIST_CHAIN_ID = 97401;

/**
 * True only for a listed wallet, outside Vercel production, on chain 97401.
 * Skips the verification-level comparison and nothing else. Fail closed when
 * `VERCEL_ENV` is `production`, even if the variable is set.
 */
function founderNftTestAllowlistSkipsHpLevel(address: string, chainId: number): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (chainId !== FOUNDER_NFT_TEST_ALLOWLIST_CHAIN_ID) return false;
  const wallet = validWallet(address);
  if (!wallet) return false;
  const raw = process.env.FOUNDER_NFT_TEST_ALLOWLIST;
  if (!raw) return false;
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (!item || !isAddress(item, { strict: false })) continue;
    try {
      if (getAddress(item) === wallet) return true;
    } catch {
      // A malformed entry is not a match.
    }
  }
  return false;
}

export type FounderNftFounder = {
  verificationLevel: number;
  walletAddress: string | null;
  passportWallet: string | null;
};

export type FounderNftServiceDeps = {
  readConfig: () => FounderNftPublicConfig | null;
  readSigner: () => PrivateKeyAccount | null;
  loadFounder: (userId: string) => Promise<FounderNftFounder | null>;
  fetchNullifiers: (wallet: string) => Promise<HumanPassportStampsLookup>;
  findPerson: (nullifiers: readonly string[]) => Promise<FounderNftPersonLookup>;
  resolvePerson: (nullifiers: readonly string[]) => Promise<FounderNftPersonResult>;
  chain: (config: FounderNftPublicConfig) => FounderNftChainReader;
  /** Unix seconds. */
  now: () => number;
  randomNonce: () => bigint;
  /** Stored wallet-auth nonce for this user, or null when it was never issued to them. */
  readWalletAuth: (userId: string, nonce: string) => Promise<FounderNftWalletAuthRow | null>;
  /** Atomically claims the nonce. False when it was already used or is expired. */
  consumeWalletAuth: (userId: string, nonce: string) => Promise<boolean>;
};

export type FounderNftPendingView = { oldHolder: string; newHolder: string; executeAfter: number };

export type FounderNftStatus =
  | { state: "holder"; tokenId: string; personId: Hex; pending: FounderNftPendingView | null }
  | { state: "can_mint" }
  | { state: "mint_closed" }
  | { state: "rebind_available"; tokenId: string; personId: Hex; oldHolder: string; dedup: boolean }
  | { state: "rebind_pending"; tokenId: string; personId: Hex; pending: FounderNftPendingView }
  | { state: "minted_elsewhere" }
  | { state: "not_eligible" };

export type FounderNftError = {
  ok: false;
  httpStatus: 400 | 403 | 409 | 502 | 503;
  error:
    | "not_configured"
    | "invalid_address"
    | "invalid_action"
    | "hp_required"
    | "identity_conflict"
    | "not_available"
    | "chain_unavailable"
    | "verification_failed"
    | "wallet_auth_missing"
    | "wallet_auth_invalid"
    | "wallet_auth_expired"
    | "wallet_auth_replayed"
    | "wallet_auth_chain";
  /** Which missing piece makes the feature unavailable (503 only). */
  reason?: "contract" | "signer" | "human_passport";
  /** Current state when the requested action does not fit it (409 `not_available`). */
  state?: FounderNftStatus["state"];
};

export type FounderNftStatusResult = { ok: true; status: FounderNftStatus; signerReady: boolean } | FounderNftError;

export type FounderNftSignature = {
  action: "mint" | "rebind";
  personId: Hex;
  address: Address;
  oldHolder?: Address;
  /** Decimal strings: uint256 does not survive JSON numbers. */
  nonce: string;
  deadline: string;
  signature: Hex;
  contract: { address: Address; chainId: number };
};

export type FounderNftSignatureResult = { ok: true; signature: FounderNftSignature } | FounderNftError;

type Evaluation = {
  status: FounderNftStatus;
  config: FounderNftPublicConfig;
  reader: FounderNftChainReader;
  address: Address;
  nullifiers: string[];
  personId?: Hex;
  oldHolder?: Address;
};

function fail(
  httpStatus: FounderNftError["httpStatus"],
  error: FounderNftError["error"],
  extra: Partial<Pick<FounderNftError, "reason" | "state">> = {},
): FounderNftError {
  return { ok: false, httpStatus, error, ...extra };
}

function pendingView(p: FounderNftPendingRebind): FounderNftPendingView {
  return { oldHolder: p.oldHolder, newHolder: p.newHolder, executeAfter: Number(p.executeAfter) };
}

function validWallet(value: string | null | undefined): Address | null {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed, { strict: false }) ? getAddress(trimmed) : null;
}

async function evaluate(
  userId: string,
  addressInput: string,
  deps: FounderNftServiceDeps,
): Promise<{ ok: true; value: Evaluation } | FounderNftError> {
  const config = deps.readConfig();
  if (!config) return fail(503, "not_configured", { reason: "contract" });
  const address = validWallet(addressInput);
  if (!address) return fail(400, "invalid_address");
  const reader = deps.chain(config);
  const base = { config, reader, address, nullifiers: [] as string[] };

  try {
    const [epoch, heldId] = await Promise.all([reader.signerEpoch(), reader.tokenOfOwner(address)]);
    const live = (p: FounderNftPendingRebind | null, holder: Address | null) =>
      p && p.signerEpoch === epoch && (!holder || p.oldHolder.toLowerCase() === holder.toLowerCase()) ? p : null;

    if (heldId > BigInt(0)) {
      const personId = await reader.personOf(heldId);
      const pending = live(await reader.pendingRebind(personId), address);
      return {
        ok: true,
        value: {
          ...base,
          personId,
          status: {
            state: "holder",
            tokenId: heldId.toString(),
            personId,
            pending: pending ? pendingView(pending) : null,
          },
        },
      };
    }

    const founder = await deps.loadFounder(userId);
    if (!founder) return { ok: true, value: { ...base, status: { state: "not_eligible" } } };
    const hpWallet = validWallet(founder.passportWallet);
    const strong =
      founder.verificationLevel >= VERIFICATION_LEVEL_STRONG ||
      founderNftTestAllowlistSkipsHpLevel(address, config.chainId);

    // Stamps of the wallet that will send the transaction. A new address presents the same
    // nullifiers Human Passport already scored elsewhere (often with dedup and score 0).
    const stamps = await deps.fetchNullifiers(address);
    if (!stamps.ok) {
      if (stamps.error === "not_configured") {
        if (!strong) return { ok: true, value: { ...base, status: { state: "not_eligible" } } };
        return fail(503, "not_configured", { reason: "human_passport" });
      }
      if (stamps.error === "verification_failed") return fail(502, "verification_failed");
      return { ok: true, value: { ...base, status: { state: "not_eligible" } } };
    }
    const nullifiers = stamps.nullifiers;
    const deduped = stamps.deduped === true;

    const person = await deps.findPerson(nullifiers);
    if (person.kind === "conflict") return fail(409, "identity_conflict");
    if (person.kind === "found") {
      const personId = person.personId as Hex;
      const tokenId = await reader.tokenOfPerson(personId);
      if (tokenId > BigInt(0)) {
        const oldHolder = await reader.ownerOf(tokenId);
        if (!oldHolder) {
          return { ok: true, value: { ...base, nullifiers, status: { state: "minted_elsewhere" } } };
        }
        const pending = live(await reader.pendingRebind(personId), oldHolder);
        if (pending && pending.newHolder.toLowerCase() === address.toLowerCase()) {
          return {
            ok: true,
            value: {
              ...base,
              nullifiers,
              personId,
              oldHolder,
              status: { state: "rebind_pending", tokenId: tokenId.toString(), personId, pending: pendingView(pending) },
            },
          };
        }
        // Below level 2, or stamps HP itself marked dedup: this account cannot mint. Rebind only.
        // A level-2 founder still needs the signature-proven passport wallet for the other path.
        const dedup = deduped || !strong;
        if (dedup || hpWallet) {
          return {
            ok: true,
            value: {
              ...base,
              nullifiers,
              personId,
              oldHolder,
              status: { state: "rebind_available", tokenId: tokenId.toString(), personId, oldHolder, dedup },
            },
          };
        }
        return { ok: true, value: { ...base, nullifiers, status: { state: "minted_elsewhere" } } };
      }
    }

    if (!strong || deduped || nullifiers.length === 0) {
      return { ok: true, value: { ...base, nullifiers, status: { state: "not_eligible" } } };
    }
    const deadline = await reader.mintDeadline();
    const state = BigInt(deps.now()) > deadline ? "mint_closed" : "can_mint";
    return { ok: true, value: { ...base, nullifiers, status: { state } } };
  } catch {
    return fail(502, "chain_unavailable");
  }
}

/** What the founders page may offer this user for `address` (read-only; creates nothing). */
export async function getFounderNftStatus(
  userId: string,
  address: string,
  deps: FounderNftServiceDeps,
): Promise<FounderNftStatusResult> {
  const result = await evaluate(userId, address, deps);
  if (!result.ok) return result;
  return { ok: true, status: result.value.status, signerReady: deps.readSigner() !== null };
}

const WALLET_AUTH_ERROR: Record<string, FounderNftError["error"]> = {
  missing: "wallet_auth_missing",
  invalid_signature: "wallet_auth_invalid",
  expired: "wallet_auth_expired",
  replayed: "wallet_auth_replayed",
  wrong_chain: "wallet_auth_chain",
};

/**
 * EIP-712 Mint / Rebind signature for `address` (which must be the wallet that will send the
 * transaction: the contract requires `msg.sender == to / newHolder`). Issued only when that wallet
 * has just signed a server nonce and the current state allows the action. A Telegram-only user,
 * and a deduped account that already has a token, never receive a mint signature.
 */
export async function issueFounderNftSignature(
  action: string,
  userId: string,
  address: string,
  walletAuth: FounderNftWalletAuthProof | null,
  deps: FounderNftServiceDeps,
): Promise<FounderNftSignatureResult> {
  if (action !== "mint" && action !== "rebind") return fail(400, "invalid_action");
  const config = deps.readConfig();
  if (!config) return fail(503, "not_configured", { reason: "contract" });
  const signer = deps.readSigner();
  if (!signer) return fail(503, "not_configured", { reason: "signer" });
  if (!validWallet(address)) return fail(400, "invalid_address");

  const auth = await verifyFounderNftWalletAuth({
    address,
    proof: walletAuth,
    nowMs: deps.now() * 1000,
    readNonce: (nonce) => deps.readWalletAuth(userId, nonce),
    consumeNonce: (nonce) => deps.consumeWalletAuth(userId, nonce),
  });
  if (!auth.ok) return fail(403, WALLET_AUTH_ERROR[auth.reason] ?? "wallet_auth_invalid");

  const result = await evaluate(userId, address, deps);
  if (!result.ok) return result;
  const ev = result.value;
  const nonce = deps.randomNonce();
  const deadline = BigInt(deps.now() + FOUNDER_NFT_SIGNATURE_TTL_SECONDS);
  const contract = { address: config.address, chainId: config.chainId };

  if (action === "mint") {
    if (ev.status.state !== "can_mint") {
      return fail(ev.status.state === "not_eligible" ? 403 : 409, ev.status.state === "not_eligible" ? "hp_required" : "not_available", {
        state: ev.status.state,
      });
    }
    // First sight of a verified person creates the personId; this is the only write on the path.
    const person = await deps.resolvePerson(ev.nullifiers);
    if (!person.ok) {
      return person.error === "conflict" ? fail(409, "identity_conflict") : fail(403, "hp_required", { state: "not_eligible" });
    }
    const personId = person.personId as Hex;
    try {
      if ((await ev.reader.tokenOfPerson(personId)) > BigInt(0)) return fail(409, "not_available", { state: "minted_elsewhere" });
    } catch {
      return fail(502, "chain_unavailable");
    }
    const signature = await signFounderNftMint(signer, config, { personId, to: ev.address, nonce, deadline });
    return {
      ok: true,
      signature: { action, personId, address: ev.address, nonce: nonce.toString(), deadline: deadline.toString(), signature, contract },
    };
  }

  if (ev.status.state !== "rebind_available" || !ev.personId || !ev.oldHolder) {
    return fail(ev.status.state === "not_eligible" ? 403 : 409, ev.status.state === "not_eligible" ? "hp_required" : "not_available", {
      state: ev.status.state,
    });
  }
  const signature = await signFounderNftRebind(signer, config, {
    personId: ev.personId,
    oldHolder: ev.oldHolder,
    newHolder: ev.address,
    nonce,
    deadline,
  });
  return {
    ok: true,
    signature: {
      action,
      personId: ev.personId,
      address: ev.address,
      oldHolder: ev.oldHolder,
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      signature,
      contract,
    },
  };
}
