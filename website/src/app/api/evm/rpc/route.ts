import { NextRequest, NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { countGetLogsCalls, evmJsonRpcMethodsAllowed } from "@/lib/evm/json-rpc-allowlist";
import { readCappedText } from "@/lib/read-capped-text";

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = 600;
const RATE_WINDOW_MS = 60_000;
/** AUDIT M5: same cap as the /api/network proxy; JSON-RPC answers never legitimately get close. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/** AUDIT M5: separate, stricter per-IP budget for `eth_getLogs` (counted per batch entry). */
const GET_LOGS_RATE_LIMIT = 300;

export async function POST(request: NextRequest) {
  const upstream = readEvmRpcUrl();
  if (!upstream) {
    return NextResponse.json({ error: "evm_rpc_unconfigured" }, { status: 503 });
  }
  if (
    !await checkSharedRateLimit(
      "evm-rpc-proxy",
      clientIpFromRequest(request),
      RATE_LIMIT,
      RATE_WINDOW_MS,
    )
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 200 });
  }
  if (!evmJsonRpcMethodsAllowed(parsed)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32601, message: "Method not allowed" } },
      { status: 200 },
    );
  }
  const ip = clientIpFromRequest(request);
  const getLogsCalls = countGetLogsCalls(parsed);
  for (let i = 0; i < getLogsCalls; i++) {
    if (!await checkSharedRateLimit("evm-rpc-proxy-getlogs", ip, GET_LOGS_RATE_LIMIT, RATE_WINDOW_MS)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  }
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await readCappedText(res, MAX_RESPONSE_BYTES);
    if (text === null) {
      return NextResponse.json({ error: "upstream_response_too_large" }, { status: 502 });
    }
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "evm_rpc_unavailable" }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
