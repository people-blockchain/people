import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { getReferralStatus, settleStayBonusesForInviter } from "@/lib/founders/referral-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  await settleStayBonusesForInviter(guard.userId).catch(() => undefined);
  const status = await getReferralStatus(guard.userId);
  if (!status) return NextResponse.json({ error: "not_registered" }, { status: 403 });
  return NextResponse.json(status);
}
