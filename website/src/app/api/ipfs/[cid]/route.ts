import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import {
  IPFS_MAX_BYTES,
  ipfsGatewayUrl,
  ipfsResponseHeaders,
  isAllowedIpfsContentType,
  isValidIpfsCid,
  normalizeIpfsContentType,
} from "@/lib/ipfs";
import { clientIpFromRequest } from "@/lib/request-client-ip";

type Params = { params: Promise<{ cid: string }> };

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request, { params }: Params) {
  if (!checkSlidingWindowRateLimit("ipfs-gateway", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { cid } = await params;
  if (!isValidIpfsCid(cid)) {
    return NextResponse.json({ error: "invalid_cid" }, { status: 400 });
  }
  const upstream = ipfsGatewayUrl(cid);
  const res = await fetch(upstream, {
    cache: "force-cache",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) {
    return NextResponse.json({ error: "gateway_error" }, { status: 502 });
  }

  const rawContentType = res.headers.get("content-type");
  if (!isAllowedIpfsContentType(rawContentType)) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  const contentType = normalizeIpfsContentType(rawContentType) as string;

  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > IPFS_MAX_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const body = res.body;
  if (!body) {
    return NextResponse.json({ error: "gateway_error" }, { status: 502 });
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > IPFS_MAX_BYTES) {
          return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return new NextResponse(Buffer.concat(chunks.map((c) => Buffer.from(c))), {
    status: 200,
    headers: ipfsResponseHeaders(contentType),
  });
}
