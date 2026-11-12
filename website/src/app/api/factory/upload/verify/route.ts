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
import { listPinataFileIdsByCid, pinataPrivateDownloadUrl, pinPublicFileBytes } from "@/lib/pinata-private-access";
import { PINATA_UPLOAD_NETWORK } from "@/lib/pinata-signed-upload";
import { mediaBytesMatch } from "@/lib/media-upload-magic";
import { DIRECT_UPLOAD_RATE } from "@/lib/media-upload-rate";
import {
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
 * appear, so this retries briefly inside a total time budget that stays below maxDuration.
 * Returns null and logs a step code when every attempt fails.
 */
async function readPublicGatewayBytes(cid: string): Promise<{ bytes: Uint8Array; overflow: boolean } | null> {
  const source = ipfsGatewayUrl(cid);
  const deadline = Date.now() + GATEWAY_TOTAL_BUDGET_MS;
  let lastCode = "fetch_failed";
  for (let attempt = 0; attempt <= GATEWAY_RETRY_DELAYS_MS.length; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lastCode = "budget_exhausted";
      break;
    }
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(Math.min(GATEWAY_TIMEOUT_MS, remaining)) });
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
 * Confirms a direct upload: size, MIME, magic bytes and the signed sha256.
 * Public uploads are read through the public gateway and stay public. A mismatch deletes
 * every public file id for the CID. Legacy private records are still read through a
 * private download link, then copied to public and removed once verified.
 */
export async function POST(request: Request) {
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

  let record: PinataFileRecord;
  let network: PinataFileNetwork = PINATA_UPLOAD_NETWORK;
  try {
    try {
      record = await getPinataFile(id, fetch, "public");
    } catch (error) {
      if (!(error instanceof PinataError) || error.code !== "pin_failed") throw error;
      record = await getPinataFile(id, fetch, "private");
      network = "private";
    }
  } catch (error) {
    const code = error instanceof PinataError ? error.code : "lookup_failed";
    console.warn("[upload-verify] file lookup failed", { code });
    if (error instanceof PinataError && error.code === "pin_failed") return nftError("content_mismatch", 422);
    return pinataErrorResponse(error, "storage_unavailable");
  }

  const reject = async (error: string, status: number) => {
    try {
      if (network === "public") {
        const ids = new Set(await listPinataFileIdsByCid("public", record.cid, fetch));
        ids.add(record.id);
        for (const fileId of ids) await deletePinataFile(fileId, fetch, "public");
      } else {
        await deletePinataFile(record.id, fetch, "private");
      }
      return NextResponse.json(
        { error, cleanup: "deleted" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    } catch (deleteError) {
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
    downloaded = await readPublicGatewayBytes(record.cid);
  } else {
    try {
      const source = await pinataPrivateDownloadUrl(record.cid, fetch);
      const res = await fetch(source, { signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS) });
      downloaded = await readBounded(res, DIRECT_UPLOAD_MAX_BYTES + 1);
    } catch {
      downloaded = null;
      privateReadFailed = true;
    }
  }
  if (!downloaded) {
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
    let published: { id: string; cid: string };
    try {
      const ext = extensionForMime(mime) ?? "bin";
      published = await pinPublicFileBytes(downloaded.bytes, `people-direct.${ext}`, mime, fetch);
    } catch (error) {
      const code = error instanceof PinataError ? error.code : "pin_failed";
      console.warn("[upload-verify] public publish failed", { code });
      return reject("verify_unavailable", 503);
    }
    if (!isValidIpfsCid(published.cid) || published.cid !== record.cid) {
      try {
        await deletePinataFile(published.id, fetch, "public");
      } catch (error) {
        const code = error instanceof PinataError ? error.code : "delete_failed";
        console.warn("[upload-verify] delete failed", { fileId: published.id, network: "public", code });
      }
      return reject("content_mismatch", 422);
    }
    cid = published.cid;
    try {
      await deletePinataFile(record.id, fetch, "private");
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
