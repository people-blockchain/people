import { keyFromPrivate } from "@/lib/people-sign";

/**
 * Client-side check that a decrypted Turnkey export is the same wallet shown in the UI.
 * Never log or send the private key.
 */
export function exportedKeyMatchesAddress(privateKeyHex: string, expectedAddress: string): boolean {
  const expected = expectedAddress.trim().toLowerCase();
  if (!expected) return false;
  try {
    return keyFromPrivate(privateKeyHex).address.toLowerCase() === expected;
  } catch {
    return false;
  }
}

export const TURNKEY_EXPORT_IFRAME_URL = "https://export.turnkey.com";
