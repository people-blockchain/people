import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import {
  deletePinataFile,
  getPinataFile,
  ipfsGatewayUrl,
  isValidIpfsCid,
  PinataError,
  type PinataFileNetwork,
  type PinataFileRecord,
} from "@/lib/ipfs";
import { pinataPrivateDownloadUrl, pinPublicFileBytes } from "@/lib/pinata-private-access";
import { PINATA_UPLOAD_NETWORK } from "@/lib/pinata-signed-upload";
import { mediaBytesMatch } from "@/lib/media-upload-magic";
import { DIRECT_UPLOAD_RATE } from "@/lib/media-upload-rate";
import {
  DIRECT_UPLOAD_URL_TTL_SEC,
  declaredUploadSizeError,
  DIRECT_UPLOAD_MAX_BYTES,
  downloadedBytesMatchDeclaration,
  extensionForMime,
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

const GATEWAY_TIMEOUT_MS = 15_000;
const GATEWAY_TOTAL_BUDGET_MS = 45_000;
const GATEWAY_RETRY_DELAYS_MS = [1_000, 2_000] as const;
const VERIFY_DEADLINE_MS = 50_000;
const UPLOAD_RECORD_SKEW_MS = 5 * 60_000;

function readVerifyDeadlineMs(): number {
  const raw = Number(process.env.UPLOAD_VERIFY_DEADLINE_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : VERIFY_DEADLINE_MS;
}

/** A direct-upload record is only accepted while its signed link could still be alive. */
function isFreshUploadRecord(record: PinataFileRecord, now: number): boolean {
  if (typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)) return false;
  const age = now - record.createdAt;
  return age <= DIRECT_UPLOAD_URL_TTL_SEC * 1_000 + UPLOAD_RECORD_SKEW_MS && age >= -UPLOAD_RECORD_SKEW_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Reads freshly pinned bytes from the public gateway. A new pin can take a few seconds to
 * appear, so this retries briefly inside the handler deadline. Returns null when every
 * attempt fails or the deadline is reached.
 */
async function readPublicGatewayBytes(
  cid: string,
  handlerDeadline: number,
): Promise<{ bytes: Uint8Array; overflow: boolean } | null> {
  const source = ipfsGatewayUrl(cid);
  const deadline = Math.min(Date.now() + GATEWAY_TOTAL_BUDGET_MS, handlerDeadline);
  let lastCode = "fetch_failed";
  for (let attempt = 0; attempt <= GATEWAY_RETRY_DELAYS_MS.length; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lastCode = "budget_exhausted";
      break;
    }
    try {
      const res = await fetch(source, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(GATEWAY_TIMEOUT_MS, remaining))),
      });
      if (!res.ok) {
        lastCode = `http_${res.status}`;
      } else {
        const downloaded = await readBounded(res, DIRECT_UPLOAD_MAX_BYTES + 1);
        if (downloaded) return downloaded;
        lastCode = "empty_body";
      }
    } catch (error) {
      lastCode =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "fetch_failed";
    }
    const delay = GATEWAY_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) {
      const wait = Math.min(delay, deadline - Date.now());
      if (wait <= 0) break;
      await sleep(wait);
    }
  }
  console.warn("[upload-verify] gateway read failed", {
    code: lastCode,
    attempts: GATEWAY_RETRY_DELAYS_MS.length + 1,
  });
  return null;
}

/**
 * Confirms a direct upload: freshness, size, MIME, magic bytes and the signed sha256.
 * Public uploads are read through the public gateway and stay public. A mismatch deletes only
 * the verified file record. Legacy private records are still read through a private download
 * link, then copied to public and removed once verified. Every network step stays inside one
 * absolute handler deadline below maxDuration.
 */
