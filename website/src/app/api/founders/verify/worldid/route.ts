import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { getFounderByUserId } from "@/lib/founders/service";
import { verifyWorldIdProofForUser } from "@/lib/founders/world-id-verify";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const founder = await getFounderByUserId(guard.userId);
  if (!founder) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  const body = (await request.json()) as { idkitResponse?: IDKitResult };
  if (!body.idkitResponse) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 400 });
  }

  const result = await verifyWorldIdProofForUser(guard.userId, body.idkitResponse);
  if (!result.ok) {
    const status =
      result.error === "not_configured"
        ? 503
        : result.error === "nullifier_used"
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, level: 2 });
}
