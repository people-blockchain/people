/** Shared helpers for the `/api/factory/nft/*` routes (rate limits, capped body reads, error mapping). */
import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { PinataError } from "@/lib/ipfs";

export type NftRateRule = { namespace: string; limit: number; windowMs: number };

export const NFT_RATE = {
  image: { namespace: "nft-image-upload", limit: 20, windowMs: 10 * 60_000 },
  videoSign: { namespace: "nft-video-sign", limit: 6, windowMs: 60 * 60_000 },
  videoVerify: { namespace: "nft-video-verify", limit: 12, windowMs: 60 * 60_000 },
  metadata: { namespace: "nft-metadata", limit: 30, windowMs: 10 * 60_000 },
  videoDaily: { namespace: "nft-video-daily", limit: 200, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<string, NftRateRule>;

/** Per-client budget (Postgres-backed when `DATABASE_URL` is set, in-process otherwise). */
export async function nftRateAllowed(request: Request, rule: NftRateRule): Promise<boolean> {
  return checkSharedRateLimit(rule.namespace, clientIpFromRequest(request), rule.limit, rule.windowMs);
}

/** One budget shared by every client (daily cap on signed video uploads). */
export async function nftGlobalRateAllowed(rule: NftRateRule): Promise<boolean> {
  return checkSharedRateLimit(rule.namespace, "global", rule.limit, rule.windowMs);
}

export function nftError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads a request body, giving up as soon as it passes `maxBytes`. Returns null when too large. */
export async function readRequestBytesCapped(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const body = request.body;
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Maps a storage failure onto a stable error code. `unavailableCode` is used when the key cannot do the job. */
export function pinataErrorResponse(err: unknown, unavailableCode: string): NextResponse {
  if (err instanceof PinataError && (err.code === "pinata_not_configured" || err.code === "pinata_scope_missing")) {
    return nftError(unavailableCode, 503);
  }
  return nftError("pin_failed", 502);
}
