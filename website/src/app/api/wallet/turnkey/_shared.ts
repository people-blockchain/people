import { auth } from "@/auth";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isTurnkeyWalletReady } from "@/lib/turnkey-config";
import { isAuthTimeFresh } from "@/lib/wallet-reauth-window";
import { NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function requireTurnkeySession(
  request: Request,
  options?: { freshAuth?: boolean },
): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse }
> {
  if (!isTurnkeyWalletReady()) {
    return { ok: false, response: jsonError("not_configured", 503) };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: jsonError("unauthorized", 401) };
  }
  if (options?.freshAuth && !isAuthTimeFresh(session.authTime)) {
    return { ok: false, response: jsonError("reauth_required", 401) };
  }
  const ip = clientIp(request);
  const key = `${session.user.id}:${ip}`;
  if (!(await checkSharedRateLimit("wallet-turnkey", key, 30, 5 * 60 * 1000))) {
    return { ok: false, response: jsonError("rate_limited", 429) };
  }
  return { ok: true, userId: session.user.id, email: session.user.email ?? null };
}

export function mapTurnkeyError(err: unknown): NextResponse {
  const code = err instanceof Error ? err.message : "turnkey_failed";
  if (
    code === "invalid_client_key" ||
    code === "invalid_email" ||
    code === "invalid_otp" ||
    code === "invalid_address"
  ) {
    return jsonError(code, 400);
  }
  if (code === "turnkey_suborg_missing" || code === "turnkey_user_missing") {
    return jsonError(code, 404);
  }
  if (
    code === "address_conflict" ||
    code === "address_taken" ||
    code === "legacy_address_mismatch"
  ) {
    return jsonError(code, 409);
  }
  if (code === "turnkey_not_configured") {
    return jsonError("not_configured", 503);
  }
  console.warn("[turnkey] request failed", { code: /^[a-z0-9_]+$/.test(code) ? code : "unknown" });
  return jsonError("turnkey_failed", 502);
}
