import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { nftError, nftRateAllowed } from "@/lib/nft-upload-server";
import { isUploadDomain } from "@/lib/media-upload-rules";
import { DIRECT_UPLOAD_RATE, directUploadAddressAllowed } from "@/lib/media-upload-rate";
import { issueUploadNonce, UploadNonceStoreError } from "@/lib/upload-nonce-store";

export const runtime = "nodejs";
export const maxDuration = 15;

function requestDomain(request: Request): string | null {
  try {
    const host = new URL(request.url).host;
    return isUploadDomain(host) ? host : null;
  } catch {
    return null;
  }
}

/** Issues a one-time nonce for a wallet address. No session cookie is required. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(raw, { strict: false })) return nftError("invalid_request", 400);
  const address = getAddress(raw);
  const domain = requestDomain(request);
  if (!domain) return nftError("invalid_request", 400);

  if (!(await nftRateAllowed(request, DIRECT_UPLOAD_RATE.nonceIp))) return nftError("rate_limited", 429);
  if (!(await directUploadAddressAllowed(address, DIRECT_UPLOAD_RATE.nonceAddress))) {
    return nftError("rate_limited", 429);
  }

  try {
    const issued = await issueUploadNonce({ address, domain });
    return NextResponse.json(
      { nonce: issued.nonce, expiry: issued.expiry, domain: issued.domain },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UploadNonceStoreError) {
      console.warn("[upload-nonce] store unavailable");
      return nftError("storage_unavailable", 503);
    }
    throw error;
  }
}
