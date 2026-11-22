import { NextResponse } from "next/server";
import { checkSharedRateLimit, checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isMissingTableOrDbError } from "@/lib/founders/telegram-cold-start";
import { telegramColdStartLink } from "@/lib/founding/contract";
import { submitFoundingWaitlistEmail } from "@/lib/founding/waitlist";

export async function POST(request: Request) {
  const ip = clientIp(request) || "anon";
  if (!checkSlidingWindowRateLimit("founding_waitlist_ip", ip, 8, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const allowed = await checkSharedRateLimit("founding_waitlist", ip, 8, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  } catch (error) {
    if (!isMissingTableOrDbError(error)) {
      // Fall back to in-memory sliding window check above
    }
  }

  let body: { email?: unknown; locale?: string; path?: string; ref?: string };
  try {
    body = (await request.json()) as { email?: unknown; locale?: string; path?: string; ref?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await submitFoundingWaitlistEmail({
      email: body?.email,
      locale: body?.locale ?? null,
      path: body?.path ?? null,
      ref: body?.ref ?? null,
      ip,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      status: "registered",
      botUrl: result.botUrl,
    });
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      return NextResponse.json({
        ok: true,
        status: "registered",
        botUrl: telegramColdStartLink(body?.locale ?? null, body?.ref ?? null),
        degraded: true,
      });
    }
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
