import { createHash } from "node:crypto";
import type { NftRecord, Transaction } from "@ovn/protocol";

const NFT_ID_RE = /^nft-[a-z0-9]{8,48}$/;
const MAX_NAME = 64;
const MIN_NAME = 2;
const MAX_DESCRIPTION = 1024;
const MAX_IMAGE_URI = 2048;
const MAX_COLLECTION = 64;

export { nftMintMinFee } from "./factory-fees.js";

export function isValidNftId(nftId: string): boolean {
  return NFT_ID_RE.test(nftId.trim().toLowerCase());
}

export function deriveNftId(creator: string, nonce: number, name: string): string {
  const digest = createHash("sha256")
    .update(`${creator.toLowerCase()}:${nonce}:${name}`)
    .digest("hex")
    .slice(0, 24);
  return `nft-${digest}`;
}

export function parseNftMintPayload(
  tx: Transaction,
  restrictImageUriScheme = false
): {
  name: string;
  description: string;
  imageUri: string;
  collectionId?: string;
  requestedId?: string;
} {
  const name = String(tx.payload?.name ?? "").trim();
  const description = String(tx.payload?.description ?? "").trim();
  const imageUri = String(tx.payload?.imageUri ?? "").trim();
  const collectionRaw = String(tx.payload?.collectionId ?? "").trim();
  const requestedRaw = String(tx.payload?.nftId ?? "").trim().toLowerCase();

  if (name.length < MIN_NAME || name.length > MAX_NAME) {
    throw new Error("Invalid NFT name (must be 2-64 characters)");
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new Error("NFT description too long");
  }
  if (!imageUri || imageUri.length > MAX_IMAGE_URI) {
    throw new Error("Invalid NFT image URI");
  }
  if (!isAllowedImageUri(imageUri, restrictImageUriScheme)) {
    throw new Error(
      restrictImageUriScheme ? "NFT image URI must be https or ipfs" : "NFT image URI must be https, data, blob, or sha256"
    );
  }
  let collectionId: string | undefined;
  if (collectionRaw) {
    if (collectionRaw.length < 2 || collectionRaw.length > MAX_COLLECTION) {
      throw new Error("Invalid collection id");
    }
    collectionId = collectionRaw;
  }
  const requestedId = requestedRaw && isValidNftId(requestedRaw) ? requestedRaw : undefined;
  return { name, description, imageUri, collectionId, requestedId };
}

/**
 * M12-7: `http:`/`data:`/`blob:`/`sha256:` were all accepted at mint time, but a `blob:` URI is
 * meaningless once persisted off the browser that created it, and the rest are inconsistent with
 * how the image is actually expected to resolve later. Behind the upgrade, a new mint is bound to
 * `https://` or `ipfs://` only; URIs minted before the upgrade keep rendering under either rule.
 */
export function isAllowedImageUri(uri: string, restrictScheme = false): boolean {
  if (restrictScheme) {
    return uri.startsWith("https://") || uri.startsWith("ipfs://");
  }
  return (
    uri.startsWith("https://") ||
    uri.startsWith("http://") ||
    uri.startsWith("data:image/") ||
    uri.startsWith("blob:") ||
    uri.startsWith("sha256:")
  );
}

export function getNft(nfts: Record<string, NftRecord> | undefined, nftId: string): NftRecord | undefined {
  return nfts?.[nftId.trim().toLowerCase()];
}

export function listNfts(nfts: Record<string, NftRecord> | undefined): NftRecord[] {
  return Object.values(nfts ?? {}).sort((a, b) => a.nftId.localeCompare(b.nftId));
}

export function listNftsByOwner(
  nfts: Record<string, NftRecord> | undefined,
  owner: string
): NftRecord[] {
  const normalized = owner.toLowerCase();
  return listNfts(nfts).filter((item) => item.owner.toLowerCase() === normalized);
}
