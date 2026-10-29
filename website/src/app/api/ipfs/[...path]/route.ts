import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import {
  fetchIpfsFromGateways,
  ipfsResponseHeaders,
  isValidIpfsCid,
  parseIpfsRequestPath,
} from "@/lib/ipfs";
import { clientIpFromRequest } from "@/lib/request-client-ip";

type Params = { params: Promise<{ path: string[] }> };

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request, { params }: Params) {
  if (!await checkSharedRateLimit("ipfs-gateway", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { path } = await params;
  if (!isValidIpfsCid(path?.[0] ?? "")) {
    return NextResponse.json({ error: "invalid_cid" }, { status: 400 });
  }
  const parsed = parseIpfsRequestPath(path);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const result = await fetchIpfsFromGateways(parsed.cid, parsed.subPath);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(Buffer.from(result.body), {
    status: 200,
    headers: ipfsResponseHeaders(result.contentType),
  });
}
