import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { isVerifiedHuman } from "@/lib/discover/verified-human";

export async function discoverApiGuard(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unavailable" }, { status: 503 }),
    };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "sign_in_required" }, { status: 401 }),
    };
  }
  if (!(await isVerifiedHuman(session.user.id))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "wallet_required" }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.user.id };
}

/**
 * Trusted-proxy-aware client IP. Delegates to the shared helper so forwarding headers are
 * never trusted unless `TRUST_PROXY_HEADERS=1` (else the value is client-controlled and
 * trivially rotated to evade rate limits).
 */
export { clientIpFromRequest as clientIp } from "@/lib/request-client-ip";
