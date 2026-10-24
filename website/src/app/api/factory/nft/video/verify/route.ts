import { NextResponse } from "next/server";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { deletePinataFile, getPinataFile, ipfsGatewayUrl, PinataError } from "@/lib/ipfs";
import { NFT_VIDEO_HEAD_BYTES, NFT_VIDEO_MAX_BYTES, isNftVideoType, validVideoHeader } from "@/lib/nft-media-rules";
import { NFT_RATE, nftError, nftRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const FILE_ID = /^[A-Za-z0-9-]{8,80}$/;
const GATEWAY_TIMEOUT_MS = 15_000;

/** First bytes of the stored file through a ranged gateway read; null when the gateway cannot serve it. */
async function readHead(cid: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(ipfsGatewayUrl(cid), {
      headers: { Range: `bytes=0-${NFT_VIDEO_HEAD_BYTES - 1}` },
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const out = new Uint8Array(NFT_VIDEO_HEAD_BYTES);
    let filled = 0;
    while (filled < NFT_VIDEO_HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const take = Math.min(value.byteLength, NFT_VIDEO_HEAD_BYTES - filled);
      out.set(value.subarray(0, take), filled);
      filled += take;
    }
    await reader.cancel().catch(() => {});
    return out.subarray(0, filled);
  } catch {
    return null;
  }
}

/**
 * Confirms that a directly uploaded video is really what it claims before it can become an
 * `animation_url`: it must exist in this account's storage, be within the size cap, carry an
 * MP4/WebM type and pass the same container-header rules PeopleScan applies. A bad file is
 * deleted; an unreachable gateway keeps it so the check can simply be retried.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("video_storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!FILE_ID.test(id)) return nftError("missing_file", 400);
  if (!(await nftRateAllowed(request, NFT_RATE.videoVerify))) return nftError("rate_limited", 429);

  let record;
  try {
    record = await getPinataFile(id);
  } catch (err) {
    if (err instanceof PinataError && err.code === "pin_failed") return nftError("video_rejected", 422);
    return pinataErrorResponse(err, "video_storage_unavailable");
  }

  const reject = async () => {
    await deletePinataFile(id).catch(() => {});
    return nftError("video_rejected", 422);
  };

  const type = record.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isNftVideoType(type) || record.size <= 0 || record.size > NFT_VIDEO_MAX_BYTES) return reject();

  const head = await readHead(record.cid);
  if (!head) return nftError("video_verify_unavailable", 503);
  if (!validVideoHeader(head, type, record.size)) return reject();

  return NextResponse.json(
    { uri: `ipfs://${record.cid}`, gatewayUrl: ipfsGatewayUrl(record.cid), size: record.size, type },
    { headers: { "Cache-Control": "no-store" } },
  );
}
