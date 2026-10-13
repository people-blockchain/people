import { NextResponse } from "next/server";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { verifyHumanPassportForUser } from "@/lib/founders/human-passport-verify";
import { applyStrongVerification } from "@/lib/founders/verification-service";
import { getFounderByUserId } from "@/lib/founders/service";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  // The scored wallet is founders.walletAddress (server-side). An optional
  // `credential` is only checked for equality with it, never used as the source.
  const body = (await request.json().catch(() => ({}))) as { credential?: unknown };
  if (body.credential !== undefined && typeof body.credential !== "string") {
    return NextResponse.json({ error: "invalid_credential" }, { status: 400 });
  }

  const verified = await verifyHumanPassportForUser(guard.userId, body.credential, {
    loadFounder: async () => founder,
    applyStrongVerification,
    fetch,
  });
  if (!verified.ok) {
    switch (verified.error) {
      case "not_configured":
        return NextResponse.json({ error: "not_configured" }, { status: 503 });
      case "not_registered":
        return NextResponse.json({ error: "not_registered" }, { status: 403 });
      case "invalid_credential":
        return NextResponse.json({ error: "invalid_credential" }, { status: 400 });
      case "wallet_not_linked":
        return NextResponse.json({ error: "wallet_not_linked" }, { status: 409 });
      case "wallet_mismatch":
        return NextResponse.json({ error: "wallet_mismatch" }, { status: 403 });
      case "score_too_low":
        return NextResponse.json(
          {
            error: "score_too_low",
            score: verified.score,
            threshold: verified.threshold,
            wallet: verified.address ? `${verified.address.slice(0, 6)}…${verified.address.slice(-4)}` : undefined,
            walletKind: verified.walletKind,
          },
          { status: 403 },
        );
      default:
        return NextResponse.json({ error: "verification_failed" }, { status: 422 });
    }
  }

  return NextResponse.json({ ok: true, level: 2 });
}
