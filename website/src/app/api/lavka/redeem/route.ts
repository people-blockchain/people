import { NextResponse } from "next/server";
import { lavkaApiGuard } from "@/lib/lavka/guard";
import { lavkaRateLimitAllowed } from "@/lib/lavka/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { loadVerifiedHuman } from "@/lib/discover/verified-human";
import { recordRedemption } from "@/lib/lavka/service";

export async function POST(request: Request) {
  const guard = await lavkaApiGuard();
  if (!guard.ok) return guard.response;
  if (!lavkaRateLimitAllowed(guard.userId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    programId?: string;
    txHash?: string;
    visits?: unknown;
  };
  const programId = body.programId?.trim();
  const txHash = body.txHash?.trim();
  if (!programId || !txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  // Optional: the visit count the client asked its wallet to redeem. When present it must be a
  // positive integer and must match the on-chain `VisitRedeemed` count (AUD-M14).
  let expectedVisits: number | undefined;
  if (body.visits !== undefined) {
    if (!Number.isInteger(body.visits) || (body.visits as number) < 1) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    expectedVisits = body.visits as number;
  }
  const human = await loadVerifiedHuman(guard.userId);
  if (!human?.walletAddress) {
    return NextResponse.json({ error: "wallet_required" }, { status: 403 });
  }
  const result = await recordRedemption({
    customerUserId: guard.userId,
    programDbId: programId,
    walletAddress: human.walletAddress,
    txHash,
    ip: clientIp(request),
    expectedVisits,
  });
  if (!result.ok) {
    const status = result.error === "program_not_found" ? 404 : result.error === "program_mismatch" || result.error === "holder_mismatch" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, visits: result.visits, founder: result.founder });
}
