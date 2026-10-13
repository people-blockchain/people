import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { getFounderByUserId } from "@/lib/founders/service";
import { registerIssuerReferralProgram } from "@/lib/founders/referral-service";

/** Issuer opt-in for a launched token. Absent / `enabled: false` stores nothing (default OFF). */
export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  const founder = await getFounderByUserId(guard.userId);
  if (!founder) return NextResponse.json({ error: "not_registered" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    tokenAddress?: string;
    totalSupplyBaseUnits?: string;
    enabled?: unknown;
    allocationBps?: unknown;
    l1Bps?: unknown;
  };
  const result = await registerIssuerReferralProgram({
    tokenAddress: body.tokenAddress ?? "",
    issuerUserId: guard.userId,
    issuerWalletAddress: founder.walletAddress,
    totalSupplyBaseUnits: body.totalSupplyBaseUnits ?? "",
    enabled: body.enabled,
    allocationBps: body.allocationBps,
    l1Bps: body.l1Bps,
  });
  if (!result.ok) {
    const status = result.error === "exists" ? 409 : result.error === "not_token_creator" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, config: result.config });
}
