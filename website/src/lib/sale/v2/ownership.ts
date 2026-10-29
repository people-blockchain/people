/**
 * The exact wallet-ownership message the sale verifier expects.
 *
 * The server builds the same string in `/api/sale/verify-signature`; keeping the
 * format in one small pure module makes it easy to test and impossible for the
 * client to drift accidentally.
 */
export function buildV2OwnershipMessage(input: {
  domain: string;
  account: string;
  chainId: number;
  hub: string;
  nonceCode?: string;
  issuedAt?: string;
  expiresAt?: string;
}): string {
  const lines = [
    `${input.domain} wants you to verify this wallet for the PPL sale.`,
    "",
    "This proves wallet ownership only. It does not move funds.",
    `Address: ${input.account}`,
    `Chain ID: ${input.chainId}`,
    `Hub: ${input.hub}`,
  ];
  if (input.nonceCode) {
    lines.push(`Nonce: ${input.nonceCode}`);
    if (input.issuedAt) lines.push(`Issued At: ${input.issuedAt}`);
    if (input.expiresAt) lines.push(`Expiration Time: ${input.expiresAt}`);
  }
  return lines.join("\n");
}

/** Same normalisation as the server: origin only, no protocol, no trailing slash. */
export function saleDomain(origin: string): string {
  return origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
