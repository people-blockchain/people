import { NextResponse } from "next/server";
import { getAddress, isAddress, verifyMessage } from "viem";
import { isPinataConfigured } from "@/lib/factory-icon-config";
import {
  directUploadSignMessage,
  extensionForMime,
  validateDirectUploadFields,
} from "@/lib/media-upload-rules";
import { DIRECT_UPLOAD_RATE, directUploadAddressAllowed } from "@/lib/media-upload-rate";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { nftError, nftGlobalRateAllowed, pinataErrorResponse } from "@/lib/nft-upload-server";
import { createPinataSignedUpload } from "@/lib/pinata-signed-upload";
import {
  classifyNonce,
  consumeUploadNonce,
  readUploadNonce,
  UploadNonceStoreError,
} from "@/lib/upload-nonce-store";
import { UploadSignRateStoreError, allowDirectUploadSignIp } from "@/lib/upload-sign-rate-store";

export const runtime = "nodejs";
export const maxDuration = 30;

const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const NONCE = /^[0-9a-f]{32}$/;

function nonceFailure(code: "nonce_used" | "nonce_expired" | "nonce_missing") {
  return nftError(code, code === "nonce_used" ? 409 : 401);
}

/**
 * Checks a wallet signature over the server nonce, consumes that nonce, and returns a
 * signed upload URL bound to the declared type and size (120 seconds).
 */
export async function POST(request: Request) {
  if (!isPinataConfigured()) return nftError("storage_unavailable", 503);
  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    type?: unknown;
    size?: unknown;
    sha256?: unknown;
    address?: unknown;
    signature?: unknown;
    nonce?: unknown;
  } | null;
  if (!body) return nftError("invalid_request", 400);

  const fields = validateDirectUploadFields({
    kind: body.kind,
    type: body.type,
    size: body.size,
    sha256: body.sha256,
  });
  if (!fields.ok) {
    const status = fields.error === "file_too_large" ? 413 : fields.error === "unsupported_format" ? 415 : 400;
    return nftError(fields.error, status);
  }
  if (typeof body.address !== "string" || !isAddress(body.address, { strict: false })) {
    return nftError("invalid_request", 400);
  }
  if (typeof body.signature !== "string" || !SIGNATURE.test(body.signature)) return nftError("invalid_request", 400);
  if (typeof body.nonce !== "string" || !NONCE.test(body.nonce)) return nftError("invalid_request", 400);

  const address = getAddress(body.address);
  try {
    const ipAllowed = await allowDirectUploadSignIp(
      clientIpFromRequest(request),
      DIRECT_UPLOAD_RATE.signIp.limit,
      DIRECT_UPLOAD_RATE.signIp.windowMs,
    );
    if (!ipAllowed) return nftError("rate_limited", 429);
  } catch (error) {
    if (error instanceof UploadSignRateStoreError) {
      console.warn("[upload-sign-rate] store unavailable");
      return nftError("storage_unavailable", 503);
    }
    throw error;
  }
  if (!(await directUploadAddressAllowed(address, DIRECT_UPLOAD_RATE.signAddress))) {
    return nftError("rate_limited", 429);
  }
  if (!(await nftGlobalRateAllowed(DIRECT_UPLOAD_RATE.signGlobal))) return nftError("rate_limited", 429);

  try {
    const row = await readUploadNonce(body.nonce);
    const nonceStatus = classifyNonce(row, address, Date.now());
    if (nonceStatus !== "ok" || !row) {
      return nonceFailure(nonceStatus === "ok" ? "nonce_missing" : nonceStatus);
    }

    const message = directUploadSignMessage({
      domain: row.domain,
      address: row.address,
      nonce: row.nonce,
      kind: fields.fields.kind,
      type: fields.fields.type,
      size: fields.fields.size,
      sha256: fields.fields.sha256,
      expiry: row.expiry,
    });
    let valid = false;
    try {
      valid = await verifyMessage({ address, message, signature: body.signature as `0x${string}` });
    } catch {
      valid = false;
    }
    if (!valid) return nftError("bad_signature", 401);

    const consumed = await consumeUploadNonce(body.nonce, address);
    if (consumed !== "ok") return nonceFailure(consumed);

    const ext = extensionForMime(fields.fields.type) ?? "bin";
    const { url } = await createPinataSignedUpload({
      filename: `people-direct-${crypto.randomUUID()}.${ext}`,
      mimeTypes: [fields.fields.type],
      maxBytes: fields.fields.size,
      expiresSec: 120,
    });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadNonceStoreError) {
      console.warn("[upload-nonce] store unavailable");
      return nftError("storage_unavailable", 503);
    }
    return pinataErrorResponse(error, "storage_unavailable");
  }
}
