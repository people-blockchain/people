/**
 * Caption for an NFT card. A metadata `name` with any non-space text wins.
 * Missing, empty, and whitespace-only names stay `NFT #<id>`.
 */
export function nftCardLabel(metadataName: unknown, tokenId: string | number): string {
  const name = typeof metadataName === "string" ? metadataName.trim() : "";
  return name ? name : `NFT #${tokenId}`;
}
