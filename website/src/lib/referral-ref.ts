import { normalizeReferralCode } from "@/lib/partner/referral";

const STORAGE_KEY = "ppl_referrer";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * One invite link for every program: `?ref=` carries either the short personal code
 * (`/?ref=33063c3605`, the link the site shows now) or, for links shared before, a wallet
 * address (`/bounty?ref=0x…`). Both are stored under the same key, first touch wins.
 */
export type StoredReferral = { kind: "wallet"; value: string } | { kind: "code"; value: string };

function parseReferral(raw: string | null | undefined): StoredReferral | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (ADDRESS_RE.test(value)) return { kind: "wallet", value };
  const code = normalizeReferralCode(value);
  return code ? { kind: "code", value: code } : null;
}

export type RegistrationStep = "register" | "referral";

export interface RegistrationPlan {
  steps: RegistrationStep[];
  referrer: string | null;
}

export function isValidReferrerAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Persist `?ref=` from the landing URL (any page). First-touch: once a referrer is stored, a
 * later `?ref=` on some other page must not overwrite it, or whichever link the user clicks
 * last would earn the referral instead of whoever actually brought them in.
 */
export function captureReferrerFromSearch(search: string): void {
  const store = storage();
  if (!store) return;
  if (readStoredReferral()) return;
  const ref = parseReferral(new URLSearchParams(search).get("ref"));
  if (!ref) return;
  try {
    store.setItem(STORAGE_KEY, ref.value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredReferral(): StoredReferral | null {
  const store = storage();
  if (!store) return null;
  try {
    return parseReferral(store.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** The stored referrer when it is a wallet address (links shared before the short code). */
export function readStoredReferrer(): string | null {
  const ref = readStoredReferral();
  return ref?.kind === "wallet" ? ref.value : null;
}

/** The stored referrer when it is a short personal code (the current invite link). */
export function readStoredReferralCode(): string | null {
  const ref = readStoredReferral();
  return ref?.kind === "code" ? ref.value : null;
}

export function resolveReferrerForWallet(selfAddress: string, codeWallet?: string | null): string | null {
  const ref = readStoredReferrer() ?? (codeWallet && isValidReferrerAddress(codeWallet) ? codeWallet.trim() : null);
  if (!ref) return null;
  if (ref.toLowerCase() === selfAddress.toLowerCase()) return null;
  return ref;
}

/**
 * The on-chain referral needs the inviter's address. A short code is looked up on the site;
 * any failure just skips the referral step, registration itself still goes ahead.
 */
export async function lookupReferralCodeWallet(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`/api/referral/resolve?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { wallet?: unknown };
    return typeof body.wallet === "string" && isValidReferrerAddress(body.wallet) ? body.wallet : null;
  } catch {
    return null;
  }
}

export function planParticipantRegistration(selfAddress: string, codeWallet?: string | null): RegistrationPlan {
  const referrer = resolveReferrerForWallet(selfAddress, codeWallet);
  const steps: RegistrationStep[] = ["register"];
  if (referrer) steps.push("referral");
  return { steps, referrer };
}