export async function POST(request: Request) {
  const deadline = Date.now() + readVerifyDeadlineMs();
  const remaining = () => Math.max(0, deadline - Date.now());
  const deadlineExceeded = () => remaining() <= 0;
  const stepTimeout = () => Math.max(1, remaining());
  const unavailable = () => nftError("verify_unavailable", 503);

  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    kind?: unknown;
    sha256?: unknown;
    size?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!PINATA_FILE_ID.test(id) || isValidIpfsCid(id) || !isDirectUploadKind(body?.kind)) return nftError("invalid_request", 400);
  if (typeof body?.sha256 !== "string" || !SHA256_HEX.test(body.sha256.trim().toLowerCase())) {
    return nftError("invalid_request", 400);
  }
  const sizeError = declaredUploadSizeError(body.size);
  if (sizeError === "invalid_request") return nftError("invalid_request", 400);
  const declared = body.size as number;
  const kind = body.kind;
  const claimedHash = body.sha256.trim().toLowerCase();

  if (!(await nftRateAllowed(request, DIRECT_UPLOAD_RATE.verifyIp))) return nftError("rate_limited", 429);
  if (!(await nftGlobalRateAllowed(DIRECT_UPLOAD_RATE.verifyGlobal))) return nftError("rate_limited", 429);
  if (deadlineExceeded()) return unavailable();

  let record: PinataFileRecord;
  let network: PinataFileNetwork = PINATA_UPLOAD_NETWORK;
  try {
    try {
      record = await getPinataFile(id, fetch, "public", stepTimeout());
    } catch (error) {
      if (!(error instanceof PinataError) || error.code !== "pin_failed") throw error;
      if (deadlineExceeded()) return unavailable();
      record = await getPinataFile(id, fetch, "private", stepTimeout());
      network = "private";
    }
  } catch (error) {
    if (deadlineExceeded()) return unavailable();
    const code = error instanceof PinataError ? error.code : "lookup_failed";
    console.warn("[upload-verify] file lookup failed", { code });
    if (error instanceof PinataError && error.code === "pin_failed") return nftError("content_mismatch", 422);
    return pinataErrorResponse(error, "storage_unavailable");
  }

  if (deadlineExceeded()) return unavailable();
  if (!isFreshUploadRecord(record, Date.now())) return nftError("content_mismatch", 422);

  const reject = async (error: string, status: number) => {
    if (deadlineExceeded()) return unavailable();
    try {
      await deletePinataFile(record.id, fetch, network, stepTimeout());
      return NextResponse.json(
        { error, cleanup: "deleted" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    } catch (deleteError) {
      if (deadlineExceeded()) return unavailable();
      const code = deleteError instanceof PinataError ? deleteError.code : "delete_failed";
      console.warn("[upload-verify] delete failed", { fileId: record.id, network, code });
      return NextResponse.json(
        { error, cleanup: "delete_failed" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  };

  if (sizeError === "file_too_large") return reject("file_too_large", 413);
  if (!Number.isInteger(record.size) || record.size < declared) return reject("size_mismatch", 422);
  const mime = normalizeUploadMime(record.mimeType);
  if (!mimeAllowedForKind(kind, mime)) return reject("unsupported_format", 415);

  let downloaded: { bytes: Uint8Array; overflow: boolean } | null = null;
  let privateReadFailed = false;
  if (network === "public") {
    downloaded = await readPublicGatewayBytes(record.cid, deadline);
  } else {
    try {
      const source = await pinataPrivateDownloadUrl(record.cid, fetch, stepTimeout());
      if (deadlineExceeded()) return unavailable();
      const res = await fetch(source, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(GATEWAY_TIMEOUT_MS, remaining()))),
      });
      downloaded = await readBounded(res, DIRECT_UPLOAD_MAX_BYTES + 1);
    } catch {
      downloaded = null;
      privateReadFailed = true;
    }
  }
  if (!downloaded) {
    if (deadlineExceeded()) return unavailable();
    if (network === "private" || privateReadFailed) {
      console.warn("[upload-verify] private read unavailable");
      return reject("verify_unavailable", 503);
    }
    return nftError("verify_unavailable", 503);
  }
  if (!downloadedBytesMatchDeclaration(declared, record.size, downloaded.bytes.byteLength, downloaded.overflow)) {
    return reject("size_mismatch", 422);
  }
  if (!mediaBytesMatch(mime, downloaded.bytes)) return reject("content_mismatch", 422);

  const actual = await sha256Hex(downloaded.bytes);
  if (!sameHash(actual, claimedHash)) return reject("sha256_mismatch", 422);

  let cid = record.cid;
  if (network === "private") {
    if (deadlineExceeded()) return unavailable();
    let published: { id: string; cid: string };
    try {
      const ext = extensionForMime(mime) ?? "bin";
      published = await pinPublicFileBytes(downloaded.bytes, `people-direct.${ext}`, mime, fetch, stepTimeout());
    } catch (error) {
      if (deadlineExceeded()) return unavailable();
      const code = error instanceof PinataError ? error.code : "pin_failed";
      console.warn("[upload-verify] public publish failed", { code });
      return reject("verify_unavailable", 503);
    }
    if (!isValidIpfsCid(published.cid) || published.cid !== record.cid) {
      try {
        await deletePinataFile(published.id, fetch, "public", stepTimeout());
      } catch (error) {
        const code = error instanceof PinataError ? error.code : "delete_failed";
        console.warn("[upload-verify] delete failed", { fileId: published.id, network: "public", code });
      }
      return reject("content_mismatch", 422);
    }
    cid = published.cid;
    try {
      await deletePinataFile(record.id, fetch, "private", stepTimeout());
    } catch (error) {
      const code = error instanceof PinataError ? error.code : "delete_failed";
      console.warn("[upload-verify] delete failed", { fileId: record.id, network: "private", code });
    }
  }

  return NextResponse.json(
    {
      uri: `ipfs://${cid}`,
      gatewayUrl: ipfsGatewayUrl(cid),
      size: downloaded.bytes.byteLength,
      mime,
      sha256: actual,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
