import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { ipfsGatewayUrlForUri, pinBytesToIpfs } from "@/lib/ipfs";
import {
  NFT_IMAGE_EXT,
  NFT_IMAGE_MAX_BYTES,
  NFT_IMAGE_MIME,
  NFT_SVG_MAX_BYTES,
  imageKindFromMime,
  maxBytesForImage,
  sniffNftImage,
} from "@/lib/nft-media-rules";
import { sanitizeSvg } from "@/lib/nft-svg-sanitize";
import { NFT_RATE, nftError, nftRateAllowed, pinataErrorResponse, readRequestBytesCapped } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Multipart overhead on top of the largest file. */
const BODY_SLACK_BYTES = 100_000;

/**
 * Image or video-cover upload. The browser-declared type is only a hint: the stored kind comes
 * from the file's own bytes, SVG is rebuilt through the allowlist sanitizer, and only the
 * sanitized bytes are pinned. The raw SVG is never returned.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  if (!(await nftRateAllowed(request, NFT_RATE.image))) return nftError("rate_limited", 429);

  const raw = await readRequestBytesCapped(request, Math.max(NFT_IMAGE_MAX_BYTES, NFT_SVG_MAX_BYTES) + BODY_SLACK_BYTES);
  if (!raw) return nftError("file_too_large", 413);

  let file: FormDataEntryValue | null;
  try {
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: raw as BodyInit }).formData();
    file = form.get("file");
  } catch {
    return nftError("missing_file", 400);
  }
  if (!(file instanceof File)) return nftError("missing_file", 400);

  const declared = imageKindFromMime(file.type);
  if (!declared) return nftError("unsupported_type", 415);
  if (file.size <= 0) return nftError("missing_file", 400);
  if (file.size > maxBytesForImage(declared)) return nftError("file_too_large", 413);

  const original = new Uint8Array(await file.arrayBuffer());
  const kind = sniffNftImage(original);
  if (!kind || kind !== declared) return nftError("content_type_mismatch", 415);

  let bytes: Uint8Array = original;
  if (kind === "svg") {
    const clean = sanitizeSvg(original);
    if (!clean) return nftError("svg_rejected", 422);
    bytes = clean;
  }

  const filename = `image.${NFT_IMAGE_EXT[kind]}`;
  try {
    const { uri } = await pinBytesToIpfs(bytes, filename, NFT_IMAGE_MIME[kind], { wrapWithDirectory: true });
    return NextResponse.json(
      {
        uri,
        gatewayUrl: ipfsGatewayUrlForUri(uri),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        kind,
        // The stored (sanitized) SVG so the preview shows exactly what was pinned, through <img> only.
        ...(kind === "svg" ? { sanitizedSvgBase64: Buffer.from(bytes).toString("base64") } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return pinataErrorResponse(err, "storage_unavailable");
  }
}
