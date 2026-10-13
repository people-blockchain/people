const STORAGE_KEY = "ppl_referrer";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
  if (readStoredReferrer()) return;
  const ref = new URLSearchParams(search).get("ref")?.trim() ?? "";
  if (!isValidReferrerAddress(ref)) return;
  try {
    store.setItem(STORAGE_KEY, ref);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredReferrer(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const ref = store.getItem(STORAGE_KEY)?.trim() ?? "";
    return isValidReferrerAddress(ref) ? ref : null;
  } catch {
    return null;
  }
}

export function resolveReferrerForWallet(selfAddress: string): string | null {
  const ref = readStoredReferrer();
  if (!ref) return null;
  if (ref.toLowerCase() === selfAddress.toLowerCase()) return null;
  return ref;
}

export function planParticipantRegistration(selfAddress: string): RegistrationPlan {
  const referrer = resolveReferrerForWallet(selfAddress);
  const steps: RegistrationStep[] = ["register"];
  if (referrer) steps.push("referral");
  return { steps, referrer };
}
