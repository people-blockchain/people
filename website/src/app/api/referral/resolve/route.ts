import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { normalizeReferralCode } from "@/lib/partner/referral";
import { resolveWalletByReferralCode } from "@/lib/referral-link-server";

export const dynamic = "force-dynamic";

/**
 * `GET /api/referral/resolve?code=<code>` → `{ wallet }`: the inviter's address for the
 * on-chain participant referral when someone arrives via `/?ref=<code>`. The same address
 * was already public in the older `?ref=0x…` links; codes are 10 hex chars, too many to scan.
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!await checkSharedRateLimit("referral_resolve", clientIp(request), 30, 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const code = normalizeReferralCode(new URL(request.url).searchParams.get("code"));
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  const wallet = await resolveWalletByReferralCode(code);
  return NextResponse.json({ wallet }, { headers: { "Cache-Control": "no-store" } });
}
