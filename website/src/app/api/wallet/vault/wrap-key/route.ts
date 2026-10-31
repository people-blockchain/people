import { auth } from "@/auth";
import { ensurePartnerSchema } from "@/db";
import { clientIp } from "@/lib/discover/api-guard";
import { getUserWrapKeyHex, isAuthTimeFresh, isWalletVaultConfigured } from "@/lib/wallet-cloud-server";
import { recordWalletVaultAccess } from "@/lib/wallet-vault-access-log";
import {
  WALLET_VAULT_WRAP_ROUTE,
  checkWalletVaultWrapKeyDelivery,
  checkWalletVaultWrapKeyFailures,
  walletVaultRateLimitedResponse,
} from "@/lib/wallet-vault-rate-limit";
import { NextResponse } from "next/server";

/** Key material responses must never be cached by a shared cache or the browser disk cache. */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const ROUTE = WALLET_VAULT_WRAP_ROUTE;

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

  // Failures (including reauth_required) are capped before this attempt is recorded, so a
  // rejected retry is rate_limited and does not push the failure window forward. The cap stays
  // 30 failures / 15 minutes. Only a real wrap-key delivery resets it.
  const failures = await checkWalletVaultWrapKeyFailures(userId);
  if (!failures.allowed) {
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "rate_limited", ip });
    return walletVaultRateLimitedResponse(failures.retryAfterSeconds);
  }

  // Require a recent sign-in (not just a long-lived session cookie) before handing out the
  // key that unlocks the vault ciphertext.
  if (!isAuthTimeFresh(session.authTime)) {
    // Both 401s used to be indistinguishable in the runtime logs, which left a production
    // reauth failure looking like an anonymous request. Name the reason (never the key material).
    console.warn(
      `[wallet-vault] wrap-key reauth_required for user ${userId}: ` +
        `authTime=${typeof session.authTime === "number" ? session.authTime : "absent"}`,
    );
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "reauth_required", ip });
    return NextResponse.json({ error: "reauth_required" }, { status: 401, headers: NO_STORE });
  }

  // Delivery ceiling, separate from vault reads: 20 wrap keys / 5 minutes per account.
  const delivery = await checkWalletVaultWrapKeyDelivery(userId);
  if (!delivery.allowed) {
    await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "rate_limited", ip });
    return walletVaultRateLimitedResponse(delivery.retryAfterSeconds);
  }

  const wrapKeyHex = await getUserWrapKeyHex(userId);
  await recordWalletVaultAccess({ userId, route: ROUTE, outcome: "ok", ip });
  return NextResponse.json({ wrapKeyHex, version: 1 }, { headers: NO_STORE });
}
