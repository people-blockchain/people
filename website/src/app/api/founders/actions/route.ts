import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { clientIp } from "@/lib/discover/api-guard";
import { awardFounderPoints } from "@/lib/founders/service";

/**
 * Only actions that must prove themselves with an on-chain tx hash go through this generic
 * route. Discover reactions/follows are credited from their own routes with a server-derived
 * idempotency key (see app/api/discover/projects/[id]/{react,follow}); "invite" pays only
 * through the referral bounty (referral-service.ts). Neither belongs here.
 */
const CHAIN_VERIFIED_ACTIONS = new Set(["swap", "stake", "token_launch", "nft_mint", "pool_create", "governance_vote"]);

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const key = `${guard.userId}:${clientIp(request)}`;
  if (!await checkSharedRateLimit("founders-actions", key, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // This route only ever credits actions whose proof is an on-chain tx (swap, token_launch,
  // nft_mint, pool_create, governance_vote): the server fetches the receipt and derives both
  // the amount and the idempotency key from it. The client never supplies points-affecting
  // data (amounts, holder counts, idempotency keys) here — see awardFounderPoints.
  const body = (await request.json()) as {
    action?: string;
    txHash?: string;
  };
  const action = body.action ?? "";
  if (!CHAIN_VERIFIED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const txHash = body.txHash ?? "";
  const result = await awardFounderPoints(guard.userId, action, `chain:${action}:${txHash}`, {
    txHash,
  });
  if (!result.ok) {
    const status =
      result.error === "not_registered"
        ? 403
        : result.error === "invalid_action"
          ? 400
          : 200;
    if (result.error === "duplicate") {
      return NextResponse.json({ ok: true, awardedPoints: 0, duplicate: true });
    }
    if (
      result.error === "action_cap" ||
      result.error === "daily_total_cap" ||
      result.error === "zero" ||
      result.error === "swap_too_small" ||
      result.error === "stake_too_small" ||
      result.error === "not_verifiable" ||
      result.error === "chain_verification_failed" ||
      result.error === "bot_flagged" ||
      result.error === "closed_group"
    ) {
      return NextResponse.json({ ok: true, awardedPoints: 0, capped: true, reason: result.error });
    }
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    awardedPoints: result.awardedPoints,
    totalPoints: result.totalPoints,
  });
}
