/** In-app token page. The explorer address page is a different route and 404s a token id. */
export function inAppNftPath(collection: string, tokenId: bigint | number | string): string {
  return `/nft/${collection}/${tokenId.toString()}`;
}

/** `/nft` has no token to show. The explorer already lists collections. */
export function nftIndexPath(): string {
  return "/explorer/nfts";
}
