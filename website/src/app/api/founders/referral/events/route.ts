import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import {
  recordIssuerPurchase,
  resolveBuyerByWallet,
} from "@/lib/founders/referral-service";

function authorized(request: Request): boolean | null {
  const secret = process.env.FOUNDERS_REFERRAL_INDEXER_TOKEN?.trim();
  if (!secret) return null;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Trusted-backend endpoint (indexer / sale watcher): invitee purchases of issuer tokens.
 * Never callable from a browser session — events must not be self-reported by the invitee.
 *
 * The retired `sale_buy` / `airdrop_join` bonus kinds are rejected as `invalid_kind`: referral
 * points are earned only for real actions of verified invitees.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const ok = authorized(request);
  if (ok === null) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    wallet?: string;
    eventKey?: string;
    tokenAddress?: string;
    purchaseAmount?: string;
  };
  const userId = await resolveBuyerByWallet(body.wallet ?? "");
  if (!userId) return NextResponse.json({ error: "unknown_wallet" }, { status: 404 });
  const eventKey = (body.eventKey ?? "").trim();
  if (eventKey.length < 4 || eventKey.length > 200) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  if (body.kind === "issuer_purchase") {
    let amount: bigint;
    try {
      amount = BigInt(body.purchaseAmount ?? "");
    } catch {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    const result = await recordIssuerPurchase({
      tokenAddress: body.tokenAddress ?? "",
      buyerUserId: userId,
      purchaseAmount: amount,
      purchaseKey: eventKey,
    });
    return NextResponse.json(result.ok ? { ok: true, credited: result.credited } : { ok: false, reason: result.error });
  }
  return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
}
