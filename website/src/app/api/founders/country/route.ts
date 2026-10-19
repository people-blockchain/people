import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { foundersApiGuard } from "@/lib/founders/api-guard";
import { updateFounderCountry } from "@/lib/founders/service";

/** Lets a founder correct their own country later. `foundersApiGuard` resolves `userId` from
 * the session, so a caller can never target anyone else's record. */
export async function PATCH(request: Request) {
  const guard = await foundersApiGuard();
  if (!guard.ok) return guard.response;

  const key = `${guard.userId}:${clientIp(request)}`;
  if (!(await checkRateLimitDurableFirst("founders-country-update", key, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { countryCode?: string };
  const result = await updateFounderCountry(guard.userId, body.countryCode ?? "");
  if (!result.ok) {
    const status = result.error === "invalid_country" ? 400 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, founder: result.profile });
}
