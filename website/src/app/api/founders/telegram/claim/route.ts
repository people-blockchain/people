import { NextResponse } from "next/server";
import { checkSharedRateLimit, checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import {
  inspectPendingTelegramClaim,
  isMissingTableOrDbError,
  redeemPendingTelegramClaim,
} from "@/lib/founders/telegram-cold-start";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request) || "anon";
  if (!checkSlidingWindowRateLimit("tg_claim_inspect", ip, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  try {
    const status = await inspectPendingTelegramClaim(token);
    if (!status.ok) {
      const code = status.error === "invalid_token" ? 400 : 410;
      return NextResponse.json(status, { status: code });
    }
    return NextResponse.json(status);
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      return NextResponse.json({ ok: false, error: "unavailable", degraded: true }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request) || "anon";
  if (!checkSlidingWindowRateLimit("tg_claim_redeem_ip", ip, 15, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  try {
    const allowed = await checkSharedRateLimit("founders_tg_claim", guard.userId, 10, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  } catch (error) {
    if (!isMissingTableOrDbError(error)) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }
  }

  let body: { token?: string; countryCode?: string; deviceId?: string };
  try {
    body = (await request.json()) as { token?: string; countryCode?: string; deviceId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  try {
    const result = await redeemPendingTelegramClaim({
      token,
      userId: guard.userId,
      countryCode: typeof body.countryCode === "string" ? body.countryCode : undefined,
      deviceId: typeof body.deviceId === "string" ? body.deviceId : undefined,
      ip,
    });
    if (!result.ok) {
      const status =
        result.error === "invalid_token"
          ? 400
          : result.error === "expired_token" || result.error === "already_claimed"
            ? 410
            : result.error === "phone_taken" || result.error === "telegram_taken"
              ? 409
              : 503;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      return NextResponse.json(
        { ok: false, error: "schema_not_ready", degraded: true },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
