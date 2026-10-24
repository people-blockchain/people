import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { ipfsGatewayUrlForUri, pinBytesToIpfs } from "@/lib/ipfs";
import { NftMetadataError, buildNftMetadata } from "@/lib/nft-media-rules";
import { NFT_RATE, nftError, nftRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Pins the ERC-721 metadata JSON and returns the `tokenUri` the mint transaction will carry.
 * The JSON is rebuilt on the server from validated fields; `image`/`animation_url` must be
 * permanent `ipfs://` or `https://` addresses, never `blob:` or `data:`.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    image?: unknown;
    animationUrl?: unknown;
  } | null;
  if (!body || typeof body.name !== "string" || typeof body.image !== "string") return nftError("invalid_metadata", 400);
  if (body.description !== undefined && typeof body.description !== "string") return nftError("invalid_description", 400);
  if (body.animationUrl !== undefined && body.animationUrl !== null && typeof body.animationUrl !== "string") {
    return nftError("invalid_animation_uri", 400);
  }
  if (!(await nftRateAllowed(request, NFT_RATE.metadata))) return nftError("rate_limited", 429);

  let json;
  try {
    json = buildNftMetadata({
      name: body.name,
      description: body.description as string | undefined,
      image: body.image,
      animationUrl: body.animationUrl as string | null | undefined,
    });
  } catch (err) {
    return nftError(err instanceof NftMetadataError ? err.code : "invalid_metadata", 400);
  }

  try {
    const bytes = new TextEncoder().encode(JSON.stringify(json));
    const { uri } = await pinBytesToIpfs(bytes, "metadata.json", "application/json", { wrapWithDirectory: true });
    return NextResponse.json(
      { tokenUri: uri, gatewayUrl: ipfsGatewayUrlForUri(uri), json },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return pinataErrorResponse(err, "storage_unavailable");
  }
}
