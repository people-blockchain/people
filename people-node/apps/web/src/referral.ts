import { isWalletAddress } from "./address.js";
import { migratePeopleWebStorage } from "./storageMigration.js";

export const REFERRAL_STORAGE_KEY = "people-referrer";
export const REFERRAL_BINDINGS_KEY = "people-referrer-bindings";

type ReferrerBindings = Record<string, string>;

function normalizeAddress(value: string): string {
  return value.trim();
}

function readBindings(): ReferrerBindings {
  try {
    migratePeopleWebStorage(localStorage);
    const raw = localStorage.getItem(REFERRAL_BINDINGS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const out: ReferrerBindings = {};
    for (const [address, referrer] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof referrer === "string" && isWalletAddress(address) && isWalletAddress(referrer)) {
        out[normalizeAddress(address)] = normalizeAddress(referrer);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeBindings(bindings: ReferrerBindings): void {
  try {
    localStorage.setItem(REFERRAL_BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // ignore quota / private mode
  }
}

export function captureReferrer(raw: string | null | undefined): string | null {
  if (!raw) {
    return getStoredReferrer();
  }
  const value = normalizeAddress(raw);
  if (!isWalletAddress(value)) {
    return getStoredReferrer();
  }
  try {
    sessionStorage.setItem(REFERRAL_STORAGE_KEY, value);
  } catch {
    // ignore quota / private mode
  }
  return value;
}

export function getStoredReferrer(): string | null {
  try {
    const value = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
    if (value && isWalletAddress(value)) {
      return normalizeAddress(value);
    }
  } catch {
    // ignore
  }
  return null;
}

/** Persistent referrer for a wallet/validator address (first bind wins). */
export function getBoundReferrer(address: string | null | undefined): string | null {
  if (!address || !isWalletAddress(address)) {
    return null;
  }
  const referrer = readBindings()[normalizeAddress(address)];
  return referrer && isWalletAddress(referrer) ? referrer : null;
}

/**
 * Lock pending invite (`?ref=` / sessionStorage) onto this address.
 * Skips self-referral; does not overwrite an existing bind.
 */
export function bindPendingReferrer(address: string | null | undefined): string | null {
  if (!address || !isWalletAddress(address)) {
    return getBoundReferrer(address);
  }
  const normalized = normalizeAddress(address);
  const existing = getBoundReferrer(normalized);
  if (existing) {
    return existing;
  }
  const pending = getStoredReferrer();
  if (!pending || pending.toLowerCase() === normalized.toLowerCase()) {
    return null;
  }
  const bindings = readBindings();
  bindings[normalized] = pending;
  writeBindings(bindings);
  return pending;
}

/**
 * Copy invite attribution onto a new address (e.g. Launch key) from
 * an unlocked wallet binding or pending `?ref=` — first bind wins.
 */
export function inheritReferrerBinding(
  toAddress: string,
  fromAddress?: string | null
): string | null {
  if (!isWalletAddress(toAddress)) {
    return null;
  }
  const existing = getBoundReferrer(toAddress);
  if (existing) {
    return existing;
  }
  const source =
    (fromAddress && getBoundReferrer(fromAddress)) || getStoredReferrer() || null;
  if (!source || source.toLowerCase() === normalizeAddress(toAddress).toLowerCase()) {
    return null;
  }
  if (!isWalletAddress(source)) {
    return null;
  }
  const bindings = readBindings();
  bindings[normalizeAddress(toAddress)] = normalizeAddress(source);
  writeBindings(bindings);
  return normalizeAddress(source);
}

/**
 * Referrer used for joinValidator:
 * 1) already bound to joining address
 * 2) bound to unlocked cabinet wallet (invitee identity)
 * 3) pending link in sessionStorage
 */
export function resolveJoinReferrer(options: {
  joiningAddress: string;
  sessionAddress?: string | null;
}): string | null {
  const joining = normalizeAddress(options.joiningAddress);
  const candidates = [
    getBoundReferrer(joining),
    options.sessionAddress ? getBoundReferrer(options.sessionAddress) : null,
    getStoredReferrer()
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (candidate.toLowerCase() === joining.toLowerCase()) {
      continue;
    }
    if (isWalletAddress(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Invite landing: wallet create/connect binds the guest under the referrer. */
export function referralSharePath(address: string): string {
  return `/wallet?ref=${encodeURIComponent(address)}`;
}
