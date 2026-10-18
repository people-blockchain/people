import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { GatewayError, LOCAL_CONNECT_ORIGIN, MobileWalletGateway, PEOPLE_CONNECT_ORIGIN } from "@/lib/mobile-wallet/service";
import { checkGatewayRateLimit, DevelopmentGatewayStore, PostgresGatewayStore } from "@/lib/mobile-wallet/store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const development = process.env.NODE_ENV === "development" && process.env.PEOPLE_CONNECT_DEVELOPMENT === "97401";
const memory = development ? new DevelopmentGatewayStore() : null;
const gateway = new MobileWalletGateway(memory ?? new PostgresGatewayStore(), development ? LOCAL_CONNECT_ORIGIN : PEOPLE_CONNECT_ORIGIN);
export async function POST(request: Request) {
  try {
    if (!development && process.env.PEOPLE_CONNECT_ENABLED !== "1") throw new GatewayError("connection_not_enabled", 503);
    if (!development && !isDatabaseConfigured()) throw new GatewayError("storage_unavailable", 503);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new GatewayError("json_required", 415);
    const source = request.body?.getReader();
    if (!source) throw new GatewayError("invalid_request");
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const next = await source.read(); if (next.done) break;
      bytes += next.value.length;
      if (bytes > 32_768) { await source.cancel(); throw new GatewayError("request_too_large", 413); }
      chunks.push(next.value);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new GatewayError("invalid_json"); }
    const creating = !!body && typeof body === "object" && "action" in body && body.action === "create";
    const ip = clientIpFromRequest(request);
    const budget = creating ? 5 : 120;
    if (!checkSlidingWindowRateLimit(`people-mobile:${creating ? "create" : "action"}`, ip, budget, 60_000) ||
        (!development && !await checkGatewayRateLimit(`people-mobile:${creating ? "create" : "action"}`, ip, budget, 60_000))) throw new GatewayError("rate_limited", 429);
    const result = await gateway.execute(body, request.headers.get("origin"));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const safe = error instanceof GatewayError ? error : new GatewayError("storage_unavailable", 503);
    return NextResponse.json({ error: safe.code }, { status: safe.status, headers });
  }
}
