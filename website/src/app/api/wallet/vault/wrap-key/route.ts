import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { clientIp } from "@/lib/discover/api-guard";
import { getUserWrapKeyHex, isAuthTimeFresh, isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { reserveWalletVaultWrapKeyAttempt, setWalletVaultAccessOutcome } from "@/lib/wallet-vault-access-log";
import {
  WALLET_VAULT_WRAP_FAILURE_MAX,
  WALLET_VAULT_WRAP_FAILURE_WINDOW_MS,
  WALLET_VAULT_WRAP_ROUTE,
  checkWalletVaultWrapKeyDelivery,
  walletVaultRateLimitedResponse,
} from "@/lib/wallet-vault-rate-limit";
import { NextResponse } from "next/server";

/** Key material responses must never be cached by a shared cache or the browser disk cache. */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const ROUTE = WALLET_VAULT_WRAP_ROUTE;

function unavailable(): NextResponse {
  return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
}

export async function GET(request: Request) {
  if (!isWalletVaultConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  await ensurePartnerSchema();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const userId = session.user.id;
  const ip = clientIp(request);

  // The attempt row is inserted before it is counted, so concurrent requests share one ceiling.
  // A failed insert fails closed: handing out the key without a counted row would be fail-open.
  let attempt: { id: string; allowed: boolean; retryAfterSeconds: number };
  try {
    attempt = await reserveWalletVaultWrapKeyAttempt({
      userId,
      route: ROUTE,
      ip,
      maxPerWindow: WALLET_VAULT_WRAP_FAILURE_MAX,
      windowMs: WALLET_VAULT_WRAP_FAILURE_WINDOW_MS,
    });
  } catch (error) {
    console.warn(
      "[wallet-vault] wrap-key access log insert failed",
      error instanceof Error ? error.message : error,
    );
    return unavailable();
  }
  if (!attempt.allowed) return walletVaultRateLimitedResponse(attempt.retryAfterSeconds);

  // Require a recent sign-in (not just a long-lived session cookie) before handing out the
  // key that unlocks the vault ciphertext.
  if (!isAuthTimeFresh(session.authTime)) {
    // Both 401s used to be indistinguishable in the runtime logs, which left a production
    // reauth failure looking like an anonymous request. Name the reason (never the key material).
    console.warn(
      `[wallet-vault] wrap-key reauth_required for user ${userId}: ` +
        `authTime=${typeof session.authTime === "number" ? session.authTime : "absent"}`,
    );
    try {
      await setWalletVaultAccessOutcome(attempt.id, "reauth_required");
    } catch (error) {
      console.warn(
        "[wallet-vault] wrap-key access log update failed",
        error instanceof Error ? error.message : error,
      );
      return unavailable();
    }
    return NextResponse.json({ error: "reauth_required" }, { status: 401, headers: NO_STORE });
  }

  // Delivery ceiling, separate from the 15-minute ceiling: 20 wrap keys / 5 minutes per
  // account, plus a per-address cap. "unknown" skips the address half.
  const delivery = await checkWalletVaultWrapKeyDelivery(userId, ip);
  if (!delivery.allowed) {
    try {
      await setWalletVaultAccessOutcome(attempt.id, "rate_limited");
    } catch (error) {
      console.warn(
        "[wallet-vault] wrap-key access log update failed",
        error instanceof Error ? error.message : error,
      );
      return unavailable();
    }
    return walletVaultRateLimitedResponse(delivery.retryAfterSeconds);
  }

  try {
    const wrapKeyHex = await getUserWrapKeyHex(userId);
    await setWalletVaultAccessOutcome(attempt.id, "ok");
    return NextResponse.json({ wrapKeyHex, version: 1 }, { headers: NO_STORE });
  } catch (error) {
    console.warn(
      "[wallet-vault] wrap-key delivery failed closed",
      error instanceof Error ? error.message : error,
    );
    return unavailable();
  }
}
