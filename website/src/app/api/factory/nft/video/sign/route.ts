import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { createPinataSignedVideoUpload } from "@/lib/ipfs";
import { NFT_VIDEO_MAX_BYTES, isNftVideoType } from "@/lib/nft-media-rules";
import { NFT_RATE, nftError, nftGlobalRateAllowed, nftRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SIGN_EXPIRES_SEC = 120;

/**
 * Hands out a short-lived signed upload URL so a video (up to 20 MB) goes straight from the
 * browser to storage; a serverless function body cannot carry it. The signature pins the MIME
 * type and maximum size, and `/video/verify` still checks the stored bytes before they are used.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("video_storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (!body || !isNftVideoType(body.type)) return nftError("unsupported_type", 415);
  if (typeof body.size !== "number" || !Number.isInteger(body.size) || body.size <= 0) {
    return nftError("missing_file", 400);
  }
  if (body.size > NFT_VIDEO_MAX_BYTES) return nftError("file_too_large", 413);

  if (!(await nftRateAllowed(request, NFT_RATE.videoSign))) return nftError("rate_limited", 429);
  if (!(await nftGlobalRateAllowed(NFT_RATE.videoDaily))) return nftError("rate_limited", 429);

  const ext = body.type === "video/mp4" ? "mp4" : "webm";
  try {
    const { url } = await createPinataSignedVideoUpload({
      filename: `people-nft-${crypto.randomUUID()}.${ext}`,
      mimeType: body.type,
      maxBytes: NFT_VIDEO_MAX_BYTES,
      expiresSec: SIGN_EXPIRES_SEC,
    });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return pinataErrorResponse(err, "video_storage_unavailable");
  }
}
