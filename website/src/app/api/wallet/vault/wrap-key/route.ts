import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { getUserWrapKeyHex, isAuthTimeFresh, isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { checkDurableWrapKeyRateLimit, recordWalletVaultAccess } from "@/lib/wallet-vault-access-log";
import { hasAuthJsSessionCookie, sanitizeForwardedHost } from "@/lib/wallet-wrap-key-diagnostics";
import { NextResponse } from "next/server";

/** Key material responses must never be cached by a shared cache or the browser disk cache. */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const ROUTE = "wallet/vault/wrap-key";

export async function GET(request: Request) {
  if (!isWalletVaultConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    // Same status as reauth_required. Name which gate failed (never the cookie, token, or email).
    const reason = session ? "no_user_id" : "no_session";
    const sessionCookie = hasAuthJsSessionCookie(request.headers.get("cookie"));
    const host = sanitizeForwardedHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "",
    );
    console.warn(
      `[wallet-vault] wrap-key unauthorized: reason=${reason} sessionCookie=${sessionCookie} host=${host}`,
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const userId = session.user.id;
  const ip = clientIp(request);

  // Require a recent sign-in (not just a long-lived session cookie) before handing out the
  // key that unlocks the vault ciphertext.
  if (!isAuthTimeFresh(session.authTime)) {
    // Both 401s used to be indistinguishable in the runtime logs, which left a production
    // reauth failure looking like an anonymous request. Name the reason (never the key material).
    const authTimePresent = typeof session.authTime === "number";
    console.warn(`[wallet-vault] wrap-key reauth_required authTimePresent=${authTimePresent}`);
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "reauth_required", ip });
    return NextResponse.json({ error: "reauth_required" }, { status: 401, headers: NO_STORE });
  }

  // Cheap in-memory check first (fast path, survives no restart assumption needed), then the
  // durable DB-backed check (recon.md R1: forensic trail + rate limit that isn't wiped by a
  // deploy/restart or bypassed by hitting a different server instance).
  const key = `${userId}:${ip}`;
  if (!await checkSharedRateLimit("wallet-vault", key, 20, 5 * 60 * 1000)) {
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "rate_limited", ip });
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  if (!(await checkDurableWrapKeyRateLimit(userId, ROUTE, 30, 15 * 60 * 1000))) {
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "rate_limited", ip });
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  const wrapKeyHex = await getUserWrapKeyHex(userId);
  await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "ok", ip });
  return NextResponse.json({ wrapKeyHex, version: 1 }, { headers: NO_STORE });
}
