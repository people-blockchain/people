import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import { deletePinataFile, getPinataFile, ipfsGatewayUrl, PinataError } from "@/lib/ipfs";
import { mediaBytesMatch } from "@/lib/media-upload-magic";
import { DIRECT_UPLOAD_RATE } from "@/lib/media-upload-rate";
import {
  DIRECT_UPLOAD_MAX_BYTES,
  isDirectUploadKind,
  mimeAllowedForKind,
  normalizeUploadMime,
  PINATA_FILE_ID,
  sha256Hex,
  SHA256_HEX,
} from "@/lib/media-upload-rules";
import { nftError, nftGlobalRateAllowed, nftRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const GATEWAY_TIMEOUT_MS = 20_000;

async function readBounded(response: Response, cap: number): Promise<{ bytes: Uint8Array; overflow: boolean } | null> {
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > cap) {
        const take = cap - total;
        if (take > 0) chunks.push(value.subarray(0, take));
        total = cap;
        overflow = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, overflow };
}

function sameHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/**
 * Confirms a direct upload: size, declared MIME, magic bytes and sha256 of the gateway bytes.
 * Any mismatch deletes the stored file.
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as { id?: unknown; kind?: unknown; sha256?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!PINATA_FILE_ID.test(id) || !isDirectUploadKind(body?.kind)) return nftError("invalid_request", 400);
  if (typeof body?.sha256 !== "string" || !SHA256_HEX.test(body.sha256.trim().toLowerCase())) {
    return nftError("invalid_request", 400);
  }
  const kind = body.kind;
  const claimedHash = body.sha256.trim().toLowerCase();

  if (!(await nftRateAllowed(request, DIRECT_UPLOAD_RATE.verifyIp))) return nftError("rate_limited", 429);
  if (!(await nftGlobalRateAllowed(DIRECT_UPLOAD_RATE.verifyGlobal))) return nftError("rate_limited", 429);

  let record;
  try {
    record = await getPinataFile(id);
  } catch (error) {
    if (error instanceof PinataError && error.code === "pin_failed") return nftError("content_mismatch", 422);
    return pinataErrorResponse(error, "storage_unavailable");
  }

  const reject = async (error: string, status: number) => {
    await deletePinataFile(id).catch(() => {});
    return nftError(error, status);
  };

  if (!Number.isInteger(record.size) || record.size <= 0 || record.size > DIRECT_UPLOAD_MAX_BYTES) {
    return reject(record.size > DIRECT_UPLOAD_MAX_BYTES ? "file_too_large" : "size_mismatch", record.size > DIRECT_UPLOAD_MAX_BYTES ? 413 : 422);
  }
  const mime = normalizeUploadMime(record.mimeType);
  if (!mimeAllowedForKind(kind, mime)) return reject("unsupported_format", 415);

  let downloaded: { bytes: Uint8Array; overflow: boolean } | null;
  try {
    const res = await fetch(ipfsGatewayUrl(record.cid), {
      headers: { Range: `bytes=0-${record.size - 1}` },
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    downloaded = await readBounded(res, record.size);
  } catch {
    downloaded = null;
  }
  if (!downloaded) return nftError("verify_unavailable", 503);
  if (downloaded.overflow || downloaded.bytes.byteLength !== record.size) return reject("size_mismatch", 422);
  if (!mediaBytesMatch(mime, downloaded.bytes)) return reject("content_mismatch", 422);

  const actual = await sha256Hex(downloaded.bytes);
  if (!sameHash(actual, claimedHash)) return reject("sha256_mismatch", 422);

  return NextResponse.json(
    {
      uri: `ipfs://${record.cid}`,
      gatewayUrl: ipfsGatewayUrl(record.cid),
      size: downloaded.bytes.byteLength,
      mime,
      sha256: actual,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
