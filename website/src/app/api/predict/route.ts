import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { readPredictSnapshot } from "@/lib/predict/read";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { PREDICT_ENABLED } from "@/lib/features";
export async function GET(request: NextRequest) {
  // hidden: PeoplePredict (feature flag)
  if (!PREDICT_ENABLED) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!checkSlidingWindowRateLimit("predict", clientIpFromRequest(request), 30, 60000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const q = request.nextUrl.searchParams;
  const account = q.get("account") ?? undefined;
  const id = q.get("market") ?? undefined;
  const page = q.get("page") ?? "0";
  const orderPage = q.get("orderPage") ?? "0";
  if ((account && !isAddress(account)) || (id && !/^[1-9]\d{0,17}$/.test(id)) || !/^\d{1,7}$/.test(page) || !/^\d{1,7}$/.test(orderPage)) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  try {
    const body = await readPredictSnapshot({ account: account as Address | undefined, marketId: id ? BigInt(id) : undefined, page: Number(page), orderPage: Number(orderPage) });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const known = ["market_not_found", "wrong_chain", "stale_network", "genesis_mismatch", "contract_mismatch", "invalid_deployment", "version_mismatch", "reorg_retry"];
    const error = e instanceof Error && known.includes(e.message) ? e.message : "rpc_unavailable";
    return NextResponse.json({ error }, { status: error === "market_not_found" ? 404 : 503 });
  }
}
