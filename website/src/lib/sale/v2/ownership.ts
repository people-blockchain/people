/**
 * The exact wallet-ownership message the sale verifier expects.
 *
 * The server builds the same string in `/api/sale/verify-signature`; keeping the
 * format in one small pure module makes it easy to test and impossible for the
 * client to drift accidentally.
 */
/** A usable one-time code, or null when the client omitted it. */
export function parseSaleNonceCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 200) return null;
  return value;
}

export function buildV2OwnershipMessage(input: {
  domain: string;
  account: string;
  chainId: number;
  hub: string;
  nonceCode: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    `${input.domain} wants you to verify this wallet for the PPL sale.`,
    "",
    "This proves wallet ownership only. It does not move funds.",
    `Address: ${input.account}`,
    `Chain ID: ${input.chainId}`,
    `Hub: ${input.hub}`,
    `Nonce: ${input.nonceCode}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`,
  ].join("\n");
}

/** Same normalisation as the server: origin only, no protocol, no trailing slash. */
export function saleDomain(origin: string): string {
  return origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
