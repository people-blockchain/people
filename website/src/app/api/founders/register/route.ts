import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { registerFounder, resolveFounderUserIdByWallet } from "@/lib/founders/service";
import { REFERRAL_COOKIE } from "@/lib/partner/referral";
import { attachReferralIfEligible } from "@/lib/partner/service";
import { referralCodeForUserId, resolveFounderUserIdByReferralCode } from "@/lib/referral-link-server";

export async function POST(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;
  // Registration is a one-time action; a tight per-user window stops scripted churn
  // (each attempt consumes verification work and registration-slot bookkeeping).
  if (!await checkSharedRateLimit("founders_register", guard.userId, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json()) as {
    countryCode?: string;
    deviceId?: string;
    invitedByWallet?: string;
    /** Short code from the one invite link (`/?ref=<code>`). */
    invitedByCode?: string;
  };
  const countryCode = body.countryCode ?? "";
  const deviceId = body.deviceId?.trim() ?? "";
  if (deviceId.length < 16) {
    return NextResponse.json({ error: "invalid_device" }, { status: 400 });
  }
  // One invite link for every program: an old `?ref=0x…` wallet link, the short code the
  // browser stored, or the code cookie set by the proxy when localStorage was unavailable.
  let invitedByUserId: string | null = null;
  const invWallet = body.invitedByWallet?.trim();
  if (invWallet) {
    invitedByUserId = await resolveFounderUserIdByWallet(invWallet);
  } else {
    const code = body.invitedByCode?.trim() || (await cookies()).get(REFERRAL_COOKIE)?.value;
    if (code) invitedByUserId = await resolveFounderUserIdByReferralCode(code);
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
  if (invitedByUserId && invitedByUserId !== guard.userId) {
    // The same invite also counts in the partner program. attachReferralIfEligible keeps its
    // own rules: first inviter wins, only within 24h of account creation, max depth 2, no cycles.
    try {
      const code = await referralCodeForUserId(invitedByUserId);
      if (code) await attachReferralIfEligible(guard.userId, code);
    } catch (error) {
      console.error("[founders/register] partner attach failed", error instanceof Error ? error.name : typeof error);
    }
  }
  return NextResponse.json({ ok: true, founder: result.profile });
}
