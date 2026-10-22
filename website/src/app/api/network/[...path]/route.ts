import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { getNodeRpcUrl } from "@/lib/factory-config";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { evmJsonRpcMethodsAllowed } from "@/lib/evm/json-rpc-allowlist";
import { readCappedText } from "@/lib/read-capped-text";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT = 240;
const RATE_WINDOW_MS = 60_000;

const ROOTS = new Set([
  "health",
  "snapshot",
  "metrics",
  "blocks",
  "transactions",
  "search",
  "address",
  "accounts",
  "assets",
  "nfts",
  "contracts",
  "liquidity-pools",
  "tx",
  "chain",
  "faucet",
  "rpc",
]);

function allowedPath(segments: string[]): string | null {
  if (segments.length === 0) return null;
  const root = segments[0]?.toLowerCase();
  if (!root || !ROOTS.has(root)) return null;
  if (segments.some((part) => part.includes("..") || part.includes("\\") || part.includes("://"))) {
    return null;
  }
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

async function proxy(request: NextRequest, segments: string[]) {
  const base = getNodeRpcUrl();
  if (!base) {
    return NextResponse.json({ error: "node_unavailable" }, { status: 503 });
  }
  const path = allowedPath(segments);
  if (!path) {
    return NextResponse.json({ error: "path_not_allowed" }, { status: 400 });
  }
  if (!checkSlidingWindowRateLimit("network-proxy", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const isFaucet = segments[0] === "faucet" && segments[1] === "fund";
  const isContractCall = segments[0] === "contracts" && segments[1] === "call";
  const isJsonRpc = segments[0] === "rpc";
  if (request.method === "POST" && segments[0] !== "tx" && !isFaucet && !isContractCall && !isJsonRpc) {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }
  const url = new URL(base + path);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  const init: RequestInit = {
    method: request.method,
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  };
  if (request.method === "POST") {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    // S4-07: /api/network/rpc must use the same JSON-RPC allowlist as /api/evm/rpc.
    if (isJsonRpc) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
          { status: 200 },
        );
      }
      if (!evmJsonRpcMethodsAllowed(parsed)) {
        return NextResponse.json(
          { jsonrpc: "2.0", id: null, error: { code: -32601, message: "Method not allowed" } },
          { status: 200 },
        );
      }
    }
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = raw;
  }
  // Enable only behind an ingress which OVERWRITES x-real-ip; never trust a client XFF chain.
  const clientIp = request.headers.get("x-real-ip") ?? "";
  if (process.env.TRUST_PROXY_HEADERS === "1" && isIP(clientIp)) {
    init.headers = { ...init.headers, "x-forwarded-for": clientIp };
  }
  let upstream: Response;
  try { upstream = await fetch(url.toString(), init); } catch {
    return NextResponse.json({ error: "node_unavailable" }, { status: 502 });
  }
  const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    return NextResponse.json({ error: "upstream_response_too_large" }, { status: 502 });
  }
  const text = await readCappedText(upstream, MAX_RESPONSE_BYTES);
  if (text === null) {
    return NextResponse.json({ error: "upstream_response_too_large" }, { status: 502 });
  }
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}
