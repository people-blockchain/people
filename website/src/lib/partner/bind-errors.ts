import type { PartnerStrings } from "./copy";

type BindErrorCopy = Pick<
  PartnerStrings,
  | "bindErrorGeneric"
  | "bindErrorExpired"
  | "bindErrorTaken"
  | "bindErrorWrongPassword"
>;

/** Map partner wallet bind API errors to locale strings. */
export function bindErrorMessage(
  code: string | null | undefined,
  t: BindErrorCopy,
): string {
  const key = code?.trim();
  if (!key) return t.bindErrorGeneric;
  if (key === "challenge_expired" || key === "challenge_mismatch") return t.bindErrorExpired;
  if (key === "wallet_taken") return t.bindErrorTaken;
  if (key === "bad_signature" || key === "address_mismatch" || key === "invalid_input") {
    return t.bindErrorGeneric;
  }
  if (key === "unauthorized" || key === "not_configured") return t.bindErrorGeneric;
  return t.bindErrorGeneric;
}

export function shortWalletAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (normalized.length < 12) return normalized;
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}
