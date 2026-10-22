import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { claimReferralVested } from "@/lib/founders/referral-service";

export async function POST() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  if (!await checkSharedRateLimit("founders-referral-claim", guard.userId, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const result = await claimReferralVested(guard.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, claims: result.claims });
}
