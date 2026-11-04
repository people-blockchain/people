import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCurveHubReferralSync } from "@/lib/partner/curve-hub-sync";
import { expireStaleOrders } from "@/lib/sale/service";

/** Constant-time string comparison that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

export async function POST(request: Request) {
  const secret = process.env.SALE_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "sale_watch_not_configured" }, { status: 401 });
  }
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!safeEqual(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expired = await expireStaleOrders();
  const referral = await runCurveHubReferralSync();
  return NextResponse.json({ expired, referral });
}

export async function GET(request: Request) {
  return POST(request);
}
