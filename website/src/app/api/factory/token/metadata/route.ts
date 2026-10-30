import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { ipfsGatewayUrlForUri, pinBytesToIpfs } from "@/lib/ipfs";
import { TOKEN_METADATA_FILENAME, TokenMetadataError, buildTokenMetadata } from "@/lib/factory/token-metadata";
import { NFT_RATE, nftError, nftRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Pins the token metadata JSON `{name, symbol, description, image?}` and returns the `tokenUri`
 * (`ipfs://<CID>/metadata.json`) the createToken transaction will carry. The JSON is rebuilt on the
 * server from validated fields; `image` must be a permanent `ipfs://` or `https://` address.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    symbol?: unknown;
    description?: unknown;
    image?: unknown;
  } | null;
  if (!body || typeof body.name !== "string" || typeof body.symbol !== "string") return nftError("invalid_metadata", 400);
  if (body.description !== undefined && typeof body.description !== "string") return nftError("invalid_description", 400);
  if (body.image !== undefined && body.image !== null && typeof body.image !== "string") return nftError("invalid_image_uri", 400);
  if (!(await nftRateAllowed(request, NFT_RATE.tokenMetadata))) return nftError("rate_limited", 429);

  let json;
  try {
    json = buildTokenMetadata({
      name: body.name,
      symbol: body.symbol,
      description: body.description as string | undefined,
      image: body.image as string | null | undefined,
    });
  } catch (err) {
    return nftError(err instanceof TokenMetadataError ? err.code : "invalid_metadata", 400);
  }

  try {
    const bytes = new TextEncoder().encode(JSON.stringify(json));
    const { uri } = await pinBytesToIpfs(bytes, TOKEN_METADATA_FILENAME, "application/json", { wrapWithDirectory: true });
    return NextResponse.json(
      { tokenUri: uri, gatewayUrl: ipfsGatewayUrlForUri(uri), json },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return pinataErrorResponse(err, "storage_unavailable");
  }
}
