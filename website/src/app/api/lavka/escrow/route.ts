import { NextResponse } from "next/server";
import { lavkaApiGuard } from "@/lib/lavka/guard";
import { lavkaRateLimitAllowed } from "@/lib/lavka/api-rate-limit";
import { recordEscrowFromChain } from "@/lib/lavka/service";

/**
 * The escrow id, amount and deadline are read back from the `EscrowCreated` event of
 * `createTxHash` (see lib/lavka/chain-verify.ts) — the body only says which tx to check.
 */
export async function POST(request: Request) {
  const guard = await lavkaApiGuard();
  if (!guard.ok) return guard.response;
  if (!lavkaRateLimitAllowed(guard.userId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    merchantSlug?: string;
    termsNote?: string;
    createTxHash?: string;
  };
  const slug = body.merchantSlug?.trim();
  const createTxHash = body.createTxHash?.trim();
  if (!slug || !createTxHash) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  // Not trimmed: the note is hashed as-is against the on-chain termsHash, so changing a single
  // byte here would fail verification.
  const termsNote = typeof body.termsNote === "string" && body.termsNote.trim() ? body.termsNote : null;
  const recorded = await recordEscrowFromChain({
    customerUserId: guard.userId,
    merchantSlug: slug,
    createTxHash,
    termsNote,
  });
  if (!recorded.ok) {
    const status = recorded.error === "merchant_not_found" ? 404 : recorded.error.startsWith("tx_") ? 409 : 400;
    return NextResponse.json({ error: recorded.error }, { status });
  }
  return NextResponse.json({ ok: true, chainEscrowId: recorded.chainEscrowId });
}
