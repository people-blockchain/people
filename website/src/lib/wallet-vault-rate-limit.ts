import { NextResponse } from "next/server";
import { checkSharedRateLimitDetail, type RateLimitVerdict } from "@/lib/api-rate-limit";
import { checkDurableWrapKeyRateLimitDetail } from "@/lib/wallet-vault-access-log";

/**
 * Vault reads, vault writes, and wrap-key delivery no longer share one bucket. A sign-in reads
 * the ciphertext and then asks for the wrap key; counting both against the old 20/5-minute
 * ceiling turned a few ordinary sign-ins into HTTP 429.
 *
 * Reads: 60 per account per 5 minutes. One sign-in reads the vault once, and the session
 * bridge may read again when a tab regains focus. 60 is one read every 5 seconds — enough for
 * that restore loop and for ten sign-ins back to back, without letting one session pull the
 * ciphertext in a tight loop.
 *
 * Read addresses: 3000 per 5 minutes across every account. Carrier-grade NAT and shared mobile
 * egress present many accounts as one address. 3000 reads (~10/s) absorbs a sign-in burst on
 * that shared egress. One account is still capped above; this only stops a single host from
 * reading vaults for a large number of accounts.
 *
 * Writes: 10 per account per 15 minutes. A vault is created once; the spare slots cover
 * validation retries and a conflict follow-up, not a rewrite loop. The address ceiling is 1000
 * writes per 15 minutes so a shared egress can sign up many new accounts while a script on one
 * address cannot create them without bound.
 *
 * Wrap-key delivery stays at 20 per account per 5 minutes — the previous short-window figure —
 * so a fresh session cannot pull the key more often than before. Failures stay at 30 per
 * account per 15 minutes and are not raised. A successful wrap-key is the only reset. A missing
 * client address ("unknown") is not an address: keying the per-address buckets on it would merge
 * every such account into one budget, so that check is skipped.
 */
export const WALLET_VAULT_READ_ACCOUNT_MAX = 60;
export const WALLET_VAULT_READ_WINDOW_MS = 5 * 60 * 1000;
export const WALLET_VAULT_READ_IP_MAX = 3000;

export const WALLET_VAULT_WRITE_ACCOUNT_MAX = 10;
export const WALLET_VAULT_WRITE_WINDOW_MS = 15 * 60 * 1000;
export const WALLET_VAULT_WRITE_IP_MAX = 1000;

export const WALLET_VAULT_WRAP_ACCOUNT_MAX = 20;
export const WALLET_VAULT_WRAP_WINDOW_MS = 5 * 60 * 1000;
export const WALLET_VAULT_WRAP_FAILURE_MAX = 30;
export const WALLET_VAULT_WRAP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const WALLET_VAULT_WRAP_ROUTE = "wallet/vault/wrap-key";

const READ_ACCOUNT = "wallet-vault-read";
const READ_IP = "wallet-vault-read-ip";
const WRITE_ACCOUNT = "wallet-vault-write";
const WRITE_IP = "wallet-vault-write-ip";
const WRAP_DELIVERY = "wallet-vault-wrap-key";

/** Null when this value must not be used as a shared per-address bucket. */
export function walletVaultIpRateLimitKey(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed || trimmed === "unknown") return null;
  return trimmed;
}

async function checkAccountAndAddress(
  accountNamespace: string,
  addressNamespace: string,
  userId: string,
  ip: string,
  accountMax: number,
  addressMax: number,
  windowMs: number,
): Promise<RateLimitVerdict> {
  const account = await checkSharedRateLimitDetail(accountNamespace, userId, accountMax, windowMs);
  if (!account.allowed) return account;
  const addressKey = walletVaultIpRateLimitKey(ip);
  if (!addressKey) return account;
  return checkSharedRateLimitDetail(addressNamespace, addressKey, addressMax, windowMs);
}

export function checkWalletVaultReadLimit(userId: string, ip: string): Promise<RateLimitVerdict> {
  return checkAccountAndAddress(
    READ_ACCOUNT,
    READ_IP,
    userId,
    ip,
    WALLET_VAULT_READ_ACCOUNT_MAX,
    WALLET_VAULT_READ_IP_MAX,
    WALLET_VAULT_READ_WINDOW_MS,
  );
}

export function checkWalletVaultWriteLimit(userId: string, ip: string): Promise<RateLimitVerdict> {
  return checkAccountAndAddress(
    WRITE_ACCOUNT,
    WRITE_IP,
    userId,
    ip,
    WALLET_VAULT_WRITE_ACCOUNT_MAX,
    WALLET_VAULT_WRITE_IP_MAX,
    WALLET_VAULT_WRITE_WINDOW_MS,
  );
}

/** Failure budget only. Delivery of a fresh wrap key is a separate, shorter ceiling. */
export function checkWalletVaultWrapKeyFailures(userId: string): Promise<RateLimitVerdict> {
  return checkDurableWrapKeyRateLimitDetail(
    userId,
    WALLET_VAULT_WRAP_ROUTE,
    WALLET_VAULT_WRAP_FAILURE_MAX,
    WALLET_VAULT_WRAP_FAILURE_WINDOW_MS,
  );
}

/** How often a session that already passed the reauth check may receive the wrap key. */
export function checkWalletVaultWrapKeyDelivery(userId: string): Promise<RateLimitVerdict> {
  return checkSharedRateLimitDetail(
    WRAP_DELIVERY,
    userId,
    WALLET_VAULT_WRAP_ACCOUNT_MAX,
    WALLET_VAULT_WRAP_WINDOW_MS,
  );
}

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function walletVaultRateLimitedResponse(retryAfterSeconds: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    { error: "rate_limited", retryAfter },
    { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
  );
}
