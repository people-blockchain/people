import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { registerFounder, resolveFounderUserIdByWallet } from "@/lib/founders/service";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  // Registration is a one-time action; a tight per-user window stops scripted churn
  // (each attempt consumes verification work and registration-slot bookkeeping).
  // TODO(audit-2026-10-19): Turnstile on register — when TURNSTILE_SECRET_KEY is set, call
  // verifyTurnstileToken(body.turnstileToken, clientIp(request)) before registerFounder and
  // return 400 on failure; expose NEXT_PUBLIC_TURNSTILE_SITE_KEY in FoundersApp (widget like
  // FactoryIconGenerator) and pass turnstileToken in the register JSON body.
  if (!(await checkRateLimitDurableFirst("founders_register", guard.userId, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json()) as {
    countryCode?: string;
    deviceId?: string;
    invitedByWallet?: string;
  };
  const countryCode = body.countryCode ?? "";
  const deviceId = body.deviceId?.trim() ?? "";
  if (deviceId.length < 16) {
    return NextResponse.json({ error: "invalid_device" }, { status: 400 });
  }
  let invitedByUserId: string | null = null;
  const invWallet = body.invitedByWallet?.trim();
  if (invWallet) {
    invitedByUserId = await resolveFounderUserIdByWallet(invWallet);
  }
  const result = await registerFounder(guard.userId, countryCode, {
    deviceId,
    ip: clientIp(request),
    invitedByUserId,
  });
  if (!result.ok) {
    const status =
      result.error === "poh_required"
        ? 403
        : result.error === "invalid_country"
          ? 400
          : result.error === "device_cap" || result.error === "ip_cap"
            ? 429
            : result.error === "cap_reached" || result.error === "already_registered"
              ? 409
              : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, founder: result.profile });
}
